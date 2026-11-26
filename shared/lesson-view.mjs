// Read-only view of the imported lesson, in the order Level Builder shows it.
// Every item carries a ⚑ Report button; onReport receives {label, content}.
// Text is shown formatted (.md) and as its Markdown source (.source); the
// "Show Markdown source" switch on #lesson-view picks which one is visible.
import {inlineNodes, markdownBlock} from './markdown-view.mjs';

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter(c => c != null && c !== false));
  return n;
};

function item(
  label,
  content,
  onReport,
  {
    heading = 'h3',
    className = '',
    meta = '',
    tag = '',
    resources = [],
    plain = false,
  } = {}
) {
  const text = Array.isArray(content)
    ? content.join('\n')
    : String(content ?? '');
  const report = el('button', {
    type: 'button',
    className: 'flag-btn',
    textContent: '⚑ Report',
  });
  report.setAttribute('aria-label', 'Report a problem with ' + label);
  report.addEventListener('click', () => onReport({label, content: text}));
  const head = el(
    'div',
    {className: 'item-head'},
    el(heading, {textContent: label}),
    report
  );
  const empty = () =>
    el('p', {
      className: 'empty',
      textContent: 'Nothing imported for this field.',
    });
  let body;
  if (Array.isArray(content)) {
    body = content.length
      ? el(
          'ul',
          {},
          ...content.map(c =>
            el('li', {}, ...(plain ? [c] : inlineNodes(c, resources)))
          )
        )
      : empty();
  } else if (!text.trim()) {
    body = empty();
  } else if (plain) {
    body = el('p', {className: 'body-text', textContent: text});
  } else {
    body = el(
      'div',
      {className: 'item-body'},
      markdownBlock(text, resources),
      el('pre', {className: 'source', textContent: text})
    );
  }
  const metaLine =
    meta || tag
      ? el(
          'p',
          {className: 'meta'},
          meta,
          tag ? el('span', {className: 'item-tag', textContent: tag}) : null
        )
      : null;
  return el(
    'article',
    {className: 'lesson-item ' + className},
    head,
    metaLine,
    body
  );
}

