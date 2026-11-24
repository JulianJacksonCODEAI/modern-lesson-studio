import test from 'node:test';
import assert from 'node:assert/strict';
import {savedSectionBlanks, sectionDifferences} from '../dist/save-review.mjs';
import {canonical} from '../dist/transfer-core.mjs';

// From the first live save to lesson 8898985 (2026-11-22): the untitled new section came back with nulls.
const reviewed = {
  name: '',
  description: 'Wrap up: share one thing you learned.',
  duration: null,
  remarks: false,
  progressionName: '',
  tips: [],
  scriptLevels: [],
};
const saved = {
  name: null,
  description: 'Wrap up: share one thing you learned.',
  duration: null,
  remarks: null,
  progressionName: null,
  tips: null,
  scriptLevels: [],
};

test("Level Builder's null blanks match the reviewed empty values", () => {
  assert.notEqual(canonical(saved), canonical(reviewed));
  assert.equal(
    canonical(savedSectionBlanks(saved)),
    canonical(savedSectionBlanks(reviewed))
  );
});

test('real content differences are still mismatches', () => {
  for (const change of [
    {description: 'Different text'},
    {name: 'Wrap-up'},
    {remarks: true},
    {tips: [{type: 'teachingTip', markdown: 'x'}]},
    {duration: 5},
  ])
    assert.notEqual(
      canonical(savedSectionBlanks({...saved, ...change})),
      canonical(savedSectionBlanks(reviewed)),
      JSON.stringify(change)
    );
});

test('a failed new-section check names the fields that differ', () => {
  const msg = sectionDifferences(
    {name: '', duration: null, tips: [{key: 'a', markdown: 'x'}]},
    {name: '', duration: 5, tips: [{key: 'a', markdown: 'y'}]}
  );
  assert.match(msg, /duration: saved null, reviewed 5/);
  assert.match(msg, /tips\[0\]\.markdown: saved "x", reviewed "y"/);
  assert.doesNotMatch(msg, /name/);
});
test('a new section saved with its duration as text matches the reviewed number', () => {
  assert.equal(
    canonical(savedSectionBlanks({name: '', duration: '5'})),
    canonical(savedSectionBlanks({name: '', duration: 5}))
  );
  assert.notEqual(
    canonical(savedSectionBlanks({duration: '6'})),
    canonical(savedSectionBlanks({duration: 5})),
    'a different duration still fails'
  );
  assert.notEqual(
    canonical(savedSectionBlanks({duration: '5 min'})),
    canonical(savedSectionBlanks({duration: 5})),
    'non-numeric text is not converted'
  );
});
