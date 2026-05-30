/**
 * Pin-Tube: Content Script
 * Handles YouTube SPA navigation, injects Pin button, and renders
 * the Homepage Pinned Videos row using YouTube's own grid metrics.
 */

const PIN_ICON = `<svg viewBox="0 0 24 24"><path d="M16 11V5h2V3H6v2h2v6l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3zm-1 0H9V5h6v6z" fill="currentColor"/></svg>`;
const PIN_FILLED_ICON = `<svg viewBox="0 0 24 24"><path d="M16 11V5h2V3H6v2h2v6l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3z" fill="currentColor"/></svg>`;

// ── Extension Context Guard ──────────────────────────────────────────────────
function isExtensionValid() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); }
  catch { return false; }
}

function safeStorageGet(keys, cb) {
  if (!isExtensionValid()) return;
  try {
    chrome.storage.local.get(keys, (...a) => {
      try { if (isExtensionValid()) cb(...a); } catch {}
    });
  } catch {}
}

function safeStorageSet(data) {
  if (!isExtensionValid()) return;
  try { chrome.storage.local.set(data); } catch {}
}

// ── Settings ─────────────────────────────────────────────────────────────────
function applySettings() {
  safeStorageGet(['hideShorts', 'hideTags'], (r) => {
    document.body.classList.toggle('pin-tube-hide-shorts', r.hideShorts !== false);
    document.body.classList.toggle('pin-tube-hide-tags', r.hideTags !== false);
  });
}

chrome.storage.onChanged.addListener((changes, ns) => {
  if (!isExtensionValid()) return;
  if (ns !== 'local') return;
  if (changes.hideShorts || changes.hideTags) applySettings();
  if (changes.pinnedVideos) {
    updatePinButtonState();
    if (window.location.pathname === '/') injectPinnedRow();
  }
});

applySettings();

