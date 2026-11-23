import { AIService } from '../../ai/ai-service.mjs';
import { generate, exportMarkdown } from '../../engine/dist/core.mjs';
import { importSourceFile, combineSourceImports, unzipOffice, presentationParts, notionMarkdown } from '../../engine/dist/source-imports.mjs';
import { sourcePageExport } from '../../engine/browser-fill/source-page-export.mjs';
import { notionPageExport } from '../../shared/notion-page-export.mjs';
import { buildTransferPlan } from '../../engine/dist/transfer-core.mjs';
import { normalizeNativeCapture } from '../../engine/dist/transfer-native.mjs';
import { stageNativeTransferPlan } from '../../engine/dist/native-transfer-runner.mjs';
import { nativeEditorBridge } from '../../engine/dist/native-dom-adapter.mjs';
import { createNativeTransport } from '../../engine/browser-fill/native-transport.mjs';
import { NotionConnector } from '../notion-connector.mjs';

const $ = id => document.getElementById(id);

let state = {
  draft: null,
  undoStack: [],
  redoStack: [],
  audit: null
};

let stagingState = {
  targetTabId: null,
  destinationSnapshot: null,
  transferPlan: null
};

function toast(message, duration = 3000) {
  const el = $('studio-toast');
  el.textContent = message;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, duration);
}

function pushHistory() {
  if (state.draft) {
    state.undoStack.push(JSON.stringify(state.draft));
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }
}

function updateHistoryButtons() {
  $('btn-studio-undo').disabled = state.undoStack.length === 0;
  $('btn-studio-redo').disabled = state.redoStack.length === 0;
}

function saveDraft() {
  if (state.draft) {
    chrome.storage?.local?.set({ activeLessonDraft: state.draft });
  }
}

async function init() {
  // 1. Load active draft
  try {
    const data = await chrome.storage?.local?.get(['activeLessonDraft']);
    if (data?.activeLessonDraft) {
      state.draft = data.activeLessonDraft;
    } else {
      const res = await fetch(chrome.runtime.getURL('engine/dist/fixture.json'));
      state.draft = await res.json();
    }

    if (state.draft && (!state.draft.activities || state.draft.activities.length === 0) && state.draft.slides) {
      state.draft = generate(state.draft);
      saveDraft();
    }
  } catch (err) {
    console.warn('Initial load failed:', err);
  }

  // 2. Setup listeners
  setupEventListeners();

  // 3. Render all components
  renderAll();
}

function renderAll() {
  if (!state.draft) return;
  renderNavbar();
  renderOutline();
  renderOverviews();
  renderObjectives();
  renderResources();
  renderVocabulary();
  renderActivities();
}

function renderNavbar() {
  const d = state.draft;
  $('navbar-lesson-title').value = d.title || 'Untitled Lesson';

  const totalMin = (d.activities || []).reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
  $('navbar-timing-pill').textContent = `${totalMin || 45} min`;

  $('navbar-approval-pill').textContent = d.status === 'approved-locally' ? '✓ Approved' : 'Drafting';
  $('navbar-approval-pill').className = d.status === 'approved-locally' ? 'pill pill-success' : 'pill pill-neutral';
}

function renderOutline() {
  const container = $('outline-activities-list');
  container.innerHTML = '';

  (state.draft?.activities || []).forEach((act, idx) => {
    const a = document.createElement('a');
    a.href = `#act-block-${idx}`;
    a.className = 'outline-item';
    a.textContent = `${idx + 1}. ${act.title || 'Activity'}`;
    container.appendChild(a);
  });

  // Attach smooth scrolling inside the canvas container
  document.querySelectorAll('#outline-nav a').forEach(link => {
    link.onclick = e => {
      e.preventDefault();
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      const targetId = href.slice(1);
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('#outline-nav a').forEach(item => item.classList.remove('active'));
        link.classList.add('active');
      }
    };
  });
}

