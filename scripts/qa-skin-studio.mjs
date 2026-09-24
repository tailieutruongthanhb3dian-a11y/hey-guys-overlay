// Kiểm tra hợp đồng giao diện Skin Studio bằng IPC giả lập; không gửi skin thật lên ERA.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

await mkdir('docs/qa-output', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    window.skinFixture = { calls: [] };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback() { return 1; },
      unregisterCallback() {},
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      async invoke(cmd, args) {
        window.skinFixture.calls.push({ cmd, args });
        if (cmd === 'get_settings') return { language: 'vi', map: { basemap: 'vulnona' } };
        if (cmd === 'data_status') return { basemapMinimap: false, basemapFullmap: false, pois: false };
        if (cmd === 'islepilot_state') return { tokenPresent: false, loginActive: false };
        if (cmd === 'get_fullscreen_mode') return 1;
        if (cmd === 'era_live_state') return {
          status: 'online', receivedAt: Date.now(), data: {
            player: {
              name: 'Thanh Chillil', class: 'Rex',
              skinColors: ['#16A34A', '#3F6212', '#EAB308', '#78350F', '#C08457', '#111827', '#F3F4F6'],
            },
          },
        };
        if (cmd === 'era_skin_policy') return {
          success: true, available: true, arbitraryHex: true,
          cooldownRemainingSeconds: 0,
        };
        if (cmd === 'era_skin_apply') return { success: true, cooldownRemainingSeconds: 300 };
        return null;
      },
    };
  });

  await page.goto('http://127.0.0.1:1420/#skin');
  await page.getByRole('heading', { name: 'Xưởng skin khủng long', exact: true }).waitFor();
  assert.equal(await page.locator('.card-head strong').textContent(), 'Tyrannosaurus');
  // Trình duyệt QA không có asset:// của Tauri; khung xem trước vẫn phải được gắn đúng loài.
  assert.equal(await page.locator('.viewer-frame .viewer-bg').count(), 1);
  assert.equal(await page.locator('.slot').count(), 3);
  assert.equal(await page.locator('.color-grid input[type="color"]').first().isEnabled(), true);

  const names = ['Rex rừng', 'Rex lửa', 'Rex tím'];
  for (let index = 0; index < 3; index += 1) {
    await page.locator('.slot').nth(index).click();
    await page.locator('.save-row input').fill(names[index]);
    if (index === 1) await page.getByRole('button', { name: 'Dung nham', exact: true }).click();
    if (index === 2) await page.getByRole('button', { name: 'Hoàng gia', exact: true }).click();
    await page.locator('.save-row button').click();
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('heyGuys.skinSlots.v1')));
  assert.deepEqual(stored.map((slot) => slot.name), names);
  assert.equal(stored.length, 3);

  await page.reload();
  await page.getByRole('heading', { name: 'Xưởng skin khủng long', exact: true }).waitFor();
  for (const name of names) await page.getByText(name, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Áp dụng skin', exact: true }).click();
  await page.getByText('Skin đã được áp dụng thành công.', { exact: true }).waitFor();
  const apply = await page.evaluate(() => window.skinFixture.calls.find((call) => call.cmd === 'era_skin_apply'));
  assert.equal(apply.args.colors.length, 7);
  assert.ok(apply.args.colors.every((color) => /^#[0-9A-F]{6}$/.test(color)));

  await page.screenshot({ path: 'docs/qa-output/skin-studio.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: Rex auto-detect, 3D preview, color presets, exactly 3 persistent slots, and confirmed apply payload. No real ERA mutation.');
} finally {
  await browser.close();
}
