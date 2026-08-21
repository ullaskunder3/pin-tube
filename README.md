# Pin-Tube

Pin-Tube is a privacy-first WebExtension that operates entirely on the client side using `chrome.storage.local` and DOM script injections on youtube.com.

## Operating System and Build Environment Requirements
- Any standard OS (Windows, macOS, Linux)
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher) or pnpm

## Step-by-step Build Instructions
1. Open a terminal in the root directory of the extracted source code.
2. Run `npm install` (or `pnpm install`) to install the required dependencies (terser).
3. Run `npm run build` to execute the build script for both Chrome and Firefox.
4. The build script will copy the source files from `src/`, minify the JavaScript using Terser, inline the CSS, apply target-specific manifest configurations, and output the compiled extensions into the `dist/chrome/` and `dist/firefox/` directories. ZIP files are generated in `dist/zips/`.
