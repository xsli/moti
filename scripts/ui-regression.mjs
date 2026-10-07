import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { fromJSON } from 'seroval';

const origin = process.env.UI_TEST_URL || 'http://127.0.0.1:8080';
const output = 'tmp/ui-review/qa';
await mkdir(output, { recursive: true });
const rpc = new Map();
for (const file of ['problems/api', 'paper/api', 'paper/sample', 'ai/extract', 'ai/variants']) {
  const code = await (await fetch(`${origin}/src/lib/${file}.ts`)).text();
  for (const match of code.matchAll(/export const (\w+)[^\n]+createClientRpc\("([^"]+)"/g)) rpc.set(match[2], match[1]);
}
assert.ok([...rpc.values()].includes('getNotebook'));
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
let collections = [
  { id: 'qa-a', name: '第一讲 代数式', groupName: '测试讲义', kind: 'unit', sortOrder: 1, createdAt: 1, updatedAt: 1 },
  { id: 'qa-b', name: '第二讲 几何图形', groupName: '测试讲义', kind: 'unit', sortOrder: 2, createdAt: 1, updatedAt: 1 },
  { id: 'qa-empty', name: '空章节', groupName: '测试讲义', kind: 'unit', sortOrder: 3, createdAt: 1, updatedAt: 1 },
];
let problems = Array.from({ length: 35 }, (_, i) => ({
  id: `qa-p${i + 1}`, title: `测试题目${i + 1}`, stem: `第${i + 1}道题：计算 $x^2+2x+1$，其中 $x=2$。`,
  createdAt: 1000, updatedAt: 1000, sourceKind: 'photo', sourceImage: pixel,
  subject: 'algebra', tags: [i % 2 ? '习题' : '例题', '代数式'], difficulty: 2,
  figures: i === 0 ? [{ id: 'figure-a', title: '三角形', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><path d="M20 100 L100 10 L180 100 Z" fill="none" stroke="black" stroke-width="2"/></svg>', caption: '图1', originalImage: pixel }] : [],
  myAnswer: '', correctAnswer: '$9$', analysis: i === 1 ? `长公式：$$${Array.from({ length: 40 }, (_, n) => `x_{${n + 1}}`).join('+')}=820.$$` : '先整理：\n\n$$x^2+2x+1=(x+1)^2.$$\n\n代入 $x=2$，得 $9$。',
  notes: '', errorReason: 'unknown', mastery: 'new', reviewCount: 0, nextReviewAt: 0,
  collectionId: i < 30 ? 'qa-a' : 'qa-b', sourceBatchId: i < 30 ? 'batch-a' : 'batch-b', sourceOrder: i < 30 ? i + 1 : i - 29,
}));
let paper = { basket: [], basketUpdatedAt: 0, templates: [], deletedTemplates: {} };
const writes = [], errors = [], blocked = [], checks = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.route('**/*', async route => {
  const request = route.request();
  if (request.method() !== 'POST') return route.continue();
  const entry = [...rpc].find(([id]) => request.url().includes(id));
  if (!entry) { blocked.push(request.url()); return route.abort(); }
  const name = entry[1];
  const raw = JSON.parse(request.postData() || '{}');
  const parsed = raw.t ? fromJSON(raw) : raw;
  const data = parsed.data || {};
  let result;
  if (name === 'getNotebook') result = { problems, collections, initialized: true };
  else if (name === 'getProblemFn') result = problems.find((p) => p.id === data.id) || null;
  else if (name === 'getPaperSessionFn') result = { payload: JSON.stringify(paper) };
  else if (name === 'putPaperSessionFn') { paper = data; writes.push({ name, data }); result = { ok: true }; }
  else if (name === 'patchProblemFn') { problems = problems.map((p) => p.id === data.id ? { ...p, ...data.patch, updatedAt: Date.now() } : p); writes.push({ name, data }); result = { ok: true, updatedAt: Date.now() }; }
  else if (name === 'upsertCollectionFn') { collections = [data, ...collections.filter((c) => c.id !== data.id)]; writes.push({ name, data }); result = { ok: true }; }
  else if (name === 'deleteCollectionFn') { collections = collections.filter((c) => c.id !== data.id); writes.push({ name, data }); result = { ok: true }; }
  else if (name === 'saveSamplePdf') { result = { ok: true }; }
  else { blocked.push(name); return route.abort(); }
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result }) });
});
const page = await context.newPage();
page.on('pageerror', e => errors.push(String(e)));
page.setDefaultTimeout(10000);
async function open(path) {
  await page.goto(origin + path);
  await page.waitForFunction(async () => (await import('/src/lib/problems/store.ts')).useProblemStore.getState().status === 'ready');
  await page.waitForTimeout(700);
}
async function pass(label) { checks.push(label); console.log(`PASS: ${label}`); }
async function paperCount(n) {
  await page.waitForFunction(n => JSON.parse(localStorage.getItem('moti-paper-shared')).basket.length === n, n);
}
try {
  await open('/');
  assert.equal(await page.locator('main').evaluate(n => n.getBoundingClientRect().width), 1200);
  await page.getByRole('button', { name: '数据管理', exact: true }).click();
  await page.getByRole('menuitem', { name: '备份全部数据' }).waitFor();
  await page.getByRole('menuitem', { name: '恢复备份' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('textbox', { name: '搜索大组、小组' }).fill('几何图形');
  await page.getByRole('region', { name: '小组搜索结果' }).getByRole('link', { name: /第二讲 几何图形/ }).click();
  await page.getByRole('heading', { name: '第二讲 几何图形' }).waitFor();
  await open('/');
  await page.getByRole('button', { name: '新建大组', exact: true }).click();
  await page.getByRole('dialog').getByLabel('大组名称').fill('新增测试书');
  await page.getByRole('dialog').getByLabel('首个小组名称').fill('新章节');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('heading', { name: '新章节', exact: true }).waitFor();
  assert.ok(collections.some((c) => c.groupName === '新增测试书' && c.name === '新章节'));
  await pass('global backup entry and explicit book/chapter creation');

  await open('/?f=测试讲义');
  assert.equal(await page.getByRole('button', { name: /^删除/ }).count(), 0);
  await page.getByRole('button', { name: '管理小组', exact: true }).click();
  await page.getByRole('button', { name: '删除空章节', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.ok(collections.some((c) => c.id === 'qa-empty'));
  await page.getByRole('button', { name: '完成管理' }).click();
  assert.equal(await page.getByRole('button', { name: /^删除/ }).count(), 0);
  await pass('chapter management is opt-in and deletion is confirmed');

  await open('/?g=qa-a');
  assert.equal(await page.getByRole('button', { name: '数据管理' }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: '概览' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '拖动排序', exact: true }).count(), 0);
  await page.getByRole('button', { name: '调整题目顺序' }).click();
  assert.equal(await page.getByRole('button', { name: '拖动排序', exact: true }).count(), 30);
  await page.getByRole('button', { name: '完成排序' }).click();
  await page.getByRole('button', { name: '编辑分组信息', exact: true }).click();
  await page.getByRole('form', { name: '编辑分组信息' }).getByLabel('小组', { exact: true }).fill('修改后章节');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('heading', { name: '第一讲 代数式' }).waitFor();
  await page.getByRole('button', { name: '多选', exact: true }).click();
  await page.locator('[data-row="qa-p1"]').getByRole('button').first().click();
  await page.getByRole('button', { name: '改掌握状态' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '退出多选' }).click();
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByRole('button', { name: '科目', exact: true }).click();
  await page.getByRole('button', { name: '几何', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByText('还没有这类题目', { exact: true }).waitFor();
  await page.getByRole('button', { name: '清除几何', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 30);
  await pass('compact subgroup, explicit reorder/edit modes, multi-select tools');

  await open('/?g=all');
  assert.equal(await page.locator('[data-row]').count(), 24);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-row]').length === 11);
  assert.equal(await page.locator('[data-row]').count(), 11);
  await page.getByRole('textbox', { name: '搜索题目' }).fill('不存在的关键词');
  await page.getByText('还没有这类题目', { exact: true }).waitFor();
  await pass('all-problems pagination and empty filter results');

  await open('/p/qa-p1');
  assert.equal(await page.locator('header nav a[aria-current="page"]').innerText(), '题库');
  assert.equal(await page.getByRole('textbox').count(), 0);
  assert.equal(await page.getByRole('button', { name: '编辑题干', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '添加图形' }).count(), 0);
  const media = JSON.stringify(problems[0].figures);
  const beforeEditWrites = writes.length;
  for (const name of ['编辑标题', '编辑题干', '编辑正确答案', '编辑解析', '编辑笔记']) {
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: '退出编辑' }).click();
    await page.waitForFunction(() => !document.querySelector('main input:not([type="hidden"]), main textarea'));
    assert.equal(await page.getByRole('textbox').count(), 0);
  }
  assert.equal(writes.length, beforeEditWrites, 'entering/leaving unchanged editors must not write');
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByRole('combobox', { name: '选择小组', exact: true }).click();
  const optionNames = await page.getByRole('option').allTextContents();
  assert.ok(optionNames.indexOf('第一讲 代数式') < optionNames.indexOf('第二讲 几何图形'));
  await page.getByRole('combobox', { name: '搜索选择小组' }).fill('几何');
  await page.waitForFunction(() => document.querySelectorAll('[role="option"]').length === 1);
  assert.equal(await page.locator('[cmdk-item]').count(), 1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '编辑题干', exact: true }).click();
  await page.locator('textarea').fill('更新后的题干 $x=3$。');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === '退出编辑' && b.disabled));
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '退出编辑' }).click();
  assert.equal(JSON.stringify(problems[0].figures), media);
  assert.deepEqual(Object.keys(writes.filter((w) => w.name === 'patchProblemFn').at(-1).data.patch), ['stem']);
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '删除题目' }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(problems.length, 35);
  await pass('detail read-only, protected drafts, field-only save, original media, delete cancel');

  await open('/read/qa-a');
  await page.locator('#answer-qa-p1').waitFor();
  await page.locator('#analysis-qa-p1').waitFor();
  await page.getByRole('button', { name: '显示设置' }).click();
  await page.getByLabel('显示解析').uncheck();
  assert.equal(await page.locator('#analysis-qa-p1').count(), 0);
  await page.getByLabel('显示解析').check();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const wideMath = page.locator('.math-scrollable[data-scroll-right="true"]').first();
  await wideMath.waitFor();
  await wideMath.press('ArrowRight');
  await page.waitForFunction(() => [...document.querySelectorAll('.math-scrollable')].some((n) => n.scrollLeft > 0));
  await page.getByRole('button', { name: '收起答案与解析' }).first().click();
  assert.equal(await page.locator('#answer-qa-p1').count(), 0);
  assert.equal(await page.locator('#analysis-qa-p1').count(), 0);
  await page.getByRole('button', { name: '展开答案与解析' }).first().click();
  await page.getByLabel('题目类型').selectOption('例题');
  await page.waitForFunction(() => document.querySelectorAll('article').length === 15);
  assert.equal(await page.getByRole('article').count(), 15);
  await pass('reading defaults, joint collapse, example filter');

  await open('/paper?ids=&tpl=');
  await page.getByRole('button', { name: '已存模板', exact: true }).click();
  await page.getByRole('heading', { name: '已存模板', exact: true }).waitFor();
  await page.getByRole('dialog').press('Escape');
  const cards = () => page.locator('[aria-label="选题列表"] > button');
  assert.equal(await cards().count(), 24);
  assert.match(await cards().first().innerText(), /第一讲 代数式/);
  await cards().first().click();
  await paperCount(1);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await cards().first().click();
  await paperCount(2);
  await page.reload();
  await page.waitForFunction(async () => (await import('/src/lib/problems/store.ts')).useProblemStore.getState().status === 'ready');
  await page.waitForTimeout(500);
  await page.getByLabel('只看已选').check();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="选题列表"] > button').length === 2);
  assert.equal(await cards().count(), 2);
  await cards().first().click();
  await paperCount(1);
  await page.getByRole('button', { name: '下一步：排版', exact: true }).click();
  await page.getByRole('heading', { name: '排版', exact: true }).waitFor();
  assert.equal(await page.getByText('总分 0 分').count(), 0);
  await page.getByRole('button', { name: '添加标题' }).click();
  await page.getByRole('menuitem', { name: '填空题', exact: true }).click();
  await page.getByRole('button', { name: '预览并导出' }).click();
  await page.getByRole('heading', { name: '预览试卷' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '下载 TeX' }).isVisible(), false);
  await page.getByText('高级选项', { exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '下载 TeX' }).isVisible(), true);
  await page.getByRole('button', { name: '生成 PDF', exact: true }).click();
  await page.getByRole('link', { name: '下载 PDF', exact: true }).waitFor({ timeout: 90000 });
  const paperDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 PDF', exact: true }).click();
  await (await paperDownload).saveAs(`${output}/paper-smoke.pdf`);
  const paperPdf = await PDFDocument.load(await readFile(`${output}/paper-smoke.pdf`));
  assert.ok(paperPdf.getPageCount() >= 1);
  await page.screenshot({ path: `${output}/paper-preview.png`, fullPage: true });
  assert.equal(await page.getByRole('button', { name: '生成 PDF', exact: true }).count(), 0);
  await page.getByLabel('附答案与解析').check();
  await page.getByText('设置已修改，请重新生成 PDF。').waitFor();
  assert.equal(await page.getByRole('link', { name: '下载 PDF', exact: true }).count(), 0);
  await page.getByLabel('附答案与解析').uncheck();
  await page.getByRole('link', { name: '下载 PDF', exact: true }).waitFor();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await paperCount(1);
  await page.getByRole('button', { name: '清空已选', exact: true }).click();
  await page.getByRole('button', { name: '确认清空', exact: true }).click();
  await paperCount(0);
  await page.reload();
  await page.getByRole('heading', { name: '组卷', exact: true }).waitFor();
  await paperCount(0);
  await pass('one persistent selection, cross-page select, reload, remove, arrange/back and clear');

  // Direct chapter papers are temporary; only explicit basket actions persist.
  async function directChapterPaper(expectedBasket) {
    await open('/?g=qa-a');
    const writesBefore = writes.filter((entry) => entry.name === 'putPaperSessionFn').length;
    await page.getByRole('button', { name: '组卷', exact: true }).click();
    await page.getByRole('heading', { name: '排版', exact: true }).waitFor();
    await page.getByRole('button', { name: '添加标题' }).click();
    await page.getByRole('menuitem', { name: '例题', exact: true }).click();
    await page.getByRole('button', { name: '预览并导出' }).click();
    await page.getByRole('heading', { name: '预览学案' }).waitFor();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('heading', { name: '组卷', exact: true }).waitFor();
    await paperCount(expectedBasket.length);
    await open('/');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('moti-paper-shared')).basket), expectedBasket);
    assert.equal(writes.filter((entry) => entry.name === 'putPaperSessionFn').length, writesBefore);
  }
  await directChapterPaper([]);
  await open('/p/qa-p35');
  await page.getByRole('button', { name: '加入组卷篮', exact: true }).click();
  await paperCount(1);
  await directChapterPaper(['qa-p35']);
  await open('/paper?ids=qa-p1,qa-p2&tpl=');
  await page.getByRole('heading', { name: '排版', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '排版', exact: true }).waitFor();
  await paperCount(1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('moti-paper-shared')).basket), ['qa-p35']);
  await open('/');
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.getByRole('button', { name: '确认清空', exact: true }).click();
  await paperCount(0);
  await pass('direct chapter paper, layout edits, back and reload never populate or overwrite the basket');

  await open('/capture');
  assert.equal(await page.locator('textarea:visible').count(), 0);
  await page.getByLabel('补充题目信息', { exact: true }).check();
  assert.equal(await page.locator('textarea:visible').count(), 1);
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await page.getByText('合并后会作为一张长图处理，单张识别时间会较长。').waitFor();
  await page.getByLabel('合并成长图识别').uncheck();
  assert.equal(await page.getByText('合并后会作为一张长图处理，单张识别时间会较长。').count(), 0);
  await page.getByRole('button', { name: '文字', exact: true }).click();
  assert.ok(await page.getByRole('button', { name: '识别题目', exact: true }).isDisabled());
  await page.getByLabel('题目文字').fill('计算 1+1');
  assert.equal(await page.getByRole('button', { name: '识别题目', exact: true }).isDisabled(), false);
  await page.waitForTimeout(800);
  await page.reload();
  await page.getByLabel('题目文字').waitFor();
  assert.equal(await page.getByLabel('题目文字').inputValue(), '计算 1+1');
  await pass('capture input modes, supplemental text, long-image warning, empty-input guard');

  await open('/review');
  await page.getByRole('combobox', { name: '复习小组', exact: true }).click();
  await page.locator('[data-option-value="qa-b"]').click();
  await page.getByLabel('本轮题量').selectOption('10');
  await page.getByRole('button', { name: '开始复习 · 5 题', exact: true }).waitFor();
  await page.getByRole('button', { name: /^开始复习/ }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '查看答案与解析' }).click();
    await page.getByRole('button', { name: '记住了', exact: true }).click();
    if (i === 1) {
      await page.getByText('3 / 5', { exact: true }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: '继续复习' }).waitFor();
      assert.equal(await page.getByLabel('复习小组', { exact: true }).getAttribute('data-value'), 'qa-b');
      assert.equal(await page.getByLabel('本轮题量').inputValue(), '10');
      await page.getByRole('button', { name: '继续复习' }).click();
      await page.getByText('3 / 5', { exact: true }).waitFor();
    }
  }
  await page.getByRole('heading', { name: '这轮复习完成了' }).waitFor();
  assert.equal(problems.filter((p) => p.reviewCount > 0).length, 5);
  await page.getByRole('button', { name: '再来一轮' }).click();
  await page.getByText('所选范围没有待复习题目').waitFor();
  await pass('scoped bounded review, answer reveal, marking, progress, completion/empty state');

  await open('/?f=测试讲义');
  await page.getByRole('button', { name: '导出 PDF', exact: true }).click();
  await page.getByRole('button', { name: '全不选', exact: true }).click();
  await page.getByLabel('第二讲 几何图形', { exact: true }).check();
  await page.getByLabel('附带已有答案与解析').check();
  await page.getByRole('button', { name: '生成 PDF', exact: true }).click();
  await page.getByRole('link', { name: '下载 PDF', exact: true }).waitFor({ timeout: 120000 });
  const bookDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载 PDF', exact: true }).click();
  await (await bookDownload).saveAs(`${output}/book-smoke.pdf`);
  const bookPdf = await PDFDocument.load(await readFile(`${output}/book-smoke.pdf`));
  assert.ok(bookPdf.getPageCount() >= 3);
  await pass(`real PDF generation with mock questions: paper ${paperPdf.getPageCount()} pages, selected chapter book ${bookPdf.getPageCount()} pages`);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    for (const path of ['/', '/?f=测试讲义', '/?g=qa-a', '/?g=all', '/p/qa-p1', '/read/qa-a', '/capture', '/review', '/paper?ids=&tpl=', '/paper?ids=qa-p1&tpl=']) {
      await open(path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width} ${path}`);
      const active = page.locator(width < 768 ? 'nav.fixed a[aria-current="page"]' : 'header nav a[aria-current="page"]');
      assert.equal(await active.count(), 1, `navigation ${path}`);
    }
  }
  await pass('10 page states at 320/390/768/1440px: no document overflow, exactly one active nav');
  assert.deepEqual(blocked, []);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/results.json`, JSON.stringify({ checks, errors, blocked, mockedWrites: writes.length }, null, 2));
  console.log(`ALL PASS: ${checks.length} workflows; ${writes.length} isolated writes; no real data changed`);
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  await writeFile(`${output}/failure.json`, JSON.stringify({ url: page.url(), errors, blocked, writes: writes.slice(-3) }, null, 2));
  throw error;
} finally { await browser.close(); }