// ── Utilities ────────────────────────────────────────────────────────────────
function waitForElement(selector, parent = document, timeout = 8000) {
  return new Promise((resolve) => {
    const el = parent.querySelector(selector);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = parent.querySelector(selector);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(parent, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

function showToast(msg) {
  let t = document.getElementById('pin-tube-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'pin-tube-toast';
    t.className = 'pin-tube-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Video Info ───────────────────────────────────────────────────────────────
function getCurrentVideoInfo() {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return null;

  let title = document.title.replace(' - YouTube', '');
  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
  if (titleEl?.textContent) title = titleEl.textContent;

  let channel = '';
  const channelEl = document.querySelector('ytd-channel-name .yt-simple-endpoint');
  if (channelEl?.textContent) channel = channelEl.textContent;

  const videoEl = document.querySelector('video');
  const resumeTime = videoEl ? Math.floor(videoEl.currentTime) : 0;

  return {
    id: videoId, title, channel,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    timestamp: Date.now(),
    lastViewed: Date.now(),
    resumeTime
  };
}

// ── Pin / Unpin ──────────────────────────────────────────────────────────────
function togglePinVideo(info, btn) {
  if (!info?.id) return;
  safeStorageGet(['pinnedVideos'], (result) => {
    const videos = result.pinnedVideos || [];
    const idx = videos.findIndex(v => v.id === info.id);
    if (idx >= 0) {
      videos.splice(idx, 1);
      btn.innerHTML = PIN_ICON;
      btn.classList.remove('pinned');
      showToast('Video unpinned');
    } else {
      videos.unshift(info);
      btn.innerHTML = PIN_FILLED_ICON;
      btn.classList.add('pinned');
      showToast('Video pinned to Home');
    }
    safeStorageSet({ pinnedVideos: videos });
  });
}

// ── Pin Button (Player Controls) ─────────────────────────────────────────────
async function injectPinButton() {
  const controls = await waitForElement('.ytp-right-controls');
  if (!controls) return;

  if (controls.querySelector('#pin-tube-btn')) {
    updatePinButtonState();
    return;
  }

  const btn = document.createElement('button');
  btn.id = 'pin-tube-btn';
  btn.className = 'ytp-button pin-tube-player-btn';
  btn.title = 'Pin Video';
  btn.innerHTML = PIN_ICON;
  btn.addEventListener('click', () => {
    const info = getCurrentVideoInfo();
    if (info) togglePinVideo(info, btn);
  });
  controls.prepend(btn);
  updatePinButtonState();
}

function updatePinButtonState() {
  const btn = document.getElementById('pin-tube-btn');
  if (!btn) return;
  const vid = new URLSearchParams(window.location.search).get('v');
  if (!vid) return;
  safeStorageGet(['pinnedVideos'], (r) => {
    const pinned = (r.pinnedVideos || []).some(v => v.id === vid);
    btn.innerHTML = pinned ? PIN_FILLED_ICON : PIN_ICON;
    btn.classList.toggle('pinned', pinned);
  });
}

// ── Homepage Pinned Row ──────────────────────────────────────────────────────
let pinnedRowObserver = null;
let gridResizeObserver = null;

function getYTColumnCount() {
  const renderer = document.querySelector('ytd-rich-grid-renderer');
  if (!renderer) return 4;
  const v = getComputedStyle(renderer).getPropertyValue('--ytd-rich-grid-items-per-row');
  return v ? parseInt(v, 10) : 4;
}

async function injectPinnedRow() {
  const contents = await waitForElement('ytd-rich-grid-renderer #contents');
  if (!contents) return;

  const render = () => {
    if (!isExtensionValid()) return;

    safeStorageGet(['pinnedVideos'], (result) => {
      const videos = result.pinnedVideos || [];

      document.getElementById('pin-tube-home-container')?.remove();
      if (videos.length === 0) return;

      const cols = getYTColumnCount();
      const displayVideos = videos.slice(0, cols);

      const container = document.createElement('div');
      container.id = 'pin-tube-home-container';
      container.className = 'pin-tube-home-container';

      const header = document.createElement('div');
      header.className = 'pin-tube-header';

      const title = document.createElement('h2');
      title.innerHTML = `${PIN_FILLED_ICON} Pinned Videos`;
      header.appendChild(title);

      if (videos.length > cols) {
        const seeAll = document.createElement('button');
        seeAll.className = 'pin-tube-see-all-link';
        seeAll.innerHTML = `See all (${videos.length}) ›`;
        seeAll.addEventListener('click', () => {
          try { chrome.runtime.sendMessage({ action: 'openPinnedPage' }); } catch {}
        });
        header.appendChild(seeAll);
      }

      container.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'pin-tube-grid';
      grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

      displayVideos.forEach(video => {
        const timeParam = video.resumeTime ? `&t=${video.resumeTime}s` : '';
        const card = document.createElement('a');
        card.className = 'pin-tube-card';
        card.href = `/watch?v=${video.id}${timeParam}`;
        card.innerHTML = `
          <img class="pin-tube-thumbnail" src="${video.thumbnail}" alt="" loading="lazy">
          <h3 class="pin-tube-title">${video.title}</h3>
          <p class="pin-tube-channel">${video.channel}</p>
        `;
        grid.appendChild(card);
      });

      container.appendChild(grid);
      contents.prepend(container);
    });
  };

  render();

  if (pinnedRowObserver) pinnedRowObserver.disconnect();
  pinnedRowObserver = new MutationObserver(() => {
    if (!isExtensionValid()) { pinnedRowObserver.disconnect(); return; }
    if (!document.getElementById('pin-tube-home-container') && window.location.pathname === '/') {
      render();
    }
  });
  pinnedRowObserver.observe(contents, { childList: true });

  if (gridResizeObserver) gridResizeObserver.disconnect();
  const renderer = document.querySelector('ytd-rich-grid-renderer');
  if (renderer) {
    let lastCols = getYTColumnCount();
    gridResizeObserver = new ResizeObserver(() => {
      if (!isExtensionValid()) { gridResizeObserver.disconnect(); return; }
      const newCols = getYTColumnCount();
      if (newCols !== lastCols) {
        lastCols = newCols;
        if (window.location.pathname === '/') render();
      }
    });
    gridResizeObserver.observe(renderer);
  }
}

// ── Video Resume Time Tracking ───────────────────────────────────────────────
function saveCurrentTimestamp() {
  if (!isExtensionValid()) return;
  const videoId = new URLSearchParams(window.location.search).get('v');
  const videoEl = document.querySelector('video');
  if (!videoId || !videoEl) return;

  const currentTime = Math.floor(videoEl.currentTime);
  if (currentTime === 0) return;

  safeStorageGet(['pinnedVideos'], (result) => {
    const videos = result.pinnedVideos || [];
    const idx = videos.findIndex(v => v.id === videoId);
    if (idx !== -1) {
      videos[idx].resumeTime = currentTime;
      videos[idx].lastViewed = Date.now();
      safeStorageSet({ pinnedVideos: videos });
    }
  });
}

document.addEventListener('yt-navigate-start', saveCurrentTimestamp);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveCurrentTimestamp();
});
document.addEventListener('pause', (e) => {
  if (e.target.tagName === 'VIDEO') saveCurrentTimestamp();
}, true);

// ── SPA Navigation Router ────────────────────────────────────────────────────
function handlePageChange() {
  if (window.location.pathname === '/watch') {
    setTimeout(injectPinButton, 600);
  } else if (window.location.pathname === '/') {
    setTimeout(injectPinnedRow, 600);
  }
}

document.addEventListener('yt-navigate-finish', handlePageChange);
handlePageChange();
