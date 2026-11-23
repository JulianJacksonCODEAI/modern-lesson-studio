import { AIService } from '../ai/ai-service.mjs';
import { generate, exportMarkdown, convertNotes } from '../core/core.mjs';
import { sourcePageExport } from '../core/source-page-export.mjs';
import { notionPageExport } from '../core/notion-page-export.mjs';
import { unzipOffice, presentationParts, importSourceFile, combineSourceImports, notionMarkdown } from '../core/source-imports.mjs';
import { buildTransferPlan, packageProblems, clone } from '../core/transfer-core.mjs';
import { normalizeNativeCapture } from '../core/transfer-native.mjs';
import { stageNativeTransferPlan } from '../core/native-transfer-runner.mjs';
import { nativeEditorBridge } from '../core/native-dom-adapter.mjs';
import { createNativeTransport } from '../core/native-transport.mjs';
import { NotionConnector } from '../core/notion-connector.mjs';

const $ = id => document.getElementById(id);

let state = {
  draft: null,
  sourcePackage: null,
  destinationSnapshot: null,
  transferPlan: null,
  targetTabId: null,
  undoStack: [],
  redoStack: []
};

function toast(message, duration = 3500) {
  const el = $('sidepanel-toast');
  el.textContent = message;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, duration);
}

function pushHistory() {
  if (state.draft) {
    state.undoStack.push(JSON.stringify(state.draft));
    if (state.undoStack.length > 30) state.undoStack.shift();
    state.redoStack = [];
    updateHistoryButtons();
  }
}

function updateHistoryButtons() {
  $('btn-undo').disabled = state.undoStack.length === 0;
  $('btn-redo').disabled = state.redoStack.length === 0;
}

function switchTab(tabName) {
  const tabs = ['sources', 'editor', 'ai', 'transfer', 'export'];
  tabs.forEach(t => {
    const btn = $(`tab-btn-${t}`);
    const pane = $(`tab-pane-${t}`);
    const isActive = t === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    pane.hidden = !isActive;
  });
}

async function init() {
  // Setup Tab Navigation
  ['sources', 'editor', 'ai', 'transfer', 'export'].forEach(t => {
    $(`tab-btn-${t}`).onclick = () => switchTab(t);
  });

  $('btn-open-full-studio').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('studio/index.html') });
  };

  // History buttons
  $('btn-undo').onclick = () => {
    if (state.undoStack.length === 0) return;
    state.redoStack.push(JSON.stringify(state.draft));
    state.draft = JSON.parse(state.undoStack.pop());
    renderEditor();
    updateHistoryButtons();
    toast('↩ Undone');
  };

  $('btn-redo').onclick = () => {
    if (state.redoStack.length === 0) return;
    state.undoStack.push(JSON.stringify(state.draft));
    state.draft = JSON.parse(state.redoStack.pop());
    renderEditor();
    updateHistoryButtons();
    toast('↪ Redone');
  };

  // Load existing or default draft
  await loadInitialDraft();

  // Setup sub-controllers
  setupSources();
  setupEditor();
  setupAI();
  setupTransfer();
  setupExport();
}

async function loadInitialDraft() {
  try {
    const stored = await chrome.storage.local.get(['activeLessonDraft', 'lastImportId']);
    if (stored.activeLessonDraft) {
      state.draft = stored.activeLessonDraft;
    } else {
      const res = await fetch(chrome.runtime.getURL('core/fixture.json'));
      const fixture = await res.json();
      state.draft = fixture;
    }

    if (state.draft && (!state.draft.activities || state.draft.activities.length === 0) && state.draft.slides) {
      state.draft = generate(state.draft);
      chrome.storage.local.set({ activeLessonDraft: state.draft });
    }
  } catch (err) {
    console.warn('Draft initialization error:', err);
  }
  updateLessonHeader();
  renderEditor();
}

function updateLessonHeader() {
  if (!state.draft) return;
  $('active-lesson-label').textContent = state.draft.title || 'Untitled Lesson';
}

