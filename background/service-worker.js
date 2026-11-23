// Lesson Studio service worker: clicking the toolbar icon opens the side panel.
// No state is kept here (service workers stop when idle).
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.error('Could not set side panel behavior:', err);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.error('Could not set side panel behavior:', err);
  }
});
