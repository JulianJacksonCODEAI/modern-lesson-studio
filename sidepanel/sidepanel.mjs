// Lesson Studio side panel (team v1): Import → Check (read-only) → Save to Level Builder → Report.
import {
  loadImports,
  saveImports,
  clearImports,
  importSlides,
  importNotion,
  buildLesson,
} from '../shared/sources.mjs';
import {renderLesson, renderReview} from '../shared/lesson-view.mjs';
import {
  buildReport,
  sendReport,
  sendReportViaFormTab,
  queueReport,
  pendingReports,
  removePending,
  openFilledReportForm,
  PROBLEM_TYPES,
  PROBLEM_LABELS,
} from '../shared/report.mjs';
import {
  createSession,
  destinationFromTab,
  editorUrlFromInput,
  lessonPageFromInput,
  lessonDescriptionInPage,
  reviewPackageFor,
  SANDBOX_LESSONS,
} from '../engine/session.mjs';
import {AIService} from '../ai/ai-service.mjs';
import {
  moveLessonDataToSession,
  sessionRecordStore,
} from '../shared/lesson-store.mjs';

const $ = id => document.getElementById(id);
const VERSION = chrome.runtime.getManifest().version;
const STEPS = ['import', 'check', 'save'];
let imports = {slides: null, brief: null},
  built = null,
  session = null,
  destination = null,
  destTabId = null,
  currentStep = 'import',
  busy = false;
let reportConfig = null,
  reportDraft = null;
// Lesson data is kept only until the browser closes. Moves anything an earlier version saved to disk first.
const moved = moveLessonDataToSession().catch(err =>
  console.warn('Moving old lesson data failed:', err)
);
const recordStore = moved.then(() =>
  sessionRecordStore({
    onError: err => console.warn('Save record not kept:', err),
  })
);

// ---------- small helpers ----------
function toast(text, ms = 3500) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.hidden = true;
  }, ms);
}
const say = (id, text, kind = '') => {
  const n = $(id);
  n.textContent = text;
  n.dataset.kind = kind;
};
async function activeTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  return tab;
}
async function withBusy(button, label, action) {
  if (busy) {
    return;
  }
  busy = true;
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  button.setAttribute('aria-busy', 'true');
  try {
    return await action();
  } finally {
    busy = false;
    button.textContent = old;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    refresh();
  }
}
function notes(container, list, title) {
  container.hidden = !list.length;
  if (!list.length) {
    return;
  }
  const ul = document.createElement('ul');
  for (const w of list) {
    const li = document.createElement('li');
    li.textContent = w;
    ul.append(li);
  }
  const h = document.createElement('h3');
  h.textContent = title;
  container.replaceChildren(h, ul);
}

// ---------- tabs (focusgroup with a keyboard fallback) ----------
const tabButtons = STEPS.map(s => $('tab-' + s));
function selectStep(step, {focus = false} = {}) {
  currentStep = step;
  for (const s of STEPS) {
    const tab = $('tab-' + s),
      panel = $('panel-' + s),
      on = s === step;
    tab.setAttribute('aria-selected', String(on));
    tab.toggleAttribute('focusgroupstart', on);
    panel.hidden = !on;
    if (on) {
      panel.tabIndex = 0;
    } else {
      panel.removeAttribute('tabindex');
    }
  }
  if (focus) {
    $('tab-' + step).focus();
  }
  // Look for the lesson editor only once the Save step stays open, so arrowing past the tab doesn't start a search.
  clearTimeout(selectStep.timer);
  if (step === 'save') {
    selectStep.timer = setTimeout(() => {
      if (currentStep === 'save') {
        findDestination();
      }
    }, 300);
  }
}
for (const s of STEPS) {
  $('tab-' + s).addEventListener('click', () => selectStep(s));
  $('tab-' + s).addEventListener('focus', () => {
    if (currentStep !== s || $('panel-' + s).hidden) {
      selectStep(s);
    }
  }); // selection follows focus
}
if (!Object.hasOwn(HTMLElement.prototype, 'focusGroup')) {
  for (const b of tabButtons) {
    b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
  }
  $('tablist').addEventListener('keydown', e => {
    const i = tabButtons.indexOf(document.activeElement);
    if (i < 0) {
      return;
    }
    const next = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: tabButtons.length - 1,
    }[e.key];
    if (next === undefined) {
      return;
    }
    e.preventDefault();
    const step = STEPS[(next + STEPS.length) % STEPS.length];
    selectStep(step, {focus: true});
    tabButtons.forEach(b => {
      b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
    });
  });
  for (const s of STEPS) {
    $('tab-' + s).addEventListener('click', () =>
      tabButtons.forEach(b => {
        b.tabIndex = b.getAttribute('aria-selected') === 'true' ? 0 : -1;
      })
    );
  }
}