/**
 * 1. SOURCES CONTROLLER
 */
function setupSources() {
  // Google Slides 1-Click
  $('btn-import-active-slides').onclick = async () => {
    const btn = $('btn-import-active-slides');
    btn.disabled = true;
    btn.textContent = 'Extracting Slides & Speaker Notes...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url.includes('docs.google.com/presentation')) {
        throw new Error('Please open or switch to a Google Slides deck first.');
      }

      const [response] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: sourcePageExport,
        args: [tab.url]
      });

      const result = response?.result;
      if (result?.kind !== 'google-slides-export') {
        throw new Error('Google Slides export failed. Ensure the deck has speaker notes.');
      }

      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const parsed = presentationParts(await unzipOffice(bytes), result.name);
      parsed.deckUrl = result.deckUrl;

      pushHistory();
      applyParsedSlides(parsed);
      toast('✓ Slides imported and parsed successfully!');
      switchTab('editor');
    } catch (err) {
      toast(`Import failed: ${err.message}`, 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Import from Current Slides Tab';
    }
  };

  // Notion 1-Click Clipper
  $('btn-import-active-notion').onclick = async () => {
    const btn = $('btn-import-active-notion');
    btn.disabled = true;
    btn.textContent = 'Clipping Notion Brief...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || (!tab.url.includes('notion.so') && !tab.url.includes('notion.site') && !tab.url.includes('app.notion.com'))) {
        throw new Error('Please open or switch to a Notion page first.');
      }

      const [response] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: notionPageExport
      });

      const result = response?.result;
      if (result?.kind !== 'notion-web-clip') {
        throw new Error('Notion clipping failed. Ensure the page contains text and headings.');
      }

      const parsedBrief = notionMarkdown(result.markdown);
      if (result.title) parsedBrief.title = result.title;

      pushHistory();
      const base = state.sourcePackage || {
        title: parsedBrief.title || 'Imported Lesson',
        slides: [],
        teacherOverview: '',
        studentOverview: '',
        objectives: [],
        preparation: '',
        vocabulary: [],
        resources: []
      };

      const combined = combineSourceImports(base, [parsedBrief]);
      state.sourcePackage = combined.source;
      state.draft = generate(combined.source);
      await chrome.storage.local.set({ activeLessonDraft: state.draft });

      toast('✓ Notion brief clipped and combined with lesson!');
      updateLessonHeader();
      renderEditor();
      switchTab('editor');
    } catch (err) {
      toast(`Notion clip error: ${err.message}`, 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Clip from Current Notion Tab';
    }
  };

  // Notion URL Import (direct API fetch)
  (async () => {
    const token = await NotionConnector.getToken();
    if (!token) $('notion-url-hint').hidden = false;
  })();

  $('btn-import-notion-url').onclick = async () => {
    const btn = $('btn-import-notion-url');
    const urlInput = $('notion-url-input');
    const urlVal = urlInput.value.trim();
    if (!urlVal) {
      toast('Please paste a Notion page URL or ID first.', 3000);
      return;
    }
    const origText = btn.textContent;
    btn.textContent = 'Fetching from Notion...';
    btn.disabled = true;

    try {
      const token = await NotionConnector.getToken();
      if (!token) {
        throw new Error('No Notion Integration Token saved. Open the popup → ⚙ AI Settings and add your token (secret_...).');
      }
      const brief = await NotionConnector.fetchFromApi(urlVal);
      if (state.sourcePackage) {
        state.sourcePackage = combineSourceImports(state.sourcePackage, brief);
      } else {
        state.sourcePackage = brief;
      }
      pushHistory();
      state.draft = generate(state.sourcePackage);
      await chrome.storage?.local?.set({ activeLessonDraft: state.draft });
      updateLessonHeader();
      renderEditor();
      urlInput.value = '';
      toast(`✓ Notion page "${brief.title || 'Brief'}" imported!`);
      switchTab('editor');
    } catch (err) {
      toast(`Notion import error: ${err.message}`, 5000);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  };

  // Drag & drop file upload
  const dropZone = $('drop-zone');
  const fileInput = $('file-input');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('drag-over'); };
  dropZone.ondragleave = () => dropZone.classList.remove('drag-over');
  dropZone.ondrop = async e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files?.length) {
      await handleSourceFiles(e.dataTransfer.files);
    }
  };

  fileInput.onchange = async () => {
    if (fileInput.files?.length) {
      await handleSourceFiles(fileInput.files);
    }
  };

  // AI Unstructured Notes Parser
  $('btn-ai-parse-notes').onclick = async () => {
    const text = $('raw-notes-input').value.trim();
    if (!text) {
      toast('Please enter or paste rough notes first.');
      return;
    }

    const btn = $('btn-ai-parse-notes');
    btn.disabled = true;
    btn.textContent = '✨ AI Structuring Lesson...';

    try {
      pushHistory();
      const structured = await AIService.parseUnstructuredNotes(text, state.draft?.title || 'Imported Lesson');
      state.draft = structured;
      await chrome.storage.local.set({ activeLessonDraft: structured });
      updateLessonHeader();
      renderEditor();
      toast(`✓ AI structured into ${structured.activities?.length || 1} activities and ${structured.objectives?.length || 0} objectives!`);
      switchTab('editor');
    } catch (err) {
      toast(`AI parsing failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ AI Auto-Structure into Lesson';
    }
  };
}

async function handleSourceFiles(files) {
  try {
    const parsedSources = [];
    for (const file of files) {
      const parsed = await importSourceFile(file);
      parsedSources.push(parsed);
    }

    pushHistory();
    if (parsedSources.length === 1 && parsedSources[0].kind === 'slides') {
      applyParsedSlides(parsedSources[0]);
    } else {
      const base = state.sourcePackage || {
        title: 'Combined Lesson',
        slides: [],
        teacherOverview: '',
        studentOverview: '',
        objectives: [],
        preparation: '',
        vocabulary: [],
        resources: []
      };
      const combined = combineSourceImports(base, parsedSources);
      state.sourcePackage = combined.source;
      const generated = generate(combined.source);
      state.draft = generated;
      await chrome.storage.local.set({ activeLessonDraft: generated });
    }

    toast('✓ Files processed and lesson draft updated!');
    updateLessonHeader();
    renderEditor();
    switchTab('editor');
  } catch (err) {
    toast(`File processing error: ${err.message}`, 4000);
  }
}

function applyParsedSlides(slidesPackage) {
  state.sourcePackage = slidesPackage;
  const generated = generate(slidesPackage);
  state.draft = generated;
  chrome.storage.local.set({ activeLessonDraft: generated });
  updateLessonHeader();
  renderEditor();
}

/**
 * 2. LESSON OUTLINE / EDITOR CONTROLLER
 */
function setupEditor() {
  $('input-lesson-title').onchange = () => {
    pushHistory();
    state.draft.title = $('input-lesson-title').value.trim();
    saveDraft();
    updateLessonHeader();
  };

  $('input-teacher-overview').onchange = () => {
    pushHistory();
    ensureFrontMatter();
    state.draft.frontMatter.teacherOverview = $('input-teacher-overview').value;
    saveDraft();
  };

  $('input-student-overview').onchange = () => {
    pushHistory();
    ensureFrontMatter();
    state.draft.frontMatter.studentOverview = $('input-student-overview').value;
    saveDraft();
  };

  $('input-objectives').onchange = () => {
    pushHistory();
    ensureFrontMatter();
    state.draft.frontMatter.objectives = $('input-objectives').value.split('\n').map(s => s.trim()).filter(Boolean);
    saveDraft();
  };

  $('btn-add-activity').onclick = () => {
    pushHistory();
    state.draft.activities ??= [];
    const newId = `activity-${Date.now()}`;
    state.draft.activities.push({
      id: newId,
      title: 'New Activity',
      duration: 15,
      sections: [
        {
          id: `sec-${Date.now()}`,
          activityId: newId,
          title: 'Activity Overview',
          duration: 15,
          body: 'Teacher guidance here...',
          remarks: false,
          callouts: []
        }
      ]
    });
    saveDraft();
    renderEditor();
    toast('✓ Added new activity');
  };
}

function ensureFrontMatter() {
  state.draft.frontMatter ??= {
    teacherOverview: state.draft.teacherOverview || '',
    studentOverview: state.draft.studentOverview || '',
    objectives: state.draft.objectives || [],
    preparation: state.draft.preparation || '',
    vocabulary: state.draft.vocabulary || []
  };
}

function saveDraft() {
  if (state.draft) {
    chrome.storage.local.set({ activeLessonDraft: state.draft });
  }
}

function renderEditor() {
  if (!state.draft) return;
  const d = state.draft;
  const fm = d.frontMatter || d;

  $('input-lesson-title').value = d.title || '';
  $('input-teacher-overview').value = fm.teacherOverview || '';
  $('input-student-overview').value = fm.studentOverview || '';
  $('input-objectives').value = (fm.objectives || []).join('\n');

  const totalMin = (d.activities || []).reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
  $('input-lesson-timing').value = totalMin;

  const container = $('activities-list');
  container.innerHTML = '';

  (d.activities || []).forEach((activity, aIdx) => {
    const actCard = document.createElement('div');
    actCard.className = 'activity-card';

    const actHeader = document.createElement('div');
    actHeader.className = 'activity-header';
    actHeader.innerHTML = `
      <div class="flex-2">
        <input type="text" class="form-control font-semibold" value="${escapeHtml(activity.title || '')}" data-act-idx="${aIdx}" data-act-field="title">
      </div>
      <div class="flex-1 ml-2">
        <input type="number" class="form-control" value="${activity.duration || 0}" min="0" data-act-idx="${aIdx}" data-act-field="duration" title="Minutes">
      </div>
      <button class="btn-icon text-danger ml-1" data-act-del="${aIdx}" title="Delete Activity">✕</button>
    `;

    const secList = document.createElement('div');
    secList.className = 'section-list';

    const sections = (activity.sections || d.sections?.filter(s => s.activityId === activity.id) || []);
    sections.forEach((sec, sIdx) => {
      const secItem = document.createElement('div');
      secItem.className = 'section-item';

      const calloutsHtml = (sec.callouts || []).map((c, cIdx) => {
        let badgeClass = 'callout-tip';
        if (/warn/i.test(c.type)) badgeClass = 'callout-warn';
        else if (/discuss/i.test(c.type)) badgeClass = 'callout-discuss';
        else if (/content/i.test(c.type)) badgeClass = 'callout-content';
        return `<span class="callout-badge ${badgeClass}">${escapeHtml(c.type)}</span>`;
      }).join(' ');

      secItem.innerHTML = `
        <div class="section-item-header">
          <strong>${escapeHtml(sec.title || `Section ${sIdx + 1}`)}</strong>
          <span class="text-secondary">${sec.duration ? `${sec.duration} min` : ''}</span>
        </div>
        <p class="text-secondary text-xs mt-1" style="max-height: 40px; overflow: hidden; text-overflow: ellipsis;">
          ${escapeHtml((sec.body || '').slice(0, 100))}...
        </p>
        <div class="callouts-row mt-1">${calloutsHtml}</div>
      `;
      secList.appendChild(secItem);
    });

    const addSecBtn = document.createElement('button');
    addSecBtn.className = 'btn btn-secondary btn-xs mt-2';
    addSecBtn.textContent = '+ Add Section';
    addSecBtn.onclick = () => {
      pushHistory();
      activity.sections ??= [];
      activity.sections.push({
        id: `sec-${Date.now()}`,
        activityId: activity.id,
        title: 'New Section',
        duration: 5,
        body: 'Teacher guidance notes...',
        remarks: false,
        callouts: [{ type: 'Teaching Tip', body: 'Tip note' }]
      });
      saveDraft();
      renderEditor();
    };
    secList.appendChild(addSecBtn);

    actCard.appendChild(actHeader);
    actCard.appendChild(secList);
    container.appendChild(actCard);
  });

  // Attach event delegation for inputs
  container.querySelectorAll('[data-act-field]').forEach(input => {
    input.onchange = e => {
      pushHistory();
      const idx = parseInt(e.target.dataset.actIdx, 10);
      const field = e.target.dataset.actField;
      state.draft.activities[idx][field] = field === 'duration' ? Number(e.target.value) : e.target.value;
      saveDraft();
      renderEditor();
    };
  });

  container.querySelectorAll('[data-act-del]').forEach(btn => {
    btn.onclick = e => {
      pushHistory();
      const idx = parseInt(e.target.dataset.actDel, 10);
      state.draft.activities.splice(idx, 1);
      saveDraft();
      renderEditor();
    };
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 3. AI COPILOT CONTROLLER
 */
function setupAI() {
  $('btn-run-full-audit').onclick = async () => {
    if (!state.draft) return;
    const btn = $('btn-run-full-audit');
    btn.disabled = true;
    btn.textContent = '✨ Auditing Pedagogical Flow & Quality...';

    try {
      const audit = await AIService.auditCurriculum(state.draft);
      $('ai-score-num').textContent = audit.score;
      $('ai-score-grade').textContent = `Grade ${audit.grade} • ${audit.score}/100`;
      $('ai-score-summary').textContent = `${audit.strengths.length} strengths, ${audit.issues.length} opportunities for improvement.`;

      const strengthsBox = $('ai-strengths-list');
      strengthsBox.innerHTML = audit.strengths.map(s => `<div class="insight-item">✓ ${escapeHtml(s)}</div>`).join('');

      const issuesBox = $('ai-issues-list');
      issuesBox.innerHTML = audit.issues.map(i => `<div class="issue-item issue-${i.type}">⚠️ [${escapeHtml(i.category)}] ${escapeHtml(i.message)}</div>`).join('');

      if (audit.aiInsight) {
        $('ai-deep-insight').textContent = `Coach Note: "${audit.aiInsight}"`;
        $('ai-deep-insight').hidden = false;
      }

      $('ai-audit-results').hidden = false;
      toast(`✓ Quality Audit Complete: Score ${audit.score}/100`);
    } catch (err) {
      toast(`Audit failed: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Run Curriculum Quality Audit';
    }
  };

  $('btn-ai-gen-vocab').onclick = async () => {
    if (!state.draft) return;
    const btn = $('btn-ai-gen-vocab');
    btn.disabled = true;
    btn.textContent = 'Extracting Terms...';

    try {
      pushHistory();
      const guidance = (state.draft.activities || []).flatMap(a => a.sections || []).map(s => s.body).join('\n');
      const terms = await AIService.generateVocabDefinitions(guidance || state.draft.title);

      ensureFrontMatter();
      state.draft.frontMatter.vocabulary ??= [];
      terms.forEach(t => {
        if (!state.draft.frontMatter.vocabulary.some(v => v.word === t.word)) {
          state.draft.frontMatter.vocabulary.push(t);
        }
      });
      saveDraft();
      toast(`✓ Added ${terms.length} vocabulary definitions!`);
    } catch (err) {
      toast(`Vocab generation error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Define Vocabulary';
    }
  };

  $('btn-ai-gen-discussion').onclick = async () => {
    if (!state.draft) return;
    const sec = state.draft.activities?.[0]?.sections?.[0];
    if (!sec) {
      toast('No sections available for discussion generation.');
      return;
    }

    try {
      const prompts = await AIService.generateDiscussionPrompts(sec.title || 'Discussion', sec.body || '');
      $('ai-custom-response').innerHTML = `<pre style="white-space: pre-wrap;">${escapeHtml(prompts)}</pre>`;
      $('ai-custom-response').hidden = false;
      toast('✓ Discussion prompts generated!');
    } catch (err) {
      toast(`Error: ${err.message}`);
    }
  };

  $('btn-send-ai-prompt').onclick = async () => {
    const promptText = $('ai-custom-prompt').value.trim();
    if (!promptText) return;

    const btn = $('btn-send-ai-prompt');
    btn.disabled = true;
    btn.textContent = 'Thinking...';

    try {
      const res = await AIService.executePrompt({
        systemInstruction: 'You are an instructional curriculum assistant specializing in computer science.',
        prompt: `Context Lesson: "${state.draft?.title}"\nUser Request: ${promptText}`
      });

      $('ai-custom-response').innerHTML = `<p><strong>${escapeHtml(res.engine)}:</strong></p><p>${escapeHtml(res.text || 'No response')}</p>`;
      $('ai-custom-response').hidden = false;
    } catch (err) {
      toast(`AI Error: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Request';
    }
  };
}

/**
 * 4. LEVEL BUILDER STAGING CONTROLLER
 */
function setupTransfer() {
  detectLevelBuilderTab();

  $('btn-refresh-target').onclick = detectLevelBuilderTab;

  $('btn-read-baseline').onclick = async () => {
    if (!state.targetTabId) {
      toast('Please open or focus the Level Builder lesson editor tab first.');
      return;
    }

    const btn = $('btn-read-baseline');
    btn.disabled = true;
    btn.textContent = 'Reading Editor...';

    try {
      const transport = createNativeTransport(async encoded => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: state.targetTabId },
          func: nativeEditorBridge,
          args: [encoded]
        });
        return result?.result;
      });

      const capture = await transport({ action: 'read' });
      state.destinationSnapshot = normalizeNativeCapture(capture);

      toast('✓ Read baseline from Level Builder tab! (Zero writes performed)');
      buildAndRenderTransferPlan();
    } catch (err) {
      toast(`Baseline read error: ${err.message}`, 4000);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Read Baseline Only (No Writes)';
    }
  };

  $('chk-approve-save').onchange = () => {
    const checked = $('chk-approve-save').checked;
    $('btn-stage-changes').disabled = !checked || !state.transferPlan || state.transferPlan.blockers.length > 0;
  };

  $('btn-stage-changes').onclick = async () => {
    if (!$('chk-approve-save').checked || !state.transferPlan) return;
    const btn = $('btn-stage-changes');
    btn.disabled = true;
    btn.textContent = 'Staging Changes into Editor...';

    const logBox = $('staging-status-box');
    logBox.hidden = false;
    logBox.textContent = 'Initializing native transfer runner...\n';

    try {
      const transport = createNativeTransport(async encoded => {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: state.targetTabId },
          func: nativeEditorBridge,
          args: [encoded]
        });
        return result?.result;
      });

      const report = await stageNativeTransferPlan(state.transferPlan, transport, {
        onProgress: rep => {
          logBox.textContent += `Action completed: ${rep.completed} operations.\n`;
        }
      });

      logBox.textContent += `Staging complete: Status ${report.status}. Running verified readback...\n`;
      $('btn-verified-readback').disabled = false;
      $('step-3').classList.add('completed');
      $('step-4').classList.add('active');
      toast('✓ Changes safely staged! Verify the Level Builder tab.');
    } catch (err) {
      logBox.textContent += `ERROR: ${err.message}\n`;
      toast(`Staging failed: ${err.message}`, 4500);
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Stage Reviewed Changes';
    }
  };
}

