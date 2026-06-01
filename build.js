/**
 * Pin-Tube: Build Script
 *
 * Copies all extension files to dist/ and minifies JS with Terser.
 * No framework magic — the output is a clean, standard Chrome extension.
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// Every file that makes up the extension (must match manifest.json references)
const FILES = [
  'manifest.json',
  // Content script (injected into YouTube)
  'content.css',
  'content.js',
  // Background service worker
  'background.js',
  // Popup (toolbar button)
  'popup.html',
  'popup.css',
  'popup.js',
  // Pinned Videos page
  'pinned.html',
  'pinned.css',
  'pinned.js',
  // Welcome / onboarding page
  'welcome.html',
  'welcome.css',
];

async function build() {
  console.log('');
  console.log('📦 Building Pin-Tube extension...');

  // 1. Clean dist/
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // 2. Copy all extension files
  for (const file of FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) {
      console.error(`   ❌ Missing file: ${file}`);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(DIST, file));
  }
  console.log(`   ✓ Copied ${FILES.length} files`);

  // 3. Copy icon/ directory
  const iconSrc = path.join(ROOT, 'icon');
  if (fs.existsSync(iconSrc)) {
    fs.cpSync(iconSrc, path.join(DIST, 'icon'), { recursive: true });
    console.log('   ✓ Copied icons');
  }

  // 4. Minify JS files with Terser
  const jsFiles = FILES.filter(f => f.endsWith('.js'));
  for (const file of jsFiles) {
    const filePath = path.join(DIST, file);
    const code = fs.readFileSync(filePath, 'utf-8');
    const result = await minify(code, {
      compress: { drop_console: true, drop_debugger: true },
      format: { comments: false },
    });
    if (result.code) {
      fs.writeFileSync(filePath, result.code);
    }
  }
  console.log('   ✓ Minified JS');

  // 5. Minify CSS (basic — strip comments and excess whitespace)
  const cssFiles = FILES.filter(f => f.endsWith('.css'));
  for (const file of cssFiles) {
    const filePath = path.join(DIST, file);
    let css = fs.readFileSync(filePath, 'utf-8');
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');       // remove block comments
    css = css.replace(/\n\s*\n/g, '\n');               // collapse blank lines
    css = css.replace(/^\s+/gm, '');                   // strip leading whitespace
    css = css.replace(/\s*([{}:;,>~+])\s*/g, '$1');    // trim around tokens
    css = css.replace(/;}/g, '}');                     // remove trailing semicolons
    css = css.trim();
    fs.writeFileSync(filePath, css);
  }
  console.log('   ✓ Minified CSS');

  // 6. Report size
  let totalBytes = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else totalBytes += fs.statSync(full).size;
    }
  })(DIST);

  console.log('');
  console.log(`✅ Done!  Size: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log('   Output → dist/');
  console.log('');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
