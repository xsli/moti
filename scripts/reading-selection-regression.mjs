import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.UI_TEST_URL || 'http://127.0.0.1:8080';
const output='tmp/reading-selection-qa';
const performanceRun=process.argv.includes('--performance');
await mkdir(output,{recursive:true});
const rpc=new Map();
for(const file of ['problems/api','paper/api']){
 const source=await (await fetch(`${origin}/src/lib/${file}.ts`)).text();
 for(const m of source.matchAll(/export const (\w+)[^\n]+createClientRpc\("([^"]+)"/g))rpc.set(m[2],m[1]);
}
assert.ok([...rpc.values()].includes('getNotebook'));
const collections=['a','b'].map(id=>({id,name:`测试小组${id}`,groupName:'阅读测试',kind:'unit',sortOrder:1,createdAt:1,updatedAt:1}));
const problems=Array.from({length:performanceRun?80:4},(_,i)=>({
 id:`reading-${i+1}`,title:`题目${i+1}`,stem:`求 $x^2+2x+1$ 的值，其中 $x=${i+1}$。`,
 createdAt:1,updatedAt:1,sourceKind:'photo',sourceImage:'',subject:'algebra',
 tags:[i%2?'习题':'例题'],difficulty:5,figures:[],myAnswer:'',correctAnswer:'$4$',analysis:performanceRun?Array.from({length:8},(_,j)=>`第${j+1}步：$$\\frac{x^2+2x+1}{x+1}=x+1.$$`).join('\n\n'):'利用完全平方公式。',
 notes:'',errorReason:'unknown',mastery:'new',reviewCount:0,nextReviewAt:0,collectionId:'a',sourceOrder:i+1,sourceBatchId:'qa',
}));
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext();
const blocked=[],errors=[];
await context.route('**/*',async route=>{
 if(performanceRun && route.request().method()==='GET' && route.request().url().includes('/src/lib/problems/math-text.tsx')){
  const response=await route.fetch();
  const source=await response.text();
  assert.ok(source.includes('function renderMath(tex, display) {'));
  return route.fulfill({response,body:source.replace('function renderMath(tex, display) {','function renderMath(tex, display) { window.__mathRenders = (window.__mathRenders || 0) + 1;')});
 }
 if(route.request().method()!=='POST')return route.continue();
 const name=[...rpc].find(([id])=>route.request().url().includes(id))?.[1];
 let result;
 if(name==='getNotebook')result={problems,collections,initialized:true};
 else if(name==='getPaperSessionFn')result={payload:JSON.stringify({basket:[],basketUpdatedAt:0,templates:[],deletedTemplates:{}})};
 else if(name==='putPaperSessionFn')result={ok:true};
 else{blocked.push(name||route.request().url());return route.abort();}
 return route.fulfill({contentType:'application/json',body:JSON.stringify({result})});
});
const page=await context.newPage();
page.on('pageerror',e=>errors.push(String(e)));
const basket=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('moti-paper-shared')||'{"basket":[]}').basket);
try{
 if(performanceRun){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/read/a',{waitUntil:'networkidle'});
  await page.getByLabel('选择第 1 题',{exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const samples=[];
  for(let i=0;i<4;i++){
   samples.push(await page.evaluate(async()=>{
    window.__mathRenders=0;
    const input=document.querySelector('input[aria-label="选择第 1 题"]');
    const start=performance.now();
    input.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {elapsedMs:Math.round(performance.now()-start),formulaRenders:window.__mathRenders};
   }));
  }
  console.log('SELECTION PERFORMANCE',JSON.stringify(samples));
  if(process.argv.includes('--assert-cached'))assert.ok(samples.every(s=>s.formulaRenders===0),'selection must not re-typeset formulas');
  await page.evaluate(async()=>{
   window.__mathRenders=0;
   [...document.querySelectorAll('label')].find(el=>el.textContent.trim()==='全选当前').querySelector('input').click();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  if(process.argv.includes('--assert-cached'))assert.equal(await page.evaluate(()=>window.__mathRenders),0,'bulk selection must reuse formulas');
  await page.evaluate(()=>{
   document.addEventListener('click',()=>{
    window.__mathRenders=0;
    const start=performance.now();
    window.__clickSample=new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({elapsedMs:Math.round(performance.now()-start),formulaRenders:window.__mathRenders}))));
   },{capture:true,once:true});
  });
  await page.getByLabel('全选当前',{exact:true}).uncheck();
  const pointerSample=await page.evaluate(()=>window.__clickSample);
  console.log('POINTER BULK SELECTION',JSON.stringify(pointerSample));
  if(process.argv.includes('--assert-cached'))assert.equal(pointerSample.formulaRenders,0,'pointer selection must reuse formulas');
  await writeFile(`${output}/performance-${process.env.QA_LABEL||'current'}.json`,JSON.stringify({samples,pointerSample},null,2));
 } else for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+'/read/a');
  await page.getByRole('heading',{name:'测试小组a',exact:true}).waitFor();
  assert.equal(await page.locator('[data-reading-question]').count(),4);
  assert.equal(await page.getByRole('heading',{name:'答案',exact:true}).count(),4);
  const previous=await basket();
  await page.getByLabel('选择第 3 题',{exact:true}).check();
  await page.getByLabel('选择第 1 题',{exact:true}).check();
  const first=page.locator('[data-reading-question="reading-1"]');
  await first.getByRole('button',{name:'收起答案与解析',exact:true}).click();
  assert.equal(await first.getByRole('heading',{name:'答案',exact:true}).count(),0);
  await first.getByRole('button',{name:'展开答案与解析',exact:true}).click();
  assert.equal(await first.getByRole('heading',{name:'解析',exact:true}).count(),1);
  assert.equal(await page.getByLabel('选择第 1 题',{exact:true}).isChecked(),true);
  assert.deepEqual(await basket(),previous,'selection must not change basket');
  assert.equal(await page.getByLabel('全选当前',{exact:true}).evaluate(el=>el.indeterminate),true);
  await page.getByLabel('题目类型',{exact:true}).selectOption('习题');
  await page.getByLabel('选择第 2 题',{exact:true}).check();
  await page.getByLabel('只看已选',{exact:true}).check();
  assert.equal(await page.locator('[data-reading-question]').count(),1);
  await page.getByLabel('题目类型',{exact:true}).selectOption('all');
  assert.deepEqual(await page.locator('[data-reading-question]').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label'))),['第 1 题','第 2 题','第 3 题']);
  const link=new URL(await page.getByLabel('已选题目操作').getByRole('link',{name:'组卷',exact:true}).getAttribute('href'),origin);
  assert.equal(link.searchParams.get('ids'),'reading-1,reading-2,reading-3');
  await page.getByRole('button',{name:'加入组卷篮',exact:true}).click();
  assert.deepEqual(await basket(),['reading-1','reading-2','reading-3']);
  await page.getByLabel('跳转题目',{exact:true}).selectOption('reading-1');
  const geometry=await page.evaluate(()=>({
   overflow:document.documentElement.scrollWidth>innerWidth,
   toolbar:document.querySelector('[aria-label="阅读设置"]').getBoundingClientRect().bottom,
   question:document.querySelector('[data-reading-question="reading-1"]').getBoundingClientRect().top,
  }));
  assert.equal(geometry.overflow,false,`${width}px horizontal overflow`);
  assert.ok(geometry.question>=geometry.toolbar,`${width}px jump hidden under toolbar: ${JSON.stringify(geometry)}`);
  await page.screenshot({path:`${output}/selected-${width}.png`});
  await page.getByLabel('选择第 3 题',{exact:true}).click();
  assert.equal(await page.locator('[data-reading-question]').count(),2);
  await page.getByRole('button',{name:'清空阅读选择',exact:true}).click();
  assert.equal(await page.locator('[data-reading-question]').count(),4);
  assert.deepEqual(await basket(),['reading-1','reading-2','reading-3'],'clear local selection must preserve basket');
  await page.getByLabel('全选当前',{exact:true}).check();
  assert.equal(await page.getByRole('checkbox',{checked:true}).count(),5);
  await page.getByLabel('全选当前',{exact:true}).uncheck();
  await page.getByLabel('只看已选',{exact:true}).check();
  await page.getByText('当前范围没有已选题目',{exact:true}).waitFor();
  await page.getByLabel('只看已选',{exact:true}).uncheck();
  await page.goto(origin+'/read/b');
  await page.getByText('这个小组还没有题目',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('全选当前',{exact:true}).isDisabled(),true);
  console.log('PASS reading selection',width);
 }
 assert.deepEqual(blocked,[],'unexpected backend writes/requests');
 assert.deepEqual(errors,[],'browser errors');
}finally{
 await writeFile(`${output}/result.json`,JSON.stringify({errors,blocked},null,2));
 await browser.close();
}
