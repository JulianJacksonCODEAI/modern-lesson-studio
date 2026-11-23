// "Report a problem": builds a report from the current run and sends it to the team's Google Form.
// Five fields are filled automatically; the user picks a problem type and writes a note.
const FIELD_LIMIT=1800; // keeps every field readable in the response Sheet
const PENDING_KEY='pendingReports';

export const PROBLEM_TYPES=['wrong content','missing content','in the wrong place','didnt save','other'];
export const PROBLEM_LABELS={'wrong content':'Wrong content','missing content':'Missing content','in the wrong place':'In the wrong place','didnt save':"Didn't save",'other':'Other'};

const SHORTENED=' … [shortened; full run report kept locally]';
const clip=(text,limit=FIELD_LIMIT)=>{text=String(text??'').trim();return text.length>limit?text.slice(0,limit-SHORTENED.length).trimEnd()+SHORTENED:text;};

// context: {lesson:{title,url}, sources:{slides:{name,url},notion:{name,url}}, item:{label,content}|null, step, receipt, version, now}
export function buildReport(context){
 const {lesson,sources,item,step,receipt,version,now=new Date()}=context;
 const mismatches=receipt?.verification?.mismatches||[];
 const stepText=[
  'Step: '+(step||'unknown'),
  receipt?'Save result: '+receipt.status+(receipt.attemptedAt?' at '+receipt.attemptedAt:'')+(receipt.requestDigest?' · receipt '+String(receipt.requestDigest).slice(0,16):''):'Save result: no save attempted',
  mismatches.length?'Readback mismatches ('+mismatches.length+'):\n- '+mismatches.join('\n- '):(receipt?'Readback mismatches: none':'')
 ].filter(Boolean).join('\n');
 const fields={
  lesson:clip([lesson?.title||'(no lesson imported)',lesson?.url||'(no Level Builder lesson open)'].join('\n')),
  sources:clip([sources?.slides?`Slides: ${sources.slides.name} — ${sources.slides.url}`:'Slides: not imported',sources?.notion?`Notion: ${sources.notion.name} — ${sources.notion.url}`:'Notion: not imported'].join('\n')),
  flaggedItem:clip(item?`${item.label}\n---\n${item.content||'(empty)'}`:'General report (no specific item)'),
  stepAndReadback:clip(stepText),
  versionAndDate:`Lesson Studio ${version||'?'} · ${now.toISOString()}`
 };
 return {fields,suggestedType:suggestType(context)};
}

export function suggestType({item,receipt}){
 if(receipt&&receipt.status!=='saved-and-verified')return 'didnt save';
 if(receipt?.verification?.mismatches?.length)return 'didnt save';
 if(item)return 'wrong content';
 return 'other';
}

export function formBody(config,fields,problemType,note){
 if(!PROBLEM_TYPES.includes(problemType))throw Error('Choose a type of problem.');
 if(!String(note||'').trim())throw Error('Write a short note about what is wrong.');
 const body=new URLSearchParams();
 for(const [name,entry] of Object.entries(config.fields)){
  const value=name==='problemType'?problemType:name==='note'?clip(note,4000):fields[name];
  if(value===undefined)throw Error('Report field missing: '+name);
  body.append(entry,value);
 }
 return body;
}

// Injected into a docs.google.com/forms tab. Firefox sends an extension page's request without the user's
// Google cookies (seen 2026-11-22: redirect to accounts.google.com, then CORS block). From inside the form's
// own page (content.fetch in Firefox), the request is first-party, so the sign-in goes with it.
export async function postReportInPage(submitUrl,body){
 const pageFetch=globalThis.content&&typeof globalThis.content.fetch==='function'?globalThis.content.fetch.bind(globalThis.content):fetch;
 try{
  // From inside the form page, Google also expects the form's own hidden fields (session token fbzx, fvv,
  // pageHistory, partialResponse), as a real Submit sends; without them it answers 400 (seen in Firefox).
  const params=new URLSearchParams(body);
  const form=globalThis.document?.querySelector?.('form[action*="formResponse"]');
  for(const input of form?form.querySelectorAll('input[type="hidden"][name]'):[])if(!input.name.startsWith('entry.')&&!params.has(input.name))params.append(input.name,input.value);
  if(!params.has('fvv'))params.append('fvv','1');
  if(!params.has('pageHistory'))params.append('pageHistory','0');
  const response=await pageFetch(submitUrl,{method:'POST',body:params,credentials:'include',redirect:'follow'});
  return {ok:response.ok,status:response.status,url:String(response.url||'')};
 }catch(error){return {ok:false,status:0,url:'',error:String(error?.message||error)};}
}

