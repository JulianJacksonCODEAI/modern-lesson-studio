// Read-only imports from the open Google Slides deck and Notion page.
// The lesson is built by the prototype engine's generate(), exactly as the reviewed-transfer workflow expects.
import {sourcePageExport} from '../engine/browser-fill/source-page-export.mjs';
import {
  unzipOffice,
  presentationParts,
  notionMarkdown,
  combineSourceImports,
} from '../engine/dist/source-imports.mjs';
import {generate} from '../engine/dist/core.mjs';
import {notionPageExport} from './notion-page-export.mjs';

const STORE_KEY = 'teamImports';
export const isSlidesUrl = url =>
  /^https:\/\/docs\.google\.com\/presentation\//.test(url || '');
export const isNotionUrl = url =>
  /^https:\/\/([a-z0-9-]+\.)?(notion\.so|notion\.site)\/|^https:\/\/app\.notion\.com\//.test(
    url || ''
  );

export async function loadImports() {
  const {[STORE_KEY]: saved} = await chrome.storage.session.get(STORE_KEY);
  return saved || {slides: null, brief: null};
}
export async function saveImports(imports) {
  await chrome.storage.session.set({[STORE_KEY]: imports});
}
export async function clearImports() {
  await chrome.storage.session.remove(STORE_KEY);
}

export async function importSlides(tab) {
  if (!tab?.id || !isSlidesUrl(tab.url)) {
    throw Error('Switch to the Google Slides deck first, then try again.');
  }
  const [response] = await chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: sourcePageExport,
    args: [tab.url],
  });
  const result = response?.result;
  if (result?.kind !== 'google-slides-export') {
    throw Error(
      result?.error ||
        'The deck could not be read. Make sure you are signed in and the deck has speaker notes.'
    );
  }
  const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
  const item = presentationParts(await unzipOffice(bytes), result.name);
  if (result.deckUrl) {
    item.deckUrl = result.deckUrl;
  }
  return {
    item,
    url: result.deckUrl || tab.url,
    name: result.name || tab.title || 'Slides deck',
    count: item.slides?.length || 0,
  };
}

export async function importNotion(tab) {
  if (!tab?.id || !isNotionUrl(tab.url)) {
    throw Error('Switch to the Notion lesson page first, then try again.');
  }
  const [response] = await chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: notionPageExport,
  });
  const result = response?.result;
  if (result?.kind !== 'notion-web-clip') {
    throw Error(
      'The Notion page could not be read. Make sure it has loaded fully.'
    );
  }
  const item = notionMarkdown(result.markdown);
  if (result.title) {
    item.title = result.title;
  }
  return {
    item,
    url: result.url || tab.url,
    name: result.title || 'Notion page',
  };
}

// Google adds "?usp=sharing" (or usp=drive_link etc.) to links copied from Share. Level Builder's records usually
// don't have it, and resources are matched on their exact link, so it is removed from Google Docs/Drive links.
export function cleanResourceUrl(url) {
  try {
    const u = new URL(url);
    if (!/^(docs|drive)\.google\.com$/.test(u.hostname)) {
      return url;
    }
    u.searchParams.delete('usp');
    return u.toString().replace(/\?$/, '');
  } catch {
    return url;
  }
}

// Slides are required (the lesson's sections come from speaker notes); Notion adds the front matter.
export function buildLesson(imports) {
  if (!imports?.slides) {
    return null;
  }
  const base = {
    title:
      imports.brief?.item?.title || imports.slides.name || 'Untitled lesson',
    slides: [],
  };
  const parts = [imports.slides.item, imports.brief?.item].filter(Boolean);
  const {source, warnings} = combineSourceImports(base, parts);
  source.resources = (source.resources || []).map(r => ({
    ...r,
    url: cleanResourceUrl(r.url),
  }));
  const lesson = generate(source);
  // A first import always starts from zero slides, so the engine's "different slide identities" revision note doesn't apply.
  const relevant = w =>
    !/uses different slide identities|previous level mappings/i.test(w);
  const untitled = (lesson.sections || [])
    .filter(s => !String(s.title || '').trim())
    .map(
      s =>
        `Slide ${s.slide}: no "Title (N minutes)" line at the top of its notes, so it becomes a section with no title in Level Builder.`
    );
  return {
    source,
    lesson,
    warnings: [
      ...new Set([
        ...(warnings || []),
        ...(lesson.warnings || []),
        ...untitled,
      ]),
    ].filter(relevant),
  };
}
