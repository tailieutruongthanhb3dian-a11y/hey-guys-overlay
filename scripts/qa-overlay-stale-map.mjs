// Bản đồ vẫn hiện, nhưng không dẫn tới tọa độ nhân vật đã hết hạn.
import {chromium} from '../.tools/qa/node_modules/playwright/index.mjs';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const bundle=await build({entryPoints:['src/minimap/render.ts'],bundle:true,write:false,format:'esm'});
const url='data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();
 const result=await page.evaluate(async url=>{
  const {renderMap}=await import(url),canvas=document.createElement('canvas');document.body.append(canvas);
  const state={sizePx:260,panelH:0,questsH:0,position:{xCm:0,yCm:0,px:0,py:0,headingDeg:null},radiusM:600,pxPerM:.7,miniScale:1,opacity:1,pois:[],friends:[],waypoints:[],trailPx:[],compassLetters:['B','Đ','N','T'],headingLabel:'',headingUnknown:'',showWaypoints:false,navigation:{bearingDeg:90,distanceM:1200,name:'Điểm hẹn'}};
  const labels=[],ctx=canvas.getContext('2d'),original=ctx.fillText.bind(ctx);ctx.fillText=(s,...args)=>{labels.push(s);original(s,...args);};
  renderMap(canvas,state);const fresh=labels.some(s=>s.includes('Điểm hẹn'));labels.length=0;
  renderMap(canvas,{...state,positionStale:true});return {fresh,stale:labels.some(s=>s.includes('Điểm hẹn')),width:canvas.width};
 },url);
 assert.equal(result.fresh,true);assert.equal(result.stale,false);assert.ok(result.width>0);
 console.log('PASS: live navigation label renders; stale position suppresses navigation without removing map canvas.');
}finally{await browser.close();}