// Second attempt: open the form in a background tab, send from inside it, then close the tab.
export async function sendReportViaFormTab(config,fields,problemType,note,{tabs=chrome.tabs,scripting=chrome.scripting,timeoutMs=30000}={}){
 const body=formBody(config,fields,problemType,note).toString();
 const tab=await tabs.create({url:config.submitUrl.replace(/\/formResponse$/,'/viewform'),active:false});
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{tabs.onUpdated.removeListener(on);reject(Error('The form page took too long to load.'));},timeoutMs);
   const on=(id,info)=>{if(id===tab.id&&info.status==='complete'){clearTimeout(timer);tabs.onUpdated.removeListener(on);resolve();}};
   tabs.onUpdated.addListener(on);
   tabs.get(tab.id).then(t=>{if(t.status==='complete')on(tab.id,{status:'complete'});}).catch(()=>{});
  });
  const [r]=await scripting.executeScript({target:{tabId:tab.id},func:postReportInPage,args:[config.submitUrl,body]});
  const result=r?.result||{};
  if(/accounts\.google\.com|ServiceLogin/.test(result.url))throw Error('Google asked you to sign in. Sign in to your code.org Google account in this browser, then try again.');
  if(!result.ok)throw Error(result.error||'The report form returned an error ('+result.status+').');
  return {sent:true,via:'form-tab',at:new Date().toISOString()};
 }finally{tabs.remove(tab.id).catch(()=>{});}
}

// Fallback when sending from the extension is blocked (seen in Firefox, 2026-11-22): the same report as a
// pre-filled Google Form link; the user clicks Submit in Google's own page, which also records their email.
export function prefilledFormUrl(config,fields,problemType,note){
 const params=new URLSearchParams({usp:'pp_url'});
 for(const [name,entry] of Object.entries(config.fields)){
  const value=name==='problemType'?(PROBLEM_TYPES.includes(problemType)?problemType:''):name==='note'?clip(note,1500):clip(fields[name],1200);
  if(value)params.append(entry,value);
 }
 return config.submitUrl.replace(/\/formResponse$/,'/viewform')+'?'+params.toString();
}

// Sends from the extension (host permission for docs.google.com/forms). Signed-in cookies go with it,
// so a form limited to code.org users records the sender's email.
export async function sendReport(config,fields,problemType,note,{fetchImpl=fetch}={}){
 const body=formBody(config,fields,problemType,note);
 const response=await fetchImpl(config.submitUrl,{method:'POST',body,credentials:'include',redirect:'follow'});
 const finalUrl=String(response.url||'');
 if(/accounts\.google\.com|ServiceLogin/.test(finalUrl))throw Error('Google asked you to sign in. Sign in to your code.org Google account in Chrome, then try again.');
 if(!response.ok)throw Error('The report form returned an error ('+response.status+').');
 return {sent:true,at:new Date().toISOString()};
}

export async function queueReport(report){
 const {[PENDING_KEY]:pending=[]}=await chrome.storage.local.get(PENDING_KEY);
 pending.push({...report,queuedAt:new Date().toISOString(),id:crypto.randomUUID()});
 await chrome.storage.local.set({[PENDING_KEY]:pending});
 return pending.length;
}
export async function pendingReports(){return (await chrome.storage.local.get(PENDING_KEY))[PENDING_KEY]||[];}
export async function removePending(id){
 const pending=(await pendingReports()).filter(r=>r.id!==id);
 await chrome.storage.local.set({[PENDING_KEY]:pending});
}
