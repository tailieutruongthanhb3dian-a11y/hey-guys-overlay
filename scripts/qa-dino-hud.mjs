// Kiểm tra HUD chỉ số riêng, nhịp ERA và các tay nắm kéo/resize mà không điều khiển cửa sổ thật.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
try {
  const page = await browser.newPage({ viewport:{width:280,height:120} });
  await page.addInitScript(() => {
    window.hudCalls=[];
    window.drawnText=[];
    const original=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(value,...args){window.drawnText.push(String(value));return original.call(this,value,...args);};
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    window.__TAURI_INTERNALS__={
      transformCallback(){return 1;},unregisterCallback(){},
      metadata:{currentWindow:{label:'dino-hud'},currentWebview:{label:'dino-hud'}},
      async invoke(cmd,args){
        window.hudCalls.push({cmd,args});
        if(cmd==='get_settings')return {language:'vi',position_source:'era',minimap:{free_position:true,click_through:false,opacity:.9},dino_hud:{width_px:280}};
        if(cmd==='era_live_state')return {status:'online',receivedAt:Date.now(),intervalMs:1000,data:{player:{healthPercent:undefined,hungerPercent:null,thirstPercent:30,staminaPercent:60,growthPercent:85,exactVitals:{health:75,maxHealth:100}}}};
        if(cmd==='islepilot_state')return {lastUpdate:null};
        return null;
      }
    };
  });
  await page.goto('http://127.0.0.1:1420/dino-hud.html');
  await page.waitForFunction(() => window.drawnText.includes('75%') && window.drawnText.includes('—'));
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('editing')),true);
  await page.locator('#resize-handle').dispatchEvent('pointerdown',{button:0});
  await page.locator('canvas').dispatchEvent('pointerdown',{button:0});
  const calls=await page.evaluate(()=>window.hudCalls.map(call=>call.cmd));
  assert.ok(calls.includes('resize_hud'));
  assert.ok(calls.includes('drag_hud'));
  assert.ok(calls.filter(cmd=>cmd==='era_live_state').length>=2,'HUD phải tự đồng bộ snapshot cục bộ mỗi giây');
  assert.equal(await page.locator('canvas').getAttribute('style').then(style=>style.includes('width: 280px')),true);
  console.log('PASS: separate dino HUD, ERA percentage data, 1 s snapshot, drag and resize controls.');
} finally { await browser.close(); }
