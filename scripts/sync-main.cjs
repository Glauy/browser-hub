#!/usr/bin/env node
/**
 * sync-main: internal -> main fast-forward, then strip docs/ on main so the
 * public branch never carries the internal notes.
 *
 * Usage: npm run sync-main          (merge + strip, no push)
 *        npm run sync-main -- --push (merge + strip + push origin main)
 *
 * Flow:
 *   1. require clean working tree
 *   2. fast-forward main to internal
 *   3. on main: git rm -r --cached docs/  (files stay on disk? no - on main
 *      they are removed from the working tree too; internal keeps them)
 *   4. commit the removal on main
 *   5. back to internal
 */
const { execSync } = require("child_process");

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

// 2. strip docs/ from main's history tip (files remain tracked on internal)
git("rm -r -q --cached docs");
git('commit -m "chore: strip internal docs for public branch"');

// 3. back to internal
git("checkout internal");

console.log("\nmain is ready: docs stripped, ready to push.");
if (shouldPush) {
  git("push -u origin main");
  console.log("pushed origin main.");
} else {
  console.log("push manually with: git push -u origin main");
}
