// Side panel'i ikon tıklamasıyla aç
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Uyku zamanlayıcı
let sleepTimeout = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_SLEEP_TIMER') {
    if (sleepTimeout) clearTimeout(sleepTimeout);
    if (msg.minutes > 0) {
      sleepTimeout = setTimeout(() => {
        chrome.storage.local.get({ ytm_commands: [] }, (res) => {
          const cmds = res.ytm_commands;
          cmds.push({ cmd: 'playPause', ts: Date.now() });
          chrome.storage.local.set({ ytm_commands: cmds.slice(-20) });
        });
      }, msg.minutes * 60 * 1000);
    }
    sendResponse({ ok: true });
  }
  return true;
});
