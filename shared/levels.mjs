// Linking existing Level Builder levels to the lesson's sections (team build).
//
// Speaker notes name levels only by number ("Direct students to Lesson 16, Levels 2-4"). Names come,
// in order, from the Notion page's Levels list, a Level Builder search, or the user typing them. Every
// name is checked with the editor's own Add Levels search before it is saved. A section whose level
// group in Level Builder already has levels can't take new ones yet; its levels go to a copy list to
// add by hand.

const MAX_PER_SECTION = 8; // the engine's limit for one level group

// "Lesson 16, Levels 2-4" / "Lesson 7, Level 5" / "Levels 2, 5 and 7" → {lesson, numbers}.
export function levelNumbersFromNotes(notes) {
  const m = String(notes || '').match(
    /Lesson\s+(\d+),?\s+Levels?\s+(\d+(?:\s*(?:[-–—]|to|,|and|&)\s*\d+)*)/i
  );
  if (!m) {
    return null;
  }
  const numbers = [];
  for (const part of m[2].split(/\s*(?:,|and|&)\s*/i)) {
    const range = part.match(/^(\d+)\s*(?:[-–—]|to)\s*(\d+)$/i);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to >= from && to - from < 20) {
        for (let n = from; n <= to; n++) {
          numbers.push(n);
        }
      }
    } else if (/^\d+$/.test(part)) {
      numbers.push(Number(part));
    }
  }
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  return unique.length ? {lesson: Number(m[1]), numbers: unique} : null;
}

const plainText = text =>
  String(text)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();

// A "Levels" heading on the Notion page, followed by lines like "- Level 2: CSP U1L16 AI Lab Reflect"
// (or a table row "| 2 | CSP U1L16 AI Lab Reflect |"). Returns {number: name}.
export function levelNamesFromMarkdown(markdown) {
  const names = {};
  let inLevels = false;
  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^(?:#{1,6}\s*|\*\*)(.+?)(?:\*\*)?:?$/);
    if (heading && (line.startsWith('#') || line.startsWith('**'))) {
      inLevels = /^levels?$/i.test(plainText(heading[1]).replace(/:$/, ''));
      continue;
    }
    if (!inLevels) {
      continue;
    }
    const item =
      line.match(/^(?:[-*+]|\d+[.)])?\s*Level\s+(\d+)\s*[:\-–—.]\s*(.+)$/i) ||
      line.match(/^\|\s*(?:Level\s+)?(\d+)\s*\|\s*([^|]+?)\s*\|/i);
    if (item) {
      const name = plainText(item[2]);
      if (name && name.length <= 250) {
        names[Number(item[1])] = name;
      }
    }
  }
  return names;
}

// The sections whose speaker notes name levels and that have no level links yet.
export function levelRequests(lesson) {
  const requests = [];
  for (const section of lesson?.sections || []) {
    if (section.progression?.levels?.length) {
      continue;
    }
    const found = levelNumbersFromNotes(section.sourceNotes);
    if (found) {
      requests.push({
        sectionId: section.id,
        slide: section.slide,
        title: section.title || '',
        lesson: found.lesson,
        numbers: found.numbers.slice(0, MAX_PER_SECTION),
        tooMany: found.numbers.length > MAX_PER_SECTION,
      });
    }
  }
  return requests;
}

export const choiceKey = (sectionId, number) => sectionId + ':' + number;

// Starting choices: names from Notion where it has them, otherwise empty for search or typing.
export function initialLevelChoices(requests, notionNames = {}) {
  const choices = {};
  for (const r of requests) {
    for (const number of r.numbers) {
      const name = notionNames[number] || '';
      choices[choiceKey(r.sectionId, number)] = {
        name,
        source: name ? 'notion' : '',
        status: 'unchecked',
      };
    }
  }
  return choices;
}

// Where each draft section will sit in Level Builder: the engine matches sections by position.
function sectionPositions(lesson) {
  const positions = new Map();
  (lesson.activities || []).forEach((activity, ai) => {
    (lesson.sections || [])
      .filter(s => s.activityId === activity.id)
      .forEach((section, si) => positions.set(section.id, {ai, si}));
  });
  return positions;
}

const existingLevelNames = section =>
  (section?.scriptLevels || []).map(sl =>
    sl.levels?.length === 1 ? sl.levels[0].name : null
  );

// Applied during Prepare, once the lesson's saved state is known. Adds verified levels to empty
// level groups and numbers every level by its position in the whole lesson, as Level Builder does.
// Returns the updated package and the levels left to add by hand.
export function applyLevelChoices(pkg, freshLesson, requests, choices) {
  const next = structuredClone(pkg),
    toCopy = [],
    positions = sectionPositions(next.lesson);
  const label = r => 'Slide ' + r.slide + (r.title ? ' · ' + r.title : '');
  const linked = new Map();
  for (const r of requests) {
    const verified = [],
      section = next.lesson.sections.find(s => s.id === r.sectionId),
      pos = positions.get(r.sectionId);
    for (const number of r.numbers) {
      const c = choices[choiceKey(r.sectionId, number)] || {};
      if (c.status === 'verified' && c.name) {
        verified.push({key: c.name, number});
      } else {
        toCopy.push({
          where: label(r),
          number,
          name: c.name || '',
          reason:
            c.status === 'skipped'
              ? 'Skipped'
              : c.status === 'not-found'
                ? 'Not found in Level Builder'
                : c.name
                  ? 'Name not checked'
                  : 'No level name',
        });
      }
    }
    if (!verified.length || !section || !pos) {
      continue;
    }
    const target =
      freshLesson?.activities?.[pos.ai]?.activitySections?.[pos.si];
    const existing = existingLevelNames(target);
    if (existing.length) {
      const same =
        existing.length === verified.length &&
        existing.every((name, i) => name === verified[i].key);
      if (!same) {
        for (const v of verified) {
          toCopy.push({
            where: label(r),
            number: v.number,
            name: v.key,
            reason: 'This level group in Level Builder already has levels',
          });
        }
        continue;
      }
    }
    linked.set(r.sectionId, {
      title: existing.length ? target.progressionName || '' : '',
      levels: verified.map(v => ({key: v.key, number: 0, assessment: false})),
    });
  }
  // Number levels by their position across the whole lesson (sections Lesson Studio doesn't change
  // keep the levels Level Builder already has).
  let position = 0;
  const activities = next.lesson.activities || [];
  for (let ai = 0; ai < activities.length; ai++) {
    const sections = next.lesson.sections.filter(
      s => s.activityId === activities[ai].id
    );
    for (let si = 0; si < sections.length; si++) {
      const progression = linked.get(sections[si].id);
      if (progression) {
        for (const level of progression.levels) {
          level.number = ++position;
        }
      } else {
        position +=
          sections[si].progression?.levels?.length ||
          existingLevelNames(
            freshLesson?.activities?.[ai]?.activitySections?.[si]
          ).length;
      }
    }
  }
  for (const key of ['lesson', 'baseline']) {
    for (const section of next[key]?.sections || []) {
      if (linked.has(section.id)) {
        section.progression = structuredClone(linked.get(section.id));
      }
    }
  }
  return {pkg: next, linked: [...linked.keys()], toCopy};
}
