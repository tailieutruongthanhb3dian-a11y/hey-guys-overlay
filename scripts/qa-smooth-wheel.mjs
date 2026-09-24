import {chromium} from '../.tools/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 await page.goto('http://127.0.0.1:1420/');
 const result=await page.evaluate(async()=>{
  const L=(await import('/node_modules/.vite/deps/leaflet.js')).default;
  const {smoothWheel}=await import('/src/main/fullmap/smooth-wheel.ts');
  document.body.innerHTML='<div id="test" style="width:900px;height:650px"></div>';
  const el=document.getElementById('test');const map=L.map(el,{crs:L.CRS.Simple,zoomSnap:0,zoomAnimation:false,scrollWheelZoom:false,minZoom:-5,maxZoom:3}).setView([0,0],0);
  const control=smoothWheel(map);let commits=0;map.on('zoomend',()=>commits++);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const at=L.point(600,300),anchor=map.containerPointToLatLng(at);
  const rect=el.getBoundingClientRect();
  function wheel(delta){el.dispatchEvent(new WheelEvent('wheel',{deltaY:delta,clientX:rect.left+at.x,clientY:rect.top+at.y,bubbles:true,cancelable:true}));}
  for(let i=0;i<12;i++){wheel(-20);await sleep(20);}
  const intermediate={commits,transformed:map.getPane('mapPane').style.transform.includes('scale(')};
  await sleep(800);
  const drift=map.latLngToContainerPoint(anchor).distanceTo(at),zoom=map.getZoom();
  wheel(80);await sleep(60);control.cancel();
  const cancelled=!el.dataset.wheelZooming&&!map.getPane('mapPane').style.transform.includes('scale(');
  control.destroy();map.remove();return {intermediate,commits,drift,zoom,cancelled};
 });
 assert.equal(result.intermediate.commits,0);assert.equal(result.intermediate.transformed,true);assert.equal(result.commits,1);assert.ok(result.drift<=2);assert.ok(result.zoom>0);assert.equal(result.cancelled,true);console.log('PASS: wheel burst composites without layer redraw, one final zoom commit, cursor anchor, cancellation',JSON.stringify(result));
}finally{await browser.close();}
