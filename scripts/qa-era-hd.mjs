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
      if(cmd==='era_atlas') return window.atlasFixture;
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
  const atlas=await fetch('https://eragamingvn.net/live-map/assets/gateway-atlas-data.json?v=20260821b').then(r=>r.json());
  const c=atlas.coordLocator,a=+c.matrix_m11,b=+c.matrix_m12,d=+c.matrix_m21,e=+c.matrix_m22,det=a*e-b*d;
  atlas.projectionAnchors=[[0,0],[100,0],[0,100]].map(([u,v])=>{const x=(e*(u-c.matrix_m13)-b*(v-c.matrix_m23))/det;const y=(-d*(u-c.matrix_m13)+a*(v-c.matrix_m23))/det;return {px:(y+505)/1112*7800,py:(x+607)/1116*7817,xCm:x*1000,yCm:y*1000};});
  await page.addInitScript(data=>window.atlasFixture=data,atlas);
  await page.clock.install();
  await page.goto('http://127.0.0.1:1420/#map', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(4000);
  console.log(await page.locator('.era-map-tools').innerText());
  assert.ok(await page.locator('canvas.leaflet-tile-loaded').count()>0);
  await page.waitForTimeout(3000);
  assert.equal(await page.getByRole('button',{name:'ERA HD',exact:true}).count(),0);
  assert.equal(await page.locator('.leaflet-container').count(),1);
  await page.screenshot({path:'docs/qa-output/era-unified.png',fullPage:true});
  for(let i=0;i<3;i++){
    await page.locator('.tab-nav button').nth(2).click();
    await page.locator('.tab-nav button').nth(1).click();
  }
  assert.equal(await page.locator('.leaflet-container').count(),1);
  await page.route('https://raidatlas.app/**',route=>route.abort());
  for(let i=0;i<3;i++)await page.locator('.leaflet-control-zoom-in').click();
  await page.locator('.era-map-tools [role=status]').waitFor();
  assert.equal(await page.locator('.era-map-tools button').first().getAttribute('aria-pressed'),'false');
  await page.unroute('https://raidatlas.app/**');
  await page.locator('.era-map-tools button').first().click();
  await page.locator('canvas.leaflet-tile-loaded').first().waitFor();
  assert.equal(await page.locator('.era-map-tools button').first().getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);
  console.log('PASS: one map, projected HD tiles, shared Atlas layers and tactical controls');
}finally{await browser.close();}
