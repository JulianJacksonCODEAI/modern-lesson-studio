// Builds two unpacked extensions:
//   build/full  – Julian and Angi: everything, including the Advanced tab.
//   build/team  – everyone else: only files reachable from the side panel and service worker,
//                 with advanced/ removed and the advanced host permissions dropped.
// Fails (exit 1) if the team build contains any advanced code or a broken import.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeZip,readZip} from './zip.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'build');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const builtAt=new Date().toISOString();
const rel=p=>path.relative(root,p).split(path.sep).join('/');

const EXCLUDE_ALWAYS=[/^build\//,/^docs\//,/^_legacy\//,/^test\//,/^engine\/test\//,/^scripts\//,/^node_modules\//,/^\.git/,/\.md$/i,/^package(-lock)?\.json$/,/^build\.ps1$/,/^core\//];
const TEAM_ENTRIES=['sidepanel/sidepanel.html','background/service-worker.js'];
const TEAM_ASSETS=['icons/icon-16.png','icons/icon-48.png','icons/icon-128.png','shared/report-form.json'];
const ADVANCED=/^advanced\//;
const TEAM_DROPPED_HOSTS=['https://api.notion.com/*','https://generativelanguage.googleapis.com/*'];

function walk(dir){const files=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())files.push(...walk(p));else files.push(rel(p));}return files;}
function refsOf(file){
 const text=fs.readFileSync(path.join(root,file),'utf8'),dir=path.posix.dirname(file),found=[];
 const patterns=file.endsWith('.html')
  ?[/<script[^>]+src="([^"]+)"/g,/<link[^>]+href="([^"]+)"/g,/<img[^>]+src="([^"]+)"/g]
  :[/(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g,/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g];
 for(const re of patterns)for(const m of text.matchAll(re)){if(/^(https?:|data:|#)/.test(m[1]))continue;found.push(path.posix.normalize(path.posix.join(dir,m[1].split(/[?#]/)[0])));}
 return found;
}
function copy(files,target){
 fs.rmSync(target,{recursive:true,force:true});
 for(const f of files){const dest=path.join(target,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
}
const writeJson=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');

// ---- full ----
const all=walk(root).filter(f=>!EXCLUDE_ALWAYS.some(re=>re.test(f)));
copy(all,path.join(out,'full'));
writeJson(path.join(out,'full','manifest.json'),{...manifest,name:manifest.name+' (full)'});
writeJson(path.join(out,'full','build-info.json'),{edition:'full',version:manifest.version,builtAt});

// ---- team: reachable files only ----
const problems=[],team=new Set(TEAM_ASSETS);
const queue=[...TEAM_ENTRIES];
while(queue.length){
 const f=queue.shift();if(team.has(f)&&!TEAM_ASSETS.includes(f))continue;
 if(ADVANCED.test(f))continue; // the side panel loads advanced/ only in the full build
 if(!fs.existsSync(path.join(root,f))){problems.push('Missing file referenced: '+f);continue;}
 team.add(f);
 if(/\.(m?js|html)$/.test(f))for(const r of refsOf(f))if(!team.has(r))queue.push(r);
}
copy([...team],path.join(out,'team'));
const teamManifest=structuredClone(manifest);
teamManifest.host_permissions=manifest.host_permissions.filter(h=>!TEAM_DROPPED_HOSTS.includes(h));
writeJson(path.join(out,'team','manifest.json'),teamManifest);
writeJson(path.join(out,'team','build-info.json'),{edition:'team',version:manifest.version,builtAt});

// ---- checks ----
const teamFiles=walk(path.join(out,'team')).map(f=>f.replace(/^build\/team\//,''));
for(const f of teamFiles){
 if(ADVANCED.test(f))problems.push('Advanced file in team build: '+f);
 if(/\.(m?js|html)$/.test(f))for(const r of refsOf(f)){
  if(ADVANCED.test(r))continue; // guarded dynamic import, edition check prevents loading
  if(!fs.existsSync(path.join(out,'team',r)))problems.push(`Team build: ${f} references missing ${r}`);
 }
}
for(const f of teamFiles.filter(f=>/\.(m?js|html)$/.test(f))){
 const text=fs.readFileSync(path.join(out,'team',f),'utf8');
 for(const marker of ['NotionConnector','setToken(','engine/browser-fill/workflow.html','installAdvanced'])
  if(text.includes(marker)&&!(f==='sidepanel/sidepanel.mjs'&&marker==='installAdvanced'))problems.push(`Team build: ${f} contains advanced code (${marker})`);
}
// Full build: every relative import must resolve too (the legacy core/ folder is not shipped).
const fullFiles=walk(path.join(out,'full')).map(f=>f.replace(/^build\/full\//,''));
for(const f of fullFiles.filter(f=>/\.(m?js|html)$/.test(f)))for(const r of refsOf(path.posix.join('build','full',f)).map(r=>r.replace(/^build\/full\//,'')))
 if(!fs.existsSync(path.join(out,'full',r)))problems.push(`Full build: ${f} references missing ${r}`);
for(const f of [...manifest.host_permissions])if(TEAM_DROPPED_HOSTS.includes(f)&&teamManifest.host_permissions.includes(f))problems.push('Team manifest kept '+f);

// ---- team zip to share (only if the team build passed its checks) ----
let zipName=null;
if(!problems.length){
 zipName=`lesson-studio-team-${manifest.version}.zip`;
 const guide=fs.readFileSync(path.join(root,'docs','INSTALL-team.txt'),'utf8').replaceAll('{VERSION}',manifest.version);
 const entries=[{name:'How to install Lesson Studio.txt',data:Buffer.from(guide.replace(/\r?\n/g,'\r\n'),'utf8')},
  ...teamFiles.sort().map(f=>({name:'lesson-studio/'+f,data:fs.readFileSync(path.join(out,'team',f))}))];
 const zip=writeZip(entries);fs.writeFileSync(path.join(out,zipName),zip);
 const back=readZip(fs.readFileSync(path.join(out,zipName)));
 if(back.length!==entries.length)problems.push('Team zip: wrong number of files.');
 if(!back.some(e=>e.name==='lesson-studio/manifest.json'))problems.push('Team zip: lesson-studio/manifest.json is missing.');
 if(JSON.parse(back.find(e=>e.name==='lesson-studio/manifest.json').data).version!==manifest.version)problems.push('Team zip: manifest version differs.');
 for(const e of back){if(e.name.includes('\\'))problems.push('Team zip: backslash path '+e.name);if(/^lesson-studio\/advanced\//.test(e.name))problems.push('Team zip: advanced file '+e.name);}
 const info=JSON.parse(back.find(e=>e.name==='lesson-studio/build-info.json').data);if(info.edition!=='team')problems.push('Team zip: not the team edition.');
}

console.log(`full: ${all.length+2} files → build/full`);
console.log(`team: ${teamFiles.length} files → build/team`);
if(zipName)console.log(`share: build/${zipName} (team build + install guide)`);
if(problems.length){console.error('\nBUILD CHECK FAILED:\n- '+problems.join('\n- '));process.exit(1);}
console.log('Build checks passed: no broken imports in either build, and no advanced code in the team build.');
