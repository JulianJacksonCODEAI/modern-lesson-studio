// What the Level Builder lesson keeps that isn't in the import. Lesson Studio never deletes content: it
// matches imported sections to the lesson's sections by position, updates or adds them, and leaves the
// rest. This lists that rest, so it can be shown before saving.
//
// imported: the draft lesson ({activities: [{id, title}], sections: [{activityId, title, callouts, progression}]}).
// saved: Level Builder's saved lesson ({activities: [{name, activitySections: [{name, tips, scriptLevels}]}]}).

const nameOf = x =>
  String(x?.name ?? x?.displayName ?? '').trim() || 'Untitled';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function leftoverContent(imported, saved) {
  const items = [],
    importedActivities = imported?.activities || [];
  (saved?.activities || []).forEach((activity, ai) => {
    const sections = activity.activitySections || [];
    if (ai >= importedActivities.length) {
      items.push({
        kind: 'activity',
        where: `Activity ${ai + 1}`,
        text: `Activity ${ai + 1} “${nameOf(activity)}”, with ${plural(sections.length, 'section')}`,
      });
      return;
    }
    const importedSections = (imported.sections || []).filter(
      s => s.activityId === importedActivities[ai].id
    );
    sections.forEach((section, si) => {
      const where = `Activity ${ai + 1} / Section ${si + 1}`;
      if (si >= importedSections.length) {
        items.push({
          kind: 'section',
          where,
          text: `${where} “${nameOf(section)}”`,
        });
        return;
      }
      const extraCallouts =
        (section.tips || []).length -
        (importedSections[si].callouts || []).length;
      if (extraCallouts > 0) {
        items.push({
          kind: 'callouts',
          where,
          text: `${where}: ${plural(extraCallouts, 'more callout')} than the import`,
        });
      }
      const levels = (section.scriptLevels || []).length;
      if (levels && !importedSections[si].progression?.levels?.length) {
        items.push({
          kind: 'levels',
          where,
          text: `${where}: ${plural(levels, 'level link')}`,
        });
      }
    });
  });
  return items;
}
