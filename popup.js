document.addEventListener('DOMContentLoaded', () => {
  const shortsToggle = document.getElementById('toggle-shorts');
  const tagsToggle = document.getElementById('toggle-tags');

  // Load current settings
  chrome.storage.local.get(['hideShorts', 'hideTags'], (result) => {
    // Default to true if not set
    shortsToggle.checked = result.hideShorts !== false;
    tagsToggle.checked = result.hideTags !== false;
  });

  // Save settings on change
  shortsToggle.addEventListener('change', () => {
    chrome.storage.local.set({ hideShorts: shortsToggle.checked });
  });

  tagsToggle.addEventListener('change', () => {
    chrome.storage.local.set({ hideTags: tagsToggle.checked });
  });

  // Handle Manage button to prevent duplicate tabs
  document.getElementById('manage-btn').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'openPinnedPage' });
  });
});
