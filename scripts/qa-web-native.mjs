// Kiểm tra đọc dữ liệu thật qua cầu nối. Không gọi thao tác thay đổi game.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
const site='https://heyguys-dashboard.pages.dev',base='http://127.0.0.1:17864';
const native=await chromium.connectOverCDP('http://127.0.0.1:9229');
const main=native.contexts().flatMap(c=>c.pages()).find(p=>/index\.html|tauri\.localhost\/$/.test(p.url()));
if(!main)throw new Error('Native main window not found');
const pair=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('web_bridge_pair'));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
await mkdir('docs/qa-output',{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:980}});
  await context.grantPermissions(['local-network-access'],{origin:site});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  if(!process.argv.includes('--deployed'))await page.route(`${site}/**`,async route=>{
    const filename=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'')||'index.html';
    if(filename.includes('..'))return route.abort();
    const mime=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':filename.endsWith('.html')?'text/html':'application/octet-stream';
    try { await route.fulfill({body:await readFile(path.join('dist',filename)),contentType:mime}); } catch {await route.fulfill({status:404});}
  });
  const unauthorized=await fetch(`${base}/rpc`,{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:'{"command":"get_settings"}'});
  assert.equal(unauthorized.status,401);
  const foreign=await fetch(`${base}/rpc`,{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json',Authorization:`Bearer ${pair.code}`},body:'{"command":"get_settings"}'});
  assert.equal(foreign.status,403);
  const restricted=await fetch(`${base}/rpc`,{method:'POST',headers:{Origin:site,'Content-Type':'application/json',Authorization:`Bearer ${pair.code}`},body:'{"command":"islepilot_set_token","args":{"token":"must-not-write"}}'});
  assert.ok((await restricted.json()).error);
  await page.goto(pair.url,{waitUntil:'domcontentloaded'});
  await page.locator('.tab-nav').waitFor({timeout:45000});
  assert.ok(!page.url().includes(pair.code),'Mã ghép đôi phải được xóa khỏi URL');
  await page.getByRole('button',{name:'Khủng long',exact:true}).click();
  await page.locator('.stats').waitFor();
  await page.waitForTimeout(3500);
  await page.screenshot({path:'docs/qa-output/web-native-dino.png',fullPage:true});
  const status=await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('era_suicide_status').then(s=>({available:s.available,identityReady:s.identityReady})).catch(()=>({unavailable:true})));
  console.log('Native suicide status (read only):',JSON.stringify(status));
  await page.getByRole('button',{name:'Bản đồ',exact:true}).click();
  await page.locator('.leaflet-container').waitFor({timeout:45000});
  await page.waitForTimeout(5000);
  assert.equal(await page.locator('.leaflet-container').count(),1);
  const loaded=await page.locator('.leaflet-container img').evaluateAll(images=>images.filter(i=>i.complete&&i.naturalWidth>0).length);
  assert.ok(loaded>0,'Bản đồ phải tải được ảnh qua cầu nối');
  await page.screenshot({path:'docs/qa-output/web-native-map.png',fullPage:true});
  await page.getByRole('button',{name:'Garage',exact:true}).click();
  await page.getByRole('heading',{name:'Garage ERA',exact:true}).waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({path:'docs/qa-output/web-native-garage.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: real native bridge, origin/auth rejection, forbidden command, pairing, native HUD, map assets, Garage read; no game mutations.');
} finally {await browser.close();await native.close();}