// ---------- 1 · Import ----------
function rebuild() {
  built = null;
  try {
    built = buildLesson(imports);
    say('import-msg', '');
  } catch (e) {
    say('import-msg', 'The lesson could not be built: ' + e.message, 'error');
  }
  renderCheck();
  refresh();
}
$('btn-slides').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Reading the deck…', async () => {
    try {
      imports.slides = await importSlides(await activeTab());
      await saveImports(imports);
      rebuild();
      toast(`Imported ${imports.slides.count} slides.`);
    } catch (err) {
      say('import-msg', err.message, 'error');
    }
  })
);
$('btn-notion').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Reading the page…', async () => {
    try {
      imports.brief = await importNotion(await activeTab());
      await saveImports(imports);
      rebuild();
      toast('Imported the Notion page.');
    } catch (err) {
      say('import-msg', err.message, 'error');
    }
  })
);
$('btn-reset').addEventListener('click', async () => {
  imports = {slides: null, brief: null};
  await clearImports();
  session?.reset();
  session = null;
  rebuild();
  selectStep('import');
  toast('Cleared. Import a deck to start again.');
});
$('btn-to-check').addEventListener('click', () =>
  selectStep('check', {focus: true})
);

// ---------- 2 · Check ----------
function lessonForAudit(lesson) {
  return {
    ...lesson,
    activities: lesson.activities.map(a => ({
      ...a,
      sections: lesson.sections.filter(s => s.activityId === a.id),
    })),
  };
}
function renderCheck() {
  $('check-empty').hidden = !!built;
  $('ai-box').hidden = !built;
  if (!built) {
    $('lesson-view').replaceChildren();
    notes($('check-warnings'), [], '');
    return;
  }
  notes($('check-warnings'), built.warnings, 'Things to look at');
  renderLesson($('lesson-view'), built.lesson, item => openReport(item));
}
$('btn-to-save').addEventListener('click', () =>
  selectStep('save', {focus: true})
);
$('btn-audit').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Checking…', async () => {
    const r = await AIService.auditCurriculum(lessonForAudit(built.lesson));
    const out = $('audit-out'),
      h = document.createElement('p');
    h.className = 'audit-score';
    h.textContent = `Score ${r.score}/100 (${r.grade})`;
    const ul = document.createElement('ul');
    for (const i of r.issues) {
      const li = document.createElement('li');
      li.textContent = `${i.category}: ${i.message}`;
      ul.append(li);
    }
    const parts = [h, ul];
    if (r.aiInsight) {
      const p = document.createElement('p');
      p.className = 'body-text';
      p.textContent = r.aiInsight;
      parts.push(p);
    }
    out.replaceChildren(...parts);
  })
);
$('btn-vocab').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Thinking…', async () => {
    const text = [
      built.lesson.frontMatter.teacherOverview,
      ...built.lesson.sections.map(s => s.body),
    ]
      .join('\n')
      .slice(0, 6000);
    const terms = await AIService.generateVocabDefinitions(text);
    const ul = document.createElement('ul');
    for (const t of terms || []) {
      const li = document.createElement('li');
      li.textContent = `${t.word}: ${t.definition}`;
      ul.append(li);
    }
    $('vocab-out').replaceChildren(
      terms?.length
        ? ul
        : Object.assign(document.createElement('p'), {
            textContent: 'No suggestions.',
          })
    );
  })
);
async function setupAI() {
  try {
    const caps = await AIService.detectCapabilities();
    const real = !!caps.hasPromptApi;
    $('ai-extra').hidden = !real;
    $('ai-note').textContent = real
      ? "Using Chrome's built-in AI on this computer."
      : "Chrome's built-in AI isn't available here, so only the rule-based quality check runs.";
  } catch {
    $('ai-extra').hidden = true;
  }
}

// ---------- 3 · Save ----------
let lessonInfo = null,
  pinnedTabId = null;
const sharedChoices = new Map(); // "kind:index" → 'add' | 'skip'
const choiceKey = c => c.kind + ':' + c.index;

