// Skip/Add choices for resources and vocabulary that Level Builder doesn't have yet.
// Pure functions (no chrome.*), so they are unit-tested in test/shared-choices.test.mjs.
import {clone, canonical} from './dist/transfer-core.mjs';
import {sharedIntent} from './dist/shared-records.mjs';

const label = (kind, v) =>
  kind === 'resources'
    ? v.name
    : typeof v === 'string'
      ? v.split(': ')[0]
      : v.word;

// Every resource and vocabulary word in the draft, with whether Level Builder could accept it as a shared record.
export function sharedCandidates(lesson) {
  const out = [];
  for (const [kind, values] of [
    ['resources', lesson.resources || []],
    ['vocabularies', lesson.frontMatter?.vocabulary || []],
  ]) {
    values.forEach((value, index) => {
      let intent = null,
        problem = null;
      try {
        intent = sharedIntent(kind, value);
      } catch (e) {
        problem = e.message;
      }
      out.push({
        kind,
        index,
        label: label(kind, value) || '(unnamed)',
        url: kind === 'resources' ? value.url : null,
        value: clone(value),
        intent,
        problem,
      });
    });
  }
  return out;
}

// Removes the chosen candidates from both the draft and its approved baseline (they must stay equal).
export function withoutCandidates(pkg, remove) {
  const next = clone(pkg);
  for (const part of [next.lesson, next.baseline]) {
    if (!part) {
      continue;
    }
    part.resources = (part.resources || []).filter(
      r =>
        !remove.some(
          c => c.kind === 'resources' && canonical(c.value) === canonical(r)
        )
    );
    part.frontMatter.vocabulary = (part.frontMatter.vocabulary || []).filter(
      v =>
        !remove.some(
          c => c.kind === 'vocabularies' && canonical(c.value) === canonical(v)
        )
    );
  }
  return next;
}

// Objectives (team build): adding a new objective in the native editor has never passed a live test
// (first live run, 2026-11-22, the new row did not open). So the lesson keeps Level Builder's objectives
// exactly, and Notion objectives that aren't already there are listed for the user to add by hand.
export const normalizeObjective = text =>
  String(text ?? '')
    .normalize('NFKC')
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;]$/, '')
    .toLowerCase();
// With addMissing (Julian, 2026-11-22), Notion objectives that Level Builder doesn't have are appended after the
// saved ones; existing objectives keep their exact saved text and order. Without it, they're only listed.
export function keepSavedObjectives(
  pkg,
  savedDescriptions,
  {addMissing = false} = {}
) {
  const saved = (savedDescriptions || []).map(String),
    seen = new Set(saved.map(normalizeObjective));
  const proposed = pkg.lesson.frontMatter.objectives || [];
  const missing = [];
  for (const o of proposed) {
    const key = normalizeObjective(o);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    missing.push(String(o).trim());
  }
  const objectives = addMissing ? [...saved, ...missing] : saved;
  const next = clone(pkg);
  for (const part of [next.lesson, next.baseline]) {
    if (part) {
      part.frontMatter.objectives = clone(objectives);
    }
  }
  return {
    pkg: next,
    added: addMissing ? missing : [],
    notCopied: addMissing ? [] : missing,
    alreadyThere: proposed.length - missing.length,
  };
}

// Matches a shared-review item back to its candidate.
export const sameIntent = (candidate, item) =>
  candidate.intent &&
  candidate.kind === item.kind &&
  canonical(candidate.intent) === canonical(item.intent);
