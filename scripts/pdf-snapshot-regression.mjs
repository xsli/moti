import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().method() === 'POST'
    ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ result: { problems: [], collections: [], initialized: true, payload: '{}' } }) })
    : route.continue());
  await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:8080', { waitUntil: 'networkidle' });
  const result = await page.evaluate(async () => {
    const { buildExamPdf } = await import('/src/lib/paper/pdf.ts');
    const { PDFDocument } = await import('/node_modules/.vite/deps/pdf-lib.js');
    const { default: css } = await import('/src/components/paper/handout-sheet.css?inline');
    const sheet = document.createElement('div');
    sheet.className = 'exam-sheet handout-sheet';
    const style = document.createElement('style');
    style.textContent = css;
    const pack = document.createElement('div');
    pack.className = 'exam-pack';
    for (let i = 1; i <= 2; i++) {
      const el = document.createElement('div');
      el.className = 'exam-page';
      el.innerHTML = `<header class="hn-head"><span class="hn-running-title">第22讲 均值不等式</span><span class="hn-header-rule"></span></header><p>Export snapshot page ${i}</p>`;
      pack.append(el);
    }
    sheet.append(style, pack);
    document.body.replaceChildren(sheet);
    await document.fonts.ready;
    const captured = [];
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (this.width > 1000) {
        const pixels = this.getContext('2d').getImageData(0, 0, this.width, this.height).data;
        let green = 0, dark = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] < 30 && pixels[i + 1] > 100 && pixels[i + 1] < 170 && pixels[i + 2] > 80 && pixels[i + 2] < 140) green++;
          if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80) dark++;
        }
        captured.push({ green, dark });
      }
      return originalToBlob.call(this, callback, ...args);
    };
    const options = { title: 'Snapshot regression', dateLabel: '', withAnswers: false };
    try {
      const pending = buildExamPdf([], options);
      // Repagination replaces the live pages; navigation can also remove their styles.
      pack.replaceChildren();
      sheet.remove();
      const blob = await pending;
      const pdf = await PDFDocument.load(await blob.arrayBuffer());
      const remainingAfterSuccess = document.querySelectorAll('[data-pdf-snapshot]').length;
      document.body.append(sheet);
      const failurePage = document.createElement('div');
      failurePage.className = 'exam-page';
      failurePage.textContent = 'Failure cleanup';
      pack.append(failurePage);
      HTMLCanvasElement.prototype.toBlob = callback => callback(null);
      let failure = '';
      try { await buildExamPdf([], options); } catch (error) { failure = String(error); }
      return { pages: pdf.getPageCount(), captured, remainingAfterSuccess,
        remainingAfterFailure: document.querySelectorAll('[data-pdf-snapshot]').length,
        failure, liveUnchanged: pack.firstChild === failurePage };
    } finally {
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    }
  });
  assert.equal(result.pages, 2);
  assert.equal(result.captured.length, 2);
  assert.ok(result.captured.every(p => p.green > 1000 && p.dark > 1000), 'export must retain sheet styles and nonblank content');
  assert.equal(result.remainingAfterSuccess, 0);
  assert.equal(result.remainingAfterFailure, 0);
  assert.match(result.failure, /无法生成页面图片/);
  assert.ok(result.liveUnchanged);
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
