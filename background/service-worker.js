// Lesson Studio background: clicking the toolbar icon opens the panel.
// Chromium (Chrome, Edge, Brave…): Chrome's side panel. Firefox: the sidebar.
// No state is kept here (it stops when idle).
const api = globalThis.browser ?? globalThis.chrome;

if (api.sidePanel?.setPanelBehavior) {
  const openOnClick = async () => {
    try {
      await api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (err) {
      console.error('Could not set side panel behavior:', err);
    }
  };
  api.runtime.onInstalled.addListener(openOnClick);
  api.runtime.onStartup.addListener(openOnClick);
} else if (api.sidebarAction?.toggle) {
  // Firefox: toggle() must run directly in the click handler (user gesture), with nothing awaited first.
  api.action.onClicked.addListener(() => {
    api.sidebarAction.toggle();
  });
}
