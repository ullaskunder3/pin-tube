/**
 * Pin-Tube: Background Service Worker
 *
 * Responsibilities:
 *  - Open onboarding page on first install.
 *  - Inject reload banner into open YouTube tabs on install/update.
 *  - Open pinned.html tab (deduplicating) on content-script request.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set defaults
    chrome.storage.local.set({ hideShorts: true, hideTags: true });

    // Open the welcome/onboarding page
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }

  // On both install and update, nudge open YouTube tabs to reload
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: injectReloadBanner,
      }).catch(() => {});
    }
  });
});

// Handle messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPinnedPage') {
    openOrFocusTab(chrome.runtime.getURL('pinned.html'));
  }
});

// Track the pinned-page tab so we can focus it instead of opening duplicates.
// Uses in-memory ID (lost on service-worker restart, which is an acceptable trade-off
// to avoid the "tabs" permission and its scary "Read your browsing history" warning).
let _pinnedPageTabId = null;

async function openOrFocusTab(url) {
  if (_pinnedPageTabId !== null) {
    try {
      const tab = await chrome.tabs.get(_pinnedPageTabId);
      await chrome.tabs.update(_pinnedPageTabId, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch {
      _pinnedPageTabId = null;
    }
  }
  const newTab = await chrome.tabs.create({ url });
  _pinnedPageTabId = newTab.id;
}

// Injected directly into YouTube pages — fully self-contained, no extension APIs needed.
function injectReloadBanner() {
  if (document.getElementById('pin-tube-reload-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pin-tube-reload-banner';
  Object.assign(banner.style, {
    position: 'fixed', top: '0', left: '0', width: '100%',
    background: '#3ea6ff', color: '#0f0f0f', textAlign: 'center',
    padding: '10px 16px', fontFamily: '"Roboto","Arial",sans-serif',
    fontSize: '14px', fontWeight: '500', zIndex: '99999',
    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  });

  const msg = document.createElement('span');
  msg.textContent = '📌 Pin-Tube is active! Reload this page to enable pinning.';

  const reloadBtn = document.createElement('button');
  reloadBtn.textContent = 'Reload';
  Object.assign(reloadBtn.style, {
    background: '#0f0f0f', color: '#fff', border: 'none',
    padding: '6px 16px', borderRadius: '16px', cursor: 'pointer',
    fontWeight: '500', fontSize: '13px',
  });
  reloadBtn.onclick = () => location.reload();

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  Object.assign(closeBtn.style, {
    background: 'transparent', color: '#0f0f0f', border: 'none',
    cursor: 'pointer', fontSize: '18px', padding: '4px 8px',
  });
  closeBtn.onclick = () => banner.remove();

  banner.append(msg, reloadBtn, closeBtn);
  document.body.prepend(banner);
}
