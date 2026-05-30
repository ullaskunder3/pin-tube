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

  // Load videos from storage
  function loadVideos() {
    chrome.storage.local.get(['pinnedVideos'], (result) => {
      pinnedVideos = result.pinnedVideos || [];
      renderVideos();
    });
  }

  // Render the video grid
  function renderVideos() {
    videoGrid.innerHTML = '';
    
    if (pinnedVideos.length === 0) {
      emptyState.classList.remove('hidden');
      selectAllBtn.disabled = true;
      clearAllBtn.disabled = true;
      unpinSelectedBtn.disabled = true;
      return;
    }

    emptyState.classList.add('hidden');
    selectAllBtn.disabled = false;
    clearAllBtn.disabled = false;
    
    pinnedVideos.forEach((video, index) => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector('.video-card');
      
      // Set data
      const timeParam = video.resumeTime ? `&t=${video.resumeTime}s` : '';
      const videoUrl = `https://www.youtube.com/watch?v=${video.id}${timeParam}`;
      
      const thumbLink = clone.querySelector('.thumbnail-container');
      thumbLink.href = videoUrl;
      
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
        timeline += ` • Last viewed ${timeAgo(video.lastViewed)}`;
      }
      timelineText.textContent = timeline;
      
      // Setup checkbox
      const checkbox = clone.querySelector('.video-checkbox');
      checkbox.dataset.id = video.id;
      checkbox.addEventListener('change', updateSelectionState);
      
      // Setup individual unpin button
      const unpinBtn = clone.querySelector('.unpin-btn');
      unpinBtn.addEventListener('click', () => {
        unpinVideo(video.id);
      });

      videoGrid.appendChild(clone);
    });

    updateSelectionState();
  }

  // Save updated list to storage and re-render
  function saveVideos() {
    chrome.storage.local.set({ pinnedVideos }, () => {
      renderVideos();
    });
  }

  // Unpin a single video
  function unpinVideo(id) {
    pinnedVideos = pinnedVideos.filter(v => v.id !== id);
    saveVideos();
  }

  // Update button states based on checkboxes
  function updateSelectionState() {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    unpinSelectedBtn.disabled = checkedCount === 0;
    
    if (checkboxes.length > 0) {
      if (checkedCount === checkboxes.length) {
        selectAllBtn.textContent = 'Deselect All';
      } else {
        selectAllBtn.textContent = 'Select All';
      }
    }
  }

  // Event Listeners for top buttons
  selectAllBtn.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.video-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
      cb.checked = !allChecked;
    });
    
    updateSelectionState();
  });

  unpinSelectedBtn.addEventListener('click', () => {
    if (!confirm('Are you sure you want to unpin the selected videos?')) return;
    
    const checkboxes = document.querySelectorAll('.video-checkbox:checked');
    const idsToRemove = Array.from(checkboxes).map(cb => cb.dataset.id);
    
    pinnedVideos = pinnedVideos.filter(v => !idsToRemove.includes(v.id));
    saveVideos();
  });

  clearAllBtn.addEventListener('click', () => {
    if (!confirm('Are you sure you want to unpin ALL videos? This cannot be undone.')) return;
    
    pinnedVideos = [];
    saveVideos();
  });

  // Initial load
  loadVideos();
});
