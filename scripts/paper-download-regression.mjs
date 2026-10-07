import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const origin=process.env.UI_TEST_URL||'http://127.0.0.1:8080';
const rpc=new Map();
for(const file of ['problems/api','paper/api','paper/sample']) {
 const source=await(await fetch(`${origin}/src/lib/${file}.ts`)).text();
 for(const m of source.matchAll(/export const (\w+)[^\n]+createClientRpc\("([^"]+)"/g))rpc.set(m[2],m[1]);
}
const problem={id:'download-test',title:'下载测试题',stem:'已知 $x=2$，求 $x+1$。',correctAnswer:'$3$',analysis:'代入得 $2+1=3$。',figures:[],tags:['习题'],difficulty:2,subject:'algebra',sourceKind:'text',myAnswer:'',notes:'',mastery:'new',errorReason:'unknown',reviewCount:0,nextReviewAt:0,createdAt:1,updatedAt:1};
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1000},acceptDownloads:true});
const blocked=[],errors=[];
page.on('pageerror',error=>errors.push(String(error)));
await page.route('**/*',async route=>{
 const req=route.request();
 if(req.method()!=='POST')return route.continue();
 const name=[...rpc].find(([id])=>req.url().includes(id))?.[1];
 let result;
 if(name==='getNotebook')result={problems:[problem],collections:[],initialized:true};
 else if(name==='getPaperSessionFn')result={payload:'{}'};
 else if(name==='saveSamplePdf')result={file:'download-test.pdf'};
 else {blocked.push(name||req.url());return route.abort();}
 return route.fulfill({contentType:'application/json',body:JSON.stringify({result})});
});
try {
 await page.goto(origin+'/paper?ids=download-test&sheet=exam&title=下载测试',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'预览并导出',exact:true}).click();
 await page.getByRole('button',{name:'生成 PDF',exact:true}).click();
 const link=page.getByRole('link',{name:'下载 PDF',exact:true});
 await link.waitFor();
 const url=await link.getAttribute('href');
 for(let i=0;i<2;i++) {
  const pending=page.waitForEvent('download');
  await link.click();
  const download=await pending;
  assert.equal(download.suggestedFilename(),'下载测试.pdf');
  assert.equal(await download.failure(),null);
  const bytes=await readFile(await download.path());
  assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  await page.evaluate(()=>{
   window.dispatchEvent(new Event('focus'));
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  assert.equal(await link.count(),1,'download must remain after returning focus');
  assert.equal(await link.getAttribute('href'),url,'same settings must reuse the generated PDF');
 }
 await page.evaluate(()=>{
  const key='moti-cloud-cache-v1:local-user';
  const cached=JSON.parse(localStorage.getItem(key));
  cached.problems=cached.problems.map(p=>({...p,mastery:'mastered',updatedAt:2,sourceImage:'data:image/png;base64,original-only'}));
  localStorage.setItem(key,JSON.stringify(cached));
  window.dispatchEvent(new Event('focus'));
 });
 assert.equal(await link.count(),1,'non-printed metadata must not invalidate the PDF');
 await page.getByLabel('卷名',{exact:true}).fill('修改后的标题');
 assert.equal(await link.count(),0);
 await page.getByRole('button',{name:'重新生成 PDF',exact:true}).waitFor();
 await page.getByLabel('卷名',{exact:true}).fill('下载测试');
 await link.waitFor();
 await page.evaluate(()=>{
  const key='moti-cloud-cache-v1:local-user';
  const cached=JSON.parse(localStorage.getItem(key));
  cached.problems=cached.problems.map(p=>({...p,updatedAt:3,stem:'修改后的题干 $x=3$。'}));
  localStorage.setItem(key,JSON.stringify(cached));
  window.dispatchEvent(new Event('focus'));
 });
 await link.waitFor({state:'hidden'});
 assert.equal(await link.count(),0,'actual printed content changes must invalidate the PDF');
 await page.getByRole('button',{name:'重新生成 PDF',exact:true}).waitFor();
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
 await mkdir('tmp/paper-download-qa',{recursive:true});
 await page.screenshot({path:'tmp/paper-download-qa/changed-settings.png'});
 console.log(JSON.stringify({downloads:2,focusPreservesPdf:true,contentInvalidation:true,blocked,errors}));
}finally{await browser.close();}