function renderOverviews() {
  const fm = state.draft.frontMatter || state.draft;
  $('display-teacher-overview').textContent = fm.teacherOverview || 'No teacher overview provided.';
  $('edit-teacher-overview').value = fm.teacherOverview || '';

  $('display-student-overview').textContent = fm.studentOverview || 'No student overview provided.';
  $('edit-student-overview').value = fm.studentOverview || '';
}

function renderObjectives() {
  const fm = state.draft.frontMatter || state.draft;
  const list = $('display-objectives-list');
  list.innerHTML = '';

  (fm.objectives || []).forEach((obj, idx) => {
    const li = document.createElement('li');
    li.className = 'objective-item';
    li.innerHTML = `
      <span class="obj-bullet">🎯</span>
      <span class="flex-1">${escapeHtml(obj)}</span>
      <button class="btn-icon text-danger" data-del-obj="${idx}" title="Remove objective">✕</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('[data-del-obj]').forEach(btn => {
    btn.onclick = e => {
      pushHistory();
      const idx = parseInt(e.target.dataset.delObj, 10);
      fm.objectives.splice(idx, 1);
      saveDraft();
      renderObjectives();
    };
  });
}

function renderResources() {
  const resources = state.draft.resources || [];
  const tbody = $('resources-tbody');
  tbody.innerHTML = '';

  resources.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong title="${escapeHtml(r.name || '')}">${escapeHtml(r.name || '')}</strong></td>
      <td><span class="badge badge-neutral">${escapeHtml(r.type || '')}</span></td>
      <td><span class="badge ${r.audience === 'Student' ? 'badge-primary' : 'badge-neutral'}">${escapeHtml(r.audience || '')}</span></td>
      <td>
        <div class="url-link-wrapper">
          <a href="${escapeHtml(r.url || '#')}" target="_blank" rel="noopener noreferrer" class="url-link" title="${escapeHtml(r.url || '')}">
            ${escapeHtml(r.url || '')}
          </a>
        </div>
      </td>
      <td style="text-align: center;"><button class="btn-icon text-danger" data-del-res="${idx}" title="Delete Resource">✕</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-del-res]').forEach(btn => {
    btn.onclick = e => {
      pushHistory();
      const idx = parseInt(e.target.dataset.delRes, 10);
      resources.splice(idx, 1);
      saveDraft();
      renderResources();
    };
  });
}

function renderVocabulary() {
  const fm = state.draft.frontMatter || state.draft;
  const vocab = fm.vocabulary || [];
  const grid = $('vocab-cards-grid');
  grid.innerHTML = '';

  if (vocab.length === 0) {
    grid.innerHTML = '<p class="text-secondary text-xs">No vocabulary words listed yet. Use "+ Add Word" or "AI Define Terms".</p>';
    return;
  }

  vocab.forEach((v, idx) => {
    const word = typeof v === 'string' ? v : v.word;
    const def = typeof v === 'string' ? '' : v.definition;
    const card = document.createElement('div');
    card.className = 'vocab-card';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="vocab-word">${escapeHtml(word)}</span>
        <button class="btn-icon text-danger" data-del-vocab="${idx}">✕</button>
      </div>
      <p class="vocab-def">${escapeHtml(def || 'No definition.')}</p>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-del-vocab]').forEach(btn => {
    btn.onclick = e => {
      pushHistory();
      const idx = parseInt(e.target.dataset.delVocab, 10);
      vocab.splice(idx, 1);
      saveDraft();
      renderVocabulary();
    };
  });
}

function renderActivities() {
  const container = $('canvas-activities-container');
  container.innerHTML = '';

  (state.draft.activities || []).forEach((act, aIdx) => {
    const actBlock = document.createElement('article');
    actBlock.id = `act-block-${aIdx}`;
    actBlock.className = 'activity-block';

    actBlock.innerHTML = `
      <div class="activity-title-bar">
        <div class="flex items-center gap-2">
          <span class="pill pill-primary">Activity ${aIdx + 1}</span>
          <h3>${escapeHtml(act.title || 'Untitled Activity')}</h3>
          <span class="text-secondary text-sm">(${act.duration || 0} min)</span>
        </div>
        <button class="btn-icon text-danger" data-del-act="${aIdx}" title="Delete Activity">✕</button>
      </div>
      <div class="sections-container" id="sections-for-${aIdx}"></div>
      <button class="btn btn-secondary btn-xs mt-3" data-add-sec="${aIdx}">+ Add Section</button>
    `;

    const secContainer = actBlock.querySelector(`#sections-for-${aIdx}`);
    const sections = act.sections || [];

    sections.forEach((sec, sIdx) => {
      const secBlock = document.createElement('div');
      secBlock.className = 'section-block';

      const calloutsHtml = (sec.callouts || []).map(c => {
        let calloutClass = 'callout-tip';
        if (/warn/i.test(c.type)) calloutClass = 'callout-warn';
        else if (/discuss/i.test(c.type)) calloutClass = 'callout-discuss';
        else if (/content/i.test(c.type)) calloutClass = 'callout-content';
        return `
          <div class="callout-box ${calloutClass}">
            <div class="callout-title">${escapeHtml(c.type)}</div>
            <div class="callout-body text-xs">${escapeHtml(c.body)}</div>
          </div>
        `;
      }).join('');

      secBlock.innerHTML = `
        <div class="section-title-bar">
          <h4>${escapeHtml(sec.title || `Section ${sIdx + 1}`)}</h4>
          <span class="text-secondary text-xs">${sec.duration ? `${sec.duration} min` : ''}</span>
        </div>
        <div class="prose text-xs">${escapeHtml(sec.body || '')}</div>
        <div class="callouts-area mt-2">${calloutsHtml}</div>
      `;
      secContainer.appendChild(secBlock);
    });

    container.appendChild(actBlock);
  });

  // Wire delete activity
  container.querySelectorAll('[data-del-act]').forEach(btn => {
    btn.onclick = e => {
      pushHistory();
      const idx = parseInt(e.target.dataset.delAct, 10);
      state.draft.activities.splice(idx, 1);
      saveDraft();
      renderAll();
    };
  });

  // Wire add section
  container.querySelectorAll('[data-add-sec]').forEach(btn => {
    btn.onclick = e => {
      pushHistory();
      const aIdx = parseInt(e.target.dataset.addSec, 10);
      state.draft.activities[aIdx].sections ??= [];
      state.draft.activities[aIdx].sections.push({
        id: `sec-${Date.now()}`,
        activityId: state.draft.activities[aIdx].id,
        title: 'New Section',
        duration: 5,
        body: 'Teacher guidance here...',
        remarks: false,
        callouts: []
      });
      saveDraft();
      renderAll();
    };
  });
}

