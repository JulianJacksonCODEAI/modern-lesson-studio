// Link checking for the Import step's Slides and Notion fields (no chrome.* here, so it runs in Node tests).
// sourceLink() turns pasted text into {url, key} or {error}; key names the page, so a pasted link and an open
// tab count as the same page even when one has #slide=…, ?usp=sharing or a different /u/N/ account path.

const SLIDES = {
  noun: 'deck',
  hint: 'Paste the deck’s link from its address bar. It starts with https://docs.google.com/presentation/.',
};
const NOTION = {
  noun: 'Notion page',
  hint: 'Paste the page’s link. It starts with https://www.notion.so/ (or your team’s notion.site address).',
};
export const LINK_KINDS = {slides: SLIDES, notion: NOTION};

function asUrl(text) {
  const t = String(text ?? '').trim();
  if (!t) {
    return null;
  }
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : 'https://' + t);
  } catch {
    return null;
  }
}

const isNotionHost = h =>
  h === 'notion.so' ||
  h.endsWith('.notion.so') ||
  h.endsWith('.notion.site') ||
  h === 'app.notion.com';

function slidesLink(u) {
  if (u.hostname !== 'docs.google.com') {
    if (u.hostname === 'drive.google.com') {
      return {
        error:
          'That’s a Google Drive link. Open the deck, then copy the link from its address bar.',
      };
    }
    return {error: 'That isn’t a Google Slides link. ' + SLIDES.hint};
  }
  const kind = u.pathname.match(/^\/(document|spreadsheets|forms|drawings)\//);
  if (kind) {
    const name = {
      document: 'Google Docs',
      spreadsheets: 'Google Sheets',
      forms: 'Google Forms',
      drawings: 'Google Drawings',
    }[kind[1]];
    return {error: `That’s a ${name} link, not a Slides deck.`};
  }
  const id = u.pathname.match(/^\/presentation\/(?:u\/\d+\/)?d\/([\w-]{10,})/);
  if (!id) {
    return {error: 'That Slides link doesn’t name a deck. ' + SLIDES.hint};
  }
  return {
    url: `https://docs.google.com/presentation/d/${id[1]}/edit`,
    key: 'slides:' + id[1],
  };
}

function notionLink(u) {
  if (u.protocol !== 'https:' || !isNotionHost(u.hostname)) {
    return {error: 'That isn’t a Notion link. ' + NOTION.hint};
  }
  // Notion pages end in a 32-character ID (a ?p= ID is a page opened over a database).
  const fromP = u.searchParams.get('p');
  const last = u.pathname.split('/').filter(Boolean).pop() || '';
  const id = (fromP || last)
    .replace(/-/g, '')
    .match(/[0-9a-f]{32}$/i)?.[0]
    ?.toLowerCase();
  if (!id) {
    return {error: 'That Notion link doesn’t name a page. ' + NOTION.hint};
  }
  const url = new URL(u.origin + u.pathname);
  if (fromP) {
    url.searchParams.set('p', fromP);
  }
  return {url: url.href, key: 'notion:' + id};
}

// kind: 'slides' | 'notion'. Returns {url, key} or {error}; {empty: true} for blank input.
export function sourceLink(kind, text) {
  if (!String(text ?? '').trim()) {
    return {empty: true};
  }
  const u = asUrl(text);
  if (!u || u.protocol !== 'https:') {
    return {error: LINK_KINDS[kind].hint};
  }
  return kind === 'slides' ? slidesLink(u) : notionLink(u);
}

// The key for an open tab's URL, or null when the tab isn't that kind of page.
export function tabKey(kind, url) {
  const r = sourceLink(kind, url);
  return r.key || null;
}

// Picks the open tab to suggest: the active one if it matches, else the most recently used.
export function bestTab(kind, tabs) {
  const matching = (tabs || []).filter(t => tabKey(kind, t.url));
  return (
    matching.find(t => t.active) ||
    [...matching].sort(
      (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)
    )[0] ||
    null
  );
}