async function findDestination() {
  const tabs = await chrome.tabs.query({
    url: 'https://levelbuilder-studio.code.org/lessons/*/edit*',
    currentWindow: true,
  });
  const candidates = tabs.filter(t => destinationFromTab(t));
  const chosen =
    candidates.find(t => t.id === pinnedTabId) ||
    candidates.find(t => t.active) ||
    candidates[0];
  const next = chosen ? destinationFromTab(chosen) : null;
  if (next?.id !== destination?.id || chosen?.id !== destTabId) {
    destination = next;
    destTabId = chosen?.id ?? null;
    lessonInfo = null;
    sharedChoices.clear();
    session = destination
      ? createSession({
          tabId: destTabId,
          destination,
          storage: await recordStore,
          onProgress: m => say('save-msg', m),
        })
      : null;
    if (session) {
      try {
        lessonInfo = await session.describe();
      } catch (err) {
        lessonInfo = {error: err.message};
      }
    }
    renderDestination();
    renderShared();
    renderSession();
  } else if (session && (!lessonInfo || lessonInfo.error)) {
    // the editor may still have been loading
    try {
      lessonInfo = await session.describe();
    } catch (err) {
      lessonInfo = {error: err.message};
    }
    renderDestination();
  }
  say(
    'dest-status',
    destination
      ? ''
      : 'Open your lesson in Level Builder (its editor page), or paste its link below.'
  );
  refresh();
}
function renderDestination() {
  $('dest-found').hidden = !destination;
  if (!destination) {
    return;
  }
  const sandbox = SANDBOX_LESSONS[destination.id];
  const rows = [
    [
      'Lesson',
      lessonInfo?.lessonName ||
        (lessonInfo?.error ? '(could not read the name)' : '…'),
    ],
    [
      'Unit or course',
      lessonInfo?.unitName || lessonInfo?.unitKey || '(not shown on this page)',
    ],
    [
      'Lesson ID',
      String(destination.id) + (sandbox ? ` · ${sandbox.label}` : ''),
    ],
  ];
  $('dest-info').replaceChildren(
    ...rows.flatMap(([k, v]) => [
      Object.assign(document.createElement('dt'), {textContent: k}),
      Object.assign(document.createElement('dd'), {textContent: v}),
    ])
  );
  $('dest-warn').hidden = !sandbox?.protected;
  $('dest-warn').textContent =
    '⚠ This lesson holds the accepted AI Lab save. Saving here changes it. Use sandbox lesson 11 for tests.';
  $('own-lesson').checked = session?.state.ownershipConfirmed === true;
}
$('own-lesson').addEventListener('change', () => {
  session?.confirmOwnership($('own-lesson').checked);
  refresh();
});
$('btn-change-lesson').addEventListener('click', () => {
  $('dest-open').hidden = false;
  $('lesson-link').focus();
});
// Resolves when the tab finishes loading (or already has).
async function tabLoaded(tabId, ms = 30000) {
  const now = await chrome.tabs.get(tabId);
  if (now.status === 'complete') {
    return now;
  }
  return new Promise((resolve, reject) => {
    const on = (id, info, tab) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(on);
        resolve(tab);
      }
    };
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(on);
      reject(Error('The lesson page took too long to load.'));
    }, ms);
    chrome.tabs.onUpdated.addListener(on);
  });
}
$('dest-open').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('lesson-link').value,
    direct = editorUrlFromInput(text);
  if (direct) {
    const tab = await chrome.tabs.create({url: direct});
    pinnedTabId = tab.id;
    $('lesson-link').value = '';
    return;
  }
  const page = lessonPageFromInput(text);
  if (!page) {
    say(
      'dest-status',
      "That isn't a Level Builder lesson link. Paste a lesson link from levelbuilder-studio.code.org (for example …/lessons/123/edit or …/s/unit-name/lessons/4/edit), or the lesson's ID.",
      'error'
    );
    return;
  }
  // Links like /s/<unit>/lessons/<n>/edit name the lesson by its position, so open it and read its real ID.
  say('dest-status', 'Opening the lesson to find its ID…');
  const tab = await chrome.tabs.create({url: page});
  pinnedTabId = tab.id;
  try {
    await tabLoaded(tab.id);
    const [r] = await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: lessonDescriptionInPage,
    });
    const id = r?.result?.id;
    if (!Number.isSafeInteger(id) || id < 1) {
      throw Error(
        r?.result?.error || 'That page is not a Level Builder lesson editor.'
      );
    }
    await chrome.tabs.update(tab.id, {
      url: `https://levelbuilder-studio.code.org/lessons/${id}/edit`,
    });
    $('lesson-link').value = '';
    say('dest-status', `Found lesson ${id}. Opening its editor…`);
  } catch (err) {
    say('dest-status', 'Could not open that lesson: ' + err.message, 'error');
  }
});
document.querySelectorAll('[data-open-lesson]').forEach(b =>
  b.addEventListener('click', async () => {
    const tab = await chrome.tabs.create({
      url: `https://levelbuilder-studio.code.org/lessons/${b.dataset.openLesson}/edit`,
    });
    pinnedTabId = tab.id;
  })
);
chrome.tabs.onUpdated.addListener((id, info) => {
  if (currentStep === 'save' && info.status === 'complete') {
    findDestination();
  }
});
chrome.tabs.onActivated.addListener(() => {
  if (currentStep === 'save') {
    findDestination();
  }
});

