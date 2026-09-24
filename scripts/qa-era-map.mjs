// UI contract tests with an in-page IPC fixture; never sends real friend requests.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/qa-output', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => {errors.push(String(e)); console.log('PAGE ERROR',String(e));});
  page.setDefaultTimeout(10000);
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
    const original=window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.convertFileSrc=()=> 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    window.__TAURI_INTERNALS__.invoke=async(cmd,args)=>{
      if(cmd==='get_settings')return window.mapSettings ??= {language:'vi',map:{basemap:'vulnona'},minimap:{visible:true},layers:{water:false},islepilot:{enabled:false}};
      if(cmd==='patch_settings'){window.fixture.calls.push({cmd,args});const p=args.patch;window.mapSettings={...window.mapSettings,layers:{...window.mapSettings.layers,...p.layers},minimap:{...window.mapSettings.minimap,...p.minimap}};return window.mapSettings;}
      if(cmd==='data_status')return {basemapMinimap:true,basemapFullmap:true,pois:true};
      if(cmd==='get_map_info')return {imageWidthPx:7800,imageHeightPx:7817,pxPerMX:.7,pxPerMY:.7,source:'vulnona',overlays:[]};
      if(cmd==='get_basemap_paths')return {minimap:'map.png',fullmap:'map.png'};
      if(cmd==='get_pois_render')return [{key:'water',kind:'point',items:[{label:'Water A',px:3500,py:3900,xCm:-10000,yCm:0},{label:'Water B',px:3500,py:3700,xCm:-50000,yCm:0}]},{key:'saltlick',kind:'point',items:[]},{key:'mudwallow',kind:'point',items:[]}];
      if(cmd==='list_waypoints_px')return [];
      if(['get_current_trail','get_previous_trail'].includes(cmd))return {segmentsCm:[],segmentsPx:[]};
      if(cmd==='get_current_position')return {xCm:0,yCm:0,px:3500,py:4000,headingDeg:null};
      if(cmd==='era_live_state')return {status:'online',receivedAt:Date.now()+60000,intervalMs:1000,data:{mapSource:'vulnona',player:{location:{x:0,y:0}},mapFriends:[{steamId:'76561198000000001',name:'\u0110\u01b0\u1eddng',class:'Tyrannosaurus',growthPercent:85,healthPercent:72,px:3600,py:4000,xCm:30000,yCm:40000}]}};
      if(cmd==='add_waypoint_at_pixel'){window.fixture.calls.push({cmd,args});return {id:'test',name:args.name};}
      return original(cmd,args);
    };
  });
  await page.clock.install();
  await page.goto('http://127.0.0.1:1420/#map', {waitUntil:'domcontentloaded'});
  await page.locator('.squad .person').waitFor();
  assert.match(await page.locator('.person small').innerText(),/500 m/);
  await page.locator('.squad > input').fill('duong');
  assert.equal(await page.locator('.person').count(),1);
  await page.locator('.person .tools button').first().click();
  assert.equal(await page.locator('.person .tools button').first().getAttribute('aria-pressed'),'true');
  await page.locator('.person .tools button').nth(2).click();
  const pin=await page.evaluate(()=>window.fixture.calls.find(c=>c.cmd==='add_waypoint_at_pixel'));
  assert.equal(pin.args.px,3600);assert.equal(pin.args.py,4000);
  assert.match(await page.locator('.leaflet-tooltip').first().innerText(),/Rex.*G 85%.*HP 72%/);
  await page.locator('.person .tools button').nth(1).click();
  assert.equal(await page.evaluate(()=>window.mapSettings.minimap.era_target),'76561198000000001');
  await page.locator('.tactical div').first().locator('button').first().click();
  assert.equal(await page.evaluate(()=>window.mapSettings.layers.water),true);
  await page.locator('.tactical div').first().locator('button').last().click();
  assert.equal(await page.evaluate(()=>window.mapSettings.layers.water),false);
  await page.locator('.tactical div').nth(1).locator('button').first().click();
  assert.equal(await page.evaluate(()=>window.mapSettings.minimap.destination.xCm),-10000);
  assert.equal(await page.evaluate(()=>window.mapSettings.minimap.era_target),null);
  await page.screenshot({path:'docs/qa-output/era-squad.png',fullPage:true});
  await page.setViewportSize({width:900,height:650});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('.era-map-tools button').nth(1).click();
  await page.screenshot({path:'docs/qa-output/era-squad-compact.png',fullPage:true});
  await page.clock.fastForward(66000);
  assert.equal(await page.locator('.person').count(),0,'Stale friends must disappear');
  assert.deepEqual(errors,[]);
  console.log('PASS: compact vitals, squad guidance, nearest water, presets and undo, search, distance, waypoint and stale removal. Fixtures only.');
} finally {await browser.close();}
