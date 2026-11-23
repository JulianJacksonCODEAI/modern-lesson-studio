# Changelog

All notable changes to Lesson Studio. Versions follow [Semantic Versioning](https://semver.org/): MAJOR for changes that break how the team works or what gets saved, MINOR for new features, PATCH for fixes. The version lives in `manifest.json`, and both builds report it in `build-info.json`.

Release steps: bump `manifest.json`, add a section here, merge the pull request, then tag the merge commit `vX.Y.Z`.

## [Unreleased]

### Changed
- Objectives: Notion objectives that Level Builder doesn't already have are added (matched ignoring quote style, spacing and capitals); existing ones keep their exact text and order. If adding fails, the Save tab offers "Prepare again without adding objectives", which lists them to add by hand.

### Fixed
- Adding an objective clicks "Create New Objective" once more if the first press opened no row (never twice).

### Tested live
- Linking existing resources ("AI Lab", "AI Lab Activity Guide") to lesson 8898985: saved and checked, 0 mismatches (2026-11-22).

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