// Resources and vocabulary: Skip or Add for anything Level Builder doesn't have.
$('btn-check-shared').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Checking Level Builder…', async () => {
    try {
      sharedChoices.clear();
      await session.checkShared(
        reviewPackageFor(built.source, built.lesson, destination)
      );
      say('save-msg', '');
    } catch (err) {
      say('save-msg', 'Could not check resources: ' + err.message, 'error');
    }
    renderShared();
  })
);
function copyButton(text, label = 'Copy link') {
  const b = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'linkish',
    textContent: label,
  });
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied.');
    } catch {
      toast('Could not copy. Select the link and copy it.');
    }
  });
  return b;
}
function renderShared() {
  const items = session?.state.sharedCheck?.items,
    out = $('shared-out');
  if (!items) {
    out.replaceChildren();
    return;
  }
  if (!items.length) {
    out.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'muted',
        textContent: 'This lesson has no resources or vocabulary to add.',
      })
    );
    return;
  }
  const list = document.createElement('ul');
  list.className = 'shared-list';
  for (const c of items) {
    const li = document.createElement('li'),
      head = document.createElement('p');
    head.className = 'shared-name';
    head.textContent = `${c.kind === 'resources' ? 'Resource' : 'Vocabulary'}: ${c.label}`;
    li.append(head);
    if (c.url) {
      const link = Object.assign(document.createElement('p'), {
        className: 'shared-url',
        textContent: c.url,
      });
      li.append(link);
    }
    if (c.status === 'found') {
      li.append(
        Object.assign(document.createElement('p'), {
          className: 'ok-text',
          textContent: '✓ Already in Level Builder.',
        }),
        radioChoice(
          c,
          'Already in Level Builder',
          [
            ['link', 'Link it to this lesson'],
            ['skip', 'Skip it (link it yourself later)'],
          ],
          'link'
        )
      );
    } else if (c.status === 'cannot-add') {
      li.append(
        Object.assign(document.createElement('p'), {
          className: 'warn-text',
          textContent: `Can't be added automatically (${c.problem}). It will be skipped.`,
        })
      );
      if (c.url) {
        li.append(copyButton(c.url));
      }
    } else {
      const fs = document.createElement('fieldset');
      fs.className = 'choice';
      fs.append(
        Object.assign(document.createElement('legend'), {
          textContent: 'Not in Level Builder yet',
        })
      );
      for (const [value, text] of [
        [
          'add',
          `Add it to Level Builder${c.kind === 'resources' ? ' with this link' : ''}`,
        ],
        ['skip', 'Skip it (add it yourself later)'],
      ]) {
        const id = `choice-${c.kind}-${c.index}-${value}`;
        const input = Object.assign(document.createElement('input'), {
          type: 'radio',
          name: `choice-${c.kind}-${c.index}`,
          id,
          value,
          checked: sharedChoices.get(choiceKey(c)) === value,
        });
        input.addEventListener('change', () => {
          sharedChoices.set(choiceKey(c), value);
          refresh();
        });
        const label = Object.assign(document.createElement('label'), {
          htmlFor: id,
          textContent: text,
        });
        const row = document.createElement('div');
        row.className = 'radio-row';
        row.append(input, label);
        fs.append(row);
      }
      li.append(fs);
    }
    list.append(li);
  }
  const missing = items.filter(c => c.status === 'missing');
  const note = missing.length
    ? Object.assign(document.createElement('p'), {
        className: 'muted',
        textContent:
          'Added items become shared records in this course, so other lessons in the course can use them too. Each is sent once and then checked.',
      })
    : null;
  out.replaceChildren(list, ...(note ? [note] : []));
}
function radioChoice(c, legend, options, fallback) {
  const fs = document.createElement('fieldset');
  fs.className = 'choice';
  fs.append(
    Object.assign(document.createElement('legend'), {textContent: legend})
  );
  if (fallback && !sharedChoices.has(choiceKey(c))) {
    sharedChoices.set(choiceKey(c), fallback);
  }
  for (const [value, text] of options) {
    const id = `choice-${c.kind}-${c.index}-${value}`;
    const input = Object.assign(document.createElement('input'), {
      type: 'radio',
      name: `choice-${c.kind}-${c.index}`,
      id,
      value,
      checked: sharedChoices.get(choiceKey(c)) === value,
    });
    input.addEventListener('change', () => {
      sharedChoices.set(choiceKey(c), value);
      refresh();
    });
    const row = document.createElement('div');
    row.className = 'radio-row';
    row.append(
      input,
      Object.assign(document.createElement('label'), {
        htmlFor: id,
        textContent: text,
      })
    );
    fs.append(row);
  }
  return fs;
}
function pendingChoices() {
  const items = session?.state.sharedCheck?.items || [];
  return items.filter(
    c => c.status === 'missing' && !sharedChoices.has(choiceKey(c))
  ).length;
}

