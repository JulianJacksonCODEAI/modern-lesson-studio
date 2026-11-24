// Local preview of a built side panel with a stubbed chrome.* API (no real tabs, saves or reports).
// Usage: node scripts/preview-server.mjs [team|full] [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edition = process.argv[2] || 'team',
  port = Number(process.argv[3] || 5178);
const base = path.join(root, 'build', edition);
const types = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
};
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'engine', 'dist', 'fixture.json'), 'utf8')
);
const seed = {
  teamImports: {
    slides: {
      item: {
        kind: 'slides',
        title: fixture.title,
        slides: fixture.slides,
        warnings: [],
      },
      name: fixture.title + ' (preview deck)',
      count: fixture.slides.length,
      url: 'https://docs.google.com/presentation/d/preview/edit',
    },
    brief: {
      item: {
        kind: 'brief',
        title: fixture.title,
        fields: {
          teacherOverview: fixture.teacherOverview,
          studentOverview: fixture.studentOverview,
          objectives: fixture.objectives,
          preparation: fixture.preparation,
          purpose: fixture.purpose || '',
          vocabulary: fixture.vocabulary || [],
          resources: fixture.resources || [],
        },
        warnings: [],
      },
      name: fixture.title + ' (preview Notion page)',
      url: 'https://www.notion.so/preview',
    },
  },
};
const stub = `
const mem=${JSON.stringify(process.argv.includes('--empty') ? {} : seed)};const sess={};
const area=store=>({get:async k=>{if(k==null)return {...store};const keys=Array.isArray(k)?k:typeof k==='string'?[k]:Object.keys(k);return Object.fromEntries(keys.filter(x=>x in store).map(x=>[x,store[x]]));},set:async o=>{Object.assign(store,structuredClone(o));},remove:async k=>{for(const x of [].concat(k))delete store[x];}});
const ev=()=>({addListener(){}});
window.chrome={runtime:{getManifest:()=>({version:'preview'}),getURL:p=>'/'+p,id:'preview'},
 storage:{local:area(mem),session:area(sess)},
 tabs:{query:async()=>[],create:async o=>{console.log('[preview] would open',o.url);return {id:1};},get:async()=>({}),onUpdated:ev(),onActivated:ev()},
 scripting:{executeScript:async()=>{throw new Error('Preview only: no real tabs.');}}};
`;
http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') {
      return res.writeHead(302, {location: '/sidepanel/sidepanel.html'}).end();
    }
    if (url.pathname === '/__chrome-stub.js') {
      return res.writeHead(200, {'content-type': 'text/javascript'}).end(stub);
    }
    const file = path.join(base, decodeURIComponent(url.pathname));
    if (
      !file.startsWith(base) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      return res.writeHead(404).end('Not found');
    }
    let body = fs.readFileSync(file);
    if (file.endsWith('sidepanel.html')) {
      body = String(body).replace(
        '<script type="module"',
        '<script src="/__chrome-stub.js"></script>\n<script type="module"'
      );
    }
    res
      .writeHead(200, {
        'content-type': types[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      })
      .end(body);
  })
  .listen(port, () =>
    console.log(`Preview (${edition}) at http://localhost:${port}/`)
  );
