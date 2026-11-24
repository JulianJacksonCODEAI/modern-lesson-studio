// AntiGrav ⇄ prototype engine connector.
// Builds the same IO the prototype's reviewed-transfer screen (dist/workflow-app.mjs, makeIO + sharedIO) uses,
// without its DOM, so the side panel can run:
//   check shared records → (user: Skip or Add each missing one) → create the added ones → bind
//   → prepare (rehearse + restore) → approve → save once → readback.
// Saves go through the prototype's runApprovedSave: receipt before dispatch, never resent, independent readback.
// Shared-record creation goes through executeSharedReview: attempt stored before the only POST, never retried.
import {clone, digest} from './dist/transfer-core.mjs';
import {applyLevelChoices} from '../shared/levels.mjs';
import {
  assertWritableLesson,
  SANDBOX_LESSONS,
  validDestination,
} from './dist/destination.mjs';
import {
  readTransferBaseline,
  prepareTransfer,
  approveTransfer,
  executeTransfer,
} from './dist/reusable-transfer.mjs';
import {
  readTransferRecord,
  writeTransferRecord,
} from './dist/transfer-storage.mjs';
import {reviewedLevelGroups} from './dist/reviewed-structure.mjs';
import {saveRequestDigest} from './dist/save-review.mjs';
import {recoverNativeLevelCheck} from './dist/native-level-verification.mjs';
import {
  prepareSharedReview,
  executeSharedReview,
  bindSharedRecords,
} from './dist/shared-records.mjs';
import {SANDBOX} from './dist/core.mjs';
import {
  sharedCandidates,
  withoutCandidates,
  sameIntent,
  keepSavedObjectives,
} from './shared-choices.mjs';

export {SANDBOX_LESSONS};
const RECEIPT_PREFIX = 'native-approved-save-',
  SHARED_PREFIX = 'native-shared-record-';

