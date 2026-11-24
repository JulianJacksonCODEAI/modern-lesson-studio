import test from 'node:test';
import assert from 'node:assert/strict';
import {
  levelNumbersFromNotes,
  levelNamesFromMarkdown,
  levelRequests,
  initialLevelChoices,
  applyLevelChoices,
  choiceKey,
} from '../shared/levels.mjs';

test('level numbers come from the transition text in speaker notes', () => {
  assert.deepEqual(
    levelNumbersFromNotes(
      'Transition: Direct students to Lesson 16, Levels 2-4.'
    ),
    {lesson: 16, numbers: [2, 3, 4]}
  );
  assert.deepEqual(levelNumbersFromNotes('Go to Lesson 7, Level 5.'), {
    lesson: 7,
    numbers: [5],
  });
  assert.deepEqual(levelNumbersFromNotes('Lesson 3 Levels 2, 5 and 7'), {
    lesson: 3,
    numbers: [2, 5, 7],
  });
  assert.deepEqual(levelNumbersFromNotes('Lesson 3, Levels 2–3'), {
    lesson: 3,
    numbers: [2, 3],
  });
  assert.equal(levelNumbersFromNotes('No levels here.'), null);
  assert.equal(levelNumbersFromNotes(''), null);
});

test('level names come from the Notion page Levels list, by number', () => {
  const md = [
    '# Lesson 16',
    '## Objectives',
    '- Level 9: not a level list',
    '## Levels',
    '- Level 2: CSP U1L16 AI Lab Reflect',
    '- Level 3 — **CSP U1L16 AI Lab Compare**',
    '* Level 4: [CSP U1L16 Wrap](https://example.com)',
    '## Vocabulary',
    '- Level 5: after the list',
  ].join('\n');
  assert.deepEqual(levelNamesFromMarkdown(md), {
    2: 'CSP U1L16 AI Lab Reflect',
    3: 'CSP U1L16 AI Lab Compare',
    4: 'CSP U1L16 Wrap',
  });
  assert.deepEqual(levelNamesFromMarkdown('**Levels**\n| 2 | Table name |\n'), {
    2: 'Table name',
  });
  assert.deepEqual(levelNamesFromMarkdown('## Levels\nNothing listed'), {});
});

function lesson() {
  return {
    activities: [{id: 'a1'}, {id: 'a2'}],
    sections: [
      {
        id: 's1',
        activityId: 'a1',
        slide: 3,
        title: 'Warm up',
        progression: null,
        sourceNotes: 'No levels',
      },
      {
        id: 's2',
        activityId: 'a1',
        slide: 5,
        title: 'Try it',
        progression: null,
        sourceNotes: 'Lesson 16, Level 1',
      },
      {
        id: 's3',
        activityId: 'a2',
        slide: 11,
        title: 'Check',
        progression: null,
        sourceNotes: 'Lesson 16, Levels 2-4',
      },
    ],
  };
}

test('sections that name levels become requests, with Notion names filled in', () => {
  const requests = levelRequests(lesson());
  assert.deepEqual(
    requests.map(r => [r.sectionId, r.numbers]),
    [
      ['s2', [1]],
      ['s3', [2, 3, 4]],
    ]
  );
  const choices = initialLevelChoices(requests, {3: 'L3'});
  assert.deepEqual(choices[choiceKey('s3', 3)], {
    name: 'L3',
    source: 'notion',
    status: 'unchecked',
  });
  assert.equal(choices[choiceKey('s3', 2)].name, '');
});

const pkgFor = l => ({
  lesson: structuredClone(l),
  baseline: structuredClone(l),
});

