import test from 'node:test';
import assert from 'node:assert/strict';
import {sameSavedField} from '../engine/dist/save-review.mjs';

const section = key => ['activities', 0, 'activitySections', 1, key];

test('a saved field passes when Level Builder returns the same value in another form the lesson check accepts', () => {
  assert.ok(
    sameSavedField(section('duration'), '15', 15),
    'digit-string minutes'
  );
  assert.ok(sameSavedField(section('duration'), 15, '15'));
  assert.ok(sameSavedField(section('duration'), null, ''), 'empty timing');
  assert.ok(
    sameSavedField(['overview'], null, ''),
    'empty text returned as null'
  );
  assert.ok(sameSavedField(section('remarks'), null, false));
  assert.ok(sameSavedField(section('description'), 'Same text', 'Same text'));
});

test('a saved field still fails on any real difference', () => {
  assert.ok(!sameSavedField(section('duration'), '15', 20));
  assert.ok(
    !sameSavedField(section('duration'), '15 min', 15),
    'non-whole-minute text is not minutes'
  );
  assert.ok(
    !sameSavedField(section('description'), 'Text ', 'Text'),
    'whitespace counts'
  );
  assert.ok(
    !sameSavedField(section('description'), 'Text\r\nMore', 'Text\nMore'),
    'line endings count'
  );
  assert.ok(!sameSavedField(['overview'], 'Old', 'New'));
  assert.ok(!sameSavedField(section('remarks'), true, false));
  assert.ok(
    !sameSavedField(
      ['activities', 0, 'activitySections', 1, 'tips', 0, 'type'],
      'teachingTip',
      'discussionGoal'
    )
  );
});
