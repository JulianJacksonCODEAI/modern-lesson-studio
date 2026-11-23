// Read-only view of the imported lesson, in the order Level Builder shows it.
// Every item carries a ⚑ Report button; onReport receives {label, content}.
const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children.filter(c=>c!=null&&c!==false));return n;};

function item(label,content,onReport,{heading='h3',className='',meta=''}={}){
 const text=Array.isArray(content)?content.join('\n'):String(content??'');
 const report=el('button',{type:'button',className:'flag-btn',textContent:'⚑ Report'});
 report.setAttribute('aria-label','Report a problem with '+label);
 report.addEventListener('click',()=>onReport({label,content:text}));
 const head=el('div',{className:'item-head'},el(heading,{textContent:label}),report);
 const body=Array.isArray(content)
  ?(content.length?el('ul',{},...content.map(c=>el('li',{textContent:c}))):el('p',{className:'empty',textContent:'Nothing imported for this field.'}))
  :(text.trim()?el('p',{className:'body-text',textContent:text}):el('p',{className:'empty',textContent:'Nothing imported for this field.'}));
 return el('article',{className:'lesson-item '+className},head,meta?el('p',{className:'meta',textContent:meta}):null,body);
}

export function renderLesson(container,lesson,onReport){
 const fm=lesson.frontMatter||{};
 const vocab=(fm.vocabulary||[]).map(v=>typeof v==='string'?v:[v.word,v.definition].filter(Boolean).join(': '));
 const resources=(lesson.resources||[]).map(r=>`${r.name} (${r.type}, ${r.audience}) — ${r.url}`);
 const fields=[
  ['Lesson title',lesson.title],
  ['Teacher overview',fm.teacherOverview],
  ['Student overview',fm.studentOverview],
  ['Purpose',fm.purpose],
  ['Preparation',fm.preparation],
  ['Assessment opportunities',fm.assessmentOpportunities],
  ['Objectives',fm.objectives||[]],
  ['Vocabulary',vocab],
  ['Resources',resources]
 ];
 const front=el('section',{className:'lesson-group'},el('h2',{textContent:'Lesson plan fields'}),...fields.map(([label,content])=>item(label,content,onReport)));
 const guide=el('section',{className:'lesson-group'},el('h2',{textContent:'Teaching guide'}));
 for(const activity of lesson.activities||[]){
  const sections=(lesson.sections||[]).filter(s=>s.activityId===activity.id);
  const block=el('div',{className:'activity'},item(`Activity: ${activity.title}`,`${activity.duration} minutes · ${sections.length} section${sections.length===1?'':'s'}`,onReport,{heading:'h3',className:'activity-head'}));
  for(const s of sections){
   const label=`Section: ${s.title||'Untitled section'}`;
   const meta=[`Slide ${s.slide}`,s.duration!=null?`${s.duration} minutes`:null].filter(Boolean).join(' · ');
   const node=item(label,s.body,onReport,{heading:'h4',className:'section',meta});
   for(const c of s.callouts||[])node.append(item(`${c.type} (in “${s.title||'Untitled section'}”)`,c.body,onReport,{heading:'h5',className:'callout'}));
   if(s.progression)node.append(item(`Levels: ${s.progression.title||'Untitled level group'}`,s.progression.levels.map(l=>`Level ${l.number}: ${l.key}${l.assessment?' (assessment)':''}`),onReport,{heading:'h5',className:'levels'}));
   block.append(node);
  }
  guide.append(block);
 }
 container.replaceChildren(front,guide);
}

// Plain-language list of what the save will change, from the engine's save review.
export function renderReview(container,review,{protectedLesson=false}={}){
 const counts=review.expectedCounts||{};
 const lines=[];
 for(const c of review.fieldChanges||[])lines.push(`Update ${c.label||c.path?.join(' / ')||'a lesson field'}`);
 for(const c of review.activityAdditions||[])lines.push(`Add activity “${c.activity?.name}”`);
 for(const c of review.sectionAdditions||[])lines.push(`Add section “${c.section?.name||'Untitled'}” (${c.label})`);
 for(const c of review.calloutAdditions||[])lines.push(`Add ${c.tip?.type||'callout'} (${c.label})`);
 for(const c of review.changes||[])if(c.addLevels?.length)lines.push(`Link ${c.addLevels.length} existing level${c.addLevels.length===1?'':'s'} to “${c.section||c.activity}”`);
 for(const c of review.objectiveAdditions||[])lines.push(`Add objective: ${c.objective?.description}`);
 for(const c of review.sharedAdditions||[])lines.push(`Link ${c.kind==='resources'?'resource':'vocabulary word'} “${c.record?.name||c.record?.word}”`);
 const summary=el('p',{className:'review-summary',textContent:`After saving, the lesson will have ${counts.activities??'?'} activities, ${counts.sections??'?'} sections, ${counts.callouts??'?'} callouts and ${counts.levels??'?'} level links. Everything not listed stays as it is.`});
 const list=lines.length?el('ul',{className:'change-list'},...lines.map(t=>el('li',{textContent:t}))):el('p',{textContent:'No changes: the lesson already matches the imported content.'});
 container.replaceChildren(...[
  el('h3',{textContent:`${lines.length} change${lines.length===1?'':'s'} to ${review.baseline?.name||'the lesson'}`}),
  list,summary,
  protectedLesson?el('p',{className:'warn',textContent:'⚠ Sandbox lesson 10 holds the accepted AI Lab save. Saving here changes that lesson. Use lesson 11 for tests.'}):null
 ].filter(Boolean));
 return lines.length;
}
