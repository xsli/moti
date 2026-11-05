import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// All UI writes are confined to a fresh disposable database.
process.env.MOTI_DATA_DIR = await mkdtemp(join(tmpdir(), "moti-study-plan-test-"));
process.env.DATABASE_URL = " ";
const { createServer } = await import("vite");
const server = await createServer({
  cacheDir: "node_modules/.vite-study-plan-test",
  server: { port: 8097, strictPort: true, open: false },
});
let browser, page;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto("http://127.0.0.1:8097/study-plans", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "新增备考计划" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("计划名称").fill("自动检查备考计划");
  await dialog.getByLabel("开始日期").fill("2026-11-05");
  await dialog.getByLabel("考试日期").fill("2027-01-03");
  await dialog.getByLabel("考试范围与目标").fill("全等与几何变换，两遍练习。");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForURL(/study-plans\/.+/);
  await page.getByRole("link", { name: "返回备考计划", exact: true }).waitFor();
  await page.getByRole("heading", { name: "自动检查备考计划", exact: true }).waitFor();
  const planId = page.url().split("/").at(-1);
  assert.equal(await page.locator("details").count(), 9);
  // A rejected dismissal or failed request must not discard the edited form.
  await page.getByRole("button", { name: "编辑计划", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("考试范围与目标").fill("保存失败后仍保留的目标");
  page.once("dialog", (d) => d.dismiss());
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), true);
  await page.route("**/_serverFn/**", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(await dialog.getByLabel("考试范围与目标").inputValue(), "保存失败后仍保留的目标");
  await page.unroute("**/_serverFn/**");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "资料与轮次", exact: true }).click();
  await page.getByRole("button", { name: "添加资料", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("资料名称").fill("全等章节");
  await dialog.getByLabel("练习范围与要求").fill("全部例题和习题两遍。");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "周计划", exact: true }).click();
  await page.getByRole("button", { name: "添加任务", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("任务名称").fill("全等第一遍");
  await dialog.getByLabel("关联资料").selectOption({ label: "全等章节" });
  await dialog.getByLabel("计划数量").fill("20");
  await dialog.getByLabel("已完成", { exact: true }).fill("8");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "networkidle" });
  assert.match(await page.locator("main").textContent(), /8\/20 题/);
  await page.getByRole("checkbox", { name: "完成任务：全等第一遍", exact: true }).check();
  await page.waitForFunction(() => document.querySelector("main").textContent.includes("20/20 题"));
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await page.getByRole("checkbox", { name: "完成任务：全等第一遍", exact: true }).isChecked(),
    true,
  );
  await page.getByRole("button", { name: "资料与轮次", exact: true }).click();
  assert.match(await page.locator("main").textContent(), /第1遍：20\/20 题/);
  await page.getByRole("button", { name: "每周时间", exact: true }).click();
  await page.getByRole("button", { name: "添加时段", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("时间段", { exact: true }).fill("全天");
  await dialog.getByLabel("净可用时间（小时）", { exact: true }).fill("7");
  await dialog.getByLabel("其中作业（小时）", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.match(
    await page.locator("main").textContent(),
    /每周可用 7 小时 · 作业 3 小时 · 专项 4 小时/,
  );
  await page.getByRole("button", { name: "周计划", exact: true }).click();
  await mkdir("tmp/study-plan-qa", { recursive: true });
  await page.screenshot({ path: "tmp/study-plan-qa/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "tmp/study-plan-qa/mobile.png" });
  await page.setViewportSize({ width: 1280, height: 960 });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "归档", exact: true }).click();
  await page.getByRole("button", { name: "恢复计划", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("checkbox", { name: "完成任务：全等第一遍", exact: true }).isDisabled(),
    true,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "恢复计划", exact: true }).click();
  await page.getByRole("button", { name: "归档", exact: true }).waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出存档", exact: true }).click();
  const downloaded = await downloadPromise;
  assert.match(downloaded.suggestedFilename(), /\.json$/);
  const result = await page.evaluate(async (id) => {
    const api = await import("/src/lib/study-plans/api.ts");
    const p = await api.getStudyPlan({ data: { id } });
    const content = { ...p, title: "从另一个页面更新" };
    const saved = await api.saveStudyPlan({ data: { id, expectedRevision: p.revision, content } });
    try {
      await api.saveStudyPlan({ data: { id, expectedRevision: p.revision, content: p } });
      return { conflict: false };
    } catch {
      return {
        conflict: true,
        savedTitle: (await api.getStudyPlan({ data: { id } })).title,
        savedRevision: saved.revision,
      };
    }
  }, planId);
  assert.equal(result.conflict, true);
  assert.equal(result.savedTitle, "从另一个页面更新");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: create, material, task counts, refresh persistence, schedule, mobile layout, archive/restore, export, conflict protection",
  );
} catch (error) {
  if (page) {
    console.error("PAGE", page.url(), (await page.locator("body").innerText()).slice(-3500));
    await mkdir("tmp/study-plan-qa", { recursive: true });
    await page.screenshot({ path: "tmp/study-plan-qa/failure.png" });
  }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
