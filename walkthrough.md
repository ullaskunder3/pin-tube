# Pin-Tube v1.2 → v1.3: Post-Publish Hotfix

## What Happened

Pin-Tube v1.2 was published to the Chrome Web Store on June 1, 2026. Users attempting to install it encountered **three critical issues**:

1. ❌ Installation failed with: `Package is invalid. Details: 'Could not load CSS 'content.css' for script.'`
2. ⚠️ A scary permission warning: *"Read your browsing history"*
3. 🐛 Toggle switches in the popup showed OFF while the features were actually active

---

## Issue 1: `Could not load CSS 'content.css'`

### Root Cause: `@crxjs/vite-plugin` broke the build

The build pipeline used `@crxjs/vite-plugin` (v2.0.0-beta.33) with Vite to bundle the extension. This plugin was doing three harmful things:

| What crxjs did | Why it broke things |
|---|---|
| **Renamed JS files** with content hashes (e.g. `content.js` → `content.js-Ceq2JSNQ.js`) | Manifest was updated to match, so this part worked — but added unnecessary complexity |
| **Did NOT copy CSS/JS dependencies** of `welcome.html` and `pinned.html` to `dist/` | These HTML files referenced `welcome.css`, `pinned.css`, `pinned.js` — none of which existed in the build output |
| **Inconsistent CSS handling** | `content.css` was declared in `manifest.json` under `content_scripts.css`, but crxjs didn't copy it to `dist/`. Chrome then failed to load the extension entirely |

The `dist/` folder was missing these files:
```
❌ dist/content.css      ← manifest.json referenced it, but it wasn't there
❌ dist/welcome.css      ← welcome.html <link> pointed to it, missing
❌ dist/pinned.css       ← pinned.html <link> pointed to it, missing
❌ dist/pinned.js        ← pinned.html <script> pointed to it, missing
```

### Why it worked locally but failed on install

When developing locally with `Load unpacked`, we were pointing Chrome at the **source directory** (not `dist/`), where all files existed. The broken `dist/` build was only used for the Chrome Web Store upload.

### Fix

**Removed `@crxjs/vite-plugin` and Vite entirely.** The extension is pure vanilla JS/CSS/HTML — no transpilation, no module bundling, no framework needed.

Replaced with a simple [build.js](file:///c:/dev/chrome/pin-tube/build.js) script that:
1. Copies all extension files to `dist/` with their original names
2. Minifies JS with Terser (strips console.log, comments)
3. Minifies CSS (strips whitespace, comments)

```diff
- "devDependencies": {
-   "@crxjs/vite-plugin": "2.0.0-beta.33",
-   "terser": "^5.48.0",
-   "vite": "^8.0.14"
- }
+ "devDependencies": {
+   "terser": "^5.48.0"
+ }
```

---

## Issue 2: "Read your browsing history" Warning

### Root Cause: Unnecessary `tabs` permission

The `manifest.json` included the `"tabs"` permission:

```json
"permissions": ["storage", "scripting", "tabs"]
```

Chrome maps `"tabs"` → the warning *"Read your browsing history"*, because it grants access to the URL, title, and favicon of **every open tab** — not just YouTube.

### Why `tabs` was there

The `openOrFocusTab()` function in `background.js` used `chrome.tabs.query({ url })` to check if the pinned videos page was already open (to avoid duplicate tabs). This query on `chrome-extension://` URLs requires the `tabs` permission.

### Fix

Removed `"tabs"` from permissions. Refactored `openOrFocusTab()` to track the pinned page's tab ID in memory instead of querying by URL:

```diff
- async function openOrFocusTab(url) {
-   const existing = await chrome.tabs.query({ url });
-   if (existing.length > 0) {
-     chrome.tabs.update(existing[0].id, { active: true });
-     chrome.windows.update(existing[0].windowId, { focused: true });
-   } else {
-     chrome.tabs.create({ url });
-   }
- }
+ let _pinnedPageTabId = null;
+
+ async function openOrFocusTab(url) {
+   if (_pinnedPageTabId !== null) {
+     try {
+       const tab = await chrome.tabs.get(_pinnedPageTabId);
+       await chrome.tabs.update(_pinnedPageTabId, { active: true });
+       await chrome.windows.update(tab.windowId, { focused: true });
+       return;
+     } catch {
+       _pinnedPageTabId = null;
+     }
+   }
+   const newTab = await chrome.tabs.create({ url });
+   _pinnedPageTabId = newTab.id;
+ }
```

> **Trade-off:** If the service worker restarts (after 30s idle), the in-memory tab ID is lost and a duplicate tab *could* be created. This is far better than showing every user "Read your browsing history".

The YouTube tabs query in `onInstalled` still works because `host_permissions` for `*://*.youtube.com/*` grants sufficient access to query those specific URLs.

---

## Issue 3: Toggles OFF but Features Active

### Root Cause: Cascading build failure

On first install, `background.js` sets defaults:
```js
chrome.storage.local.set({ hideShorts: true, hideTags: true });
```

The content script reads these and applies them correctly → Shorts and Tags are hidden.

But the popup's `popup.js` was either:
- Not included in the build at all, OR
- Broken because crxjs rewrote the `<script>` reference but the file path didn't match

Result: the toggles never read from storage and showed their HTML default state (unchecked/OFF).

### Fix

With the new clean build, `popup.js` is copied as-is and `popup.html` references it with its original filename. The `<script>` tag was also reverted from `type="module"` (which was added as a failed attempt to fix the Vite warning) back to a plain script tag:

```diff
- <script type="module" src="popup.js"></script>
+ <script src="popup.js"></script>
```

---

## Summary of All Changes (v1.2 → v1.3)

| File | Change |
|---|---|
| [manifest.json](file:///c:/dev/chrome/pin-tube/manifest.json) | Removed `tabs` permission, restored `content.css` in content_scripts, bumped to v1.3 |
| [background.js](file:///c:/dev/chrome/pin-tube/background.js) | Refactored `openOrFocusTab()` to not need `tabs` permission |
| [content.js](file:///c:/dev/chrome/pin-tube/content.js) | Removed `import './content.css'` (CSS is declared in manifest, Chrome injects it) |
| [popup.html](file:///c:/dev/chrome/pin-tube/popup.html) | Reverted `<script>` from `type="module"` to plain |
| [pinned.html](file:///c:/dev/chrome/pin-tube/pinned.html) | Reverted `<script>` from `type="module"` to plain |
| [build.js](file:///c:/dev/chrome/pin-tube/build.js) | **NEW** — simple copy + minify build script |
| [package.json](file:///c:/dev/chrome/pin-tube/package.json) | Removed `@crxjs/vite-plugin` and `vite`, kept only `terser` |
| `vite.config.js` | **DELETED** — no longer needed |

## Lesson Learned

> Don't use a complex build tool for a simple extension. Chrome extensions with vanilla JS/CSS/HTML don't need Vite, Webpack, or any bundler. A 50-line Node.js copy script is more reliable than a beta framework plugin.