async function runPrepare(button, {addObjectives}) {
  return withBusy(
    button,
    'Preparing… keep the Level Builder tab open',
    async () => {
      $('btn-prepare-no-obj').hidden = true;
      try {
        const pkg = reviewPackageFor(built.source, built.lesson, destination);
        const items = session.state.sharedCheck?.items || [];
        const add = items
          .filter(c => sharedChoices.get(choiceKey(c)) === 'add')
          .map(({kind, index}) => ({kind, index}));
        const skip = items
          .filter(
            c =>
              c.status === 'found' && sharedChoices.get(choiceKey(c)) === 'skip'
          )
          .map(({kind, index}) => ({kind, index}));
        await session.prepare(pkg, {add, skip, addObjectives});
        say(
          'save-msg',
          'Ready. The editor was put back exactly as it was. Nothing is saved to the lesson yet.',
          'ok'
        );
      } catch (err) {
        const objectiveStep = addObjectives && /objective/i.test(err.message);
        say(
          'save-msg',
          'Could not prepare: ' +
            err.message +
            (objectiveStep
              ? ' You can prepare again without adding objectives; they will be listed to add by hand.'
              : ''),
          'error'
        );
        $('btn-prepare-no-obj').hidden = !objectiveStep;
      }
      renderShared();
      renderSession();
    }
  );
}
$('btn-prepare').addEventListener('click', e =>
  runPrepare(e.currentTarget, {addObjectives: true})
);
$('btn-prepare-no-obj').addEventListener('click', e =>
  runPrepare(e.currentTarget, {addObjectives: false})
);
$('approve').addEventListener('change', refresh);
$('btn-save').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Saving and checking…', async () => {
    try {
      await session.approveAndSave();
    } catch (err) {
      say('save-msg', 'Save stopped: ' + err.message, 'error');
    }
    $('approve').checked = false;
    renderSession();
  })
);
$('btn-check-again').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Checking…', async () => {
    try {
      await session.checkAgain();
      say('save-msg', 'Checked again. Nothing was resent.');
    } catch (err) {
      say('save-msg', err.message, 'error');
    }
    renderSession();
  })
);
$('btn-restore').addEventListener('click', e =>
  withBusy(e.currentTarget, 'Restoring…', async () => {
    try {
      await session.restore();
      say(
        'save-msg',
        'The editor was restored. Prepare the changes again.',
        'ok'
      );
    } catch (err) {
      say('save-msg', err.message, 'error');
    }
    renderSession();
  })
);

