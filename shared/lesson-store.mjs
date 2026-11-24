// Lesson data lives only for the browser session: chrome.storage.session is kept in memory and cleared
// when the browser closes (1.6.0). Settings (AI choice, Notion token) stay in chrome.storage.local.
//
// The save engine reads and writes its records synchronously (a localStorage-style API), so
// sessionRecordStore() loads its records once and writes each change through to chrome.storage.session.

// chrome.storage.local keys that held lesson content before 1.6.0.
export const LESSON_KEYS = [
  'teamImports',
  'pendingReports',
  'activeLessonDraft',
];
// Window localStorage prefixes the save engine used before 1.6.0 (transfer state, receipts, shared records).
export const RECORD_PREFIXES = [
  'antigrav-transfer-',
  'native-approved-save-',
  'native-shared-record-',
];
const RECORD_KEY = 'lessonRecords';
// chrome.storage.session allows 10 MB; leave room for imports and reports.
const RECORD_LIMIT = 6 * 1024 * 1024;

export const lessonArea = (c = globalThis.chrome) => c.storage.session;

// Moves lesson content saved by earlier versions out of disk storage into the session, then deletes it.
export async function moveLessonDataToSession({
  chrome: c = globalThis.chrome,
  localStorage: ls = globalThis.localStorage,
} = {}) {
  const session = lessonArea(c);
  const old = await c.storage.local.get(LESSON_KEYS);
  const current = await session.get([...LESSON_KEYS, RECORD_KEY]);
  const move = {};
  for (const k of LESSON_KEYS)
    if (old[k] !== undefined && current[k] === undefined) move[k] = old[k];
  const records = {...(current[RECORD_KEY] || {})},
    stale = [];
  for (let i = 0; ls && i < ls.length; i++) {
    const k = ls.key(i);
    if (RECORD_PREFIXES.some(p => k?.startsWith(p))) stale.push(k);
  }
  for (const k of stale) if (!(k in records)) records[k] = ls.getItem(k);
  if (stale.length) move[RECORD_KEY] = records;
  if (Object.keys(move).length) await session.set(move);
  await c.storage.local.remove(LESSON_KEYS);
  for (const k of stale) ls.removeItem(k);
  return {moved: Object.keys(move).length, records: stale.length};
}

// A localStorage-like store for the save engine, backed by chrome.storage.session.
export async function sessionRecordStore({
  chrome: c = globalThis.chrome,
  onError = () => {},
} = {}) {
  const session = lessonArea(c);
  const map = new Map(
    Object.entries((await session.get(RECORD_KEY))[RECORD_KEY] || {})
  );
  const size = () => {
    let n = 0;
    for (const [k, v] of map) n += k.length + v.length;
    return n;
  };
  const flush = () =>
    session.set({[RECORD_KEY]: Object.fromEntries(map)}).catch(onError);
  return {
    get length() {
      return map.size;
    },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      const previous = map.get(k);
      map.set(k, String(v));
      if (size() > RECORD_LIMIT) {
        if (previous === undefined) map.delete(k);
        else map.set(k, previous);
        throw Error('Session storage is full.');
      }
      flush();
    },
    removeItem(k) {
      if (map.delete(k)) flush();
    },
  };
}