test('verified levels go into empty groups, numbered by position across the lesson', () => {
  const l = lesson(),
    requests = levelRequests(l),
    choices = initialLevelChoices(requests);
  Object.assign(choices[choiceKey('s2', 1)], {name: 'L1', status: 'verified'});
  Object.assign(choices[choiceKey('s3', 2)], {name: 'L2', status: 'verified'});
  Object.assign(choices[choiceKey('s3', 3)], {name: 'L3', status: 'skipped'});
  Object.assign(choices[choiceKey('s3', 4)], {name: 'L4', status: 'verified'});
  // Level Builder: the first section already has one level Lesson Studio doesn't touch.
  const fresh = {
    activities: [
      {
        activitySections: [
          {scriptLevels: [{levels: [{name: 'Existing'}]}]},
          {scriptLevels: []},
        ],
      },
      {activitySections: [{scriptLevels: []}]},
    ],
  };
  const {pkg, linked, toCopy} = applyLevelChoices(
    pkgFor(l),
    fresh,
    requests,
    choices
  );
  assert.deepEqual(linked, ['s2', 's3']);
  const s2 = pkg.lesson.sections.find(s => s.id === 's2'),
    s3 = pkg.lesson.sections.find(s => s.id === 's3');
  assert.deepEqual(s2.progression, {
    title: '',
    levels: [{key: 'L1', number: 2, assessment: false}],
  });
  assert.deepEqual(
    s3.progression.levels.map(x => [x.key, x.number]),
    [
      ['L2', 3],
      ['L4', 4],
    ]
  );
  assert.deepEqual(pkg.baseline.sections[2].progression, s3.progression);
  assert.deepEqual(toCopy, [
    {where: 'Slide 11 · Check', number: 3, name: 'L3', reason: 'Skipped'},
  ]);
});

test('a group that already has other levels is not changed; its levels go to the copy list', () => {
  const l = lesson(),
    requests = levelRequests(l),
    choices = initialLevelChoices(requests);
  Object.assign(choices[choiceKey('s3', 2)], {name: 'L2', status: 'verified'});
  Object.assign(choices[choiceKey('s3', 3)], {name: 'L3', status: 'not-found'});
  Object.assign(choices[choiceKey('s3', 4)], {name: 'L4', status: 'unchecked'});
  const fresh = {
    activities: [
      {activitySections: [{scriptLevels: []}, {scriptLevels: []}]},
      {activitySections: [{scriptLevels: [{levels: [{name: 'Other'}]}]}]},
    ],
  };
  const {pkg, linked, toCopy} = applyLevelChoices(
    pkgFor(l),
    fresh,
    requests,
    choices
  );
  assert.deepEqual(linked, []);
  assert.equal(pkg.lesson.sections[2].progression, null);
  assert.deepEqual(
    toCopy.map(x => [x.where, x.number, x.reason]),
    [
      ['Slide 5 · Try it', 1, 'No level name'],
      ['Slide 11 · Check', 3, 'Not found in Level Builder'],
      ['Slide 11 · Check', 4, 'Name not checked'],
      [
        'Slide 11 · Check',
        2,
        'This level group in Level Builder already has levels',
      ],
    ]
  );
});

test('a group that already has exactly these levels is kept as it is', () => {
  const l = lesson(),
    requests = levelRequests(l),
    choices = initialLevelChoices(requests);
  for (const [n, name] of [
    [2, 'L2'],
    [3, 'L3'],
    [4, 'L4'],
  ]) {
    Object.assign(choices[choiceKey('s3', n)], {name, status: 'verified'});
  }
  const fresh = {
    activities: [
      {activitySections: [{scriptLevels: []}, {scriptLevels: []}]},
      {
        activitySections: [
          {
            progressionName: 'Check levels',
            scriptLevels: ['L2', 'L3', 'L4'].map(name => ({levels: [{name}]})),
          },
        ],
      },
    ],
  };
  const {pkg, linked} = applyLevelChoices(pkgFor(l), fresh, requests, choices);
  assert.deepEqual(linked, ['s3']);
  assert.equal(pkg.lesson.sections[2].progression.title, 'Check levels');
  assert.deepEqual(
    pkg.lesson.sections[2].progression.levels.map(x => x.number),
    [1, 2, 3]
  );
});
