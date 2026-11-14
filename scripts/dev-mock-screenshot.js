const path = require("path");
const { chromium } = require("playwright");

// 截图输出目录：项目下 .screenshots（已 gitignore），避免写入系统临时目录
const shots = path.join(__dirname, "..", ".screenshots");

(async () => {
  const fs = require("fs");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const base = "http://localhost:1420/";

  fs.mkdirSync(shots, { recursive: true });

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE", msg.text());
  });
  page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

  await page.goto(base, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/environments.png`, fullPage: true });
  console.log("environments done");

  await page.locator("aside nav button").filter({ hasText: "备份" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${shots}/backups.png`, fullPage: true });
  console.log("backups done");

  await page.locator("aside button").filter({ hasText: /^设置$/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${shots}/settings-browser.png`, fullPage: true });
  await page.locator("nav[aria-label='设置分区'] button").filter({ hasText: "存储" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/settings-storage.png`, fullPage: true });
  console.log("settings done");

  await page.locator("aside nav button").filter({ hasText: "浏览器环境" }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "新建环境" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/create-dialog.png`, fullPage: true });
  await page.keyboard.press("Escape");
  console.log("dialog done");

  await page.goto(base + "?onboarding", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${shots}/onboarding.png`, fullPage: true });
  console.log("onboarding done");

  await browser.close();
})();
