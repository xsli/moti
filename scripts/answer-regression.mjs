import assert from "node:assert/strict";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// Synthetic records only; AI is mocked, persistence uses an isolated database.
process.env.MOTI_DATA_DIR = await mkdtemp(join(tmpdir(), "moti-answer-test-"));
delete process.env.DATABASE_URL;
const { createServer } = await import("vite");
const server = await createServer({ cacheDir: "node_modules/.vite-answer-test", server: { port: 8099, strictPort: true, open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.goto("http://127.0.0.1:8099", { waitUntil: "networkidle" });
  const solveUrl = await page.evaluate(async () => {
    const api = await import("/src/lib/problems/api.ts");
    const { solveProblem } = await import("/src/lib/ai/extract.ts");
    await api.upsertProblem({ data: { id: "answer-test", title: "自编答案回归题", stem: "求 1+2。", createdAt: Date.now(), updatedAt: Date.now(),
      sourceKind: "text", figures: [], subject: "algebra", tags: [], difficulty: 1, myAnswer: "", correctAnswer: "旧答案", analysis: "旧解析", notes: "保留笔记", errorReason: "unknown", mastery: "unpracticed", reviewCount: 0, nextReviewAt: 0 } });
    await api.recordPracticeFn({ data: { id: "answer-test", eventId: crypto.randomUUID(), outcome: "wrong" } });
    return solveProblem.url;
  });
  let aiFailure = false, requests = 0;
  const prompts = [];
  await page.route(`**${new URL(solveUrl, "http://127.0.0.1:8099").pathname}*`, async route => {
    requests++;
    const body = decodeURIComponent(route.request().postData() || "");
    assert.ok(body.includes("求 1+2。"), "AI must receive the edited statement");
    prompts.push(body);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ result: aiFailure
      ? { ok: false, error: "模拟解答失败" }
      : { ok: true, correctAnswer: "$3$", analysis: "将 1 与 2 相加，得 $3$。" } }) });
  });
  await page.goto("http://127.0.0.1:8099/p/answer-test", { waitUntil: "networkidle" });
  const read = () => page.evaluate(async () => (await import("/src/lib/problems/api.ts")).getProblemFn({ data: { id: "answer-test" } }));
  const original = await read();
  const ai = page.getByRole("button", { name: "重新 AI 答题", exact: true });
  await ai.click();
  let dialog = page.getByRole("dialog");
  const prompt = dialog.getByRole("textbox", { name: "自定义提示词（可选）" });
  await prompt.waitFor();
  assert.equal(requests, 0, "opening the dialog must not start AI generation");
  assert.equal(await dialog.getByRole("button", { name: "保存答案与解析" }).isDisabled(), true);
  await prompt.fill("  用初中方法，详细说明每一步。  ");
  await dialog.getByRole("button", { name: "开始解答", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正后的答案" }).waitFor();
  assert.ok(prompts[0].includes("customPrompt") && prompts[0].includes("用初中方法，详细说明每一步。"), "custom prompt must be sent to AI");
  assert.ok(!prompts[0].includes("  用初中方法"), "custom prompt must be trimmed");
  assert.equal(await dialog.getByRole("textbox", { name: "修正后的答案" }).inputValue(), "$3$");
  assert.equal((await read()).correctAnswer, "旧答案", "generation alone must not replace the answer");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal((await read()).correctAnswer, "旧答案");
  await ai.click();
  assert.equal(await prompt.inputValue(), "", "a new session starts with an optional empty prompt");
  await dialog.getByRole("button", { name: "开始解答", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正后的答案" }).waitFor();
  assert.ok(!prompts[1].includes("用初中方法"));
  await dialog.getByRole("button", { name: "保存答案与解析" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal((await read()).correctAnswer, "$3$");
  await page.getByRole("button", { name: "修正答案", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正后的答案" }).fill("手动修正答案");
  await dialog.getByRole("textbox", { name: "修正后的解析" }).fill("手动修正解析");
  await dialog.getByRole("button", { name: "保存答案与解析" }).click();
  await dialog.waitFor({ state: "hidden" });
  const manual = await read();
  assert.equal(manual.correctAnswer, "手动修正答案");
  assert.equal(manual.analysis, "手动修正解析");
  for (const key of ["stem", "figures", "practiceHistory", "mastery", "notes"]) assert.deepEqual(manual[key], original[key]);
  aiFailure = true;
  await ai.click();
  await prompt.fill("请说明易错点");
  await dialog.getByRole("button", { name: "开始解答", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(await prompt.inputValue(), "请说明易错点", "failure must preserve the prompt");
  assert.equal(await dialog.getByRole("button", { name: "保存答案与解析" }).isDisabled(), true);
  assert.equal((await read()).correctAnswer, "手动修正答案");
  aiFailure = false;
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正后的答案" }).waitFor();
  assert.ok(prompts[3].includes("请说明易错点"), "retry must send the same prompt");
  await prompt.fill("换一种方法，分步解答");
  await dialog.getByRole("button", { name: "重新生成", exact: true }).click();
  await dialog.getByRole("textbox", { name: "修正后的答案" }).waitFor();
  assert.ok(prompts[4].includes("换一种方法，分步解答"), "regeneration must use the updated prompt");
  assert.equal((await read()).correctAnswer, "手动修正答案");
  await mkdir("tmp/answer-qa", { recursive: true });
  await dialog.screenshot({ path: "tmp/answer-qa/desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: "tmp/answer-qa/mobile.png" });
  // A second editor changes the stem after generation. Applying the old result must fail.
  await page.evaluate(async () => (await import("/src/lib/problems/api.ts")).patchProblemFn({ data: { id: "answer-test", patch: { stem: "求 1+3。" } } }));
  await dialog.getByRole("button", { name: "保存答案与解析" }).click();
  await dialog.getByRole("alert").waitFor();
  assert.match(await dialog.getByRole("alert").textContent(), /题目已发生变化/);
  assert.equal((await read()).correctAnswer, "手动修正答案");
  assert.equal((await read()).stem, "求 1+3。");
  assert.equal(requests, 5);
  console.log("Passed: optional custom prompt, explicit start, updated prompt regeneration, preview/cancel, save/reload, manual correction, failure/retry preserving prompt, stale-result rejection, preserved practice/media, mobile layout.");
} finally {
  await browser?.close();
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  await (await db.getPglite()).close();
  await server.close();
}
