import { AIService } from '../ai/ai-service.mjs';
import { exportMarkdown, generate } from '../core/core.mjs';
import { sourcePageExport } from '../core/source-page-export.mjs';
import { unzipOffice, presentationParts, notionMarkdown } from '../core/source-imports.mjs';
import { notionPageExport } from '../core/notion-page-export.mjs';
import { NotionConnector } from '../core/notion-connector.mjs';

const $ = id => document.getElementById(id);

let currentTab = null;
let currentDraft = null;

function showToast(message, duration = 3000) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

async function init() {
  // 1. Check AI Capabilities & update status badge
  try {
    const caps = await AIService.detectCapabilities();
    const badgeText = $('ai-status-text');
    if (caps.hasPromptApi) {
      badgeText.textContent = 'Chrome On-Device AI';
    } else if (caps.hasGeminiKey) {
      badgeText.textContent = 'Gemini 2.0 AI';
    } else {
      badgeText.textContent = 'Heuristic AI Ready';
    }
  } catch (err) {
    console.warn('AI status check:', err);
  }

  // 2. Query Active Tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    updateTabContext(tab);
  } catch (err) {
    console.error('Failed to get active tab:', err);
  }

  // 3. Load Recent Draft
  loadRecentDraft();

  // 4. Setup Event Listeners
  setupEventListeners();
}

function updateTabContext(tab) {
  const url = tab?.url || '';
  const banner = $('context-banner');
  const icon = $('context-icon');
  const title = $('context-title');
  const desc = $('context-desc');
  const actionBtn = $('context-action-btn');

  if (url.includes('docs.google.com/presentation')) {
    banner.classList.add('active-slides');
    icon.textContent = '📊';
    title.textContent = 'Google Slides Detected';
    desc.textContent = 'Ready to extract slides and speaker notes into Lesson Studio.';
    actionBtn.textContent = '⚡ Import Slides';
    actionBtn.hidden = false;
    actionBtn.onclick = handleImportSlides;
  } else if (url.includes('notion.so') || url.includes('notion.site') || url.includes('app.notion.com')) {
    banner.classList.add('active-slides');
    icon.textContent = '📝';
    title.textContent = 'Notion Brief Detected';
    desc.textContent = 'Clip lesson overview, objectives, resources & vocab from Notion.';
    actionBtn.textContent = '⚡ Clip Notion Brief';
    actionBtn.hidden = false;
    actionBtn.onclick = handleImportNotion;
  } else if (url.includes('levelbuilder-studio.code.org')) {
    banner.classList.add('active-levelbuilder');
    icon.textContent = '🏗️';
    title.textContent = 'Level Builder Editor';
    desc.textContent = 'Ready to inspect lesson DOM, compare diffs, and safely stage changes.';
    actionBtn.textContent = '🔍 Connect & Stage';
    actionBtn.hidden = false;
    actionBtn.onclick = handleOpenSidePanel;
  } else {
    icon.textContent = '💡';
    title.textContent = 'Lesson Studio AI';
    desc.textContent = 'Open Google Slides or Level Builder to enable instant tab actions.';
    actionBtn.hidden = true;
  }
}

async function handleImportSlides() {
  if (!currentTab?.id) return;
  const actionBtn = $('context-action-btn');
  const origText = actionBtn.textContent;
  actionBtn.textContent = 'Extracting...';
  actionBtn.disabled = true;

  try {
    const [response] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: sourcePageExport,
      args: [currentTab.url]
    });

    const result = response?.result;
    if (result?.kind !== 'google-slides-export') {
      throw new Error('Could not export presentation. Ensure you are signed into Google Slides.');
    }

    const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
    const parsed = presentationParts(await unzipOffice(bytes), result.name);
    parsed.deckUrl = result.deckUrl;

    const importId = crypto.randomUUID();
    await chrome.storage.local.set({
      [`pending_source_${importId}`]: parsed,
      lastImportId: importId
    });

    showToast('Slides imported! Opening Side Panel...');
    await chrome.sidePanel.open({ windowId: currentTab.windowId });
  } catch (err) {
    showToast(`Import error: ${err.message}`, 4000);
  } finally {
    actionBtn.textContent = origText;
    actionBtn.disabled = false;
  }
}

async function handleImportNotion() {
  if (!currentTab?.id) return;
  const actionBtn = $('context-action-btn');
  const origText = actionBtn.textContent;
  actionBtn.textContent = 'Clipping Notion...';
  actionBtn.disabled = true;

  try {
    const [response] = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: notionPageExport
    });

    const result = response?.result;
    if (result?.kind !== 'notion-web-clip') {
      throw new Error('Could not clip Notion page. Ensure the brief has headings.');
    }

    const parsedBrief = notionMarkdown(result.markdown);
    if (result.title) parsedBrief.title = result.title;

    const importId = crypto.randomUUID();
    await chrome.storage.local.set({
      [`pending_source_${importId}`]: parsedBrief,
      lastImportId: importId
    });

    showToast('✓ Notion brief clipped! Opening Side Panel...');
    await chrome.sidePanel.open({ windowId: currentTab.windowId });
  } catch (err) {
    showToast(`Notion clip error: ${err.message}`, 4000);
  } finally {
    actionBtn.textContent = origText;
    actionBtn.disabled = false;
  }
}

