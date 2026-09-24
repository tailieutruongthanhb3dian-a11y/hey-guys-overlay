// Dữ liệu giả lập: kiểm tra nhãn tiếng Việt, nhiệm vụ thiếu và zoom không ghi lặp.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { primeHudRows } from '../src/lib/prime-hud.ts';
import { minimapZoom } from '../src/lib/minimap-zoom.ts';
const data={available:true,conditions:[{id:1,complete:true},{id:'2',complete:false}]};
assert.equal(primeHudRows(data,true)[0].completed,true);
assert.equal(primeHudRows(data,true)[2].unknown,true);
assert.ok(primeHudRows(data,false).every(r=>r.unknown&&!r.completed));
let queue=new Map(),seq=0,radius=600,saves=[];
globalThis.requestAnimationFrame=fn=>{queue.set(++seq,fn);return seq;};
globalThis.cancelAnimationFrame=id=>queue.delete(id);
const zoom=minimapZoom(()=>radius,r=>radius=r,r=>saves.push(r));
for(let i=0;i<12;i++)zoom.change(-.03);
const samples=[];
for(let time=16;time<600;time+=16){const frames=[...queue.values()];queue.clear();frames.forEach(fn=>fn(time));samples.push(radius);}
assert.ok(radius<600&&radius>=100);assert.ok(samples.filter((v,i)=>i&&v!==samples[i-1]).length>10);
await new Promise(r=>setTimeout(r,370));assert.equal(saves.length,1);
zoom.change(100);for(let time=600;time<1200;time+=16){const frames=[...queue.values()];queue.clear();frames.forEach(fn=>fn(time));}
assert.ok(radius>saves[0]&&radius<=3000);zoom.dispose();
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname; if(name.includes('..'))throw 0;const file=name==='/'?'/index.html':name;res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(await readFile('dist'+file));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:280,height:224}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
   window.labels=[];window.online=true;
   const original=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(value,...args){window.labels.push(value);return original.call(this,value,...args);};
   window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
   window.__TAURI_INTERNALS__={transformCallback(){return 1;},unregisterCallback(){},metadata:{currentWindow:{label:'dino-hud'},currentWebview:{label:'dino-hud'}},async invoke(cmd){
    if(cmd==='get_settings')return {language:'vi',position_source:'era',minimap:{opacity:1},dino_hud:{width_px:280},companion:{primeFocus:true,thresholds:{staminaPercent:20}}};
    if(cmd==='era_live_state')return {status:window.online?'online':'error',receivedAt:Date.now(),data:{player:{healthPercent:75,hungerPercent:53,thirstPercent:71,staminaPercent:14,growthPercent:29,prime:{available:true,conditions:Array.from({length:10},(_,i)=>({id:i+1,complete:i<3}))}}}};
    if(cmd==='islepilot_state')return {lastUpdate:null};return null;
   }};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/dino-hud.html`);
 await page.waitForFunction(()=>window.labels.includes('Prime · Việc ưu tiên'));
 await page.getByText('Thể lực thấp · 14%',{exact:true}).waitFor();
 const labels=await page.evaluate(()=>window.labels);
 for(const label of ['Máu','Thức ăn','Nước','Thể lực','Tăng trưởng 29%'])assert.ok(labels.includes(label),label);
 assert.equal(await page.locator('canvas').evaluate(c=>parseFloat(c.style.height)),160);
 await mkdir('docs/qa-output',{recursive:true});await page.screenshot({path:'docs/qa-output/companion-hud.png'});
 await page.evaluate(()=>{window.online=false;window.labels=[];});
 await page.waitForFunction(()=>document.body.textContent.includes('Chờ dữ liệu mới'));
 assert.deepEqual(errors,[]);
console.log('PASS: compact Prime HUD 160px plus 64px assistant strip, low stamina alert, stale reset, smooth zoom regression.');
}finally{await browser.close();server.close();}
