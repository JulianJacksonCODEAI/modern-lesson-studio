import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanResourceUrl,buildLesson} from '../shared/sources.mjs';

test('Google sharing tags are removed so links match Level Builder records',()=>{
 assert.equal(cleanResourceUrl('https://docs.google.com/presentation/d/1Uq3/edit?usp=sharing'),'https://docs.google.com/presentation/d/1Uq3/edit');
 assert.equal(cleanResourceUrl('https://docs.google.com/document/d/1ZG/edit?usp=drive_link&tab=t.0'),'https://docs.google.com/document/d/1ZG/edit?tab=t.0');
 assert.equal(cleanResourceUrl('https://drive.google.com/file/d/x/view?usp=sharing'),'https://drive.google.com/file/d/x/view');
 assert.equal(cleanResourceUrl('https://docs.google.com/document/d/1ZG/edit#heading=h.1'),'https://docs.google.com/document/d/1ZG/edit#heading=h.1');
 assert.equal(cleanResourceUrl('https://example.org/page?usp=sharing'),'https://example.org/page?usp=sharing','other sites are left alone');
 assert.equal(cleanResourceUrl('not a url'),'not a url');
});

test('imported Notion resources come out with clean links',()=>{
 const imports={
  slides:{name:'Deck',item:{kind:'slides',title:'Deck',slides:[{id:'a',number:1,notes:'Warm-up (5 minutes)'},{id:'b',number:2,notes:'Discuss AI.'}],warnings:[]}},
  brief:{name:'Brief',item:{kind:'brief',title:'L16: AI Lab',fields:{resources:[{key:'import-0',name:'AI Lab',type:'Slides',audience:'Student',url:'https://docs.google.com/presentation/d/1Uq3/edit?usp=sharing'}]},warnings:[]}}
 };
 const built=buildLesson(imports);
 assert.equal(built.lesson.resources[0].url,'https://docs.google.com/presentation/d/1Uq3/edit');
 assert.equal(built.source.resources[0].url,'https://docs.google.com/presentation/d/1Uq3/edit');
});
