import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// A separate database and port. No reads/writes to the user's active notebook.
process.env.MOTI_DATA_DIR = await mkdtemp(join(tmpdir(), "moti-practice-test-"));
delete process.env.DATABASE_URL;
const { createServer } = await import("vite");
const server = await createServer({ cacheDir: "node_modules/.vite-practice-test", server: { port: 8098, strictPort: true, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.goto("http://127.0.0.1:8098", { waitUntil: "networkidle" });
  const results = await page.evaluate(async () => {
    const api = await import("/src/lib/problems/api.ts");
    const { practiceStats } = await import("/src/lib/problems/review.ts");
    const { coerceProblem } = await import("/src/lib/problems/coerce.ts");
    const { exportNotebookJson, parseImportedNotebook } = await import("/src/lib/problems/cache.ts");
    const base = { createdAt: Date.now(), updatedAt: Date.now(), sourceKind: "text", stem: "自编测试：求 1+1。", figures: [], subject: "algebra", tags: [], difficulty: 1, myAnswer: "", correctAnswer: "2", analysis: "自编测试解析", notes: "", errorReason: "unknown", mastery: "new", reviewCount: 7, nextReviewAt: 0 };
    for (const [id, title] of [["legacy", "旧题测试"], ["repeat", "反复出错测试"], ["single", "一次错误测试"]]) await api.upsertProblem({ data: { ...base, id, title } });
    const old = await api.getProblemFn({ data: { id: "legacy" } });
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    for (const eventId of ids) await api.recordPracticeFn({ data: { id: "repeat", eventId, outcome: "wrong", errorReason: "calc" } });
    await api.recordPracticeFn({ data: { id: "repeat", eventId: ids[1], outcome: "wrong" } });
    await api.recordPracticeFn({ data: { id: "single", eventId: crypto.randomUUID(), outcome: "hinted" } });
    const before = await api.getProblemFn({ data: { id: "repeat" } });
    await api.patchProblemFn({ data: { id: "repeat", patch: { mastery: "mastered" } } });
    const manual = await api.getProblemFn({ data: { id: "repeat" } });
    const parsed = parseImportedNotebook(exportNotebookJson([manual], []));
    const roundtrip = coerceProblem(parsed.problems[0]);
    // Old backup rows without history must not wipe newly recorded counts.
    await api.upsertProblem({ data: { ...base, id: "repeat", title: "反复出错测试" } });
    const preserved = await api.getProblemFn({ data: { id: "repeat" } });
    await api.patchProblemFn({ data: { id: "repeat", patch: { mastery: "reviewing" } } });
    await api.undoPracticeFn({ data: { id: "repeat", entryId: ids[1] } });
    const undone = await api.getProblemFn({ data: { id: "repeat" } });
    await api.recordPracticeFn({ data: { id: "repeat", eventId: crypto.randomUUID(), outcome: "wrong" } });
    return { oldUnknown: old.practiceHistory === undefined, oldMastery: old.mastery,
      before: practiceStats(before).wrong, manual: practiceStats(manual).wrong,
      roundtrip: practiceStats(roundtrip).wrong, preserved: practiceStats(preserved).wrong,
      undone: practiceStats(undone).wrong,
      originalUnchanged: before.stem === undone.stem && before.analysis === undone.analysis };
  });
  assert.deepEqual(results, { oldUnknown: true, oldMastery: "unpracticed", before: 2, manual: 2, roundtrip: 2, preserved: 2, undone: 1, originalUnchanged: true });
  await page.goto("http://127.0.0.1:8098/?g=all", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "错误记录", exact: true }).click();
  await page.getByText("错过的题（≥1次）", { exact: true }).click();
  await page.getByRole("heading", { name: "一次错误测试", exact: true }).waitFor();
  await page.getByRole("button", { name: "错过的题（≥1次）", exact: true }).click();
  await page.getByText("反复出错（≥2次）", { exact: true }).click();
  await page.getByRole("heading", { name: "反复出错测试", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "旧题测试", exact: true }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "一次错误测试", exact: true }).count(), 0);
  await mkdir("tmp/practice-qa", { recursive: true });
  await page.screenshot({ path: "tmp/practice-qa/filter.png" });
  await page.goto("http://127.0.0.1:8098/p/repeat", { waitUntil: "networkidle" });
  const record = page.getByRole("region", { name: "练习记录" });
  const addRecord = page.getByRole("button", { name: "增加练习记录", exact: true });
  const dialog = page.getByRole("dialog", { name: "增加练习记录" });
  assert.equal(await record.getByRole("button", { name: "看提示才会", exact: true }).count(), 0);
  await addRecord.click();
  assert.equal(await dialog.getByRole("button", { name: "保存记录" }).isDisabled(), true);
  await dialog.getByRole("radio", { name: "看提示才会", exact: true }).check();
  await dialog.getByRole("combobox", { name: "本次错因" }).selectOption("method");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.match(await record.textContent(), /查看 2 次练习记录/);
  await addRecord.click();
  assert.equal(await dialog.getByRole("radio", { checked: true }).count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "保存记录" }).isDisabled(), true);
  await dialog.getByRole("radio", { name: "看提示才会", exact: true }).check();
  assert.equal(await dialog.getByRole("combobox", { name: "本次错因" }).inputValue(), "unknown");
  await dialog.screenshot({ path: "tmp/practice-qa/dialog-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: "tmp/practice-qa/dialog-mobile.png" });
  await dialog.getByRole("button", { name: "保存记录" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 1280, height: 960 });
  await page.waitForFunction(() => document.querySelector('[aria-label="练习记录"]')?.textContent?.includes("查看 3 次练习记录"));
  assert.match(await record.textContent(), /已记录错 3 次/);
  await page.reload({ waitUntil: "networkidle" });
  assert.match(await record.textContent(), /查看 3 次练习记录/);
  await record.getByText("查看 3 次练习记录", { exact: true }).click();
  await record.getByRole("button", { name: "撤销最近一次记录" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="练习记录"]')?.textContent?.includes("查看 2 次练习记录"));
  await addRecord.click();
  await dialog.getByRole("radio", { name: "做错了", exact: true }).check();
  await dialog.getByRole("button", { name: "保存记录" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector('[aria-label="练习记录"]')?.textContent?.includes("已记录错 3 次"));
  await record.getByRole("button", { name: "撤销最近一次记录" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="练习记录"]')?.textContent?.includes("已记录错 2 次"));
  await page.setViewportSize({ width: 390, height: 844 });
  await record.evaluate(el => el.scrollIntoView({ block: "center" }));
  await record.screenshot({ path: "tmp/practice-qa/mobile.png" });
  const concurrent = await page.evaluate(async () => {
    const api = await import("/src/lib/problems/api.ts");
    const { practiceStats } = await import("/src/lib/problems/review.ts");
    const attempts = await Promise.allSettled([0, 1].map(() => api.recordPracticeFn({ data: { id: "legacy", eventId: crypto.randomUUID(), outcome: "wrong" } })));
    const p = await api.getProblemFn({ data: { id: "legacy" } });
    return { succeeded: attempts.filter(r => r.status === "fulfilled").length, recorded: practiceStats(p).wrong };
  });
  assert.ok(concurrent.succeeded > 0);
  assert.equal(concurrent.recorded, concurrent.succeeded);
  console.log(JSON.stringify({ ...results, filter: "passed", hinted: "passed", reload: "passed", undoUI: "passed", dialogCancel: "passed", dialogSave: "passed", concurrent }));
} finally {
  await browser?.close();
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  await (await db.getPglite()).close();
  await server.close();
}
