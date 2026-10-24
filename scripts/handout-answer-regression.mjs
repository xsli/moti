import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.route('**/*', route => route.request().method() === 'POST'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { problems: [], collections: [], initialized: true, payload: '{}' } }) })
    : route.continue());
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { createElement: h } = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { HandoutSheet } = await import('/src/components/paper/handout-sheet.tsx');
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const problem = (id, tags, answer, analysis) => ({ id, tags, title: id, stem: `求解方程 $x+1=2$。`,
      figures: [], correctAnswer: answer, analysis, notes: '' });
    const items = [
      problem('example', ['例题'], '$x=1$', '方程两边同时减去一，得到 $x=1$。'),
      problem('practice', [], '$x=1$', Array.from({ length: 36 }, (_, i) => `第 ${i + 1} 步：两边同时减去一，得到 $x=1$。`).join('\n')),
      problem('missing', [], '', ''),
    ].map((p, i) => ({ kind: 'problem', problem: p, role: 'practice', number: i + 1, label: `${i + 1}`, blankLines: 5 }));
    window.renderHandout = (placement, withAnswers = true) => new Promise((resolve, reject) => {
      root.render(h(HandoutSheet, { title: '第10讲 方程不等式综合2', items, withAnswers,
        answerPlacement: placement, quotes: [{ text: '数学始于思考', person: '解集' }],
        onReady: resolve, onError: reject }));
    });
    await window.renderHandout('end');
  });
  const inspect = () => page.evaluate(() => {
    const pages = [...document.querySelectorAll('.exam-pack .exam-page')];
    const start = pages.findIndex(p => p.querySelector('.hn-answer-title'));
    return { pages: pages.length, start,
      questionIds: pages.flatMap(p => [...p.querySelectorAll('[data-problem]')].map(q => q.dataset.problem)),
      answers: pages.flatMap(p => [...p.querySelectorAll('[data-answer-problem]')].map(q => q.dataset.answerProblem)),
      beforeFrames: pages.slice(0, start).reduce((n, p) => n + p.querySelectorAll('.hn-frame').length, 0),
      appendixQuestions: pages.slice(start).reduce((n, p) => n + p.querySelectorAll('[data-problem]').length, 0),
      writing: pages.reduce((n, p) => n + p.querySelectorAll('.hn-writing').length, 0),
      missing: pages.some(p => p.textContent.includes('暂未录入答案与解析')),
      lastStep: pages.some(p => p.textContent.includes('第 36 步')),
      overflow: pages.some(p => p.querySelector('.hn-content').getBoundingClientRect().bottom > p.getBoundingClientRect().top + 271 * p.getBoundingClientRect().width / 210 + 1),
    };
  });
  const end = await inspect();
  assert.ok(end.start > 0);
  assert.deepEqual(end.questionIds, ['example', 'practice', 'missing']);
  assert.deepEqual(end.answers, end.questionIds);
  assert.equal(end.beforeFrames, 0);
  assert.equal(end.appendixQuestions, 0);
  assert.equal(end.writing, 3);
  assert.ok(end.lastStep && end.missing && !end.overflow);
  await mkdir('tmp/handout-answer-qa', { recursive: true });
  await page.locator('.exam-pack .exam-page').nth(end.start).screenshot({ path: 'tmp/handout-answer-qa/appendix.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/handout-answer-qa/mobile.png' });
  const pdf = await page.evaluate(async () => {
    const { buildExamPdf } = await import('/src/lib/paper/pdf.ts');
    const { PDFDocument } = await import('/node_modules/.vite/deps/pdf-lib.js');
    const blob = await buildExamPdf([], { title: 'Handout regression', dateLabel: '', withAnswers: true });
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    return { pages: doc.getPageCount(), bytes: blob.size };
  });
  assert.equal(pdf.pages, end.pages);
  assert.ok(pdf.bytes > 10000);
  await page.evaluate(() => window.renderHandout('inline'));
  assert.equal(await page.locator('.exam-pack [data-answer-problem]').count(), 0);
  assert.equal(await page.locator('.exam-pack .hn-writing').count(), 0);
  assert.ok(await page.locator('.exam-pack .hn-frame').count() > 0);
  await page.evaluate(() => window.renderHandout('end', false));
  assert.equal(await page.locator('.exam-pack .hn-frame').count(), 0);
  assert.equal(await page.locator('.exam-pack .hn-answer-title').count(), 0);
  assert.equal(await page.locator('.exam-pack .hn-writing').count(), 3);
  console.log(JSON.stringify({ end, pdf, inline: 'passed', noAnswers: 'passed' }));
} finally {
  await browser.close();
}
