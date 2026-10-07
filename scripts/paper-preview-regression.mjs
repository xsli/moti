import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {fromJSON} from 'seroval';

const origin=process.env.UI_TEST_URL||'http://127.0.0.1:8080';
const rpc=new Map();
for(const file of ['problems/api','paper/api']){
 const source=await (await fetch(`${origin}/src/lib/${file}.ts`)).text();
 for(const m of source.matchAll(/export const (\w+)[^\n]+createClientRpc\("([^"]+)"/g))rpc.set(m[2],m[1]);
}
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><path d="M10 70 L60 10 L110 70 Z" fill="none" stroke="black"/></svg>';
const problems=Array.from({length:78},(_,i)=>({
 id:`preview-${i+1}`,title:`预览题目${i+1}`,stem:`第${i+1}题：已知 $x=2$，求 $x^2+2x+1$ 与 $\\frac{x+1}{x}$ 的值。`,
 correctAnswer:'$9$，$\\frac32$。',analysis:'利用完全平方公式：$$x^2+2x+1=(x+1)^2=9.$$再代入求值。',
 tags:['例题'],difficulty:2,subject:'algebra',figures:i===0?[{id:'f1',title:'配图',image:'',svg:''}]:[],
 sourceKind:'photo',sourceImage:'',myAnswer:'',notes:'',errorReason:'unknown',mastery:'new',reviewCount:0,nextReviewAt:0,
 collectionId:'preview-group',sourceOrder:i+1,createdAt:1,updatedAt:1,
}));
const collections=[{id:'preview-group',name:'预览测试',groupName:'测试',kind:'unit',sortOrder:1,createdAt:1,updatedAt:1}];
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],blocked=[],fonts=[],reads=[];
let failFigure=true;
let figureGate;
let releaseFigure;
await page.route('**/*',async route=>{
 const request=route.request(),url=request.url();
 if(/fonts\.(googleapis|gstatic)\.com/.test(url)){fonts.push(url);return route.abort();}
 if(request.method()==='GET'&&url.includes('/src/lib/problems/math-text.tsx')){
  const response=await route.fetch(),source=await response.text();
  assert.ok(source.includes('function renderMath(tex, display) {'));
  return route.fulfill({response,body:source.replace('function renderMath(tex, display) {','function renderMath(tex, display) { window.__mathRenders=(window.__mathRenders||0)+1;')});
 }
 if(request.method()!=='POST')return route.continue();
 const name=[...rpc].find(([id])=>url.includes(id))?.[1];
 let result;
 if(name==='getNotebook')result={problems,collections,initialized:true};
 else if(name==='getPaperSessionFn')result={payload:'{}'};
 else if(name==='getProblemFn'){
  const raw=JSON.parse(request.postData()||'{}');const {data}=raw.t?fromJSON(raw):raw;
  reads.push(data.id);
  if(figureGate)await figureGate;
  const p=problems.find(p=>p.id===data.id);
  result=failFigure?null:{...p,figures:[{...p.figures[0],svg}]};
 }else{blocked.push(name||url);return route.abort();}
 return route.fulfill({contentType:'application/json',body:JSON.stringify({result})});
});
page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(origin+'/paper?ids='+problems.map(p=>p.id).join(',')+'&sheet=handout&title=预览测试',{waitUntil:'networkidle'});
 assert.equal(await page.getByLabel('一级标题',{exact:true}).count(),0,'new handouts must not insert a practice heading');
 await page.getByRole('button',{name:'试卷',exact:true}).click();
 await page.getByRole('button',{name:'学案',exact:true}).click();
 assert.equal(await page.getByLabel('一级标题',{exact:true}).count(),0,'switching sheet kind must not insert a heading');
 await page.getByRole('button',{name:'预览并导出',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'配图读取失败'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'生成 PDF',exact:true}).isDisabled(),true);
 failFigure=false;
 figureGate=new Promise(resolve=>{releaseFigure=resolve;});
 const start=Date.now();
 await page.getByRole('button',{name:'重试配图',exact:true}).click();
 await page.locator('[data-preview-loading]').waitFor();
 assert.equal(await page.getByRole('button',{name:'生成 PDF',exact:true}).isDisabled(),true);
 const loadingShot=await page.screenshot();
 releaseFigure();figureGate=null;
 await page.waitForFunction(()=>!document.querySelector('button')||[...document.querySelectorAll('button')].some(b=>b.textContent==='生成 PDF'&&!b.disabled));
 await page.locator('.exam-sheet[aria-busy="false"]').waitFor();
 const readyMs=Date.now()-start;
 assert.ok(reads.every(id=>id==='preview-1'),'text-only questions must not be re-fetched');
 assert.equal(await page.locator('.exam-pack .exam-q').count(),78);
 assert.equal(await page.locator('.exam-pack .hn-sec-title').count(),0);
 assert.equal(await page.locator('.exam-pack .hn-section-rule[aria-label="例题"]').count(),0);
 assert.equal(await page.locator('.exam-pack .exam-figure svg').count(),1);
 assert.deepEqual(fonts,[],'preview must not request external Chinese fonts');
 await page.getByText('高级选项',{exact:true}).click();
 await page.evaluate(()=>{window.__mathRenders=0;});
 await page.getByLabel('模板名称',{exact:true}).fill('只修改模板名称');
 const unrelatedMath=await page.evaluate(()=>window.__mathRenders);
 assert.equal(unrelatedMath,0,'template name must not typeset the sheet');
 const titleStart=Date.now();
 await page.getByLabel('学案名',{exact:true}).fill('修改后的预览标题');
 await page.locator('.exam-pack .hn-title').filter({hasText:'修改后的预览标题'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.exam-sheet')?.getAttribute('aria-busy')==='false');
 const titleMs=Date.now()-titleStart;
 assert.equal(await page.evaluate(()=>window.__mathRenders),0,'title edits must reuse formula rendering');
 await page.getByLabel('附答案与解析',{exact:true}).check();
 await page.locator('.exam-sheet[aria-busy="false"]').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='生成 PDF'&&!b.disabled));
 assert.ok(await page.locator('.exam-pack .hn-frame').count()>=156);
 assert.equal(await page.locator('.exam-pack .exam-q').count(),78);
 assert.equal(await page.locator('.katex-error').count(),0);
 const pages=await page.locator('.exam-pack .exam-page').count();
 await page.getByRole('button',{name:'返回',exact:true}).click();
 await page.evaluate(()=>{
  window.__loadingPaints=0;window.__watchLoading=true;
  const check=()=>{
   if(document.querySelector('[data-preview-loading]')&&!document.querySelector('.exam-measure'))window.__loadingPaints++;
   if(window.__watchLoading)requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
 });
 await page.getByRole('button',{name:'预览并导出',exact:true}).click();
 await page.locator('.exam-sheet[aria-busy="false"]').waitFor();
 const loadingPaints=await page.evaluate(()=>{window.__watchLoading=false;return window.__loadingPaints;});
 assert.ok(loadingPaints>0,'loading state must get a frame before mounting the measurement tree');
 assert.equal(await page.locator('[data-preview-loading]').count(),0);
 await page.getByRole('button',{name:'试卷',exact:true}).click();
 await page.getByRole('button',{name:'学案',exact:true}).click();
 await page.locator('.exam-sheet[aria-busy="false"]').waitFor();
 await page.getByRole('button',{name:'返回',exact:true}).click();
 assert.equal(await page.getByLabel('一级标题',{exact:true}).count(),0,'preview mode switching must not insert a heading');
 await page.getByRole('button',{name:'添加标题',exact:true}).click();
 await page.getByRole('menuitem',{name:'练习',exact:true}).click();
 assert.equal(await page.getByLabel('一级标题',{exact:true}).inputValue(),'练习','manual headings remain available');
 await page.getByRole('button',{name:'试卷',exact:true}).click();
 await page.getByRole('button',{name:'学案',exact:true}).click();
 assert.equal(await page.getByLabel('一级标题',{exact:true}).inputValue(),'练习','manual headings survive mode switches');
 await page.getByRole('button',{name:'预览并导出',exact:true}).click();
 await page.locator('.exam-sheet[aria-busy="false"]').waitFor();
 assert.equal(await page.locator('.exam-pack .hn-sec-title').textContent(),'练习');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log(JSON.stringify({readyMs,titleMs,unrelatedMath,loadingPaints,reads,pages,fonts,errors,blocked}));
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 // Write outputs only after interactions so Vite file watching cannot reload the test.
 await mkdir('tmp/paper-preview-qa',{recursive:true});
 await page.screenshot({path:'tmp/paper-preview-qa/mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'tmp/paper-preview-qa/desktop.png'});
 await writeFile('tmp/paper-preview-qa/loading.png',loadingShot);
 await writeFile('tmp/paper-preview-qa/result.json',JSON.stringify({readyMs,titleMs,unrelatedMath,loadingPaints,reads,pages,fonts,errors,blocked},null,2));
}finally{releaseFigure?.();await browser.close();}
