// FULL BUILD ONLY (Julian and Angi). build.ps1 leaves the whole advanced/ folder out of the team build.
// Adds an Advanced tab: diagnostics and evidence, shared records, the wide editor, and AI settings.
import {AIService} from '../ai/ai-service.mjs';
import {NotionConnector} from './notion-connector.mjs';
import {reviewPackageFor} from '../engine/session.mjs';

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter(Boolean));
  return n;
};
const download = (name, data) => {
  const a = el('a', {
    href: URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})
    ),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export function installAdvanced({tablist, main, tabButtons, getContext}) {
  const tab = el('button', {
    type: 'button',
    id: 'tab-advanced',
    textContent: 'Advanced',
  });
  tab.setAttribute('aria-selected', 'false');
  if (tablist.getAttribute('role')) tab.setAttribute('role', 'tab');
  tab.tabIndex = -1;
  tablist.append(tab);
  const panel = el('div', {id: 'panel-advanced', hidden: true});
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'tab-advanced');
  const msg = el('p', {className: 'msg'});
  msg.setAttribute('role', 'status');
  msg.setAttribute('aria-live', 'polite');
  const say = (t, kind = '') => {
    msg.textContent = t;
    msg.dataset.kind = kind;
  };

  // Diagnostics & evidence + shared records: the prototype's reviewed-transfer workbench.
  const workbench = el('button', {
    type: 'button',
    className: 'btn primary',
    textContent: 'Open reviewed-transfer workbench',
  });
  workbench.addEventListener('click', async () => {
    const {destination} = getContext();
    const [lb] = await chrome.tabs.query({
      url: 'https://levelbuilder-studio.code.org/lessons/*/edit*',
      currentWindow: true,
    });
    if (!lb) {
      say('Open sandbox lesson 10 or 11 in Level Builder first.', 'error');
      return;
    }
    await chrome.tabs.create({
      url:
        chrome.runtime.getURL('engine/browser-fill/workflow.html') +
        '#' +
        lb.id,
    });
    say(
      destination
        ? 'Workbench opened for ' + destination.url
        : 'Workbench opened. Paste the lesson editor URL there.'
    );
  });
  const pkgBtn = el('button', {
    type: 'button',
    className: 'btn',
    textContent: 'Download review package (JSON)',
  });
  pkgBtn.addEventListener('click', () => {
    const {built, destination} = getContext();
    if (!built) {
      say('Import a deck first.', 'error');
      return;
    }
    download(
      'lesson-review-package.json',
      reviewPackageFor(built.source, built.lesson, destination)
    );
  });
  const runBtn = el('button', {
    type: 'button',
    className: 'btn',
    textContent: "Download this run's report (JSON)",
  });
  runBtn.addEventListener('click', () => {
    const {session} = getContext();
    if (!session) {
      say('Open a sandbox lesson on the Save tab first.', 'error');
      return;
    }
    download('lesson-studio-run-report.json', session.report());
  });
  const diag = el(
    'section',
    {className: 'card'},
    el('h2', {textContent: 'Diagnostics, evidence and shared records'}),
    el('p', {
      className: 'muted',
      textContent:
        'The workbench reads a baseline only, downloads run reports, runs the unchanged-save test, creates or reuses shared resources and vocabulary, and cleans up saved test links. Each write still needs its own approval. Saves are limited to sandbox lessons 10 and 11.',
    }),
    el('div', {className: 'row wrap'}, workbench, pkgBtn, runBtn)
  );

  // Wide editor (editing, exports, backups). Its save path is disabled; saving uses the Save tab.
  const studio = el('button', {
    type: 'button',
    className: 'btn',
    textContent: 'Open wide editor',
  });
  studio.addEventListener('click', () =>
    chrome.tabs.create({
      url: chrome.runtime.getURL('advanced/studio/index.html'),
    })
  );
  const wide = el(
    'section',
    {className: 'card'},
    el('h2', {textContent: 'Wide editor'}),
    el('p', {
      className: 'muted',
      textContent:
        'Full editing, Markdown export and workspace backups. To save to Level Builder, come back to the Save tab.',
    }),
    el('div', {className: 'row'}, studio)
  );

  // AI settings.
  const model = el(
    'select',
    {id: 'adv-model'},
    ...[
      ['auto', 'Automatic'],
      ['builtin', 'Chrome built-in AI (on this computer)'],
      ['heuristic', 'Rules only, no AI'],
    ].map(([value, textContent]) => el('option', {value, textContent}))
  );
  const notion = el('input', {
    id: 'adv-notion',
    type: 'password',
    autocomplete: 'off',
    spellcheck: false,
  });
  const saveBtn = el('button', {
    type: 'submit',
    className: 'btn primary',
    textContent: 'Save settings',
  });
  const forgetBtn = el('button', {
    type: 'button',
    className: 'btn',
    textContent: 'Forget Notion token',
  });
  const form = el(
    'form',
    {className: 'card'},
    el('h2', {textContent: 'AI and Notion settings'}),
    el('label', {htmlFor: 'adv-model', textContent: 'Which AI runs'}),
    model,
    el('label', {
      htmlFor: 'adv-notion',
      textContent:
        'Notion integration token (for importing from a pasted link)',
    }),
    notion,
    el('p', {
      className: 'muted',
      textContent:
        'AI runs on this computer; lesson text is not sent anywhere. The Notion token is stored only in this browser. Leave the box empty and save, or press Forget Notion token, to delete it.',
    }),
    el('div', {className: 'row'}, saveBtn, forgetBtn)
  );
  form.addEventListener('submit', async e => {
    e.preventDefault();
    await AIService.saveSettings({preferredAiModel: model.value});
    await NotionConnector.setToken(notion.value.trim());
    say('Settings saved.', 'ok');
  });
  forgetBtn.addEventListener('click', async () => {
    await NotionConnector.clearToken();
    notion.value = '';
    say('Notion token deleted from this browser.', 'ok');
  });
  (async () => {
    const s = await AIService.getSettings();
    model.value = s.preferredAiModel || 'auto';
    notion.value = (await NotionConnector.getToken()) || '';
  })();

  panel.append(
    el(
      'div',
      {className: 'pad'},
      el('p', {
        className: 'lead',
        textContent:
          'Advanced tools for Julian and Angi. Not in the team build.',
      }),
      diag,
      wide,
      form,
      msg
    )
  );
  main.append(panel);

  const steps = [...tabButtons];
  const show = on => {
    panel.hidden = !on;
    tab.setAttribute('aria-selected', String(on));
    tab.toggleAttribute('focusgroupstart', on);
    if (on) {
      for (const b of steps) {
        b.setAttribute('aria-selected', 'false');
        b.removeAttribute('focusgroupstart');
        document.getElementById(b.id.replace('tab-', 'panel-')).hidden = true;
      }
      panel.tabIndex = 0;
    }
  };
  tab.addEventListener('click', () => show(true));
  tab.addEventListener('focus', () => {
    if (panel.hidden) show(true);
  });
  for (const b of steps) {
    b.addEventListener('click', () => show(false));
    b.addEventListener('focus', () => show(false));
  }
}