async function detectLevelBuilderTab() {
  try {
    const tabs = await chrome.tabs.query({ url: '*://levelbuilder-studio.code.org/*' });
    if (tabs.length > 0) {
      const tab = tabs[0];
      state.targetTabId = tab.id;
      $('dest-label').textContent = 'Level Builder Connected';
      $('dest-url').textContent = tab.url;
      $('transfer-target-card').classList.add('active');
    } else {
      $('dest-label').textContent = 'No Level Builder Tab Detected';
      $('dest-url').textContent = 'Open levelbuilder-studio.code.org/lessons/...';
      $('transfer-target-card').classList.remove('active');
    }
  } catch (err) {
    console.warn('Tab detection error:', err);
  }
}

async function buildAndRenderTransferPlan() {
  if (!state.draft || !state.destinationSnapshot) return;
  try {
    const pkg = {
      schemaVersion: 1,
      sandbox: 'https://levelbuilder-studio.code.org/courses/6-12-dev-playground/units/16/lessons/11',
      status: 'approved-locally',
      conflicts: [],
      lesson: state.draft,
      baseline: state.draft
    };

    const plan = await buildTransferPlan(pkg, state.destinationSnapshot, {});
    state.transferPlan = plan;

    $('diff-ops-count').textContent = `${plan.operations.length} actions`;

    // AI plain English explanation
    const explanation = AIService.explainPlan(plan);
    $('diff-summary-ai').innerHTML = `<p>${escapeHtml(explanation)}</p>`;
    $('diff-summary-ai').hidden = false;

    // Render blockers if any
    if (plan.blockers.length > 0) {
      $('diff-blockers-container').innerHTML = plan.blockers.map(b => `<div class="issue-item issue-critical">🚫 ${escapeHtml(b)}</div>`).join('');
      $('diff-blockers-container').hidden = false;
    } else {
      $('diff-blockers-container').hidden = true;
    }

    // Render operations list
    const opList = $('diff-operations-list');
    opList.innerHTML = '';

    plan.operations.forEach(op => {
      const item = document.createElement('div');
      item.className = `diff-item ${op.kind === 'append' ? 'add' : op.requiresDecision ? 'conflict' : 'update'}`;
      item.innerHTML = `
        <div class="diff-item-header">
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

    $('step-1').classList.add('completed');
    $('step-2').classList.add('active');
  } catch (err) {
    toast(`Plan building error: ${err.message}`);
  }
}

/**
 * 5. EXPORT CONTROLLER
 */
function setupExport() {
  $('btn-copy-markdown').onclick = async () => {
    if (!state.draft) return;
    try {
      const md = exportMarkdown({
        title: state.draft.title,
        frontMatter: state.draft.frontMatter || state.draft,
        resources: state.draft.resources || [],
        activities: state.draft.activities || [],
        sections: state.draft.sections || (state.draft.activities || []).flatMap(a => a.sections || [])
      });
      await navigator.clipboard.writeText(md);
      toast('✓ Markdown copied to clipboard!');
    } catch (err) {
      toast(`Copy failed: ${err.message}`);
    }
  };

  $('btn-download-markdown').onclick = () => {
    if (!state.draft) return;
    const md = exportMarkdown({
      title: state.draft.title,
      frontMatter: state.draft.frontMatter || state.draft,
      resources: state.draft.resources || [],
      activities: state.draft.activities || [],
      sections: state.draft.sections || (state.draft.activities || []).flatMap(a => a.sections || [])
    });
    downloadFile(md, `${state.draft.title || 'lesson'}.md`, 'text/markdown');
  };

  $('btn-download-package-json').onclick = () => {
    if (!state.draft) return;
    const pkg = {
      schemaVersion: 1,
      kind: 'lesson-studio-review-package',
      lesson: state.draft,
      status: 'approved-locally',
      exportedAt: new Date().toISOString()
    };
    downloadFile(JSON.stringify(pkg, null, 2), `${state.draft.title || 'lesson'}-review-package.json`, 'application/json');
  };

  $('btn-download-backup').onclick = () => {
    if (!state.draft) return;
    const snapshot = {
      schemaVersion: 1,
      kind: 'lesson-studio-full-workspace-backup',
      draft: state.draft,
      sourcePackage: state.sourcePackage,
      exportedAt: new Date().toISOString()
    };
    downloadFile(JSON.stringify(snapshot, null, 2), `lesson-studio-backup-${Date.now()}.json`, 'application/json');
  };
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`✓ Downloaded ${filename}`);
}

document.addEventListener('DOMContentLoaded', init);