// Any lesson editor tab (/lessons/ID/edit). Ownership is confirmed separately before anything is written.
export function destinationFromTab(tab) {
  const url = String(tab?.url || '').split('#')[0];
  const m = url.match(
    /^https:\/\/levelbuilder-studio\.code\.org\/lessons\/([1-9]\d*)\/edit$/
  );
  const d = m ? {id: Number(m[1]), url} : null;
  return validDestination(d) ? d : null;
}
// Other Level Builder lesson links name the lesson by its position in a unit (/s/<unit>/lessons/<n>/edit) or
// course (/courses/<course>/units/<u>/lessons/<n>). Those are opened, then the page's own lesson ID is read.
export function lessonPageFromInput(text) {
  const t = String(text || '')
    .trim()
    .replace(/^(?!https?:\/\/)(levelbuilder-studio\.code\.org)/, 'https://$1');
  let u;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'levelbuilder-studio.code.org'
  ) {
    return null;
  }
  const p = u.pathname.replace(/\/+$/, '');
  const unit = /^\/s\/[\w-]+\/lessons\/[1-9]\d*(?:\/edit)?$/.test(p),
    course =
      /^\/courses\/[\w-]+\/units\/[1-9]\d*\/lessons\/[1-9]\d*(?:\/edit)?$/.test(
        p
      );
  if (!unit && !course) {
    return null;
  }
  return (
    'https://levelbuilder-studio.code.org' +
    (p.endsWith('/edit') ? p : p + '/edit')
  );
}
export function editorUrlFromInput(text) {
  const t = String(text || '').trim();
  const id =
    t.match(
      /levelbuilder-studio\.code\.org\/lessons\/([1-9]\d*)(?:\/edit)?\/?(?:[?#].*)?$/
    )?.[1] || t.match(/^([1-9]\d*)$/)?.[1];
  return id ? `https://levelbuilder-studio.code.org/lessons/${id}/edit` : null;
}

// The review package the engine expects (same shape as the prototype workspace's reviewPackage()).
// Team build: the imported draft is approved as-is; edits happen in Level Builder after the save.
export function reviewPackageFor(source, draft, destination) {
  return {
    schemaVersion: 1,
    status: 'approved-locally',
    sandbox: destination?.url || SANDBOX,
    published: false,
    source: clone(source),
    lesson: clone(draft),
    baseline: clone(draft),
    conflicts: [],
    review: {flags: [], reviewed: {}, resourceBuffer: null},
  };
}

// Read-only: the lesson's name and course/unit, from the editor page, so the user can confirm it's theirs.
export async function lessonDescriptionInPage() {
  const script = document.querySelector(
    'script[data-lesson][data-unitforlesson]'
  );
  if (!script) {
    return {error: 'This page is not a Level Builder lesson editor.'};
  }
  const lesson = JSON.parse(script.getAttribute('data-lesson')),
    unit = JSON.parse(script.getAttribute('data-unitforlesson'));
  const pick = (o, keys) =>
    keys.map(k => o?.[k]).find(v => typeof v === 'string' && v.trim());
  return {
    id: lesson.id,
    lessonName: pick(lesson, ['name', 'displayName', 'key']),
    unitName: pick(unit, ['displayName', 'title', 'name']),
    unitKey: pick(unit, ['name', 'key']),
    courseVersionId: unit.courseVersionId ?? null,
    lessonPath: pick(lesson, ['lessonPath', 'link']),
  };
}

export function createSession({
  tabId,
  destination,
  storage = globalThis.localStorage,
  onProgress = () => {},
  onState = () => {},
}) {
  if (!validDestination(destination)) {
    throw Error('Open the lesson editor page in Level Builder.');
  }
  const key = 'antigrav-transfer-' + destination.id + '-' + tabId;
  let state = readTransferRecord(storage, key) || {
    tabId,
    destination: clone(destination),
  };
  const persist = () => {
    writeTransferRecord(storage, key, state);
    onState(state);
  };
  let io;
  const tabCheck = async () => {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url !== destination.url || tab.discarded) {
      throw Error(
        'The Level Builder tab moved or was closed. Reopen the lesson and start again.'
      );
    }
  };
  // The editor's controls (React Select, objective rows) only respond when its tab is showing, as in the prototype's prepareReview.
  const showEditor = async () => {
    await tabCheck();
    await chrome.tabs.update(tabId, {active: true});
  };
  async function makeIO() {
    if (io) {
      return io;
    }
    const [
      {createNativeTransport},
      {nativeEditorBridge},
      {readAssignedLesson},
      {readAssignedLevelUsage, findUnitLevelConflicts},
      {withReviewedReload},
      {sharedRecordBridge},
    ] = await Promise.all([
      import('./browser-fill/native-transport.mjs'),
      import('./dist/native-dom-adapter.mjs'),
      import('./api-companion/read-lesson.mjs'),
      import('./dist/native-level-usage.mjs'),
      import('./browser-fill/reviewed-reload.mjs'),
      import('./dist/shared-record-bridge.mjs'),
    ]);
    const transport = func =>
      createNativeTransport(async encoded => {
        await tabCheck();
        const [result] = await chrome.scripting.executeScript({
          target: {tabId},
          injectImmediately: true,
          func,
          args: [encoded],
        });
        return result?.result;
      });
    // practiceConfirmed is the prototype's name for "the user confirmed this lesson is theirs".
    const bound = request => ({
      ...request,
      destination: clone(destination),
      practiceConfirmed: state.ownershipConfirmed === true,
    });
    const rawEdit = transport(nativeEditorBridge),
      read = transport(readAssignedLesson),
      usage = transport(readAssignedLevelUsage),
      shared = transport(sharedRecordBridge);
    const edit = withReviewedReload(request => rawEdit(bound(request)), {
      tabs: chrome.tabs,
      tabId,
      destination,
    });
    io = {
      bridge: request => edit(bound(request)),
      readSaved: () => read(bound({action: 'read', returnRaw: true})),
      checkUsage: async review => {
        const usages = [];
        for (const level of reviewedLevelGroups(review).flatMap(
          c => c.addLevels
        )) {
          usages.push(
            await usage(
              bound({action: 'read', levelId: level.levelId, name: level.name})
            )
          );
        }
        return findUnitLevelConflicts(review, usages);
      },
      onProgress,
      loadReceipt: async digest =>
        readTransferRecord(storage, RECEIPT_PREFIX + digest),
      persist: async (digest, receipt) => {
        state.receipt = receipt;
        writeTransferRecord(storage, RECEIPT_PREFIX + digest, receipt);
        persist();
      },
      checkpoint: async point => {
        state.checkpoint = point;
        state.needsRecovery = point.stage?.restored === false;
        persist();
      },
      loadCheckpoint: async () => state.checkpoint,
      shared: {
        context: () => shared(bound({action: 'context'})),
        search: (kind, intent, context) =>
          shared(
            bound({
              action: 'search',
              kind,
              query: kind === 'resources' ? intent.name : intent.word,
              courseVersionId: context.courseVersionId,
            })
          ),
        create: (review, item, approval) =>
          shared(
            bound({
              action: 'create',
              mode: 'explicit-approved-shared-create',
              review,
              item,
              approval,
            })
          ),
        load: async digest =>
          readTransferRecord(storage, SHARED_PREFIX + digest),
        persist: async (digest, value) => {
          writeTransferRecord(storage, SHARED_PREFIX + digest, value);
          state.sharedProgress = value;
          persist();
        },
        onProgress: result =>
          onProgress(
            result.status === 'record-verified'
              ? 'Resource checked in Level Builder.'
              : 'Adding a resource was not confirmed. It will not be sent again.'
          ),
      },
    };
    return io;
  }
  const locked = action =>
    navigator.locks.request(
      'lesson-studio-native-verification',
      {ifAvailable: true},
      async lock => {
        if (!lock) {
          throw Error(
            'Another run is using this lesson. Wait for it to finish.'
          );
        }
        return action();
      }
    );
  const requireOwnership = () =>
    assertWritableLesson(destination, state.ownershipConfirmed);

  return {
    get state() {
      return state;
    },
    get lessonInfo() {
      return SANDBOX_LESSONS[destination.id] || null;
    },
    async describe() {
      await tabCheck();
      const [r] = await chrome.scripting.executeScript({
        target: {tabId},
        func: lessonDescriptionInPage,
      });
      return r?.result || {error: 'Could not read the lesson.'};
    },
    confirmOwnership(yes) {
      state.ownershipConfirmed = yes === true;
      persist();
    },

    // Step A (read-only): which resources/vocabulary Level Builder already has, which are missing, which it can't accept.
    checkShared: pkg =>
      locked(async () => {
        requireOwnership();
        const candidates = sharedCandidates(pkg.lesson),
          unusable = candidates.filter(c => c.problem);
        const usable = withoutCandidates(pkg, unusable);
        const review = await prepareSharedReview(
          usable,
          (await makeIO()).shared
        );
        const items = candidates.map(c => {
          if (c.problem) {
            return {...c, status: 'cannot-add'};
          }
          const item = review.items.find(i => sameIntent(c, i));
          return {...c, status: item?.action === 'reuse' ? 'found' : 'missing'};
        });
        state.sharedCheck = {items};
        persist();
        return items;
      }),

    // Read-only: level names that contain the query, from the editor's own Add Levels search.
    searchLevels: query =>
      locked(async () => {
        requireOwnership();
        await showEditor();
        const io = await makeIO();
        const capture = await io.bridge({action: 'read'});
        return io.bridge({
          action: 'search-levels',
          query,
          expectedCaptureDigest: await digest(capture),
        });
      }),

    // Read-only: checks each exact level name with the editor's Add Levels search.
    // Returns {name: {ok, message}}. Nothing is added to the lesson.
    checkLevels: names =>
      locked(async () => {
        requireOwnership();
        await showEditor();
        const io = await makeIO(),
          results = {};
        for (const name of [...new Set(names)]) {
          try {
            const capture = await io.bridge({action: 'read'});
            const lookup = await io.bridge({
              action: 'lookup-levels',
              names: [name],
              expectedCaptureDigest: await digest(capture),
            });
            results[name] =
              lookup?.kind === 'native-level-mappings' &&
              lookup.mappings?.length === 1
                ? {ok: true}
                : {ok: false, message: 'Level Builder did not confirm it.'};
          } catch (error) {
            results[name] = {ok: false, message: error.message};
          }
        }
        return results;
      }),

    // Step B: remove skipped items, create the added ones (one attempt each), then rehearse and build the save review.
    prepare: (
      pkg,
      {add = [], skip = [], addObjectives = true, levels = null} = {}
    ) =>
      locked(async () => {
        requireOwnership();
        if (state.receipt?.attempted) {
          throw Error(
            'This lesson already has a save attempt in this run. Use Check again.'
          );
        }
        const io = await makeIO();
        const candidates = sharedCandidates(pkg.lesson);
        const check = state.sharedCheck?.items || [];
        const statusOf = c =>
          check.find(x => x.kind === c.kind && x.index === c.index)?.status;
        const chosen = (list, c) =>
          list.some(a => a.kind === c.kind && a.index === c.index);
        const skipped = candidates.filter(
          c =>
            c.problem ||
            (statusOf(c) === 'missing' && !chosen(add, c)) ||
            (statusOf(c) === 'found' && chosen(skip, c))
        );
        await showEditor();
        const {fresh} = await readTransferBaseline(io); // read-only; also stops if the editor has unsaved edits
        // Checked level names go into empty level groups; the rest are listed to add by hand.
        let withLevels = pkg;
        state.levelsToCopy = [];
        if (levels?.requests?.length) {
          const applied = applyLevelChoices(
            pkg,
            fresh.lesson,
            levels.requests,
            levels.choices || {}
          );
          withLevels = applied.pkg;
          state.levelsToCopy = applied.toCopy;
        }
        const objectives = keepSavedObjectives(
          withoutCandidates(withLevels, skipped),
          (fresh.lesson.objectives || []).map(o => o.description),
          {addMissing: addObjectives}
        );
        const reduced = objectives.pkg;
        state.objectivesNotCopied = objectives.notCopied;
        state.objectivesAdded = objectives.added;
        const review = await prepareSharedReview(reduced, io.shared);
        const unexpected = review.items.filter(
          i =>
            i.action === 'create' &&
            !candidates.some(
              c =>
                sameIntent(c, i) &&
                add.some(a => a.kind === c.kind && a.index === c.index)
            )
        );
        if (unexpected.length) {
          throw Error(
            'Level Builder changed while you were choosing. Check the resources again.'
          );
        }
        const approval = {reviewId: review.id, approved: true};
        const receipt = await executeSharedReview(review, approval, io.shared);
        state.sharedReceipt = receipt;
        persist();
        if (receipt.status !== 'shared-records-verified') {
          throw Error(
            'Adding a resource to Level Builder was not confirmed, so the lesson was not prepared. It will not be sent again. Report this problem.'
          );
        }
        const bound = await bindSharedRecords(reduced, receipt);
        delete state.job;
        state.pkg = bound;
        state.skipped = skipped.map(({kind, label, url, problem}) => ({
          kind,
          label,
          url,
          problem,
        }));
        state.added = receipt.items
          .filter(i => i.attempted)
          .map(i => ({
            kind: i.kind,
            label: i.kind === 'resources' ? i.record?.name : i.record?.word,
          }));
        persist();
        state.job = await prepareTransfer(bound, io);
        state.needsRecovery = false;
        persist();
        return state.job;
      }),

    // One save after explicit approval, then automatic readback-only recheck (never resends).
    approveAndSave: () =>
      locked(async () => {
        if (!state.job) {
          throw Error('Prepare the review first.');
        }
        requireOwnership();
        await showEditor();
        const io = await makeIO();
        state.job = await approveTransfer(state.job);
        persist();
        state.receipt = await executeTransfer(state.job, io);
        persist();
        if (state.receipt.status === 'saved-and-verified') {
          const retained = await io.loadReceipt(
            await saveRequestDigest(state.job.review)
          );
          if (!retained?.attempted) {
            throw Error(
              'The save receipt is missing. No second save will be attempted.'
            );
          }
          state.receipt = await executeTransfer(state.job, io);
          state.automaticRecheck = true;
          state.needsRecovery = false;
          persist();
        }
        return state.receipt;
      }),
    // Readback only. Never sends a save.
    checkAgain: () =>
      locked(async () => {
        const io = await makeIO();
        const receipt = await io.loadReceipt(
          await saveRequestDigest(state.job.review)
        );
        if (!receipt?.attempted) {
          throw Error('No save attempt to check.');
        }
        state.receipt = await executeTransfer(state.job, io);
        persist();
        return state.receipt;
      }),
    // Only for a run that staged changes and failed before saving.
    restore: () =>
      locked(async () => {
        if (state.receipt?.attempted) {
          throw Error('A save was attempted; only Check again is available.');
        }
        await recoverNativeLevelCheck(
          (await makeIO()).bridge,
          state.checkpoint.stage
        );
        state.needsRecovery = false;
        delete state.job;
        persist();
      }),
    reset() {
      storage.removeItem(key);
      state = {tabId, destination: clone(destination)};
      onState(state);
    },
    report() {
      return clone({
        destination,
        pkg: state.pkg,
        job: state.job,
        receipt: state.receipt,
        checkpoint: state.checkpoint,
        sharedCheck: state.sharedCheck,
        sharedReceipt: state.sharedReceipt,
        skipped: state.skipped,
        levelsToCopy: state.levelsToCopy,
        objectivesNotCopied: state.objectivesNotCopied,
      });
    },
  };
}