const RESULT_TEXT = {
  'saved-and-verified':
    'Saved and checked. Level Builder now matches the reviewed changes, with 0 mismatches. Reload the Level Builder tab before making any edits there.',
  'save-not-confirmed':
    "The save wasn't confirmed. Lesson Studio will not resend it. Use Check again to read the lesson, or report the problem.",
  'save-rejected-unchanged':
    'Level Builder rejected the save. The lesson was not changed.',
};
function renderSkipped() {
  const st = session?.state,
    out = $('skipped-out');
  if (!st?.job || st.receipt?.attempted) {
    out.replaceChildren();
    return;
  }
  const parts = [];
  if (st.objectivesAdded?.length) {
    parts.push(
      Object.assign(document.createElement('p'), {
        className: 'ok-text',
        textContent: `Objectives to add (not in Level Builder yet): ${st.objectivesAdded.length}. They're listed with the changes below.`,
      })
    );
  }
  if (st.added?.length) {
    parts.push(
      Object.assign(document.createElement('p'), {
        className: 'ok-text',
        textContent: `Added to Level Builder: ${st.added.map(a => a.label).join(', ')}.`,
      })
    );
  }
  if (st.skipped?.length) {
    parts.push(
      Object.assign(document.createElement('h3'), {
        textContent: 'Not copied: add these in Level Builder after saving',
      })
    );
    const ul = document.createElement('ul');
    ul.className = 'shared-list';
    for (const s of st.skipped) {
      const li = document.createElement('li');
      li.append(
        Object.assign(document.createElement('p'), {
          className: 'shared-name',
          textContent: `${s.kind === 'resources' ? 'Resource' : 'Vocabulary'}: ${s.label}`,
        })
      );
      if (s.url) {
        li.append(
          Object.assign(document.createElement('p'), {
            className: 'shared-url',
            textContent: s.url,
          }),
          copyButton(s.url)
        );
      }
      ul.append(li);
    }
    parts.push(ul);
  }
  if (st.objectivesNotCopied?.length) {
    parts.push(
      Object.assign(document.createElement('h3'), {
        textContent:
          'Objectives not copied: add these in Level Builder after saving',
      })
    );
    parts.push(
      Object.assign(document.createElement('p'), {
        className: 'muted',
        textContent:
          "The lesson keeps the objectives Level Builder already has. These Notion objectives aren't there yet.",
      })
    );
    const ul = document.createElement('ul');
    ul.className = 'shared-list';
    for (const o of st.objectivesNotCopied) {
      const li = document.createElement('li');
      li.append(
        Object.assign(document.createElement('p'), {
          className: 'shared-name',
          textContent: o,
        }),
        copyButton(o, 'Copy text')
      );
      ul.append(li);
    }
    parts.push(ul);
  }
  out.replaceChildren(...parts);
}
function renderSession() {
  const st = session?.state,
    job = st?.job,
    receipt = st?.receipt;
  if (job && !receipt?.attempted) {
    renderReview($('review-out'), job.review, {
      protectedLesson: SANDBOX_LESSONS[destination?.id]?.protected,
    });
  } else {
    $('review-out').replaceChildren();
  }
  renderSkipped();
  $('approve-box').hidden = !job || !!receipt?.attempted || !!st?.needsRecovery;
  $('result-card').hidden = !receipt && !st?.needsRecovery;
  if (receipt) {
    const p = document.createElement('p');
    p.className =
      'result ' + (receipt.status === 'saved-and-verified' ? 'ok' : 'error');
    const acknowledged = /acknowledged/.test(
      String(receipt.dispatch?.outcome ?? receipt.dispatch ?? '')
    );
    p.textContent =
      receipt.status === 'save-not-confirmed' &&
      acknowledged &&
      receipt.verification?.mismatches?.length
        ? "Level Builder accepted the save, but Lesson Studio's check found differences (listed below). It won't resend. Look at the lesson in Level Builder, then use Check again or report the problem."
        : RESULT_TEXT[receipt.status] || 'Status: ' + receipt.status;
    const mm = receipt.verification?.mismatches || [];
    const parts = [p];
    if (mm.length) {
      const ul = document.createElement('ul');
      for (const m of mm) {
        const li = document.createElement('li');
        li.textContent = m;
        ul.append(li);
      }
      parts.push(ul);
    }
    $('result-out').replaceChildren(...parts);
  } else if (st?.needsRecovery) {
    $('result-out').replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'result error',
        textContent:
          'A check stopped partway. Restore the editor before trying again.',
      })
    );
  }
  $('btn-check-again').hidden = !(
    receipt?.attempted && receipt.status !== 'saved-and-verified'
  );
  $('btn-restore').hidden = !(st?.needsRecovery && !receipt?.attempted);
  refresh();
}

