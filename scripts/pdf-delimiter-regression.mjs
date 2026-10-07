import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.UI_TEST_URL||'http://127.0.0.1:8080';
const output='tmp/pdf-delimiter-qa';
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1100}});
const errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',route=>route.request().method()==='POST'
 ? route.fulfill({contentType:'application/json',body:JSON.stringify({result:{problems:[],collections:[],initialized:true,payload:'{}'}})})
 : route.continue());
let result, screenshot;
try {
 await page.goto(origin,{waitUntil:'networkidle'});
 result=await page.evaluate(async()=>{
  const {createElement}=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {ExamSheet}=await import('/src/components/paper/exam-sheet.tsx');
  const {buildExamPdf,appendBookPdfPage}=await import('/src/lib/paper/pdf.ts');
  const {PDFDocument}=await import('/node_modules/.vite/deps/pdf-lib.js');
  const host=document.createElement('div');document.body.replaceChildren(host);
  const root=createRoot(host);
  const problem={id:'delimiter',title:'长括号导出测试',stem:String.raw`已知
$$\begin{cases}x_1+x_4+x_6+x_7=39\\x_2+x_4+x_5+x_7=49\\x_3+x_5+x_6+x_7=41\\x_4+x_7=13\\x_5+x_7=14\\x_6+x_7=9\\x_1+x_2+x_3+x_4+x_5+x_6+x_7=97\end{cases}$$
求 $x_7$ 的值。
$$\left\{\begin{matrix}a=1\\b=2\\c=3\\d=4\\e=5\end{matrix}\right\}\quad\sqrt{\frac{a+b}{c+d}}\quad\overrightarrow{AB}$$
$$\left(x+\dfrac1x\right)^2-\left[x+\dfrac1x-\dfrac1{1-x-\dfrac1x}\right]^2\div\dfrac{x^2+\dfrac1{x^2}-x-\dfrac1x+3}{x^2+\dfrac1{x^2}-2x-\dfrac2x+3}$$`,figures:[],correctAnswer:'',analysis:''};
  const options={title:'长括号导出测试',dateLabel:'',withAnswers:false,sheetKind:'handout'};
  const items=[{kind:'problem',problem,number:1,blankLines:2,role:'practice',label:'1.'}];
  await new Promise(resolve=>root.render(createElement(ExamSheet,{...options,items,localFonts:true,onReady:resolve})));
  await document.fonts.ready;
  const el=host.querySelector('.exam-pack .exam-page');
  const rect=el.getBoundingClientRect();
  const segments=[...el.querySelectorAll('.delimsizing.mult svg')].map(svg=>{
   const r=svg.getBoundingClientRect();
   return {x:r.x-rect.x,y:r.y-rect.y,width:r.width,height:r.height,html:svg.outerHTML};
  });
  const original=el.innerHTML;
  const files=[];
  const blob=await buildExamPdf([problem],options);
  files.push({name:'exam-450.pdf',bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});
  for(const dpi of [200,300]) {
   const pdf=await PDFDocument.create();
   await appendBookPdfPage(pdf,el,{signal:new AbortController().signal,dpi});
   files.push({name:`book-${dpi}.pdf`,bytes:Array.from(await pdf.save())});
  }
  return {segments,files,unchanged:original===el.innerHTML};
 });
 screenshot=await page.locator('.exam-pack .exam-page').screenshot();
 assert.ok(result.segments.length>=4);
 assert.ok(result.unchanged,'export must not modify the live preview DOM');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
await mkdir(output,{recursive:true});
for(const file of result.files)await writeFile(`${output}/${file.name}`,Buffer.from(file.bytes));
await writeFile(`${output}/browser.png`,screenshot);
await writeFile(`${output}/segments.json`,JSON.stringify(result.segments,null,2));
console.log(JSON.stringify({segments:result.segments.length,unchanged:result.unchanged,errors}));