function setupEventListeners() {
  // Title input
  $('navbar-lesson-title').onchange = e => {
    pushHistory();
    state.draft.title = e.target.value.trim();
    saveDraft();
  };

  // Undo / Redo
  $('btn-studio-undo').onclick = () => {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(JSON.stringify(state.draft));
    state.draft = JSON.parse(state.undoStack.pop());
    saveDraft();
    renderAll();
    updateHistoryButtons();
    toast('↩ Undone');
  };

  $('btn-studio-redo').onclick = () => {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(JSON.stringify(state.draft));
    state.draft = JSON.parse(state.redoStack.pop());
    saveDraft();
    renderAll();
    updateHistoryButtons();
    toast('↪ Redone');
  };

  // Keyboard Shortcuts (Ctrl+Z, Ctrl+Y)
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      $('btn-studio-undo').click();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      $('btn-studio-redo').click();
    }
  });

  // Add Activity
  $('btn-studio-add-activity').onclick = () => {
    pushHistory();
    state.draft.activities ??= [];
    const newId = `act-${Date.now()}`;
    state.draft.activities.push({
      id: newId,
      title: 'New Activity',
      duration: 15,
      sections: [{
        id: `sec-${Date.now()}`,
        activityId: newId,
        title: 'Activity Step',
        duration: 15,
        body: 'Teacher instructions...',
        remarks: false,
        callouts: []
      }]
    });
    saveDraft();
    renderAll();
    toast('✓ Added new activity');
  };

  // Add Objective
  $('btn-add-objective').onclick = () => {
    const text = prompt('Enter new learning objective:');
    if (text?.trim()) {
      pushHistory();
      const fm = state.draft.frontMatter || state.draft;
      fm.objectives ??= [];
      fm.objectives.push(text.trim());
      saveDraft();
      renderObjectives();
    }
  };

  // Add Resource
  $('btn-add-resource').onclick = () => {
    const name = prompt('Resource name:');
    if (!name?.trim()) return;
    const url = prompt('Resource HTTPS URL:') || 'https://';
    pushHistory();
    state.draft.resources ??= [];
    state.draft.resources.push({
      key: `res-${Date.now()}`,
      name: name.trim(),
      type: 'Activity Guide',
      audience: 'Student',
      url: url.trim()
    });
    saveDraft();
    renderResources();
  };

  // Add Word
  $('btn-add-vocab').onclick = () => {
    const word = prompt('Vocabulary term:');
    if (!word?.trim()) return;
    const def = prompt('Definition:') || '';
    pushHistory();
    const fm = state.draft.frontMatter || state.draft;
    fm.vocabulary ??= [];
    fm.vocabulary.push({ word: word.trim(), definition: def.trim() });
    saveDraft();
    renderVocabulary();
  };

  // AI Gen Vocab
  $('btn-studio-gen-vocab').onclick = async () => {
    const btn = $('btn-studio-gen-vocab');
    btn.disabled = true;
    btn.textContent = '✨ Extracting...';
    try {
      pushHistory();
      const guidance = (state.draft.activities || []).flatMap(a => a.sections || []).map(s => s.body).join('\n');
      const terms = await AIService.generateVocabDefinitions(guidance || state.draft.title);
      const fm = state.draft.frontMatter || state.draft;
      fm.vocabulary ??= [];
      terms.forEach(t => {
        if (!fm.vocabulary.some(v => v.word === t.word)) fm.vocabulary.push(t);
      });
      saveDraft();
      renderVocabulary();
      toast(`✓ Added ${terms.length} vocabulary definitions!`);
    } catch (err) {
      toast(`Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ AI Define Terms';
    }
  };

  // AI Quality Audit
  $('btn-studio-ai-audit').onclick = runAudit;
  $('btn-quick-fix-health').onclick = runAudit;

  // AI Inspector Chat
  $('btn-inspector-send-ai').onclick = async () => {
    const text = $('inspector-ai-input').value.trim();
    if (!text) return;

    const btn = $('btn-inspector-send-ai');
    btn.disabled = true;
    btn.textContent = 'Thinking...';

    try {
      const res = await AIService.executePrompt({
        systemInstruction: 'You are an instructional curriculum designer for computer science.',
        prompt: `Lesson Title: "${state.draft.title}"\nRequest: ${text}`
      });
      $('inspector-ai-output').innerHTML = `<p>${escapeHtml(res.text || 'No response')}</p>`;
      $('inspector-ai-output').hidden = false;
    } catch (err) {
      toast(`AI Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Ask AI';
    }
  };

  // Saving to Level Builder happens only in the side panel's Save tab (prototype engine: approval, one save, real readback).
  // The old staging modal below had no real readback, so it is no longer opened.
  const useSaveTab = () => toast('To save to Level Builder, use the Save tab in the Lesson Studio side panel.', 5000);
  $('btn-studio-transfer').onclick = useSaveTab;
  $('btn-inspector-sync-lb').onclick = useSaveTab;
  document.querySelectorAll('.modal-staging-close').forEach(btn => {
    btn.onclick = () => { $('modal-staging').hidden = true; };
  });

  $('btn-modal-refresh-dest').onclick = detectLevelBuilderTabForModal;
  $('btn-modal-read-baseline').onclick = handleModalReadBaseline;
  $('btn-modal-build-plan').onclick = handleModalBuildPlan;

  $('chk-modal-approve-save').onchange = () => {
    const checked = $('chk-modal-approve-save').checked;
    $('btn-modal-stage-changes').disabled = !checked || !stagingState.transferPlan || (stagingState.transferPlan.blockers || []).length > 0;
  };

  $('btn-modal-stage-changes').onclick = handleModalStageChanges;

  $('btn-modal-verify-readback').onclick = useSaveTab;

  // Import Modal
  $('btn-studio-import').onclick = () => {
    $('modal-import').hidden = false;
  };
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.onclick = () => { $('modal-import').hidden = true; };
  });

  // Notion Clipper from Studio
  $('btn-studio-clip-notion').onclick = async () => {
    const btn = $('btn-studio-clip-notion');
    btn.disabled = true;
    btn.textContent = 'Clipping from Notion...';

    try {
      const tabs = await chrome.tabs.query({ url: ['*://*.notion.so/*', '*://*.notion.site/*', '*://app.notion.com/*'] });
      if (tabs.length === 0) {
        throw new Error('Please open or switch to a Notion page in another tab first.');
      }

      const [response] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: notionPageExport
      });

      const result = response?.result;
      if (result?.kind !== 'notion-web-clip') throw new Error('Notion clipping failed.');

      const parsedBrief = notionMarkdown(result.markdown);
      if (result.title) parsedBrief.title = result.title;

      pushHistory();
      const combined = combineSourceImports(state.draft, [parsedBrief]);
      state.draft = generate(combined.source);
      saveDraft();
      renderAll();
      $('modal-import').hidden = true;
      toast('✓ Notion lesson brief clipped and merged into draft!');
    } catch (err) {
      toast(`Notion clip error: ${err.message}`, 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = '📝 Clip Active Notion Tab';
    }
  };

  // Slides Import from Studio
  $('btn-studio-import-slides').onclick = async () => {
    const btn = $('btn-studio-import-slides');
    btn.disabled = true;
    btn.textContent = 'Importing Slides...';

    try {
      const tabs = await chrome.tabs.query({ url: '*://docs.google.com/presentation/*' });
      if (tabs.length === 0) {
        throw new Error('Please open a Google Slides deck in another tab first.');
      }

      const [response] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: sourcePageExport,
        args: [tabs[0].url]
      });

      const result = response?.result;
      if (result?.kind !== 'google-slides-export') throw new Error('Slides export failed.');

      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const parsed = presentationParts(await unzipOffice(bytes), result.name);
      parsed.deckUrl = result.deckUrl;

      pushHistory();
      const combined = combineSourceImports(state.draft, [parsed]);
      state.draft = generate(combined.source);
      saveDraft();
      renderAll();
      $('modal-import').hidden = true;
      toast('✓ Google Slides imported and parsed into lesson!');
    } catch (err) {
      toast(`Slides import error: ${err.message}`, 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = '📊 Import Active Google Slides Tab';
    }
  };

  const dropZone = $('modal-drop-zone');
  const fileInput = $('modal-file-input');
  dropZone.onclick = () => fileInput.click();
  // Notion URL import in Studio modal
  (async () => {
    const token = await NotionConnector.getToken();
    const hintEl = document.getElementById('studio-notion-url-hint');
    if (!token && hintEl) hintEl.hidden = false;
  })();

  document.getElementById('btn-studio-import-notion-url').onclick = async () => {
    const btn = document.getElementById('btn-studio-import-notion-url');
    const urlInput = document.getElementById('studio-notion-url-input');
    const urlVal = urlInput.value.trim();
    if (!urlVal) { toast('Please paste a Notion page URL or ID first.', 3000); return; }
    const origText = btn.textContent;
    btn.textContent = 'Fetching...';
    btn.disabled = true;
    try {
      const token = await NotionConnector.getToken();
      if (!token) throw new Error('No Notion Integration Token saved. Add one in Settings (secret_...).');
      const brief = await NotionConnector.fetchFromApi(urlVal);
      pushHistory();
      const combined = combineSourceImports(state.draft, [brief]);
      state.draft = generate(combined.source || combined);
      saveDraft();
      renderAll();
      urlInput.value = '';
      $('modal-import').hidden = true;
      toast('✓ Notion page "' + (brief.title || 'Brief') + '" imported!');
    } catch (err) {
      toast('Notion import error: ' + err.message, 5000);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  };
  fileInput.onchange = async () => {
    if (fileInput.files?.length) {
      const parsedSources = [];
      for (const file of fileInput.files) {
        parsedSources.push(await importSourceFile(file));
      }
      pushHistory();
      const combined = combineSourceImports(state.draft, parsedSources);
      state.draft = generate(combined.source);
      saveDraft();
      renderAll();
      $('modal-import').hidden = true;
      toast('✓ Files imported successfully!');
    }
  };

  // Export
  $('btn-studio-export').onclick = () => {
    const md = exportMarkdown({
      title: state.draft.title,
      frontMatter: state.draft.frontMatter || state.draft,
      resources: state.draft.resources || [],
      activities: state.draft.activities || [],
      sections: state.draft.sections || (state.draft.activities || []).flatMap(a => a.sections || [])
    });
    navigator.clipboard.writeText(md);
    toast('✓ Markdown review export copied to clipboard!');
  };
}

