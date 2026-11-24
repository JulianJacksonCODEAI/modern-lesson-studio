import {SANDBOX} from './core.mjs';
export const ORIGIN = 'https://levelbuilder-studio.code.org';
export function validDestination(d) {
  return (
    Number.isSafeInteger(d?.id) &&
    d.id > 0 &&
    (d.url === ORIGIN + '/lessons/' + d.id + '/edit' ||
      (d.id === 8898985 && d.url === SANDBOX))
  );
}
// AntiGrav write guard (Julian, 2026-11-22, revised): users may save to any lesson they confirm they own.
// Lesson Studio can't tell an official lesson from a dev lesson by its link, so the user's confirmation
// (shown with the lesson's name and course) is the safeguard. Known sandbox lessons are labelled:
// 8898984 = 6-12 dev playground U16 L10 (holds the accepted AI Lab save, so it gets a warning).
// 8898985 = 6-12 dev playground U16 L11 (disposable test lesson).
export const SANDBOX_LESSONS = Object.freeze({
  8898984: {label: 'Sandbox lesson 10', protected: true},
  8898985: {label: 'Sandbox lesson 11', protected: false},
});
export function assertWritableLesson(d, ownershipConfirmed) {
  if (!validDestination(d)) {
    throw Error(
      'Open the lesson in Level Builder using its editor page: https://levelbuilder-studio.code.org/lessons/LESSON_ID/edit'
    );
  }
  if (ownershipConfirmed !== true) {
    throw Error(
      'Confirm that this is your lesson, not an official course lesson, before saving to it.'
    );
  }
  return SANDBOX_LESSONS[d.id] || {label: 'Lesson ' + d.id, protected: false};
}
export function selectDestination(url, practiceConfirmed) {
  if (practiceConfirmed !== true) {
    throw Error(
      'Confirm that this is your editable practice lesson, not an official source.'
    );
  }
  const match = String(url)
    .trim()
    .match(
      /^https:\/\/levelbuilder-studio\.code\.org\/lessons\/([1-9]\d*)\/edit$/
    );
  const destination = match
    ? {id: Number(match[1]), url: String(url).trim()}
    : null;
  if (!validDestination(destination)) {
    throw Error(
      'Use the canonical editor URL: https://levelbuilder-studio.code.org/lessons/LESSON_ID/edit'
    );
  }
  assertWritableLesson(destination, practiceConfirmed);
  return destination;
}
