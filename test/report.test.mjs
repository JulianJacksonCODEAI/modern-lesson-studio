import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReport,formBody,sendReport,suggestType,prefilledFormUrl,sendReportViaFormTab,postReportInPage,PROBLEM_TYPES} from '../shared/report.mjs';

const config=JSON.parse(readFileSync(new URL('../shared/report-form.json',import.meta.url)));
const context={lesson:{title:'AI Lab',url:'https://levelbuilder-studio.code.org/lessons/8898985/edit'},
 sources:{slides:{name:'U1L16 deck',url:'https://docs.google.com/presentation/d/x/edit'},notion:null},
 item:{label:'Section: Warm-up',content:'Discuss what AI is.'},step:'2 · Check',receipt:null,version:'1.1.0',now:new Date('2026-11-22T10:00:00Z')};

test('form config matches the Google Form: seven fields and its five problem types',()=>{
 assert.equal(Object.keys(config.fields).length,7);
 assert.deepEqual(config.problemTypes,PROBLEM_TYPES);
 assert.match(config.submitUrl,/^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/);
});

test('five fields are filled from the current run',()=>{
 const {fields,suggestedType}=buildReport(context);
 assert.match(fields.lesson,/AI Lab\nhttps:\/\/levelbuilder-studio\.code\.org\/lessons\/8898985\/edit/);
 assert.match(fields.sources,/Slides: U1L16 deck/);assert.match(fields.sources,/Notion: not imported/);
 assert.match(fields.flaggedItem,/Section: Warm-up\n---\nDiscuss what AI is\./);
 assert.match(fields.stepAndReadback,/Step: 2 · Check\nSave result: no save attempted/);
 assert.equal(fields.versionAndDate,'Lesson Studio 1.1.0 · 2026-11-22T10:00:00.000Z');
 assert.equal(suggestedType,'wrong content');
});

test('save problems are summarized with mismatches and suggest "didnt save"',()=>{
 const receipt={status:'save-not-confirmed',attemptedAt:'2026-11-22T10:01:00Z',requestDigest:'abcdef0123456789zzzz',verification:{mismatches:['Section 3 text differs']}};
 const {fields,suggestedType}=buildReport({...context,item:null,step:'3 · Save',receipt});
 assert.match(fields.stepAndReadback,/save-not-confirmed at 2026-11-22T10:01:00Z · receipt abcdef0123456789\n/);
 assert.match(fields.stepAndReadback,/Readback mismatches \(1\):\n- Section 3 text differs/);
 assert.equal(suggestedType,'didnt save');
 assert.equal(suggestType({receipt:{status:'saved-and-verified',verification:{mismatches:[]}}}),'other');
});

test('long fields are shortened so the form accepts them',()=>{
 const {fields}=buildReport({...context,item:{label:'Huge',content:'x'.repeat(10000)}});
 assert.ok(fields.flaggedItem.length<=1800);assert.match(fields.flaggedItem,/shortened/);
});

test('the posted body uses every entry ID and requires a type and note',()=>{
 const {fields}=buildReport(context);
 assert.throws(()=>formBody(config,fields,'','note'),/type of problem/);
 assert.throws(()=>formBody(config,fields,'other','  '),/short note/);
 const body=formBody(config,fields,'missing content','The objectives are missing.');
 for(const entry of Object.values(config.fields))assert.ok(body.has(entry),entry);
 assert.equal(body.get(config.fields.problemType),'missing content');
 assert.equal(body.get(config.fields.note),'The objectives are missing.');
});

test('sending reports success, and a Google sign-in redirect as a failure',async()=>{
 const {fields}=buildReport(context);let seen;
 const ok=await sendReport(config,fields,'other','note',{fetchImpl:async(url,opts)=>{seen={url,opts};return {ok:true,status:200,url:config.submitUrl};}});
 assert.equal(ok.sent,true);assert.equal(seen.opts.method,'POST');assert.equal(seen.opts.credentials,'include');
 await assert.rejects(sendReport(config,fields,'other','note',{fetchImpl:async()=>({ok:true,status:200,url:'https://accounts.google.com/v3/signin/identifier'})}),/sign in/);
 await assert.rejects(sendReport(config,fields,'other','note',{fetchImpl:async()=>({ok:false,status:400,url:config.submitUrl})}),/error \(400\)/);
});

test('the Google Forms fallback is a pre-filled viewform link with every field',()=>{
 const {fields}=buildReport(context);
 const url=new URL(prefilledFormUrl(config,fields,'missing content','Objectives are missing.'));
 assert.equal(url.origin+url.pathname,config.submitUrl.replace(/\/formResponse$/,'/viewform'));
 assert.equal(url.searchParams.get('usp'),'pp_url');
 for(const entry of Object.values(config.fields))assert.ok(url.searchParams.has(entry),entry);
 assert.equal(url.searchParams.get(config.fields.problemType),'missing content');
 assert.equal(url.searchParams.get(config.fields.note),'Objectives are missing.');
 const long=new URL(prefilledFormUrl(config,{...fields,flaggedItem:'x'.repeat(20000)},'other','n'));
 assert.ok(long.href.length<9000,'long fields are shortened to keep the link usable');
 assert.ok(!new URL(prefilledFormUrl(config,fields,'not a type','n')).searchParams.has(config.fields.problemType),'unknown types are left for the user to choose');
});
function fakeBrowser(result){
 const log={created:[],removed:[],injected:[]};const listeners=new Set();
 const tabs={create:async o=>{log.created.push(o);setTimeout(()=>listeners.forEach(l=>l(7,{status:'complete'})),5);return {id:7};},get:async()=>({id:7,status:'loading'}),remove:async id=>{log.removed.push(id);},onUpdated:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)}};
 const scripting={executeScript:async o=>{log.injected.push(o);return [{result}];}};
 return {tabs,scripting,log};
}

test('the background form tab sends from inside the form page and always closes the tab',async()=>{
 const {fields}=buildReport(context);
 const ok=fakeBrowser({ok:true,status:200,url:config.submitUrl});
 const r=await sendReportViaFormTab(config,fields,'other','note',ok);
 assert.equal(r.via,'form-tab');
 assert.equal(ok.log.created[0].active,false,'opened in the background');
 assert.match(ok.log.created[0].url,/\/viewform$/);
 assert.equal(ok.log.injected[0].func,postReportInPage);
 assert.equal(ok.log.injected[0].args[0],config.submitUrl);
 assert.equal(new URLSearchParams(ok.log.injected[0].args[1]).get(config.fields.note),'note');
 assert.deepEqual(ok.log.removed,[7]);
 const signIn=fakeBrowser({ok:true,status:200,url:'https://accounts.google.com/ServiceLogin?x'});
 await assert.rejects(sendReportViaFormTab(config,fields,'other','note',signIn),/sign in/);
 assert.deepEqual(signIn.log.removed,[7],'tab closed after a failure too');
 await assert.rejects(sendReportViaFormTab(config,fields,'other','note',fakeBrowser({ok:false,status:0,url:'',error:'NetworkError'})),/NetworkError/);
});

test('the in-page sender reports network errors instead of throwing',async()=>{
 const saved=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline');};
 try{assert.deepEqual(await postReportInPage('https://docs.google.com/forms/d/e/x/formResponse','a=1'),{ok:false,status:0,url:'',error:'offline'});}
 finally{globalThis.fetch=saved;}
});