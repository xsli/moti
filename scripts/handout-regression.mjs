import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const origin = process.env.UI_TEST_URL || 'http://127.0.0.1:8080';
const fixture = process.env.HANDOUT_FIXTURE;
const base = {id:'test-1', title:'排版测试', stem:'已知 $x+y=2$，求 $x^2+y^2$ 的最小值。', correctAnswer:'$2$。', analysis:'由均值不等式，\n$$xy\\leq ((x+y)/2)^2=1.$$\n故 $x^2+y^2=4-2xy\\geq 2$，当且仅当 $x=y=1$ 时取等。', tags:['例题'], figures:[], notes:'', sourceKind:'text', subject:'algebra', difficulty:2, mastery:'new', errorReason:'unknown', myAnswer:'', createdAt:1, updatedAt:1, reviewCount:0, nextReviewAt:0};
const data = fixture ? JSON.parse(await readFile(fixture,'utf8')) : {group:{name:'讲义排版测试',groupName:'回归测试'},problems:[base,{...base,id:'test-2',tags:['习题']}]};
const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:1280,height:1000}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await mkdir('tmp/handout-regression',{recursive:true});
try {
  await page.goto(origin);
  await page.evaluate(async()=>{
    const dom=await import('/node_modules/.vite/deps/react-dom_client.js');
    const react=await import('/node_modules/.vite/deps/react.js');
    const {createRoot}=dom.default||dom;
    const {createElement}=react.default||react;
    const {ExamSheet}=await import('/src/components/paper/exam-sheet.tsx');
    const {resolveExamItems,rowsFromIds}=await import('/src/lib/paper/layout.ts');
    const host=document.createElement('div');host.style.cssText='position:absolute;left:0;top:0;z-index:9999;background:#eee;width:100%;';document.body.append(host);
    const root=createRoot(host);
    window.renderHandout=(problems,opts)=>new Promise((resolve,reject)=>{
      const items=resolveExamItems(rowsFromIds(problems.map(p=>p.id)),problems,5,opts.sheetKind||'handout');
      root.render(createElement(ExamSheet,{items,dateLabel:'',localFonts:true,withAnswers:true,sheetKind:'handout',...opts,onReady:resolve,onError:reject}));
    });
    window.handoutHost=host;
  });
  const render = async(problems,opts={})=>page.evaluate(({problems,opts})=>window.renderHandout(problems,opts),{problems,opts:{title:data.group.name,groupName:data.group.groupName,...opts}});
  const qa = ()=>page.evaluate(()=>{
    const host=window.handoutHost;
    return {pages:host.querySelectorAll('.exam-pack .exam-page').length,ids:[...host.querySelectorAll('.exam-pack [data-problem]')].map(n=>n.dataset.problem),sections:[...host.querySelectorAll('.exam-pack .hn-sec-title')].map(n=>n.textContent),overflows:[...host.querySelectorAll('.exam-pack .hn-content')].filter(n=>n.getBoundingClientRect().bottom>n.parentElement.getBoundingClientRect().top+271*96/25.4+1).length,mathErrors:host.querySelectorAll('.katex-error').length,frames:host.querySelectorAll('.exam-pack .hn-frame').length,fonts:[...document.fonts].filter(f=>f.family==='HandoutSourceHan').map(f=>f.status)};
  });
  await render(data.problems);
  const full=await qa();
  const greens=await page.evaluate(()=>{
    const pack=window.handoutHost.querySelector('.exam-pack');
    return [...pack.querySelectorAll('.hn-running-title, .hn-meta, .hn-folio')].map(n=>getComputedStyle(n).color)
      .concat([...pack.querySelectorAll('.hn-header-rule')].map(n=>getComputedStyle(n).borderTopColor),
        [...pack.querySelectorAll('.hn-section-rule')].map(n=>getComputedStyle(n).borderTopColor),
        [...pack.querySelectorAll('.hn-footer-line')].map(n=>getComputedStyle(n).backgroundColor));
  });
  assert.ok(greens.length>0&&greens.every(color=>color==='rgb(0, 134, 117)'),'all green header, divider and footer elements must use the theme green');
  const headersAligned=await page.locator('.exam-pack .hn-head').evaluateAll(headers=>headers.every(header=>{
    const title=header.querySelector('.hn-running-title').getBoundingClientRect();
    const quote=header.querySelector('.hn-meta').getBoundingClientRect();
    const line=header.querySelector('.hn-header-rule').getBoundingClientRect();
    return Math.abs(title.bottom-quote.bottom)<1&&line.top>Math.max(title.bottom,quote.bottom)&&Math.abs(line.width-header.getBoundingClientRect().width)<1;
  }));
  assert.equal(headersAligned,true,'header text must share a row above a full-width straight rule');
  assert.equal(await page.locator('.exam-pack .hn-part, .exam-pack .hn-arrow').count(),0);
  const dividers=await page.locator('.exam-pack .hn-sec:has(.hn-section-rule)').evaluateAll(nodes=>nodes.map(node=>({
    label:node.dataset.section,text:node.textContent.trim(),
    width:node.querySelector('.hn-section-rule').getBoundingClientRect().width,
    contentWidth:node.closest('.hn-content').getBoundingClientRect().width,
    beforeQuestion:node.nextElementSibling?.matches('.exam-q')
  })));
  assert.equal(await page.locator('.exam-pack .hn-title + .hn-sec .hn-section-rule').count(),0);
  assert.ok(dividers.every(d=>d.width>0&&Math.abs(d.width-d.contentWidth)<1&&d.beforeQuestion),'full-width dividers must stay with the following question');
  assert.ok(dividers.filter(d=>['例题','习题'].includes(d.label)).every(d=>d.text===''),'standard sections must show only a divider');
  assert.equal(await page.locator('.exam-pack .hn-example-tag').count(),0);
  const hangingExample=await page.locator('.exam-pack .hn-example-no').first().evaluate(tag=>{
    const text=tag.closest('.exam-q').querySelector('.hn-text');
    const range=document.createRange();range.selectNodeContents(text);
    const first=[...range.getClientRects()].find(r=>r.width>0&&r.height>0);
    const badge=tag.getBoundingClientRect();
    return !!first&&first.left>badge.right&&first.top<badge.bottom&&first.bottom>badge.top;
  });
  assert.equal(hangingExample,true,'example badge must sit beside the first text line');
  const numberStyles=await page.locator('.exam-pack .hn-example-no, .exam-pack .hn-exercise-no').evaluateAll(nodes=>nodes.map(node=>{
    const s=getComputedStyle(node);
    return [s.fontFamily,s.fontSize,s.lineHeight,s.fontVariantNumeric,s.width,s.height,s.alignItems,s.justifyContent];
  }));
  assert.ok(numberStyles.every(style=>JSON.stringify(style)===JSON.stringify(numberStyles[0])),'both number styles must share dimensions, typography and centering');
  await page.evaluate(()=>{
    const host=window.handoutHost;
    const gallery=document.createElement('div');gallery.id='number-proof';gallery.className='handout-sheet';
    gallery.style.cssText='background:white;padding:20px;display:grid;gap:16px;width:max-content';
    for(const cls of ['hn-example-no','hn-exercise-no']) {
      const row=document.createElement('div');row.style.cssText='display:flex;gap:12px';
      for(const number of ['1','2','3','4','5','6','7','8','9','10','20','59']) {
        const badge=host.querySelector(`.${cls}`).cloneNode(true);badge.textContent=number;row.append(badge);
      }
      gallery.append(row);
    }
    host.prepend(gallery);
  });
  await page.locator('#number-proof').screenshot({path:'tmp/handout-regression/numbers.png'});
  await page.locator('#number-proof').evaluate(node=>node.remove());
  assert.deepEqual(full.ids,data.problems.map(p=>p.id));assert.equal(full.overflows,0);assert.equal(full.mathErrors,0);assert.ok(full.fonts.every(s=>s==='loaded'));
  await page.locator('.handout-sheet .exam-pack .exam-page').first().screenshot({path:'tmp/handout-regression/first.png'});
  await render([base,{...base,id:'title-practice',tags:['习题']}],{title:'第22讲 均值不等式',groupName:'悦教育初联一轮'});
  assert.equal(await page.locator('.exam-pack .hn-lecture-badge').innerText(),'第 22 讲');
  assert.equal(await page.locator('.exam-pack .hn-lecture-name').innerText(),'均值不等式');
  const titleCentered=await page.locator('.exam-pack .hn-title').evaluate(node=>{
    const bounds=node.getBoundingClientRect();
    const badge=node.querySelector('.hn-lecture-badge').getBoundingClientRect();
    const name=node.querySelector('.hn-lecture-name').getBoundingClientRect();
    return Math.abs((badge.left+name.right)/2-(bounds.left+bounds.right)/2)<1;
  });
  assert.equal(titleCentered,true,'lecture badge and name must be centered together');
  assert.equal(await page.locator('.handout-sheet .hn-group').count(),0);
  assert.equal((await page.locator('.exam-pack .hn-title').innerText()).includes('悦教育初联一轮'),false,'group names must not appear in the handout title');
  assert.equal(await page.locator('.exam-pack .hn-title + .exam-q').count(),1);
  assert.equal(await page.locator('.exam-pack .hn-section-rule').count(),1);
  assert.equal(await page.locator('.exam-pack .hn-section-rule').getAttribute('aria-label'),'习题');
  await page.locator('.handout-sheet .exam-pack .exam-page').first().screenshot({path:'tmp/handout-regression/title.png'});
  await render([base],{title:'第十二章 '+ '较长的讲义标题'.repeat(6)});
  const titleFits=await page.locator('.exam-pack .hn-title h1').evaluate(node=>{
    const badge=node.querySelector('.hn-lecture-badge').getBoundingClientRect();
    const name=node.querySelector('.hn-lecture-name').getBoundingClientRect();
    return badge.right<name.left&&node.scrollWidth<=node.clientWidth+1;
  });
  assert.equal(titleFits,true,'long lecture names must wrap without overlapping the badge');
  assert.equal((await qa()).overflows,0);
  await render([{...base,stem:'这是一道需要多行排版的例题，题干换行后应与首行正文对齐。'.repeat(8)}]);
  const aligned=await page.locator('.exam-pack .hn-example').first().evaluate(question=>{
    const text=question.querySelector('.hn-text > span').firstChild;
    const range=document.createRange();range.selectNodeContents(text);
    const lines=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
    const badge=question.querySelector('.hn-example-no').getBoundingClientRect();
    return lines.length>1&&lines.every(r=>r.left>badge.right&&Math.abs(r.left-lines[0].left)<1);
  });
  assert.equal(aligned,true,'wrapped example lines must align with the first text line');
  await page.locator('.handout-sheet .exam-pack .exam-page').first().screenshot({path:'tmp/handout-regression/hanging.png'});
  await render(data.problems,{withAnswers:false});
  const blank=await qa();assert.equal(blank.frames,0);assert.equal(blank.overflows,0);assert.deepEqual(blank.ids,data.problems.map(p=>p.id));
  const figure={...base,id:'figure',tags:['习题'],figures:[{id:'fig',title:'',caption:'',svg:'<svg xmlns="http://www.w3.org/2000/svg" width="150" height="90"><path d="M10 80 L70 10 L140 80 Z" fill="none" stroke="black"/></svg>'}]};
  const long={...base,id:'long',analysis:Array(45).fill(base.analysis).join('\n')};
  await render([long,figure]);
  const stress=await qa();assert.equal(stress.overflows,0);assert.deepEqual(stress.ids,['long','figure']);assert.equal(await page.locator('.exam-pack .exam-figure svg').count(),1);
  await render([base,{...long,id:'long-practice',tags:['习题']}]);
  const palette=await page.evaluate(()=>{
    const pack=window.handoutHost.querySelector('.exam-pack');
    const example=getComputedStyle(pack.querySelector('.hn-example-no')).backgroundColor;
    const practice=getComputedStyle(pack.querySelector('.hn-exercise-no')).backgroundColor;
    const frames=[...pack.querySelectorAll('.hn-frame')];
    return {distinct:example!==practice,continued:frames.some(f=>f.matches('.hn-frame-practice')&&f.querySelector('legend').textContent.includes('续')),
      consistent:frames.every(f=>{
        const expected=f.matches('.hn-frame-practice')?practice:example;
        return getComputedStyle(f).borderTopColor===expected&&getComputedStyle(f.querySelector('legend')).color===expected&&getComputedStyle(f).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(f.querySelector('.hn-text')).color==='rgb(0, 0, 0)';
      })};
  });
  assert.deepEqual(palette,{distinct:true,continued:true,consistent:true});
  await render([{...base,id:'paragraph',analysis:'这是长段落的跨页边界测试。'.repeat(300)}]);
  const paragraph=await qa();assert.equal(paragraph.overflows,0);assert.ok(paragraph.pages>1);
  await render([base],{sheetKind:'exam'});
  assert.equal(await page.locator('.exam-pack .exam-seal').count(),1);assert.equal(await page.locator('.handout-sheet').count(),0);
  await render([data.problems[0],data.problems[3]||base,figure]);
  const proof=await qa();
  await page.locator('.handout-sheet .exam-pack .exam-page').last().screenshot({path:'tmp/handout-regression/last.png'});
  if (process.env.HANDOUT_PDF) {
    const bytes=await page.evaluate(async()=>{
      const {buildExamPdf}=await import('/src/lib/paper/pdf.ts');
      const blob=await buildExamPdf([],{title:'讲义正式模板校验',dateLabel:'',withAnswers:true});
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await writeFile(process.env.HANDOUT_PDF,new Uint8Array(bytes));
    assert.equal((await PDFDocument.load(new Uint8Array(bytes))).getPageCount(),proof.pages);
  }
  const rpcSource=await(await fetch(origin+'/src/lib/problems/api.ts')).text();
  const rpc=new Map([...rpcSource.matchAll(/export const (\w+)[^\n]+createClientRpc\("([^"]+)"/g)].map(m=>[m[2],m[1]]));
  await page.route('**/*',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const name=[...rpc].find(([id])=>route.request().url().includes(id))?.[1];
    const p={...base,collectionId:'test-chapter'};
    const result=name==='getNotebook'?{initialized:true,problems:[p],collections:[{id:'test-chapter',name:'测试章',groupName:'测试书',kind:'unit',sortOrder:1,createdAt:1,updatedAt:1}]}:name==='getProblemFn'?p:null;
    if(!result)throw new Error('Unexpected write/request '+name);
    return route.fulfill({contentType:'application/json',body:JSON.stringify({result})});
  });
  const book=await page.evaluate(async()=>{
    const {exportBook}=await import('/src/lib/paper/book-export.tsx');
    const result=await exportBook({folder:'测试书',title:'测试书',withAnswers:true,blankLines:5,dpi:96,chapterIds:['test-chapter']},new AbortController().signal,()=>{});
    return {pages:result.pages,problems:result.problems,bytes:result.blob.size};
  });
  assert.equal(book.problems,1);assert.equal(book.pages,3);assert.ok(book.bytes>1000);
  assert.deepEqual(errors,[]);
  await writeFile('tmp/handout-regression/qa.json',JSON.stringify({full,blank,stress,paragraph,proof,book},null,2));
  console.log(JSON.stringify({full,blank,stress,paragraph,proof,book}));
} finally { await browser.close(); }
