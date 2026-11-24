import test from 'node:test';
import assert from 'node:assert/strict';
import {
  moveLessonDataToSession,
  sessionRecordStore,
  LESSON_KEYS,
} from '../shared/lesson-store.mjs';
import {
  readTransferRecord,
  writeTransferRecord,
} from '../engine/dist/transfer-storage.mjs';

function area(initial = {}) {
  const data = {...initial};
  return {
    data,
    get: async keys =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter(k => k in data)
          .map(k => [k, structuredClone(data[k])])
      ),
    set: async items => {
      Object.assign(data, structuredClone(items));
    },
    remove: async keys => {
      for (const k of [].concat(keys)) {
        delete data[k];
      }
    },
  };
}
function fakeLocalStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    get length() {
      return m.size;
    },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
}

test('lesson data saved to disk by earlier versions moves to session storage and is deleted from disk', async () => {
  const local = area({
    teamImports: {slides: {name: 'Deck'}},
    pendingReports: [{id: 'r1'}],
    activeLessonDraft: {title: 'L'},
    preferredAiModel: 'builtin',
  });
  const session = area({openStep: 'save'});
  const ls = fakeLocalStorage({
    'antigrav-transfer-1-2': 'a',
    'native-approved-save-x': 'b',
    'native-shared-record-y': 'c',
    unrelated: 'keep',
  });
  const chrome = {storage: {local, session}};
  const r = await moveLessonDataToSession({chrome, localStorage: ls});
  assert.equal(r.records, 3);
  for (const k of LESSON_KEYS) {
    assert.ok(!(k in local.data), k + ' removed from disk');
  }
  assert.equal(local.data.preferredAiModel, 'builtin', 'settings stay on disk');
  assert.deepEqual(session.data.teamImports, {slides: {name: 'Deck'}});
  assert.deepEqual(session.data.pendingReports, [{id: 'r1'}]);
  assert.deepEqual(Object.keys(session.data.lessonRecords).sort(), [
    'antigrav-transfer-1-2',
    'native-approved-save-x',
    'native-shared-record-y',
  ]);
  assert.deepEqual([...ls.m.keys()], ['unrelated']);
  assert.equal(session.data.openStep, 'save');
  const again = await moveLessonDataToSession({chrome, localStorage: ls});
  assert.equal(again.moved, 0, 'running again changes nothing');
});

test('newer session data is not overwritten by an older disk copy', async () => {
  const local = area({teamImports: {slides: {name: 'Old'}}});
  const session = area({teamImports: {slides: {name: 'New'}}});
  await moveLessonDataToSession({
    chrome: {storage: {local, session}},
    localStorage: fakeLocalStorage(),
  });
  assert.equal(session.data.teamImports.slides.name, 'New');
  assert.ok(!('teamImports' in local.data));
});

test('the save engine record store reads and writes session storage and refuses to grow past its limit', async () => {
  const session = area({lessonRecords: {'native-approved-save-a': 'kept'}});
  const chrome = {storage: {session}};
  const store = await sessionRecordStore({chrome});
  assert.equal(store.getItem('native-approved-save-a'), 'kept');
  assert.equal(store.getItem('missing'), null);
  writeTransferRecord(store, 'antigrav-transfer-1-2', {tabId: 2, ok: true});
  assert.deepEqual(readTransferRecord(store, 'antigrav-transfer-1-2'), {
    tabId: 2,
    ok: true,
  });
  await new Promise(r => setTimeout(r, 0));
  assert.ok(
    'antigrav-transfer-1-2' in session.data.lessonRecords,
    'written through to the session'
  );
  const reopened = await sessionRecordStore({chrome});
  assert.deepEqual(
    readTransferRecord(reopened, 'antigrav-transfer-1-2'),
    {tabId: 2, ok: true},
    'a reopened panel sees it'
  );
  store.removeItem('native-approved-save-a');
  assert.equal(store.length, 1);
  assert.throws(
    () => store.setItem('big', 'x'.repeat(7 * 1024 * 1024)),
    /full/
  );
  assert.equal(
    store.getItem('big'),
    null,
    'a write that does not fit is not kept'
  );
});
