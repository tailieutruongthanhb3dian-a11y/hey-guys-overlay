// Kiểm tra trang công khai đã phát hành; không kết nối tài khoản hoặc sửa dữ liệu game.
import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:980}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const response=await page.goto('https://heyguys-dashboard.pages.dev/',{waitUntil:'networkidle'});
 assert.equal(response.status(),200);
 assert.equal(await page.title(),'Hey Guys Overlay');
 await page.getByRole('heading',{name:/Cùng ứng dụng/}).waitFor();
 assert.equal(await page.getByRole('link',{name:/Tải ứng dụng Windows/}).getAttribute('href'),'/downloads/Hey-Guys-Overlay.zip');
 await mkdir('docs/qa-output',{recursive:true});
 await page.screenshot({path:'docs/qa-output/web-deployed.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'docs/qa-output/web-deployed-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: deployed HTTPS page, correct app title, download link, desktop/mobile layout, no page errors. Native pairing not tested.');
} finally {await browser.close();}
