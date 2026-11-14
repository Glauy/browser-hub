#!/usr/bin/env node
/**
 * sync-main: internal -> main fast-forward, then prepare main for publishing:
 *   - strip docs/ (internal notes never reach the public branch)
 *   - strip vibe coding.md (private spec)
 *   - swap README.md for README.public.md (product-page style, no internal links)
 *
 * Usage: npm run sync-main          (merge + prepare, no push)
 *        npm run sync-main -- --push (merge + prepare + push origin main)
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function git(args, opts = {}) {
  return execSync(`git ${args}`, {
    stdio: opts.quiet ? "pipe" : "inherit",
    encoding: "utf8",
  });
}

function assertCleanTree() {
  const status = git("status --porcelain", { quiet: true }).trim();
  if (status) {
    console.error("working tree is not clean; commit or stash first:\n" + status);
    process.exit(1);
  }
}

const root = path.resolve(__dirname, "..");
const publicReadme = path.join(root, "README.public.md");
if (!fs.existsSync(publicReadme)) {
  console.error("README.public.md not found; cannot prepare public branch.");
  process.exit(1);
}

const shouldPush = process.argv.includes("--push");

assertCleanTree();

const current = git("branch --show-current", { quiet: true }).trim();
if (current !== "internal") {
  console.error(`you are on '${current}'; run this from the 'internal' branch.`);
  process.exit(1);
}

// 1. fast-forward main to internal
git("checkout main");
git("merge --ff-only internal");

// 2. strip internal-only content
const strip = ["docs", "vibe coding.md", "README.public.md"];
for (const item of strip) {
  const tracked = git(`ls-files "${item}"`, { quiet: true }).trim();
  if (tracked) {
    git(`rm -r -q --cached "${item}"`);
  }
  const fsPath = path.join(root, item);
  if (fs.existsSync(fsPath)) {
    fs.rmSync(fsPath, { recursive: true, force: true });
  }
}

// 3. swap README for the public one
fs.copyFileSync(publicReadme, path.join(root, "README.md"));
git("add README.md");
git('commit -m "chore: prepare public README (strip internal docs)"', { quiet: true });

// 4. back to internal (restores docs/ and internal README automatically)
git("checkout internal");

console.log("\nmain is ready: internal docs stripped, public README in place.");
if (shouldPush) {
  git("push -u origin main");
  console.log("pushed origin main.");
} else {
  console.log("push manually with: git push -u origin main");
}
