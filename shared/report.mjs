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

// Injected into the report form's page (a pre-filled docs.google.com/forms/…/viewform) in a background tab.
// Live, 2026-11-22: the form collects verified emails, so Google rejects a POST (HTTP 400,
// data-email-from-recipient-required) unless the respondent ticks "Record <email> as the email to be
// included with my response". So this does what a person does: tick that box, then press Google's own
// Submit button, letting the page's script build and send the response.
export async function submitReportFormInPage(){
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 let form=null;
 for(let i=0;i<40&&!form;i++){form=document.querySelector('form[action*="formResponse"]');if(!form)await wait(250);}
 if(!form)return {ok:false,error:document.querySelector('input[type="email"],#identifierId')?'sign-in':'The report form did not load.'};
 let submit=null;
 for(let i=0;i<40&&!submit;i++){
  submit=document.querySelector('[role="button"][jsname="M2UYVd"]')||[...document.querySelectorAll('[role="button"]')].find(b=>/^submit$/i.test((b.getAttribute('aria-label')||b.textContent||'').trim()));
  if(!submit)await wait(250);
 }
 if(!submit)return {ok:false,error:'The report form has no Submit button.'};
 const emailBox=[...document.querySelectorAll('[role="checkbox"]')].find(c=>/email/i.test(c.getAttribute('aria-label')||''));
 if(emailBox&&emailBox.getAttribute('aria-checked')!=='true'){
  emailBox.click();
  for(let i=0;i<20&&emailBox.getAttribute('aria-checked')!=='true';i++)await wait(100);
  if(emailBox.getAttribute('aria-checked')!=='true')return {ok:false,error:'Could not tick "Record my email" on the report form.'};
 }
 setTimeout(()=>submit.click(),0);
 return {ok:true,emailBox:!!emailBox};
}
// After the submission's page loads: Google's confirmation page has no response form; a rejected
// submission shows the form again (data-validation-failed="true").
export function reportFormOutcome(){
 const rejected=!!document.querySelector('form[action*="formResponse"]')||!!document.querySelector('[data-validation-failed="true"]');
 return {recorded:!rejected,url:location.href,text:(document.body?.innerText||'').slice(0,300)};
}

const waitForLoad=(tabs,tabId,timeoutMs,{after=null,message='The report form took too long to load.',signal=null}={})=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{tabs.onUpdated.removeListener(on);reject(Error(message));},timeoutMs);
 const on=(id,info,tab)=>{if(id===tabId&&info.status==='complete'&&(!after||after(tab))){clearTimeout(timer);tabs.onUpdated.removeListener(on);resolve(tab);}};
 tabs.onUpdated.addListener(on);
 signal?.addEventListener('abort',()=>{clearTimeout(timer);tabs.onUpdated.removeListener(on);reject(Error('Stopped.'));});
 if(!after)tabs.get(tabId).then(t=>{if(t.status==='complete')on(tabId,{status:'complete'},t);}).catch(()=>{});
});
const SIGN_IN='Google asked you to sign in. Sign in to your code.org Google account in this browser, then try again.';

// Second attempt: open the pre-filled form in a background tab, tick the email box, press Submit,
// check Google's confirmation page, close the tab.
export async function sendReportViaFormTab(config,fields,problemType,note,{tabs=chrome.tabs,scripting=chrome.scripting,timeoutMs=30000}={}){
 formBody(config,fields,problemType,note); // same checks as a direct send: a type and a note are required
 const stop=new AbortController();
 const tab=await tabs.create({url:prefilledFormUrl(config,fields,problemType,note),active:false});
 try{
  const loaded=await waitForLoad(tabs,tab.id,timeoutMs,{signal:stop.signal});
  if(/accounts\.google\.com|ServiceLogin/.test(String(loaded?.url||'')))throw Error(SIGN_IN);
  const submitted=waitForLoad(tabs,tab.id,timeoutMs,{after:t=>/\/formResponse/.test(String(t?.url||'')),message:'Google did not confirm the report.',signal:stop.signal});
  submitted.catch(()=>{});
  const [r]=await scripting.executeScript({target:{tabId:tab.id},func:submitReportFormInPage});
  const started=r?.result||{};
  if(!started.ok)throw Error(started.error==='sign-in'?SIGN_IN:started.error||'The report form could not be filled in.');
  await submitted;
  const [o]=await scripting.executeScript({target:{tabId:tab.id},func:reportFormOutcome});
  if(!o?.result?.recorded)throw Error('Google did not accept the report.');
  return {sent:true,via:'form-tab',at:new Date().toISOString()};
 }finally{stop.abort();tabs.remove(tab.id).catch(()=>{});}
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
