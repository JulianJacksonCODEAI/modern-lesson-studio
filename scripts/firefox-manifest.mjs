// Turns the Chromium manifest into Firefox's: sidebar instead of side panel, background script instead of
// service worker, and a fixed add-on ID (needed for signing and so saved data survives updates).
export const FIREFOX_IDS = {
  team: 'lesson-studio@modern-lesson-studio',
  full: 'lesson-studio-full@modern-lesson-studio',
};
export function firefoxManifest(m, {edition}) {
  if (!FIREFOX_IDS[edition]) throw Error('Unknown edition ' + edition);
  const f = structuredClone(m);
  delete f.side_panel;
  f.permissions = (f.permissions || []).filter(p => p !== 'sidePanel');
  f.background = {scripts: [m.background.service_worker]};
  f.sidebar_action = {
    default_panel: m.side_panel.default_path,
    default_title: 'Lesson Studio',
    default_icon: m.action.default_icon,
    open_at_install: false,
  };
  // Problem reports send lesson text from the user's pages to the team's Google Form.
  f.browser_specific_settings = {
    gecko: {
      id: FIREFOX_IDS[edition],
      strict_min_version: '140.0',
      data_collection_permissions: {required: ['websiteContent']},
    },
    gecko_android: {strict_min_version: '142.0'},
  }; // the first versions that support data_collection_permissions
  return f;
}
