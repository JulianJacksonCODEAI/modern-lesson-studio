# Changelog

All notable changes to Lesson Studio. Versions follow [Semantic Versioning](https://semver.org/): MAJOR for changes that break how the team works or what gets saved, MINOR for new features, PATCH for fixes. The version lives in `manifest.json`, and both builds report it in `build-info.json`.

Release steps: bump `manifest.json`, add a section here, merge the pull request, then tag the merge commit `vX.Y.Z`.

## [Unreleased]

## [1.4.1] - 2026-11-22

### Changed
- New icon: a slide card behind a Level Builder lesson card marked "LB", with a green check badge for the checked save, in the panel's blue. At 16 and 32 px it shows just the LB card so it stays readable. Adds 32 px and 96 px sizes for Windows and Firefox.

## [1.4.0] - 2026-11-22

### Added
- Firefox: `build.ps1` also makes `build/team-firefox` and `build/full-firefox` (same files, Firefox manifest: sidebar instead of side panel, background script, fixed add-on IDs, Firefox 128 or later) and `build/lesson-studio-team-firefox-<version>.zip` for signing on addons.mozilla.org. Mozilla's `web-ext lint` runs in the build: the team build must have no errors or warnings, the full build no errors.
- An "Allow access" banner appears when the browser hasn't granted access to Slides, Notion and Level Builder (Firefox asks after install; Chromium grants it at install, so it never shows there).
- The install guide covers Edge, Brave, Arc, Opera and Firefox.
- The Save tab's lesson field accepts unit and course lesson links (`/s/<unit>/lessons/<n>/edit`, `/courses/<course>/units/<u>/lessons/<n>`): Lesson Studio opens the page, reads the lesson's ID and switches to its editor.

### Changed
- Page reads that Lesson Studio runs inside Level Builder and Google Slides use the page's own `fetch` in Firefox (`content.fetch`) so they carry the user's sign-in. Chromium is unchanged.
- The toolbar icon opens Chrome's side panel in Chromium and toggles the sidebar in Firefox.
- Report a problem: if the direct send is blocked, Lesson Studio opens the pre-filled form in a background tab, ticks "Record my email" (the form collects verified emails), presses Google's own Submit, checks for the confirmation page and closes the tab. This carries the user's Google sign-in in Firefox. If that fails too, the Report window offers "Send it in Google Forms instead", which opens the form with every field filled in for the user to Submit. Waiting reports have the same option in the footer.

### Tested live (Firefox, 2026-11-22)
- Sidebar, Allow access, Import, Check, Prepare, Save and the new lesson links all work.
- Sending a report directly fails in Firefox (no Google sign-in on the request; and since the form collects verified emails, Google returns HTTP 400 without the "Record my email" consent). The background-tab send works: reports arrive with the sender's verified email.

## [1.3.1] - 2026-11-22

### Added
- `build.ps1` also makes `build/lesson-studio-team-<version>.zip` to share with the team: the team build in a `lesson-studio` folder plus "How to install Lesson Studio.txt" (from `docs/INSTALL-team.txt`). The build reads the zip back and fails if a file, checksum, path or version is wrong, or if any Advanced file is inside.

### Tested live
- The team build (`build/team`) loaded on its own in Chrome: Import, Check, Prepare and Report work, with no Advanced tab (2026-11-22).

## [1.3.0] - 2026-11-22

### Changed
- Objectives: Notion objectives that Level Builder doesn't already have are added (matched ignoring quote style, spacing and capitals); existing ones keep their exact text and order. If adding fails, the Save tab offers "Prepare again without adding objectives", which lists them to add by hand.

### Fixed
- Adding an objective now follows Level Builder's real steps: Create New Objective, then the row's Edit button, type, then the green check. The check after typing accepts the text Level Builder shows right away, and allows the one text box the open row adds to the page's controls. Restoring a rehearsal removes the row with its trash button.
- A failed objective check now names what differed (editor path, before → after).

### Tested live (lesson 8898985, 2026-11-22)
- Linking existing resources ("AI Lab", "AI Lab Activity Guide"): saved and checked, 0 mismatches.
- Adding three objectives: rehearsed and restored, then saved and checked, 0 mismatches.

## [1.2.0] - 2026-11-22

### Changed
- Saves can go to any Level Builder lesson the user confirms is theirs. The Save tab shows the lesson's name, unit and ID, and nothing is checked, added or saved until the user ticks "This is my lesson, not an official course lesson". Previously limited to sandbox lessons 10 and 11.
- Objectives: the lesson keeps the objectives Level Builder already has. Notion objectives that aren't there are listed under "Objectives not copied" with a Copy text button.

### Added
- Resources and vocabulary: Check resources looks each one up in the lesson's course. Existing ones can be linked or skipped; missing ones can be added (created once, then checked) or skipped. Skipped ones are listed with a Copy link button.
- Lesson editor link or ID field on the Save tab, with shortcuts to sandbox lessons 10 and 11.
- The Check tab flags slides with no "Title (N minutes)" line, which become sections with no title.

### Fixed
- Readback no longer reports a mismatch when Level Builder saves an empty new section's title, remarks, callouts or level-group name as null (seen on the first live save to lesson 8898985).
- Google `?usp=sharing` tags are removed from Docs and Drive resource links so they match Level Builder's records.
- Prepare and Save switch to the Level Builder tab first, and the engine gives the resource search box focus, so the editor's dropdown opens when Lesson Studio runs from the side panel.
- A stray "null" line under the change summary.

## [1.1.0] - 2026-11-22 (first build loaded for testing, not released)

### Added
- Team side panel: Import (open Slides deck and Notion page) → Check (read-only, ⚑ Report on every item, read-only AI suggestions) → Save (prepare, approve, one save, readback).
- Report a problem: sends a report filled from the current run to the team's Google Form, and keeps unsent reports to retry.
- Two builds from `build.ps1`: `build/team` without the Advanced code, and `build/full` (Julian and Angi) with the Advanced tab.
- The save engine from `jacksj12/codeai-levelbuilder-prototype` 0.15.3, with its 299 tests.

### Removed
- The popup, context menus, the old staging screen and its readback, which had never actually been checked.

## [1.0.0] - 2026-11-21

- First AntiGrav redesign of the prototype's interface (side panel, studio, AI helpers). Kept in `_legacy/` for reference; not shipped.
