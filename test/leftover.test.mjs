import test from 'node:test';
import assert from 'node:assert/strict';
import {leftoverContent} from '../shared/leftover.mjs';

const imported = {
  activities: [{id: 'a1'}, {id: 'a2'}],
  sections: [
    {id: 's1', activityId: 'a1', callouts: [{}], progression: null},
    {id: 's2', activityId: 'a2', callouts: [], progression: {levels: [{}]}},
  ],
};

test('content the lesson keeps beyond the import is listed', () => {
  const saved = {
    activities: [
      {
        name: 'Warm Up',
        activitySections: [
          {name: 'Hook', tips: [{}, {}, {}], scriptLevels: [{}]},
          {name: 'Tracing Your Tree', tips: []},
        ],
      },
      {
        name: 'Activity',
        activitySections: [{name: 'Try it', tips: [], scriptLevels: [{}]}],
      },
      {name: 'Old wrap up', activitySections: [{}, {}]},
    ],
  };
  assert.deepEqual(
    leftoverContent(imported, saved).map(i => i.text),
    [
      'Activity 1 / Section 1: 2 more callouts than the import',
      'Activity 1 / Section 1: 1 level link',
      'Activity 1 / Section 2 “Tracing Your Tree”',
      'Activity 3 “Old wrap up”, with 2 sections',
    ]
  );
});

test('nothing is listed when the lesson has no more than the import', () => {
  const saved = {
    activities: [
      {activitySections: [{name: 'Hook', tips: [{}]}]},
      {activitySections: [{name: 'Try it', scriptLevels: [{}]}]},
    ],
  };
  assert.deepEqual(leftoverContent(imported, saved), []);
  assert.deepEqual(leftoverContent(imported, {activities: []}), []);
  assert.deepEqual(leftoverContent(null, null), []);
});
