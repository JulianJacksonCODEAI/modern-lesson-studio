import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {destinationFromTab,editorUrlFromInput,reviewPackageFor} from '../session.mjs';
import {sharedCandidates,withoutCandidates,sameIntent,keepSavedObjectives,normalizeObjective} from '../shared-choices.mjs';
import {assertWritableLesson} from '../dist/destination.mjs';
import {generate} from '../dist/core.mjs';
import {packageProblems} from '../dist/transfer-core.mjs';
import {sharedIntent} from '../dist/shared-records.mjs';

const source=JSON.parse(readFileSync(new URL('../dist/fixture.json',import.meta.url)));
const dest={id:8898985,url:'https://levelbuilder-studio.code.org/lessons/8898985/edit'};

test('any lesson editor tab is a destination; other pages are not',()=>{
 assert.deepEqual(destinationFromTab({url:'https://levelbuilder-studio.code.org/lessons/123/edit#x'}),{id:123,url:'https://levelbuilder-studio.code.org/lessons/123/edit'});
 for(const url of ['https://levelbuilder-studio.code.org/s/csp-unit1-dev-27-28/lessons/16/edit','https://levelbuilder-studio.code.org/courses/csp-dev-2027/units/1/lessons/16','https://levelbuilder-studio.code.org/lessons/123/edit?x=1','https://docs.google.com/presentation/d/x/edit',undefined])
  assert.equal(destinationFromTab({url}),null,String(url));
});

test('pasted lesson links and IDs become the canonical editor URL',()=>{
 for(const input of ['https://levelbuilder-studio.code.org/lessons/42/edit','levelbuilder-studio.code.org/lessons/42','  42 '])assert.equal(editorUrlFromInput(input),'https://levelbuilder-studio.code.org/lessons/42/edit');
 for(const input of ['https://levelbuilder-studio.code.org/s/x/lessons/3/edit','abc',''])assert.equal(editorUrlFromInput(input),null);
});

test('saving needs the user to confirm the lesson is theirs; lesson 10 is flagged',()=>{
 assert.throws(()=>assertWritableLesson({id:123,url:'https://levelbuilder-studio.code.org/lessons/123/edit'},false),/Confirm that this is your lesson/);
 assert.equal(assertWritableLesson({id:123,url:'https://levelbuilder-studio.code.org/lessons/123/edit'},true).protected,false);
 assert.equal(assertWritableLesson({id:8898984,url:'https://levelbuilder-studio.code.org/lessons/8898984/edit'},true).protected,true);
 assert.throws(()=>assertWritableLesson({id:1,url:'https://example.org/lessons/1/edit'},true),/editor page/);
});

test('an imported draft becomes an engine-valid review package',()=>{
 const pkg=reviewPackageFor(source,generate(source),dest);
 assert.deepEqual(packageProblems(pkg),[]);
});

test('skipped resources and vocabulary leave the draft and baseline together, so the package stays valid',()=>{
 const lesson=generate(source);
 lesson.resources=[{key:'import-0',name:'AI Lab',type:'Slides',audience:'Student',url:'https://docs.google.com/presentation/d/a/edit'},{key:'import-1',name:'AI Lab Activity Guide',type:'Activity Guide',audience:'Student',url:'https://docs.google.com/document/d/b/edit'}];
 lesson.frontMatter.vocabulary=['Accuracy: how often the answers are right','bad-entry-without-definition'];
 const pkg=reviewPackageFor(source,lesson,dest);
 const candidates=sharedCandidates(pkg.lesson);
 assert.deepEqual(candidates.map(c=>[c.kind,c.label,Boolean(c.problem)]),[['resources','AI Lab',false],['resources','AI Lab Activity Guide',false],['vocabularies','Accuracy',false],['vocabularies','bad-entry-without-definition',true]]);
 const reduced=withoutCandidates(pkg,[candidates[1],candidates[3]]);
 assert.deepEqual(reduced.lesson.resources.map(r=>r.name),['AI Lab']);
 assert.deepEqual(reduced.lesson.frontMatter.vocabulary,['Accuracy: how often the answers are right']);
 assert.deepEqual(reduced.baseline.resources,reduced.lesson.resources);
 assert.deepEqual(packageProblems(reduced),[]);
 assert.equal(pkg.lesson.resources.length,2,'original package is not changed');
 assert.ok(sameIntent(candidates[0],{kind:'resources',intent:sharedIntent('resources',lesson.resources[0])}));
 assert.ok(!sameIntent(candidates[0],{kind:'resources',intent:sharedIntent('resources',lesson.resources[1])}));
});

test("objectives: Level Builder's are kept exactly; Notion-only ones are listed, ignoring quote style, spacing and case",()=>{
 const lesson=generate(source);
 lesson.frontMatter.objectives=["Define criteria for evaluating whether an AI chatbot's responses are accurate.",'  test an AI chatbot against your own criteria ','Explain who is affected by AI mistakes.'];
 const pkg=reviewPackageFor(source,lesson,dest);
 const saved=['Define criteria for evaluating whether an AI chatbot’s responses are accurate','Test an AI chatbot against your own criteria.','Evaluate whether an AI system needs human oversight.'];
 const r=keepSavedObjectives(pkg,saved);
 assert.deepEqual(r.notCopied,['Explain who is affected by AI mistakes.']);
 assert.equal(r.alreadyThere,2);
 assert.deepEqual(r.pkg.lesson.frontMatter.objectives,saved);
 assert.deepEqual(r.pkg.baseline.frontMatter.objectives,saved);
 assert.deepEqual(packageProblems(r.pkg),[]);
 assert.equal(normalizeObjective('A  “B” ’c’.'),"a \"b\" 'c'");
 assert.deepEqual(keepSavedObjectives(pkg,[]).notCopied.length,3);
});