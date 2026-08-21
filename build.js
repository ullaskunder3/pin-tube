/**
 * Pin-Tube: Multi-Browser Production Build Script
 *
 * Professional Single-Codebase Build Pipeline:
 *  - Reads from clean `src/` directory.
 *  - Distributes minified extensions to `dist/chrome/` and `dist/firefox/`.
 *  - Chrome build is exactly the same as before.
 *  - Generates extension ZIP bundles in `dist/zips/`.
 *  - Automatically packages a clean source-code ZIP for Mozilla reviewers.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify } = require('terser');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const ZIPS_DIR = path.join(DIST, 'zips');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const VERSION = pkg.version || '1.5.0';

function getTargetFromArgs() {
  const arg = process.argv.find(a => a.startsWith('--target='));
  if (!arg) return 'all';
  const val = arg.split('=')[1].toLowerCase();
  if (['chrome', 'firefox', 'all'].includes(val)) return val;
  console.warn(`⚠️ Unknown target "${val}", defaulting to "all"`);
  return 'all';
}

// Helper to get all files of a specific extension recursively
function getFilesByExt(dir, ext, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFilesByExt(filePath, ext, fileList);
    } else if (filePath.endsWith(ext)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function buildTarget(target) {
  console.log(`\n⚙️  Building for target: [${target.toUpperCase()}]`);

  const targetDir = path.join(DIST, target);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  // 1. Copy entire src/ directory to targetDir
  fs.cpSync(SRC, targetDir, { recursive: true });

  // 2. Minify JS files with Terser (Identical to old Chrome build)
  const jsFiles = getFilesByExt(targetDir, '.js');
  for (const filePath of jsFiles) {
    const code = fs.readFileSync(filePath, 'utf-8');
    const result = await minify(code, {
      compress: { drop_console: true, drop_debugger: true, passes: 2, toplevel: true },
      mangle: { toplevel: true },
      format: { comments: false },
    });
    if (result.code) {
      fs.writeFileSync(filePath, result.code);
    }
  }

  // 3. Inline CSS @import statements
  const cssFiles = getFilesByExt(targetDir, '.css');
  for (const filePath of cssFiles) {
    let css = fs.readFileSync(filePath, 'utf-8');
    css = css.replace(/@import\s+url\(["'](.+?)["']\);?/g, (match, importPath) => {
      // Resolve import relative to the current css file
      const importFile = path.join(path.dirname(filePath), importPath);
      if (fs.existsSync(importFile)) {
        return fs.readFileSync(importFile, 'utf-8');
      }
      return match;
    });
    fs.writeFileSync(filePath, css);
  }
  
  // Remove shared.css from target as it's inlined (if it exists at root of targetDir)
  const sharedPath = path.join(targetDir, 'shared.css');
  if (fs.existsSync(sharedPath)) fs.unlinkSync(sharedPath);

  // 4. Minify CSS
  for (const filePath of cssFiles) {
    if (!fs.existsSync(filePath)) continue;
    let css = fs.readFileSync(filePath, 'utf-8');
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    css = css.replace(/\s*([{}:;,>~+])\s*/g, '$1');
    css = css.replace(/;}/g, '}');
    css = css.replace(/\n/g, '');
    css = css.trim();
    fs.writeFileSync(filePath, css);
  }

  // 5. Minify HTML
  const htmlFiles = getFilesByExt(targetDir, '.html');
  for (const filePath of htmlFiles) {
    let html = fs.readFileSync(filePath, 'utf-8');
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    html = html.replace(/>\s+</g, '><');
    html = html.trim();
    fs.writeFileSync(filePath, html);
  }

  // 6. Process & Transform Manifest for Target
  const manifestPath = path.join(targetDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  if (target === 'firefox') {
    // Firefox MV3 uses background.scripts
    manifest.background = {
      scripts: ['background.js']
    };

    // Firefox extension ID & mandatory data collection consent declaration
    manifest.browser_specific_settings = {
      gecko: {
        id: "pin-tube@ullaskunder",
        strict_min_version: "142.0",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    };
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  // 7. Calculate total size of unpacked extension
  let totalBytes = 0;
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else totalBytes += fs.statSync(full).size;
    }
  })(targetDir);

  console.log(`   ✓ Built unpacked extension → dist/${target}/ (${(totalBytes / 1024).toFixed(1)} KB)`);

  // 8. Generate ZIP Bundle in dist/zips/
  const zipFilename = `pin-tube-${target}-v${VERSION}.zip`;
  const zipPath = path.join(ZIPS_DIR, zipFilename);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  try {
    execSync(`zip -q -r "${zipPath}" .`, { cwd: targetDir });
    const zipSize = (fs.statSync(zipPath).size / 1024).toFixed(1);
    console.log(`   📦 Created ZIP bundle → dist/zips/${zipFilename} (${zipSize} KB)`);
  } catch (err) {
    console.error(`   ❌ Failed to create zip for ${target}:`, err.message);
  }
}

function createSourceZip() {
  const srcZipFilename = `pin-tube-source-v${VERSION}.zip`;
  const srcZipPath = path.join(ZIPS_DIR, srcZipFilename);
  if (fs.existsSync(srcZipPath)) fs.unlinkSync(srcZipPath);

  // We simply zip the src directory, package.json, build.js, and README.md
  // This is clean, robust, and doesn't rely on hardcoded file lists.
  const sourceFiles = [
    'src/',
    'package.json',
    'build.js',
    'README.md'
  ];

  try {
    execSync(`zip -q -r "${srcZipPath}" ${sourceFiles.join(' ')}`, { cwd: ROOT });
    const zipSize = (fs.statSync(srcZipPath).size / 1024).toFixed(1);
    console.log(`\n📦 Created Source ZIP bundle → dist/zips/${srcZipFilename} (${zipSize} KB)`);
  } catch (err) {
    console.error(`   ❌ Failed to create source zip:`, err.message);
  }
}

async function build() {
  const selectedTarget = getTargetFromArgs();
  console.log('🚀 Starting Pin-Tube Multi-Browser Build Pipeline...');

  // Clean dist directory completely
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(ZIPS_DIR, { recursive: true });

  const targets = selectedTarget === 'all' ? ['chrome', 'firefox'] : [selectedTarget];

  for (const t of targets) {
    await buildTarget(t);
  }

  createSourceZip();

  console.log('\n✅ Build completed successfully!\n');
}

build().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