async function handleOpenSidePanel() {
  if (!currentTab?.windowId) return;
  try {
    await chrome.sidePanel.open({ windowId: currentTab.windowId });
    window.close(); // Close popup once side panel opens
  } catch (err) {
    showToast(`Error opening side panel: ${err.message}`);
  }
}

async function handleOpenStudio() {
  await chrome.tabs.create({ url: chrome.runtime.getURL('studio/index.html') });
  window.close();
}

async function loadRecentDraft() {
  try {
    // Check storage for active draft
    const data = await chrome.storage.local.get(['activeLessonDraft']);
    if (data.activeLessonDraft) {
      currentDraft = data.activeLessonDraft;
      if (currentDraft && (!currentDraft.activities || currentDraft.activities.length === 0) && currentDraft.slides) {
        currentDraft = generate(currentDraft);
        chrome.storage.local.set({ activeLessonDraft: currentDraft });
      }
      renderDraftInfo(currentDraft);
      return;
    }

    // Fallback: Fetch sample fixture if no draft stored yet
    const res = await fetch(chrome.runtime.getURL('core/fixture.json'));
    const fixture = await res.json();
    currentDraft = generate(fixture);
    chrome.storage.local.set({ activeLessonDraft: currentDraft });
    renderDraftInfo(currentDraft);
  } catch (err) {
    console.warn('Could not load draft info:', err);
  }
}

function renderDraftInfo(draft) {
  if (!draft) return;
  $('draft-pill').textContent = draft.status === 'approved' ? '✓ Approved' : 'Drafting';
  $('draft-pill').className = draft.status === 'approved' ? 'pill pill-success' : 'pill pill-muted';
  $('draft-title').textContent = draft.title || 'Untitled Lesson';

  const activities = draft.activities || [];
  const totalMin = activities.reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
  $('draft-timing').textContent = `${totalMin || 45} min`;

  const sectionsCount = activities.reduce((sum, a) => sum + (a.sections?.length || 0), 0);
  const calloutsCount = activities.flatMap(a => a.sections || []).flatMap(s => s.callouts || []).length;
  $('draft-summary').textContent = `${activities.length} activities • ${sectionsCount} sections • ${calloutsCount} callouts`;
}

function setupEventListeners() {
  $('btn-open-sidepanel').onclick = handleOpenSidePanel;
  $('btn-open-studio').onclick = handleOpenStudio;

  $('btn-quick-ai-audit').onclick = async () => {
    if (!currentDraft) return;
    const btn = $('btn-quick-ai-audit');
    btn.textContent = 'Auditing...';
    btn.disabled = true;

    try {
      const audit = await AIService.auditCurriculum(currentDraft);
      showToast(`AI Quality Score: ${audit.score}/100 (Grade ${audit.grade})! Open Side Panel for details.`, 4000);
    } catch (err) {
      showToast(`Audit failed: ${err.message}`);
    } finally {
      btn.textContent = '✨ AI Quality Audit';
      btn.disabled = false;
    }
  };

  $('btn-export-quick-md').onclick = async () => {
    if (!currentDraft) return;
    try {
      // Create markdown
      const md = exportMarkdown({
        title: currentDraft.title,
        frontMatter: currentDraft.frontMatter || currentDraft,
        resources: currentDraft.resources || [],
        activities: currentDraft.activities || [],
        sections: currentDraft.sections || (currentDraft.activities || []).flatMap(a => a.sections || [])
      });

      await navigator.clipboard.writeText(md);
      showToast('✓ Markdown copied to clipboard!');
    } catch (err) {
      showToast(`Failed to copy: ${err.message}`);
    }
  };

  // Settings
  $('btn-settings-toggle').onclick = async () => {
    const settings = await AIService.getSettings();
    $('ai-backend-select').value = settings.preferredAiModel || 'auto';
    $('gemini-key-input').value = settings.geminiApiKey || '';
    $('notion-token-input').value = await NotionConnector.getToken();
    $('settings-drawer').hidden = false;
  };

  $('btn-close-settings').onclick = () => {
    $('settings-drawer').hidden = true;
  };

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('settings-drawer').hidden) {
      $('settings-drawer').hidden = true;
    }
  });

  $('btn-save-settings').onclick = async () => {
    try {
      await AIService.saveSettings({
        preferredAiModel: $('ai-backend-select').value,
        geminiApiKey: $('gemini-key-input').value.trim()
      });
      await NotionConnector.setToken($('notion-token-input').value.trim());
      $('settings-drawer').hidden = true;
      showToast('✓ Settings saved!');
      init();
    } catch (err) {
      $('settings-drawer').hidden = true;
      showToast('✓ Settings updated');
    }
  };
}

document.addEventListener('DOMContentLoaded', init);
