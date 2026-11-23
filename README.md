# Lesson Studio (AntiGrav)

A Chrome side panel that copies a lesson's Google Slides speaker notes and Notion page into a Code.org Level Builder lesson the user owns, with a checked save.

## Browsers

- **Chromium** (Chrome, Edge, Brave, Arc, Opera): `build\team` and `build\full`. Load with **Load unpacked** on the browser's extensions page.
- **Firefox 140 or later:** `build\team-firefox` and `build\full-firefox`. For testing, use **about:debugging → This Firefox → Load Temporary Add-on** and choose the folder's `manifest.json`; it is removed when Firefox restarts. To share it, sign `build\lesson-studio-team-firefox-<version>.zip` as an **unlisted** add-on on addons.mozilla.org. That's free, isn't public, and gives a signed `.xpi` to share like the zip. Never sign or share `full-firefox`.

## Two builds

| Build | Who | What it has |
|---|---|---|
| `build/team` | Curriculum team | **1 · Import** (open Slides deck + open Notion page) → **2 · Check** (read-only view of exactly what will go in, ⚑ Report on every item, read-only AI suggestions) → **3 · Save** (pick and confirm the lesson → Skip or Add missing resources → prepare → approve → one save → readback). No editing: edits happen in Level Builder. |
| `build/full` | Julian and Angi only | Everything above, plus an **Advanced** tab: reviewed-transfer workbench (baseline-only reads, run reports, unchanged-save test, shared resources/vocabulary, test-link cleanup), review-package JSON, the wide editor, and AI/Notion settings. Share it privately, never on the Web Store or a public repo. |

Build both (runs every test first, stops on any failure):

```powershell
.\build.ps1
```

Load one in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → choose `build\team` or `build\full`. Click the toolbar icon to open the side panel.

**Sharing with the team:** share only `build\lesson-studio-team-<version>.zip`, for example in a view-only Google Drive folder. It holds the team build and install steps for teammates. Never share `build\full` or this repository.

## Safety rules

- **Saves go to any lesson the user confirms is theirs** (decided 2026-11-22). The Save tab shows the open lesson's name, unit and ID, and nothing is checked, added or saved until the user ticks "This is my lesson, not an official course lesson". Lesson Studio can't tell an official lesson from a dev lesson by its link, so that confirmation is the safeguard. Sandbox lesson 10 (8898984) holds the accepted AI Lab save and shows a warning; sandbox lesson 11 (8898985) is for tests.
- **Resources and vocabulary:** Check resources looks each one up in the lesson's course. Ones Level Builder already has are linked. For each missing one the user chooses **Add** (Lesson Studio creates the shared record from its link, sends it once and checks it, never resending) or **Skip** (listed after preparing, with a Copy link button, to add in Level Builder). Items Level Builder can't accept, such as a vocabulary line without a definition, are skipped with the reason.
- The save engine is the prototype's (`jacksj12/codeai-levelbuilder-prototype`, 0.15.3): it rehearses the changes in the editor and restores it exactly, needs your approval, records a receipt before saving, saves **once** with Level Builder's own Save control, never resends, then reads the whole lesson back and compares it with the approved result.
- Slides and Notion are only read, never changed.

## Report a problem

⚑ Report (on any item, the save result, or the footer) opens a form filled from the current run: lesson and URL, source links, the flagged item, step and save result, version and date. The user picks a problem type and writes a note, and the report is sent to the team's Google Form (`shared/report-form.json`). If sending fails, the report is kept and can be retried from the footer.

## Folders

| Folder | Contents |
|---|---|
| `sidepanel/` | The side panel (both builds) |
| `shared/` | Slides/Notion import, read-only lesson view, report |
| `engine/` | The prototype's tested engine (`dist/`, `browser-fill/`, `api-companion/`) plus `session.mjs`, which connects it to the side panel. `engine/test/` holds its tests. |
| `advanced/` | Full build only: Advanced tab, wide editor (`studio/`), Notion connector |
| `ai/` | AI helpers (Chrome built-in AI on the user's computer, or rules only; no cloud AI) |
| `test/` | Report tests |
| `scripts/` | `build.mjs` (makes both builds and checks them), `preview-server.mjs` (browser preview with a fake `chrome` API) |
| `_legacy/` | The earlier AntiGrav side panel, popup and `core/` copy. Not shipped. |

Run the tests on their own: `npm test` (309 tests).

## Known limits

- Live testing so far (2026-11-22): import, Check, Report and Prepare work in Chrome. The first live save (lesson 11, 5 changes) landed, but the readback flagged the new untitled section because Level Builder saves its empty fields as null. That check is fixed: the same saved lesson now passes with 0 mismatches. Later saves linking two existing resources and adding three objectives passed with 0 mismatches. Adding a brand-new shared resource hasn't been run live yet.
- Objectives: Notion objectives Level Builder doesn't have are added (live-tested 2026-11-22). If adding ever fails, the Save tab can prepare without them and list them to add by hand.
- Level links: slides with "Lesson N, Level M" text need confirmed level mappings. The team build doesn't map levels, so those levels aren't added; Check lists them under "Things to look at".
- AI runs only through Chrome's built-in model (recent Chrome on suitable hardware); elsewhere the rules engine runs. A Code.org-hosted AI relay is planned, not built.

## Working on Lesson Studio

- `main` only changes through pull requests. Never commit to it directly.
- Start each change on its own branch from `main`: `feature/<short-name>` for new work, `fix/<short-name>` for fixes.
- Before opening a pull request, run `.\build.ps1`. It runs every test and checks both builds.
- Releases: bump the version in `manifest.json` (`MAJOR.MINOR.PATCH`), add a section to `CHANGELOG.md`, merge the pull request, then tag the merge commit `vX.Y.Z`.
- Never commit `build/`, run reports, keys or tokens. `.gitignore` covers the usual ones.
