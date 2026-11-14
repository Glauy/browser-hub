#!/usr/bin/env node
/**
 * release collector: copy build artifacts from src-tauri/target into release/
 * with a SHA256 manifest. Output dir is version-suffixed; versions never overwrite.
 *
 * Usage: npm run dist                     (= tauri build + collect)
 *        node scripts/release-collect.cjs (collect only, no rebuild)
 */
const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");

const root = path.resolve(__dirname, "..");
const tauriDir = path.join(root, "src-tauri");
const version = JSON.parse(fs.readFileSync(path.join(tauriDir, "tauri.conf.json"), "utf8")).version;
const outDir = path.join(root, "release", `v${version}`);

// source path (relative to src-tauri/target) -> destination file name
const artifacts = [
  {
    src: "release/bundle/nsis/BrowserHub_{v}_x64-setup.exe",
    dest: `BrowserHub_${version}_x64-setup.exe`,
    required: true,
  },
  {
    src: "release/browserhub.exe",
    dest: `BrowserHub_${version}_x64-portable.exe`,
    required: true,
  },
];

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

fs.mkdirSync(outDir, { recursive: true });

const manifest = { version, date: new Date().toISOString(), files: [] };
const missing = [];

for (const item of artifacts) {
  const srcPath = path.join(tauriDir, "target", item.src.replace("{v}", version));
  if (!fs.existsSync(srcPath)) {
    if (item.required) missing.push(item.src);
    continue;
  }
  const destPath = path.join(outDir, item.dest);
  fs.copyFileSync(srcPath, destPath);
  const stats = fs.statSync(destPath);
  manifest.files.push({
    file: item.dest,
    size: stats.size,
    sha256: sha256(destPath),
  });
  console.log(`+ ${item.dest}  (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

if (missing.length > 0) {
  console.error("\nmissing artifacts (run npm run desktop:bundle first):");
  missing.forEach((m) => console.error(`  - ${m}`));
  process.exit(1);
}

fs.writeFileSync(path.join(outDir, "RELEASE.md"), renderManifest(manifest));
console.log(`\nrelease dir: ${path.relative(root, outDir)}`);
console.log(`manifest:    ${path.relative(root, path.join(outDir, "RELEASE.md"))}`);

function renderManifest(m) {
  const rows = m.files
    .map(
      (f) =>
        `| ${f.file} | ${(f.size / 1024 / 1024).toFixed(2)} MB | \`${f.sha256.slice(0, 16)}\u2026\` |`
    )
    .join("\n");
  const setup = m.files.find((f) => f.file.includes("setup"))?.file ?? "";
  const portable = m.files.find((f) => f.file.includes("portable"))?.file ?? "";
  return [
    `# BrowserHub v${m.version}`,
    "",
    `Build date: ${m.date}`,
    "",
    "| File | Size | SHA256 (first 16) |",
    "| --- | --- | --- |",
    rows,
    "",
    "## Install",
    "",
    `- **Setup**: \`${setup}\` - double-click to install (current user, no admin), includes uninstaller and Start Menu shortcut.`,
    `- **Portable**: \`${portable}\` - single file, run directly. Data still lives in %LOCALAPPDATA%\\forga.space\\BrowserHub.`,
    "",
  ].join("\n");
}