async function runAudit() {
  const btn = $('btn-studio-ai-audit');
  btn.disabled = true;
  btn.textContent = '✨ Auditing...';

  try {
    const audit = await AIService.auditCurriculum(state.draft);
    state.audit = audit;

    $('health-score-pill').textContent = `${audit.score}/100`;
    $('health-summary-text').textContent = `Grade ${audit.grade}: ${audit.strengths.length} strengths, ${audit.issues.length} opportunities.`;

    const body = $('inspector-audit-body');
    body.innerHTML = `
      <div class="mb-2"><strong>Score:</strong> ${audit.score}/100 (${audit.grade})</div>
      <div class="text-xs">
        ${audit.strengths.map(s => `<div class="text-success mb-1">✓ ${escapeHtml(s)}</div>`).join('')}
        ${audit.issues.map(i => `<div class="text-warning mb-1">⚠️ ${escapeHtml(i.message)}</div>`).join('')}
      </div>
    `;
    toast(`✓ Quality Score: ${audit.score}/100 (Grade ${audit.grade})`);
  } catch (err) {
    toast(`Audit failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ AI Quality Audit';
  }
}

async function detectLevelBuilderTabForModal() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://levelbuilder-studio.code.org/*' });
    if (tabs.length > 0) {
      const tab = tabs[0];
      stagingState.targetTabId = tab.id;
      $('modal-dest-label').textContent = 'Level Builder Connected';
      $('modal-dest-url').textContent = tab.url;
      $('btn-modal-read-baseline').disabled = false;
    } else {
      $('modal-dest-label').textContent = 'No Level Builder Tab Detected';
      $('modal-dest-url').textContent = 'Open levelbuilder-studio.code.org/lessons/.../edit in another tab';
      $('btn-modal-read-baseline').disabled = true;
    }
  } catch (err) {
    console.warn('Tab detection error:', err);
  }
}

async function handleModalReadBaseline() {
  if (!stagingState.targetTabId) {
    toast('Please open or focus the Level Builder editor tab first.');
    return;
  }
  const btn = $('btn-modal-read-baseline');
  btn.disabled = true;
  btn.textContent = 'Reading Baseline...';

  try {
    const transport = createNativeTransport(async encoded => {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: stagingState.targetTabId },
        func: nativeEditorBridge,
        args: [encoded]
      });
      return result?.result;
    });

    const capture = await transport({ action: 'read' });
    stagingState.destinationSnapshot = normalizeNativeCapture(capture);
    toast('✓ Baseline read successfully! (Zero writes performed)');
    await handleModalBuildPlan();
  } catch (err) {
    toast(`Baseline read error: ${err.message}`, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Read Baseline Only (No Writes)';
  }
}

async function handleModalBuildPlan() {
  if (!state.draft) return;
  if (!stagingState.destinationSnapshot) {
    toast('Read the destination baseline first.');
    return;
  }

  try {
    const pkg = {
      schemaVersion: 1,
      sandbox: 'https://levelbuilder-studio.code.org/courses/6-12-dev-playground/units/16/lessons/11',
      status: 'approved-locally',
      conflicts: [],
      lesson: state.draft,
      baseline: state.draft
    };

    const plan = await buildTransferPlan(pkg, stagingState.destinationSnapshot, {});
    stagingState.transferPlan = plan;

    $('modal-diff-count').textContent = `${plan.operations.length} actions`;

    // AI plain English explanation
    const summary = AIService.explainPlan(plan);
    $('modal-diff-summary').textContent = summary;

    // Render blockers if any
    const blockersEl = $('modal-diff-blockers');
    if (plan.blockers.length > 0) {
      blockersEl.innerHTML = plan.blockers.map(b => `<div class="issue-item issue-critical">🚫 ${escapeHtml(b)}</div>`).join('');
      blockersEl.hidden = false;
    } else {
      blockersEl.hidden = true;
    }

    // Render operations list
    const opList = $('modal-diff-list');
    opList.innerHTML = '';

    plan.operations.forEach(op => {
      const item = document.createElement('div');
      item.className = `diff-item ${op.kind === 'append' ? 'add' : op.requiresDecision ? 'conflict' : 'update'}`;
      item.innerHTML = `
        <div class="diff-item-header flex justify-between items-center">
          <strong>${escapeHtml(op.label)}</strong>
          <span class="badge ${op.kind === 'append' ? 'badge-primary' : 'badge-neutral'}">${op.kind}</span>
        </div>
        <div class="diff-values">
          ${op.before ? `<span class="diff-val-before">- ${escapeHtml(typeof op.before === 'string' ? op.before.slice(0, 80) : JSON.stringify(op.before).slice(0, 80))}</span>` : ''}
          <span class="diff-val-after">+ ${escapeHtml(typeof op.after === 'string' ? op.after.slice(0, 80) : JSON.stringify(op.after).slice(0, 80))}</span>
        </div>
      `;
      opList.appendChild(item);
    });

    $('modal-plan-container').hidden = false;
    $('chk-modal-approve-save').disabled = false;
  } catch (err) {
    toast(`Plan building error: ${err.message}`);
  }
}

async function handleModalStageChanges() {
  if (!$('chk-modal-approve-save').checked || !stagingState.transferPlan) return;
  const btn = $('btn-modal-stage-changes');
  btn.disabled = true;
  btn.textContent = 'Staging Changes into Editor...';

  const logBox = $('modal-staging-log');
  logBox.hidden = false;
  logBox.textContent = 'Initializing native transfer runner...\n';

  try {
    const transport = createNativeTransport(async encoded => {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: stagingState.targetTabId },
        func: nativeEditorBridge,
        args: [encoded]
      });
      return result?.result;
    });

    const report = await stageNativeTransferPlan(stagingState.transferPlan, transport, {
      onProgress: rep => {
        logBox.textContent += `Action completed: ${rep.completed} operations.\n`;
      }
    });

    logBox.textContent += `Staging completed: Status ${report.status}. Ready for readback verification.\n`;
    $('btn-modal-verify-readback').disabled = false;
    toast('✓ Changes staged into Level Builder! Verify the tab.');
  } catch (err) {
    logBox.textContent += `ERROR: ${err.message}\n`;
    toast(`Staging failed: ${err.message}`, 4500);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Stage Changes to Level Builder';
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
