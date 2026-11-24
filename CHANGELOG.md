# Changelog

All notable changes to Lesson Studio. Versions follow [Semantic Versioning](https://semver.org/): MAJOR for changes that break how the team works or what gets saved, MINOR for new features, PATCH for fixes. The version lives in `manifest.json`, and both builds report it in `build-info.json`.

Release steps: bump `manifest.json`, update the privacy page (`docs/privacy/index.md`: its "Last updated … (version X.Y.Z)" line, plus its text if what Lesson Studio reads, stores or sends changed; the build fails if the version doesn't match), add a section here, merge the pull request, then tag the merge commit `vX.Y.Z`.

## [Unreleased]

### Changed
- The build also makes `build/lesson-studio-full-<version>.zip` (the full build under `full/`, checked like the team zip), instead of it being zipped by hand.
- The build (and so CI) fails if the privacy page's "Last updated" version doesn't match `manifest.json`. The page now says 1.7.0 and mentions that level search reads level names from Level Builder.

## [1.7.0] - 2026-11-23

Link existing levels to the lesson. Also includes the changes below that were waiting for a release (one engine home, privacy page, CI, code style).

### Added
- **Levels card** in the Save step, for slides whose speaker notes send students to levels ("Lesson 16, Levels 2-4"). Each level gets its exact Level Builder name from, in order: the Notion page's Levels list (`- Level 2: <name>`), a search of Level Builder's levels (the editor's own Add Levels search, read-only), or typing it. **Check level names** confirms each name with Level Builder before Prepare; Prepare waits until every named level is checked.
- Checked levels are linked into the section's level group when that group is empty, numbered by their position in the whole lesson, then saved and read back like every other change.
- Levels that can't be linked (skipped, not found, or the group in Level Builder already has other levels) are listed after preparing and after saving, with a Copy name button, to add by hand.
- Each slide's levels become one level group (progression) in its section, with an optional **Level group title** (Level Builder's Progression Title).
- A level name given to two levels is flagged, and Prepare waits until each level is used once. Levels already used elsewhere in the unit are still caught by Prepare.
- Search results drop levels already used in the card.
- **Kept from the lesson** warning before saving: lists content the Level Builder lesson keeps that isn't in the import (extra sections and activities, extra callouts, level links), since Lesson Studio never deletes anything. Found in a live test where an earlier test's section stayed in sandbox lesson 11.
- Engine: a read-only `search-levels` action in the editor bridge (lists level names that contain a query; nothing is added and the editor must be unchanged afterwards).

### Changed
- The Check step's note for these slides now points to the Levels card.
- The "Not copied" lists stay visible after the save.

### Also in this release: one home for the engine

The prototype repo `jacksj12/codeai-levelbuilder-prototype` is retired; this repo is now the only place the save engine is fixed and tested.

### Changed
- Engine updated to the prototype's last version, 0.15.5: accessibility changes to the full build's workspace, workflow, transfer, Notion and publish pages (page titles per view, skip link, labelled dialogs, focus returned after saving a flag, larger text and targets that follow the system text size) and a content security policy on the local preview server. No save logic changed.
- The engine's design notes and live acceptance records moved to `docs/engine/`.
- Privacy policy published with GitHub Pages at https://julianjacksoncodeai.github.io/modern-lesson-studio/privacy/ (source `docs/privacy/index.md`, Cayman theme; `PRIVACY.md` links to it). The store listing's privacy and support links point to this repo.

### Added
- Code style from code.org: Prettier (code-dot-org's apps settings) and ESLint (code-dot-org's root rules, allowing `x == null` and bare `catch {}` as the Airbnb guide does). Every JS, CSS and HTML file is reformatted, every block has braces, and dead code ESLint found is removed. CI and `build.ps1` check formatting and lint; `npm run format` and `npm run lint` run them locally.
- CI: a GitHub Actions workflow (`.github/workflows/ci.yml`) runs the unit tests, both builds with their checks, and Mozilla's extension checker on every pull request and every push to `main`.

### Removed
- `_legacy/`, the earlier AntiGrav side panel, popup and engine copy (never shipped; kept in git history).

## [1.6.0] - 2026-11-23

Lesson data is no longer kept on disk, plus accessibility and security audit fixes.

### Changed
- Lesson data (the imported deck and Notion page, the save engine's records and receipts, unsent problem reports, and the studio draft) is kept in `chrome.storage.session`, so it is deleted when the browser closes. Data saved to disk by earlier versions is moved there on first open and deleted from disk. Settings (AI choice, Notion token) stay on disk. Trade-off: a browser restart in the middle of a lesson means importing again, and an unsent report is lost if the browser closes first.
- Store listing notes: the data-usage answer is now "Yes" (email and report content, only when a report is sent); the side panel says imports are kept only until the browser closes or Start over.

### Fixed
- The after-save check no longer reports "A saved teaching field differs from its exact reviewed value" when Level Builder returns the same value in another form the whole-lesson check already accepts (minutes as a digit string, an empty field as null). A real difference now names the field and shows both values.
- Problem reports are filled into the Google Form on the page instead of passed in its link, so report text no longer lands in browser history. The pre-filled link is used only if filling fails. Multi-line fields are joined with " | " (the form's questions are short answers). Answers are also written to the form's submitted fields directly, because Chrome can hold back the page's own copy in a background tab; a question that still doesn't take is named in the error. "Record my email" is ticked in the "Send it in Google Forms" fallback too, and is read from the form's email field, since the box's checked state can lag.
- Side panel: the step tabs always have tab roles and `aria-controls`; the search for a lesson editor waits until the Save step stays open, so arrowing past it doesn't start one; decorative ⚑ and → symbols are hidden from screen readers.
- Studio (full build): icon-only buttons have names (for example "Delete word: model"); the Notion URL field has a label; the lesson title field has a name; the import dialog is a labelled dialog that takes focus, closes on Escape and returns focus; the file drop zone works from the keyboard; focus outlines and reduced motion are supported; decorative emoji are hidden from screen readers; inline styles moved to the stylesheet.
- Studio: deleting an objective, resource, word or activity now uses the button's own index even when the click lands on its icon.
- Studio: the audit score and grade are escaped like other inserted text.

## [1.5.0] - 2026-11-23

Security audit follow-up. AI now runs only on the user's computer; a Code.org-hosted AI relay may come later.

### Removed
- Gemini: the full build's API key setting, the Gemini code path and the `generativelanguage.googleapis.com` host permission. Lesson text is no longer sent to any cloud AI. A Gemini key saved by an earlier version is deleted from the browser the next time the AI settings load.
- The wide editor's old Level Builder staging window. Nothing opened it, but it could write to Level Builder without the "this is my lesson" confirmation. Saving stays in the side panel's Save tab.

### Changed
- AI choices are now Automatic, Chrome built-in AI or Rules only. If built-in AI isn't available, the rules engine runs.
- The Report dialog says that your code.org email is recorded with the report.
- Notion token: a "Forget Notion token" button deletes it, and saving an empty box deletes it instead of storing an empty value.

### Fixed
- Wide editor: activity and section durations show only as whole minutes, resource links open only if they are http(s), and text escaping also covers single quotes, so imported or AI-written text can't add markup to the page.

## [1.4.2] - 2026-11-22

### Fixed
- Firefox builds now need Firefox 140 or later (Firefox for Android 142), the first versions that support the data-collection declaration. Clears Mozilla's two "strict_min_version" warnings on upload.
- Saving a new activity with new sections no longer reports a false mismatch: Level Builder stores those sections' durations as text ("5"), which the check now treats as the reviewed number. Found in a live save to sandbox lesson 11.
- When a new section does fail the check, the message now names each differing field with its saved and reviewed values.

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
