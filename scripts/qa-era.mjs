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
  await page.goto('http://127.0.0.1:1420/#era');
  await page.getByRole('button', { name: 'Kết nối Steam · ERA', exact: true }).waitFor();
  await page.screenshot({ path: 'docs/qa-output/era-connect.png', fullPage: true });
  await page.getByRole('button', { name: 'Kết nối Steam · ERA', exact: true }).click();
  await page.getByRole('button', { name: 'Tôi đã đăng nhập · kiểm tra lại' }).click();
  await page.getByRole('heading', { name: 'Tìm người chơi cùng' }).waitFor();
  await page.getByRole('textbox', { name: 'Tên người chơi trên ERA…' }).fill('Đường');
  await page.getByRole('button', { name: 'Tìm bạn', exact: true }).click();
  await page.getByRole('button', { name: 'Kết bạn', exact: true }).click();
  await page.getByText('Lời mời đã gửi (1)').waitFor();
  await page.getByRole('button', { name: 'Chấp nhận', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa bạn', exact: true }).waitFor();
  const calls = await page.evaluate(() => window.fixture.calls);
  const search = calls.find((c) => c.cmd === 'era_request' && c.args.action === 'friend-search');
  assert.equal(Buffer.from(search.args.value, 'base64').toString('utf8'), 'Đường');
  assert.equal(calls.filter((c) => c.args?.action === 'friend-request').length, 1);
  await page.screenshot({ path: 'docs/qa-output/era-friends.png', fullPage: true });
  await page.setViewportSize({ width: 900, height: 650 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator('nav .tab-button').evaluateAll((buttons) => buttons.every((button) => {
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && r.right <= innerWidth && !!hit && button.contains(hit);
  })), true, 'Every primary tab must remain visible and clickable at 900px');
  await page.screenshot({ path: 'docs/qa-output/era-compact.png', fullPage: true });
  await page.evaluate(() => { window.fixture.networkError = true; });
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Chưa kết nối được ERA' }).waitFor();
  await page.evaluate(() => { window.fixture.networkError = false; window.fixture.loggedIn = false; });
  await page.getByRole('button', { name: 'Làm mới', exact: true }).click();
  await page.getByRole('button', { name: 'Kết nối Steam · ERA', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: login UI, UTF-8 search, invitation, acceptance, compact layout, network error, expired session. IPC fixtures only.');
} finally { await browser.close(); }
