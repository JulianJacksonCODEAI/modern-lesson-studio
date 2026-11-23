import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {firefoxManifest,FIREFOX_IDS} from '../scripts/firefox-manifest.mjs';

const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url)));

test('Firefox manifest swaps the side panel and service worker for a sidebar and background script',()=>{
 const f=firefoxManifest(manifest,{edition:'team'});
 assert.equal(f.side_panel,undefined);
 assert.ok(!f.permissions.includes('sidePanel'));
 assert.deepEqual(f.background,{scripts:['background/service-worker.js']});
 assert.equal(f.sidebar_action.default_panel,'sidepanel/sidepanel.html');
 assert.equal(f.browser_specific_settings.gecko.id,FIREFOX_IDS.team);
 assert.equal(f.version,manifest.version);
 assert.equal(f.browser_specific_settings.gecko.strict_min_version,'140.0','data_collection_permissions needs Firefox 140');
 assert.equal(f.browser_specific_settings.gecko_android.strict_min_version,'142.0','and Firefox for Android 142');
 assert.deepEqual(f.host_permissions,manifest.host_permissions);
 assert.equal(manifest.side_panel.default_path,'sidepanel/sidepanel.html','the Chromium manifest is not changed');
 assert.notEqual(firefoxManifest(manifest,{edition:'full'}).browser_specific_settings.gecko.id,f.browser_specific_settings.gecko.id);
 assert.throws(()=>firefoxManifest(manifest,{edition:'other'}),/Unknown edition/);
});

test("injected page reads use Firefox's page fetch when it exists, plain fetch otherwise",async()=>{
 const src=readFileSync(new URL('../engine/api-companion/read-lesson.mjs',import.meta.url),'utf8');
 assert.match(src,/globalThis\.content&&typeof globalThis\.content\.fetch==='function'\?globalThis\.content\.fetch\.bind\(globalThis\.content\):fetch/);
 for(const file of ['../engine/browser-fill/source-page-export.mjs','../engine/dist/native-dom-adapter.mjs','../engine/dist/native-level-usage.mjs','../engine/dist/shared-record-bridge.mjs'])
  assert.doesNotMatch(readFileSync(new URL(file,import.meta.url),'utf8'),/await fetch\(/,file);
});
