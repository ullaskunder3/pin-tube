/**
 * Pin-Tube: Pinned Videos Management Page
 */

document.addEventListener('DOMContentLoaded', () => {
  const videoGrid = document.getElementById('video-grid');
  const emptyState = document.getElementById('empty-state');
  const template = document.getElementById('video-card-template');
  
  const selectAllBtn = document.getElementById('select-all-btn');
  const unpinSelectedBtn = document.getElementById('unpin-selected-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');

  let pinnedVideos = [];

  function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return "just now";
  }

  function loadVideos() {
    chrome.storage.local.get(['pinnedVideos'], (result) => {
      pinnedVideos = result.pinnedVideos || [];
      renderVideos();
    });
  }

  function renderVideos() {
    videoGrid.innerHTML = '';
    
    if (pinnedVideos.length === 0) {
      emptyState.classList.add('show');
      selectAllBtn.disabled = true;
      clearAllBtn.disabled = true;
      unpinSelectedBtn.disabled = true;
      return;
    }

    emptyState.classList.remove('show');
    selectAllBtn.disabled = false;
    clearAllBtn.disabled = false;
    
    pinnedVideos.forEach((video) => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector('.card');
      
      // Build URL with playlist params if applicable
      const timeParam = video.resumeTime ? `&t=${video.resumeTime}s` : '';
      let listParam = '';
      if (video.isPlaylist && video.playlistId) {
        listParam = `&list=${video.playlistId}`;
        if (video.playlistIndex) listParam += `&index=${video.playlistIndex}`;
      }
      const videoUrl = `https://www.youtube.com/watch?v=${video.id}${listParam}${timeParam}`;
      
      const thumbLink = clone.querySelector('.thumb');
      thumbLink.href = videoUrl;

      // Show playlist badge if it's a playlist entry
      if (video.isPlaylist) {
        const badge = document.createElement('div');
        badge.className = 'playlist-badge';
        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M22 7H2v1h20V7zm-9 5H2v-1h11v1zm0 4H2v-1h11v1zm2-3v8l7-4-7-4z" fill="currentColor"/></svg><span>Playlist</span>`;
        thumbLink.appendChild(badge);
      }
      
      const img = clone.querySelector('.thumbnail');
      img.src = video.thumbnail;
      
      const titleLink = clone.querySelector('.title');
      titleLink.href = videoUrl;
      titleLink.textContent = video.title;
      
      const channelText = clone.querySelector('.channel');
      channelText.textContent = video.channel;
      
      const timelineText = clone.querySelector('.timeline');
      let timeline = `Pinned ${timeAgo(video.timestamp)}`;
      if (video.lastViewed && video.lastViewed > video.timestamp) {
        timeline += ` · ${timeAgo(video.lastViewed)}`;
      }
      timelineText.textContent = timeline;
      
      // Setup checkbox
      const checkbox = clone.querySelector('.video-checkbox');
      const uniqueKey = video.isPlaylist ? `playlist:${video.playlistId}` : video.id;
      checkbox.dataset.id = uniqueKey;
      checkbox.addEventListener('change', () => {
        card.classList.toggle('selected', checkbox.checked);
        updateSelectionState();
      });
      // Prevent checkbox click from navigating the link
      checkbox.addEventListener('click', (e) => e.stopPropagation());
      
      // Setup individual unpin button
      const unpinBtn = clone.querySelector('.unpin-btn');
      unpinBtn.addEventListener('click', () => {
        unpinVideo(video);
      });

      videoGrid.appendChild(clone);
    });

    updateSelectionState();
  }

  function saveVideos() {
    chrome.storage.local.set({ pinnedVideos }, () => {
      renderVideos();
    });
  }

  function unpinVideo(video) {
    if (video.isPlaylist) {
      pinnedVideos = pinnedVideos.filter(v => !(v.isPlaylist && v.playlistId === video.playlistId));
    } else {
      pinnedVideos = pinnedVideos.filter(v => !(v.id === video.id && !v.isPlaylist));
    }
    saveVideos();
  }

  function updateSelectionState() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    unpinSelectedBtn.disabled = checkedCount === 0;
    
    if (checkboxes.length > 0) {
      selectAllBtn.textContent = checkedCount === checkboxes.length ? 'Deselect all' : 'Select all';
    }
  }

  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
      cb.checked = !allChecked;
      cb.closest('.card').classList.toggle('selected', !allChecked);
    });
    
    updateSelectionState();
  });

  unpinSelectedBtn.addEventListener('click', () => {
    if (!confirm('Unpin the selected videos?')) return;
    
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    const idsToRemove = new Set(Array.from(checkboxes).map(cb => cb.dataset.id));
    
    pinnedVideos = pinnedVideos.filter(v => {
      const key = v.isPlaylist ? `playlist:${v.playlistId}` : v.id;
      return !idsToRemove.has(key);
    });
    saveVideos();
  });

  clearAllBtn.addEventListener('click', () => {
    if (!confirm('Unpin ALL videos? This cannot be undone.')) return;
    pinnedVideos = [];
    saveVideos();
  });

  loadVideos();
});