export function renderLesson(container, lesson, onReport) {
  const fm = lesson.frontMatter || {};
  const vocab = (fm.vocabulary || []).map(v =>
    typeof v === 'string'
      ? v
      : [v.word, v.definition].filter(Boolean).join(': ')
  );
  const records = lesson.resources || [];
  const resources = records.map(
    r => `[${r.name}](${r.url}) (${r.type}, ${r.audience})`
  );
  const fields = [
    ['Lesson title', lesson.title, {plain: true}],
    ['Teacher overview', fm.teacherOverview],
    ['Student overview', fm.studentOverview],
    ['Purpose', fm.purpose],
    ['Preparation', fm.preparation],
    ['Assessment opportunities', fm.assessmentOpportunities],
    ['Objectives', fm.objectives || []],
    ['Vocabulary', vocab],
    ['Resources', resources],
  ];
  const front = el(
    'section',
    {className: 'lesson-group'},
    el('h2', {textContent: 'Lesson plan fields'}),
    ...fields.map(([label, content, opts]) =>
      item(label, content, onReport, {resources: records, ...opts})
    )
  );
  const guide = el(
    'section',
    {className: 'lesson-group'},
    el('h2', {textContent: 'Teaching guide'})
  );
  for (const activity of lesson.activities || []) {
    const sections = (lesson.sections || []).filter(
      s => s.activityId === activity.id
    );
    const block = el(
      'div',
      {className: 'activity'},
      item(
        `Activity: ${activity.title}`,
        `${activity.duration} minutes · ${sections.length} section${sections.length === 1 ? '' : 's'}`,
        onReport,
        {heading: 'h3', className: 'activity-head', plain: true}
      )
    );
    for (const s of sections) {
      const label = `Section: ${s.title || 'Untitled section'}`;
      const meta = [
        `Slide ${s.slide}`,
        s.duration != null ? `${s.duration} minutes` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      const node = item(label, s.body, onReport, {
        heading: 'h4',
        className: 'section',
        meta,
        // Matches the grouped "no Title (N minutes) line" warning above the lesson.
        tag: String(s.title || '').trim() ? '' : 'No title line',
        resources: records,
      });
      for (const c of s.callouts || []) {
        node.append(
          item(
            `${c.type} (in “${s.title || 'Untitled section'}”)`,
            c.body,
            onReport,
            {heading: 'h5', className: 'callout', resources: records}
          )
        );
      }
      if (s.progression) {
        node.append(
          item(
            `Levels: ${s.progression.title || 'Untitled level group'}`,
            s.progression.levels.map(
              l =>
                `Level ${l.number}: ${l.key}${l.assessment ? ' (assessment)' : ''}`
            ),
            onReport,
            {heading: 'h5', className: 'levels', plain: true}
          )
        );
      }
      block.append(node);
    }
    guide.append(block);
  }
  container.replaceChildren(front, guide);
}

// Plain-language list of what the save will change, from the engine's save review.
// leftover: from leftoverContent(), what the lesson keeps that isn't in the import.
export function renderReview(
  container,
  review,
  {protectedLesson = false, leftover = []} = {}
) {
  const counts = review.expectedCounts || {};
  const lines = [];
  for (const c of review.fieldChanges || []) {
    lines.push(`Update ${c.label || c.path?.join(' / ') || 'a lesson field'}`);
  }
  for (const c of review.activityAdditions || []) {
    lines.push(`Add activity “${c.activity?.name}”`);
  }
  for (const c of review.sectionAdditions || []) {
    lines.push(`Add section “${c.section?.name || 'Untitled'}” (${c.label})`);
  }
  for (const c of review.calloutAdditions || []) {
    lines.push(`Add ${c.tip?.type || 'callout'} (${c.label})`);
  }
  for (const c of review.changes || []) {
    if (c.addLevels?.length) {
      lines.push(
        `Link ${c.addLevels.length} existing level${c.addLevels.length === 1 ? '' : 's'} to “${c.section || c.activity}”`
      );
    }
  }
  for (const c of review.objectiveAdditions || []) {
    lines.push(`Add objective: ${c.objective?.description}`);
  }
  for (const c of review.sharedAdditions || []) {
    lines.push(
      `Link ${c.kind === 'resources' ? 'resource' : 'vocabulary word'} “${c.record?.name || c.record?.word}”`
    );
  }
  const summary = el('p', {
    className: 'review-summary',
    textContent: `After saving, the lesson will have ${counts.activities ?? '?'} activities, ${counts.sections ?? '?'} sections, ${counts.callouts ?? '?'} callouts and ${counts.levels ?? '?'} level links. Everything not listed stays as it is.`,
  });
  const list = lines.length
    ? el(
        'ul',
        {className: 'change-list'},
        ...lines.map(t => el('li', {textContent: t}))
      )
    : el('p', {
        textContent:
          'No changes: the lesson already matches the imported content.',
      });
  container.replaceChildren(
    ...[
      el('h3', {
        textContent: `${lines.length} change${lines.length === 1 ? '' : 's'} to ${review.baseline?.name || 'the lesson'}`,
      }),
      list,
      summary,
      leftover.length
        ? el(
            'div',
            {className: 'warnbox leftover'},
            el('h4', {
              textContent: `Kept from the lesson: ${leftover.length} item${leftover.length === 1 ? '' : 's'} not in your import`,
            }),
            el('p', {
              textContent:
                "Lesson Studio doesn't delete anything, so this content from the Level Builder lesson stays after saving. If it's from an earlier version or another lesson, delete it in Level Builder.",
            }),
            el(
              'ul',
              {},
              ...leftover.map(item => el('li', {textContent: item.text}))
            )
          )
        : null,
      protectedLesson
        ? el('p', {
            className: 'warn',
            textContent:
              '⚠ Sandbox lesson 10 holds the accepted AI Lab save. Saving here changes that lesson. Use lesson 11 for tests.',
          })
        : null,
    ].filter(Boolean)
  );
  return lines.length;
}
