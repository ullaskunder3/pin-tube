/**
 * Pin-Tube: Content Script
 * Handles YouTube SPA navigation, injects Pin button, and renders
 * the Homepage Pinned Videos row using YouTube's own grid metrics.
 */

function createPinSVG(filled = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', filled 
    ? 'M16 11V5h2V3H6v2h2v6l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3z' 
    : 'M16 11V5h2V3H6v2h2v6l-2 3v2h5v6l1 1 1-1v-6h5v-2l-2-3zm-1 0H9V5h6v6z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

function createPlaylistSVG() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M22 7H2v1h20V7zm-9 5H2v-1h11v1zm0 4H2v-1h11v1zm2-3v8l7-4-7-4z');
  path.setAttribute('fill', 'currentColor');
  svg.appendChild(path);
  return svg;
}

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
    document.body.classList.toggle('pin-tube-hide-shorts', r.hideShorts === true);
    document.body.classList.toggle('pin-tube-hide-tags', r.hideTags === true);
  });
}

let cachedPinnedVideos = null;
safeStorageGet(['pinnedVideos'], (r) => { cachedPinnedVideos = r.pinnedVideos || []; });

chrome.storage.onChanged.addListener((changes, ns) => {
  if (!isExtensionValid()) return;
  if (ns !== 'local') return;
  if (changes.hideShorts || changes.hideTags) applySettings();
  if (changes.pinnedVideos) {
    cachedPinnedVideos = changes.pinnedVideos.newValue || [];
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
  const searchParams = new URLSearchParams(window.location.search);
  const videoId = searchParams.get('v');
  if (!videoId) return null;

  const playlistId = searchParams.get('list');
  const playlistIndex = searchParams.get('index');

  let title = document.title.replace(' - YouTube', '');
  const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
  if (titleEl?.textContent) title = titleEl.textContent;

  let channel = '';
  const channelEl = document.querySelector('ytd-channel-name .yt-simple-endpoint');
  if (channelEl?.textContent) channel = channelEl.textContent;

  const videoEl = document.querySelector('video');
  const resumeTime = videoEl ? Math.floor(videoEl.currentTime) : 0;

  return {
    id: videoId,
    playlistId,
    playlistIndex,
    title, channel,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    timestamp: Date.now(),
    lastViewed: Date.now(),
    resumeTime
  };
}

// ── Pin / Unpin ──────────────────────────────────────────────────────────────
function togglePinVideo(info, btn, pinAsPlaylist = false) {
  if (!info?.id) return;

  if (pinAsPlaylist && info.playlistId) {
    info.isPlaylist = true;
  }

  safeStorageGet(['pinnedVideos'], (result) => {
    const videos = result.pinnedVideos || [];
    
    const matchFn = pinAsPlaylist 
        ? v => v.isPlaylist && v.playlistId === info.playlistId 
        : v => !v.isPlaylist && v.id === info.id;

    const idx = videos.findIndex(matchFn);

    if (idx >= 0) {
      videos.splice(idx, 1);
      btn.replaceChildren(createPinSVG(false));
      btn.classList.remove('pinned');
      showToast(pinAsPlaylist ? 'Playlist unpinned' : 'Video unpinned');
    } else {
      videos.unshift(info);
      btn.replaceChildren(createPinSVG(true));
      btn.classList.add('pinned');
      showToast(pinAsPlaylist ? 'Playlist pinned to Home' : 'Video pinned to Home');
    }
    safeStorageSet({ pinnedVideos: videos });
  });
}

function showPinPopover(info, btn, event) {
  let popover = document.getElementById('pin-tube-popover');
  if (popover) {
    popover.remove();
    return;
  }

  popover = document.createElement('div');
  popover.id = 'pin-tube-popover';
  popover.className = 'pin-tube-popover';
  
  const optVideo = document.createElement('div');
  optVideo.className = 'pin-tube-popover-option';
  const optVideoSpan = document.createElement('span');
  optVideoSpan.textContent = '📹 Just this video';
  optVideo.appendChild(optVideoSpan);
  optVideo.onclick = () => {
    togglePinVideo(info, btn, false);
    popover.remove();
  };

  const optPlaylist = document.createElement('div');
  optPlaylist.className = 'pin-tube-popover-option';
  const optPlaylistSpan = document.createElement('span');
  optPlaylistSpan.textContent = '🎵 The entire playlist';
  optPlaylist.appendChild(optPlaylistSpan);
  optPlaylist.onclick = () => {
    togglePinVideo(info, btn, true);
    popover.remove();
  };

  popover.appendChild(optVideo);
  popover.appendChild(optPlaylist);

  const rect = btn.getBoundingClientRect();
  popover.style.left = `${rect.left + (rect.width / 2)}px`;
  popover.style.bottom = `${window.innerHeight - rect.top + 10}px`;

  document.body.appendChild(popover);

  setTimeout(() => {
    const closeHandler = (e) => {
      if (!popover.contains(e.target) && e.target !== btn) {
        popover.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 0);
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
  btn.replaceChildren(createPinSVG(false));
  btn.addEventListener('click', (e) => {
    const info = getCurrentVideoInfo();
    if (!info) return;

    if (info.playlistId) {
      showPinPopover(info, btn, e);
    } else {
      togglePinVideo(info, btn, false);
    }
  });
  controls.prepend(btn);
  updatePinButtonState();
}

function updatePinButtonState() {
  const btn = document.getElementById('pin-tube-btn');
  if (!btn) return;
  const searchParams = new URLSearchParams(window.location.search);
  const vid = searchParams.get('v');
  const list = searchParams.get('list');
  if (!vid) return;

  const updateDOM = (videos) => {
    let pinned = false;
    if (list) {
       pinned = videos.some(v => v.isPlaylist && v.playlistId === list) || videos.some(v => !v.isPlaylist && v.id === vid);
    } else {
       pinned = videos.some(v => !v.isPlaylist && v.id === vid);
    }

    if (btn.classList.contains('pinned') !== pinned) {
      btn.replaceChildren(createPinSVG(pinned));
      btn.classList.toggle('pinned', pinned);
    }
  };

  if (cachedPinnedVideos !== null) {
    updateDOM(cachedPinnedVideos);
  } else {
    safeStorageGet(['pinnedVideos'], (r) => updateDOM(r.pinnedVideos || []));
  }
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
      title.replaceChildren(createPinSVG(true), document.createTextNode(' Pinned Videos'));
      header.appendChild(title);

      if (videos.length > cols) {
        const seeAll = document.createElement('button');
        seeAll.className = 'pin-tube-see-all-link';
        seeAll.textContent = `See all (${videos.length}) ›`;
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
        let timeParam = video.resumeTime ? `&t=${video.resumeTime}s` : '';
        let listParam = '';
        
        if (video.isPlaylist) {
           listParam = `&list=${video.playlistId}`;
           if (video.playlistIndex) listParam += `&index=${video.playlistIndex}`;
        }

        const card = document.createElement('a');
        card.className = 'pin-tube-card';
        card.href = `/watch?v=${video.id}${listParam}${timeParam}`;

        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'pin-tube-thumbnail-container';

        const img = document.createElement('img');
        img.className = 'pin-tube-thumbnail';
        img.src = video.thumbnail;
        img.alt = '';
        img.loading = 'lazy';
        thumbContainer.appendChild(img);

        if (video.isPlaylist) {
          const badge = document.createElement('div');
          badge.className = 'pin-tube-playlist-badge';
          const badgeSpan = document.createElement('span');
          badgeSpan.textContent = 'Playlist';
          badge.append(createPlaylistSVG(), badgeSpan);
          thumbContainer.appendChild(badge);
        }

        const cardTitle = document.createElement('h3');
        cardTitle.className = 'pin-tube-title';
        cardTitle.textContent = video.title;

        const cardChannel = document.createElement('p');
        cardChannel.className = 'pin-tube-channel';
        cardChannel.textContent = video.channel;

        card.append(thumbContainer, cardTitle, cardChannel);
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
let lastSaveTime = 0;

function saveCurrentTimestamp(force = false) {
  if (!isExtensionValid()) return;
  const now = Date.now();
  if (!force && now - lastSaveTime < 5000) return; // Throttle to every 5 seconds

  const videoId = new URLSearchParams(window.location.search).get('v');
  const videoEl = document.querySelector('video');
  if (!videoId || !videoEl) return;

  const currentTime = Math.floor(videoEl.currentTime);
  if (currentTime === 0) return;

  if (cachedPinnedVideos !== null) {
    const idx = cachedPinnedVideos.findIndex(v => v.id === videoId);
    if (idx !== -1) {
      cachedPinnedVideos[idx].resumeTime = currentTime;
      cachedPinnedVideos[idx].lastViewed = Date.now();
      safeStorageSet({ pinnedVideos: cachedPinnedVideos });
      lastSaveTime = now;
    }
  } else {
    safeStorageGet(['pinnedVideos'], (result) => {
      const videos = result.pinnedVideos || [];
      const idx = videos.findIndex(v => v.id === videoId);
      if (idx !== -1) {
        videos[idx].resumeTime = currentTime;
        videos[idx].lastViewed = Date.now();
        safeStorageSet({ pinnedVideos: videos });
        lastSaveTime = now;
      }
    });
  }
}

document.addEventListener('yt-navigate-start', () => saveCurrentTimestamp(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveCurrentTimestamp(true);
});
document.addEventListener('pause', (e) => {
  if (e.target.tagName === 'VIDEO') saveCurrentTimestamp(true);
}, true);
document.addEventListener('timeupdate', (e) => {
  if (e.target.tagName === 'VIDEO') saveCurrentTimestamp(false);
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
