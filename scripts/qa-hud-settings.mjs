// UI contract tests with an in-page IPC fixture; never sends real friend requests.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/qa-output', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    window.fixture = { loggedIn: false, networkError: false, calls: [], friends: [], incoming: [{ steamId: '76561198000000002', name: 'Bạn kiểm thử' }], outgoing: [] };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; }, unregisterCallback() {},
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      async invoke(cmd, args) {
        const f = window.fixture;
        f.calls.push({ cmd, args });
        if (cmd === 'get_settings') return { language: 'vi', map: { basemap: 'vulnona' } };
        if (cmd === 'data_status') return { basemapMinimap: false, basemapFullmap: false, pois: false };
        if (cmd === 'islepilot_state') return { tokenPresent: false, loginActive: false };
        if (cmd === 'get_fullscreen_mode') return 1;
        if (cmd === 'era_open') { f.loggedIn = true; return; }
        if (cmd === 'plugin:dialog|ask') return true;
        if (cmd === 'era_request') {
          if (f.networkError) throw 'ERA_NETWORK_ERROR';
          if (!f.loggedIn) throw 'ERA_LOGIN_REQUIRED';
          const { action, value } = args;
          if (action === 'friends') return { success: true, friends: f.friends, incoming: f.incoming, outgoing: f.outgoing };
          if (action === 'friend-search') return { success: true, players: [{ steamId: '76561198000000003', name: 'Đường Rừng', class: 'Raptor' }] };
          if (action === 'friend-request') f.outgoing.push({ steamId: value, name: 'Đường Rừng' });
          if (action === 'friend-accept') { f.friends.push({ ...f.incoming[0], online: true }); f.incoming = []; }
          if (action === 'friend-remove') f.friends = f.friends.filter((p) => p.steamId !== value);
          return { success: true };
        }
        return null;
      },
    };
  });
  await page.addInitScript(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.garageFailure = false;window.garageReads=0;
    window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
      if(cmd==='get_settings')return {language:'vi',minimap:{visible:true,require_game:true,click_through:true},map:{basemap:'vulnona'},layers:{},islepilot:{},hotkeys:{},trail:{},poll:{},telemetry:{}};
      if (cmd === 'era_garage_get') {window.garageReads++;
        if (window.garageFailure) throw 'ERA_NETWORK_ERROR';
        return { data: {slotCount: 3, onlinePawn: false, isVip: false, slots: [{slot:1,stored:true,parkCommitted:false,storedDino:{species:'Raptor',growthPercent:85,gender:'Female',stateHash:'a'.repeat(64)}}]} };
      }
      return original(cmd,args);
    };
  });
  await page.goto('http://127.0.0.1:1420/#garage');
  await page.getByRole('heading', {name:'Garage ERA',exact:true}).waitFor();
  await page.getByRole('heading', {name:'Raptor',exact:true}).waitFor();
  assert.equal(await page.locator('article.card').count(),3);
  assert.equal(await page.getByRole('button',{name:'Nhận lại dino',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Lưu dino vào ô này',exact:true}).first().isDisabled(),true);
  await page.screenshot({path:'docs/qa-output/era-garage.png',fullPage:true});
  const reads=await page.evaluate(()=>window.garageReads);
  const timings=[];
  for(let i=0;i<5;i++) {
    const start=performance.now();
    await page.locator('.tab-nav button').nth(2).click();
    await page.getByRole('heading',{name:'Khủng long ERA',exact:true}).waitFor();
    await page.locator('.tab-nav button').nth(3).click();
    await page.getByRole('heading',{name:'Garage ERA',exact:true}).waitFor();
    timings.push(performance.now()-start);
  }
  assert.equal(await page.evaluate(()=>window.garageReads),reads,'Switching tabs must reuse fresh garage data');
  console.log('Dino/Garage round-trip ms:',JSON.stringify(timings));
  await page.locator('.tab-nav button').nth(5).click();
  await page.getByRole('button',{name:'Đặt HUD ngoài cửa sổ game',exact:true}).waitFor();
  await page.getByRole('button',{name:'Đặt HUD ngoài cửa sổ game',exact:true}).click();
  const patch=await page.evaluate(()=>window.fixture.calls.findLast(c=>c.cmd==='patch_settings')?.args?.patch);
  assert.equal(patch.minimap.free_position,true);assert.equal(patch.minimap.require_game,false);assert.equal(patch.minimap.hide_with_app,false);assert.equal(patch.minimap.click_through,false);
  console.log('PASS: free HUD placement preset enables dragging and desktop visibility.');
  await page.locator('.tab-nav button').nth(3).click();
  await page.evaluate(()=>window.garageFailure=true);
  await page.getByRole('button',{name:'Tải lại',exact:true}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByRole('button',{name:'Xóa',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('heading',{name:'Raptor',exact:true}).count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: ERA Garage default, sparse slots, offline/locked actions, stale data on network failure. No real mutations.');
} finally { await browser.close(); }
