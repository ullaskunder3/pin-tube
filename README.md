# Pin-Tube

| Pin Tube S1 | Pin Tube S2 |
|:---:|:---:|
| <img width="480" alt="pin-tube" src="https://github.com/user-attachments/assets/7bbbb3f3-eded-4085-b334-ad7323d3fb72" /> | <img width="480" alt="video preview" src="https://github.com/user-attachments/assets/27d303d7-d722-45e8-bf1a-d258db3cf7d2" /> |



Pin-Tube is a lightweight, privacy-focused browser extension that cleans up your YouTube feed by removing distractions and lets you save videos for later with a single click. privacy-first WebExtension that operates entirely on the client side using `chrome.storage.local` and DOM script injections on youtube.com.

## 🌟 Key Features

*   **📌 Pin Videos to the Homepage:** Click the Pin icon inside the YouTube player to save a video to a native-looking "Pinned Videos" shelf at the absolute top of your YouTube homepage.
*   **⏱️ Resume Playback:** Click a pinned video to resume playing from the **exact timestamp** you left off.
*   **🎵 Pin Playlists:** Pin entire playlists to easily jump back into your queues.
*   **🚫 Hide Shorts (Doom-scroll Blocker):** Completely removes the Shorts shelf from your homepage and the Shorts link from the sidebar. Out of sight, out of mind.
*   **🧹 Hide Tag Chips:** Removes the clutter of keyword recommendation chips at the top of the feed for a minimalist browsing experience.
*   **🎛️ Dedicated Dashboard:** Manage all your pinned videos in a clean, dedicated interface (unpin individual items, bulk select, or clear all).
*   **💾 Backup & Restore:** Export your pinned videos and settings to a lightweight JSON file. Easily import it to restore your setup on any device or new browser profile.
*   **🔒 Privacy First:** Runs entirely on your local machine using your browser's local storage. No accounts, no tracking, and no external servers.

## Operating System and Build Environment Requirements
- Any standard OS (Windows, macOS, Linux)
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher) or pnpm

## Step-by-step Build Instructions
1. Open a terminal in the root directory of the extracted source code.
2. Run `npm install` (or `pnpm install`) to install the required dependencies (terser).
3. Run `npm run build` to execute the build script for both Chrome and Firefox.
4. The build script will copy the source files from `src/`, minify the JavaScript using Terser, inline the CSS, apply target-specific manifest configurations, and output the compiled extensions into the `dist/chrome/` and `dist/firefox/` directories. ZIP files are generated in `dist/zips/`.

### Building the Extension
To compile the extension for all browsers:
```bash
npm run build
```

This script will:
1. Read the unminified source code from the `src/` directory.
2. Minify JavaScript and inline CSS.
3. Apply target-specific `manifest.json` configurations.
4. Output unpacked extensions into `dist/chrome/` and `dist/firefox/`.
5. Generate ready-to-publish ZIP archives and a clean Source ZIP in `dist/zips/`.