// ---------- shared UI state ----------
function refresh() {
  $('slides-status').textContent = imports.slides
    ? `✓ ${imports.slides.name} · ${imports.slides.count} slides`
    : 'Not imported';
  $('notion-status').textContent = imports.brief
    ? `✓ ${imports.brief.name}`
    : 'Not imported (optional, adds overview, objectives and resources)';
  $('lesson-label').textContent = built
    ? built.lesson.title
    : 'No lesson imported yet';
  $('btn-to-check').disabled = !built || busy;
  $('btn-to-save').disabled = !built || busy;
  const st = session?.state,
    owned = st?.ownershipConfirmed === true,
    checked = !!st?.sharedCheck,
    waiting = pendingChoices();
  const locked = !!st?.receipt?.attempted || !!st?.needsRecovery;
  $('btn-check-shared').disabled =
    busy || !built || !session || !owned || locked;
  $('btn-check-shared').textContent = checked
    ? 'Check resources again'
    : 'Check resources';
  $('btn-prepare').disabled =
    busy || !built || !session || !owned || !checked || waiting > 0 || locked;
  const adding = [...sharedChoices.values()].filter(v => v === 'add').length;
  if (!busy) {
    $('btn-prepare').textContent =
      waiting > 0
        ? `Choose Skip or Add for ${waiting} item${waiting === 1 ? '' : 's'}`
        : adding
          ? `Add ${adding} to Level Builder and prepare changes`
          : 'Prepare changes';
  }
  $('btn-save').disabled = busy || !$('approve').checked || !st?.job;
  $('dest-open').hidden = !!destination;
}

