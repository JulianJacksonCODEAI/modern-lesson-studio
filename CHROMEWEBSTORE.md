# Chrome Web Store Listing — Lesson Studio AI

> Last Updated: 2026-11-21

## Store Listing

**Extension Name**
Lesson Studio AI — CodeAI Level Builder Companion

**Short Description**
Turn Google Slides and Notion lesson briefs into Level Builder lessons with AI curriculum auditing and safe, guarded staging.

**Detailed Description**
Lesson Studio AI helps computer science curriculum developers and instructional designers build, audit, and transfer lessons into Code.org Level Builder with zero guesswork and zero data loss.

Key Features:
- 1-Click Google Slides Ingestion: Reads active presentation tabs directly, extracting slide titles, timing, speaker notes, and callout blocks without manual copying.
- AI Curriculum Copilot: Uses on-device Chrome AI to audit lesson pacing, verify alignment between learning objectives and student activities, identify key vocabulary, and generate pedagogical discussion prompts.
- Persistent Side Panel: Work side-by-side with your Google Slides deck or Level Builder editor without switching tabs or losing your drafting context.
- Full Studio Workstation: An accessible, modern lesson workspace with document outline navigation, inline editing, and multi-level undo/redo.
- Safe, Guarded Level Builder Staging: Visual diff inspection highlights exact proposed changes (additions, updates, callouts, and level progressions) while keeping all unrelated destination content and existing level identities strictly preserved. Requires explicit approval before any staging action.

How to Use:
1. Open any lesson Google Slides deck or Notion brief, click the Lesson Studio AI extension icon, and select "Import".
2. In the Side Panel or Studio Workstation, review your assembled lesson, edit guidance, and click "AI Quality Audit" to check pacing and alignment.
3. Open your practice lesson editor in Level Builder and click "Read Baseline" to inspect existing fields safely.
4. Review the visual diff and authorize staging to update your lesson seamlessly.

Privacy & Permissions:
All processing runs locally in your browser. Source notes and drafts remain on your device and are never sent to external servers unless you explicitly provide an API key for cloud AI features.

Support & Feedback:
For questions, issue reports, or feature suggestions, visit https://github.com/jacksj12/codeai-levelbuilder-prototype

**Category**
Developer Tools

**Single Purpose**
Prepares, audits, and safely stages curriculum materials from Google Slides and Notion into Code.org Level Builder.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 | 1280×800 | ⬜ Not created | screenshots/screenshot-1.png |
| Screenshot 2 | 1280×800 | ⬜ Not created | screenshots/screenshot-2.png |
| Screenshot 3 | 1280×800 | ⬜ Not created | screenshots/screenshot-3.png |
| Small Promo Tile | 440×280 | ⬜ Not created | promo/tile-small.png |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | promo/tile-marquee.png |

### Screenshot Notes
- Screenshot 1: Persistent Side Panel open alongside Google Slides showing one-click deck extraction.
- Screenshot 2: AI Curriculum Copilot displaying the Quality Health Meter (Score 95/100, Grade A) and discussion prompts.
- Screenshot 3: Level Builder Staging Visual Diff viewer with color-coded additions, updates, and the explicit staging approval guard.

## Permissions Justification

> Updated 2026-11-22 for the team build (v1.1.0). Submit `build/team` only; `build/full` must never be uploaded.

| Permission | Type | Justification |
|------------|------|---------------|
| `scripting` | permissions | Runs the read-only exporter in the open Google Slides or Notion tab when the user clicks Import, and runs the lesson reader and save control in the open Level Builder sandbox lesson after the user approves a save. |
| `storage` | permissions | Keeps the imported lesson, save receipts and unsent problem reports in the browser so work survives closing the panel. |
| `tabs` | permissions | Finds the open Level Builder sandbox lesson by its address, and checks the tab is still that lesson before every read or save. |
| `sidePanel` | permissions | Shows Lesson Studio in Chrome's side panel next to Slides, Notion and Level Builder. |
| `https://docs.google.com/presentation/*` | host_permissions | Reads the open Slides deck's speaker notes when the user clicks "Import the open Slides deck". |
| `https://docs.google.com/forms/*` | host_permissions | Sends "Report a problem" reports to the team's Google Form. |
| `https://levelbuilder-studio.code.org/*` | host_permissions | Reads the lesson the user chose and confirmed is theirs, adds any resources or vocabulary they chose to add to its course, and saves the approved changes to it. |
| `https://*.notion.so/*`, `https://*.notion.site/*`, `https://app.notion.com/*` | host_permissions | Reads the open Notion lesson page when the user clicks "Import the open Notion page". |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

The extension operates completely locally in the user's browser. Lesson drafts, notes, and evidence are stored in local extension storage (`chrome.storage.local`). AI features use Chrome's on-device model, so curriculum text is not sent to any AI service. When the user chooses "Report a problem", the report (the lesson and source links, the flagged item and the user's note) is sent to the team's Google Form, which records the user's code.org email. No third-party telemetry or tracking exists.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/jacksj12/codeai-levelbuilder-prototype/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**
CodeAI Curriculum Team

**Contact Email**
developer@code.org

**Support URL / Email**
https://github.com/jacksj12/codeai-levelbuilder-prototype/issues

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-11-21 | Initial release: Side panel experience, AI curriculum copilot, full studio workstation, visual diff staging, undo/redo. | Draft |
| 1.1.0 | 2026-11-22 | Team build: Import → read-only Check → Save, with the prototype's tested save and readback; Report a problem; saves limited to sandbox lessons 10 and 11; popup and context menus removed. | Draft, not submitted |

## Review Notes

### Known Issues / Limitations
- Saving goes to any lesson the user confirms is theirs (shown with its name, unit and ID). Lesson Studio can't detect official lessons by link, so the confirmation is the safeguard; the review team may ask about this.
- Before the Web Store build: the store description, feature list, privacy section and screenshots above still describe 1.0.0 (AI copilot, editing, undo/redo) and must be rewritten for the team build. The privacy section must add that problem reports are sent to a Google Form. The support URL, privacy policy URL and contact email are unverified.
- The side panel's live path has not yet been run against live Level Builder.
