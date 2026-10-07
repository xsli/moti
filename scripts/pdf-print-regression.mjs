import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const origin=process.env.UI_TEST_URL||'http://127.0.0.1:8080';
const output='tmp/pdf-print-qa';
const problem={
 id:'print-qa',title:'纯黑打印测试',stem:'已知 $x=2$，求 $x^2+2x+1$ 的值。',
 correctAnswer:'$9$',analysis:'先整理原式：\n\n$$x^2+2x+1=(x+1)^2.$$\n\n代入 $x=2$，得 $9$。',
 tags:['例题'],difficulty:2,subject:'algebra',figures:[],sourceKind:'photo',sourceImage:'',
 myAnswer:'',notes:'',errorReason:'unknown',mastery:'new',reviewCount:0,nextReviewAt:0,
 collectionId:'print-chapter',sourceOrder:1,createdAt:1,updatedAt:1,
};
const collection={id:'print-chapter',name:'第一讲 打印核验',groupName:'打印测试',kind:'unit',sortOrder:1,createdAt:1,updatedAt:1};
const rpc=new Map();
for(const file of ['problems/api','paper/api']){
 const source=await (await fetch(`${origin}/src/lib/${file}.ts`)).text();
 for(const m of source.matchAll(/export const (\w+)[^\n]+createClientRpc\("([^"]+)"/g))rpc.set(m[2],m[1]);
}
assert.ok([...rpc.values()].includes('getNotebook'));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1000}});
const errors=[],blocked=[],files=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',async route=>{
 if(route.request().method()!=='POST')return route.continue();
 const name=[...rpc].find(([id])=>route.request().url().includes(id))?.[1];
 let result;
 if(name==='getNotebook')result={problems:[problem],collections:[collection],initialized:true};
 else if(name==='getProblemFn')result=problem;
 else if(name==='getPaperSessionFn')result={payload:'{}'};
 else {blocked.push(name||route.request().url());return route.abort();}
 return route.fulfill({contentType:'application/json',body:JSON.stringify({result})});
});
try{
 await page.goto(origin,{waitUntil:'networkidle'});
 for(const kind of ['exam','handout']){
  const result=await page.evaluate(async({problem,kind})=>{
   const {createElement}=(await import('/node_modules/.vite/deps/react.js')).default;
   const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
   const {ExamSheet}=await import('/src/components/paper/exam-sheet.tsx');
   const {buildExamPdf}=await import('/src/lib/paper/pdf.ts');
   const {buildExamLatex}=await import('/src/lib/paper/latex.ts');
   const host=document.createElement('div');document.body.append(host);
   const root=createRoot(host);
   const options={title:'纯黑打印测试',dateLabel:'',withAnswers:true,sheetKind:kind};
   const items=[{kind:'problem',problem,number:1,blankLines:2,role:'example',label:'例1'}];
   try{
    await new Promise(resolve=>root.render(createElement(ExamSheet,{...options,items,localFonts:true,onReady:resolve})));
    const selectors=['.exam-stem','.exam-stem .katex','.exam-page-no',kind==='exam'?'.exam-analysis':'.hn-idea'];
    const styles=selectors.map(selector=>{
     const nodes=[...host.querySelectorAll('.exam-pack '+selector)];
     return {selector,count:nodes.length,colors:nodes.map(node=>getComputedStyle(node).color)};
    });
    const weight=getComputedStyle(host.querySelector('.exam-stem')).fontWeight;
    const tex=buildExamLatex(items,options);
    const blob=await buildExamPdf([problem],options);
    return {styles,weight,tex,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
   }finally{root.unmount();host.remove();}
  },{problem,kind});
  for(const s of result.styles){assert.ok(s.count>0,s.selector);assert.ok(s.colors.every(c=>c==='rgb(0, 0, 0)'),JSON.stringify(s));}
  assert.equal(result.weight,'400');
  assert.ok(!result.tex.includes('\\color{blue}'));
  assert.ok(result.tex.includes('\\color{black}'));
  const bytes=Buffer.from(result.bytes);
  assert.ok((await PDFDocument.load(bytes)).getPageCount()>0);
  files.push({name:`${kind}.pdf`,bytes});
  console.log('PASS pure-black text and formulas',kind);
 }
 await page.evaluate(async({problem,collection})=>{
  const {createElement}=(await import('/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;
  const {BookExportDialog}=await import('/src/components/paper/book-export-dialog.tsx');
  const host=document.createElement('div');document.body.append(host);
  createRoot(host).render(createElement(BookExportDialog,{folder:'打印测试',collections:[collection],problems:[problem]}));
 },{problem,collection});
 await page.getByRole('button',{name:'导出 PDF',exact:true}).click();
 assert.equal(await page.getByLabel('清晰度',{exact:true}).inputValue(),'300');
 await page.keyboard.press('Escape');
 const book=await page.evaluate(async()=>{
  const {exportBook}=await import('/src/lib/paper/book-export.tsx');
  const result=await exportBook({folder:'打印测试',title:'打印测试',withAnswers:true,blankLines:2,dpi:300,chapterIds:['print-chapter']},new AbortController().signal,()=>{});
  return {pages:result.pages,bytes:Array.from(new Uint8Array(await result.blob.arrayBuffer()))};
 });
 assert.ok(book.pages>=3);
 files.push({name:'book.pdf',bytes:Buffer.from(book.bytes)});
 assert.deepEqual(errors,[]);
 assert.deepEqual(blocked,[],'unexpected write');
 console.log('PASS default 300 DPI and real book export',book.pages,'pages');
}finally{await browser.close();}
await mkdir(output,{recursive:true});
for(const file of files)await writeFile(`${output}/${file.name}`,file.bytes);