// ---------- Report a problem ----------
async function openReport(item = null) {
  reportConfig ??= await (
    await fetch(chrome.runtime.getURL('shared/report-form.json'))
  ).json();
  reportDraft = buildReport({
    lesson: {title: built?.lesson.title, url: destination?.url},
    sources: {
      slides: imports.slides && {
        name: imports.slides.name,
        url: imports.slides.url,
      },
      notion: imports.brief && {
        name: imports.brief.name,
        url: imports.brief.url,
      },
    },
    item,
    step: {import: '1 · Import', check: '2 · Check', save: '3 · Save'}[
      currentStep
    ],
    receipt: session?.state.receipt,
    version: VERSION,
  });
  const labels = {
    lesson: 'Lesson',
    sources: 'Sources',
    flaggedItem: 'Flagged item',
    stepAndReadback: 'Step and save result',
    versionAndDate: 'Version and date',
  };
  const dl = $('report-auto');
  dl.replaceChildren();
  for (const [k, label] of Object.entries(labels)) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = reportDraft.fields[k];
    dl.append(dt, dd);
  }
  const sel = $('report-type');
  sel.replaceChildren(
    Object.assign(document.createElement('option'), {
      value: '',
      textContent: 'Choose one',
    }),
    ...PROBLEM_TYPES.map(t =>
      Object.assign(document.createElement('option'), {
        value: t,
        textContent: PROBLEM_LABELS[t],
      })
    )
  );
  sel.value = reportDraft.suggestedType;
  $('report-note').value = '';
  $('report-error').textContent = '';
  $('report-dialog').showModal();
}
$('btn-report').addEventListener('click', () => openReport(null));
$('btn-report-result').addEventListener('click', () =>
  openReport({label: 'Save result', content: $('result-out').textContent})
);
$('report-cancel').addEventListener('click', () => $('report-dialog').close());
let queuedId = null;
// Direct send first (works in Chromium). If the browser blocks it (Firefox drops the Google sign-in), send from a background form tab.
async function sendAnyWay(config, fields, type, note) {
  try {
    return await sendReport(config, fields, type, note);
  } catch (first) {
    try {
      return await sendReportViaFormTab(config, fields, type, note);
    } catch (second) {
      throw Error(second.message || first.message);
    }
  }
}
$('report-form').addEventListener('submit', async e => {
  e.preventDefault();
  const type = $('report-type').value,
    note = $('report-note').value,
    btn = $('report-send');
  if (!type || !note.trim()) {
    $('report-error').textContent = !type
      ? 'Choose a type of problem.'
      : 'Write a short note about what is wrong.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Sending…';
  $('report-fallback').hidden = true;
  try {
    await sendAnyWay(reportConfig, reportDraft.fields, type, note);
    $('report-dialog').close();
    toast('Report sent. Thank you!');
  } catch (err) {
    // Keep the report, and offer Google's own form (always works; seen needed in Firefox).
    await queueReport({fields: reportDraft.fields, type, note});
    queuedId = (await pendingReports()).at(-1)?.id ?? null;
    $('report-error').textContent =
      'Lesson Studio could not send this (' +
      err.message +
      '). It is kept to retry until you close the browser, or send it now in Google Forms: everything is filled in, you just click Submit.';
    $('report-fallback').hidden = false;
    $('report-fallback').focus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send report';
    showPending();
  }
});
$('report-fallback').addEventListener('click', async () => {
  await openFilledReportForm(
    reportConfig,
    reportDraft.fields,
    $('report-type').value,
    $('report-note').value
  );
  if (queuedId) {
    await removePending(queuedId);
  }
  queuedId = null;
  $('report-fallback').hidden = true;
  $('report-dialog').close();
  toast('Opened in Google Forms. Click Submit there to send it.', 6000);
  showPending();
});
async function showPending() {
  const list = await pendingReports(),
    note = $('pending-note');
  note.hidden = !list.length;
  if (!list.length) {
    note.replaceChildren();
    return;
  }
  reportConfig ??= await (
    await fetch(chrome.runtime.getURL('shared/report-form.json'))
  ).json();
  const retry = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'linkish',
    textContent: `${list.length} report${list.length === 1 ? '' : 's'} waiting. Send now`,
  });
  retry.addEventListener('click', async () => {
    let sent = 0;
    for (const r of await pendingReports()) {
      try {
        await sendAnyWay(reportConfig, r.fields, r.type, r.note);
        await removePending(r.id);
        sent++;
      } catch (err) {
        toast(
          'Still not sent: ' +
            err.message +
            '. Use "Open in Google Forms" instead.',
          6000
        );
        break;
      }
    }
    if (sent) {
      toast(`Sent ${sent} waiting report${sent === 1 ? '' : 's'}.`);
    }
    showPending();
  });
  const viaForm = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'linkish',
    textContent: 'Open in Google Forms',
  });
  viaForm.addEventListener('click', async () => {
    const [first] = await pendingReports();
    if (!first) {
      return;
    }
    await openFilledReportForm(
      reportConfig,
      first.fields,
      first.type,
      first.note
    );
    await removePending(first.id);
    toast('Opened in Google Forms. Click Submit there to send it.', 6000);
    showPending();
  });
  note.replaceChildren(retry, document.createTextNode(' · '), viaForm);
}
// ---------- full build only: Advanced tab ----------
async function loadAdvanced() {
  try {
    const info = await (
      await fetch(chrome.runtime.getURL('build-info.json'))
    ).json();
    if (info.edition !== 'full') {
      return;
    }
    const {installAdvanced} = await import('../advanced/advanced-tab.mjs');
    installAdvanced({
      tablist: $('tablist'),
      main: document.querySelector('main'),
      steps: STEPS,
      tabButtons,
      selectStep,
      getContext: () => ({imports, built, destination, session}),
    });
  } catch {
    /* team build: no Advanced tab */
  }
}

// ---------- site access (Firefox asks the user after install; Chromium grants it at install) ----------
const ORIGINS = chrome.runtime.getManifest().host_permissions || [];
async function checkAccess() {
  let ok = true;
  try {
    ok = await chrome.permissions.contains({origins: ORIGINS});
  } catch {
    ok = true;
  }
  $('access-banner').hidden = ok;
  return ok;
}
$('btn-allow-access').addEventListener('click', () => {
  // request() must be the first call in the click handler (user gesture); nothing is awaited before it.
  chrome.permissions
    .request({origins: ORIGINS})
    .then(granted => {
      checkAccess();
      toast(
        granted
          ? 'Access allowed. You can import now.'
          : "Access not allowed. Lesson Studio can't read your pages without it.",
        5000
      );
    })
    .catch(err => toast('Could not ask for access: ' + err.message, 5000));
});

// ---------- start ----------
$('version').textContent = 'v' + VERSION;
checkAccess();
await moved;
imports = await loadImports();
rebuild();
setupAI();
showPending();
loadAdvanced();
const pending = await chrome.storage.session.get('openStep').catch(() => ({}));
selectStep(
  pending.openStep && STEPS.includes(pending.openStep)
    ? pending.openStep
    : built
      ? 'check'
      : 'import'
);
