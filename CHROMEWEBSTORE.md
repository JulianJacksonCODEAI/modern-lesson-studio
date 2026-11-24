# Chrome Web Store listing: Lesson Studio

> Last updated: 2026-11-23, for version 1.6.0. Submit `build/team` (or `build/lesson-studio-team-<version>.zip`) only. `build/full` must never be uploaded.

## Store listing

**Extension name**
Lesson Studio

(The same as `name` in `manifest.json`. The store shows the manifest's name, so change both together.)

**Short description** (132 characters at most; this is `description` in `manifest.json`)
Copies a lesson's Google Slides speaker notes and Notion page into a Code.org Level Builder lesson, with a checked save.

**Detailed description**

Lesson Studio is for Code.org curriculum writers. It turns a lesson's Google Slides deck and Notion page into a Level Builder lesson plan, so you don't copy speaker notes, objectives and resources by hand.

It works in three steps in Chrome's side panel:

1. Import. Open the lesson's Slides deck and import it, then do the same with its Notion page. Lesson Studio only reads them; nothing in Slides or Notion changes.
2. Check. See exactly what will go into Level Builder: overviews, objectives, activities, sections with their timing, teaching tips and other callouts, resources and vocabulary. Nothing can be edited here. If something looks wrong, use Report on that item.
3. Save. Open the lesson in Level Builder and confirm it's yours. Lesson Studio looks up each resource and vocabulary word in the lesson's course, and you choose whether to add the missing ones. It then tries the changes in the editor, puts the editor back exactly as it was and lists every change. After you approve the list, it saves once, using Level Builder's own Save, then reads the lesson back and checks every saved field against what you approved. It never sends a save twice.

Also included:
- Read-only AI suggestions (a quality check and vocabulary definitions) using Chrome's built-in AI, which runs on your computer. Suggestions are never added to the lesson.
- Report a problem, which sends the details of your run to the CodeAI team.
- Keyboard and screen reader support, and a dark theme that follows your system setting.

Privacy: the lesson you import is kept only until you close the browser or choose Start over. AI runs on your computer. Nothing is sent anywhere except the changes you approve to Level Builder, and a problem report when you choose to send one (it goes to the CodeAI team's Google Form with your code.org email address). Full policy: https://julianjacksoncodeai.github.io/modern-lesson-studio/privacy/

Questions and issue reports: https://github.com/JulianJacksonCODEAI/modern-lesson-studio/issues

**Category**
Productivity (Workflow & Planning). Earlier drafts used Developer Tools; curriculum writers are the audience.

**Single purpose**
Copies a lesson's content from Google Slides and Notion into a Code.org Level Builder lesson the user chooses, and checks the save.

**Primary language**
English

## Graphics and assets

| Asset | Size | Status | File |
|-------|------|--------|------|
| Store icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 | ⬜ Not made | `screenshots/screenshot-1.png` |
| Screenshot 2 | 1280×800 | ⬜ Not made | `screenshots/screenshot-2.png` |
| Screenshot 3 | 1280×800 | ⬜ Not made | `screenshots/screenshot-3.png` |
| Small promo tile | 440×280 | ⬜ Not made (optional) | `promo/tile-small.png` |
| Marquee promo tile | 1400×560 | ⬜ Not made (optional) | `promo/tile-marquee.png` |

### Screenshots to take
Use sandbox lesson 11 and a test deck, with no student data or real names in view.
1. **Import:** the side panel next to an open Slides deck, with the deck and Notion page imported.
2. **Check:** the read-only lesson view, showing a section with its timing, a callout and a Report button.
3. **Save:** the "What will change" list with the approval box, next to the Level Builder editor.

## Permissions justification

> Updated 2026-11-23 for version 1.6.0.

| Permission | Type | Justification |
|------------|------|---------------|
| `scripting` | permissions | Runs the read-only exporter in the open Google Slides or Notion tab when the user clicks Import, and runs the lesson reader and save control in the Level Builder lesson the user chose, after the user approves a save. |
| `storage` | permissions | Keeps the imported lesson, save records and unsent problem reports for the browser session (`chrome.storage.session`, cleared when the browser closes) so work survives closing the panel. Settings (the AI choice) are kept in `chrome.storage.local`. |
| `tabs` | permissions | Finds the open Level Builder lesson editor by its address, and checks the tab is still that lesson before every read or save. |
| `sidePanel` | permissions | Shows Lesson Studio in Chrome's side panel next to Slides, Notion and Level Builder. |
| `https://docs.google.com/presentation/*` | host_permissions | Reads the open Slides deck's speaker notes when the user clicks "Import the open Slides deck". |
| `https://docs.google.com/forms/*` | host_permissions | Fills in and sends the CodeAI team's "Report a problem" Google Form when the user sends a report. |
| `https://levelbuilder-studio.code.org/*` | host_permissions | Reads the lesson the user chose and confirmed is theirs, adds any resources or vocabulary they chose to add to its course, and saves the approved changes to it. |
| `https://*.notion.so/*`, `https://*.notion.site/*`, `https://app.notion.com/*` | host_permissions | Reads the open Notion lesson page when the user clicks "Import the open Notion page". |

Remote code: none. All code ships in the package.

## Privacy and data use

### Data collection

**Does the extension collect user data?** Yes, only when the user sends a problem report.

In the dashboard's data-usage form, tick:
- **Personally identifiable information:** the user's code.org email address, recorded by the team's Google Form with each report.
- **Website content:** the report's lesson title and links, Slides and Notion links, the flagged item's text and the user's note.

Leave every other category unticked.

Everything else stays in the user's browser. The imported lesson, save records and unsent reports are kept in memory for the browser session (`chrome.storage.session`) and are deleted when the browser closes, when the user chooses "Start over", or when the report is sent. Nothing from a lesson is written to disk. AI features use Chrome's on-device model, so curriculum text is not sent to any AI service. Reports are filled into the Google Form on the page, not passed in its link, so report text does not land in browser history. No third-party telemetry or tracking exists.

### Data use certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy policy

**Privacy policy URL**
https://julianjacksoncodeai.github.io/modern-lesson-studio/privacy/

> Published with GitHub Pages from `docs/privacy/index.md` on `main` (Cayman theme). Update its "Last updated" line whenever what Lesson Studio reads, stores or sends changes.

## Distribution

**Visibility:** Private, limited to the code.org Google Workspace domain (recommended). Only code.org staff can use Level Builder, so a public listing would offer the extension to people who can't use it. To publish privately, the developer account must belong to the code.org domain; otherwise use **Unlisted** and share the link.
**Regions:** All regions

## Developer info

**Publisher name**
CodeAI Curriculum Team

**Contact email**
developer@code.org (confirm this inbox is monitored before submitting)

**Support URL**
https://github.com/JulianJacksonCODEAI/modern-lesson-studio/issues

## Version history

| Version | Date | Changes | Store status |
|---------|------|---------|--------------|
| 1.0.0 | 2026-11-21 | First AntiGrav interface: side panel, AI copilot, studio, staging. | Draft, not submitted |
| 1.1.0 | 2026-11-22 | Team build: Import → read-only Check → Save, with the prototype's tested save and readback; Report a problem. | Draft, not submitted |
| 1.5.0 | 2026-11-23 | AI runs only on the user's computer (Gemini removed); security audit fixes. | Not submitted |
| 1.6.0 | 2026-11-23 | Lesson data kept only for the browser session; reports filled on the form's page; accessibility and security audit fixes; save check accepts Level Builder's equivalent values. | Ready to submit after screenshots |

## Review notes

### Notes for the reviewer
Lesson Studio is an internal tool for Code.org curriculum staff. Using it needs a Level Builder account (staff only) and a lesson the user can edit. To review without an account: the Import and Check steps work with any Google Slides deck.

### Known limits
- Saves go to any lesson the user confirms is theirs (shown with its name, unit and ID). Lesson Studio can't tell an official lesson from a draft by its link, so the confirmation is the safeguard. The review team may ask about this.
- Levels named in slide text ("Lesson 7, Levels 1–5") aren't linked to the lesson. The Check step lists them to add in Level Builder.
- Before submitting: take the three screenshots, decide the visibility, and confirm the contact email.
