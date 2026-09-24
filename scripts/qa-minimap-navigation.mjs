import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
const page=await browser.newPage();await page.goto('http://127.0.0.1:1420/',{waitUntil:'domcontentloaded'});
const result=await page.evaluate(async()=>{
const {render}=await import('/src/minimap/render.ts');
const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);
const state={sizePx:260,panelH:0,questsH:0,position:{xCm:0,yCm:0,px:0,py:0,headingDeg:null},radiusM:600,pxPerM:.7,miniScale:1,opacity:1,pois:[],friends:[],waypoints:[],trailPx:[],compassLetters:['N','E','S','W'],headingLabel:'',headingUnknown:'',showWaypoints:false,navigation:{bearingDeg:90,distanceM:1200,name:'TrollGusta'}};
render(canvas,state);
const ctx=canvas.getContext('2d');const ratio=devicePixelRatio;
const east=ctx.getImageData(238*ratio,125*ratio,12*ratio,12*ratio).data;
return [...east].some((v,i)=>i%4===3&&v>0);
});assert.equal(result,true);await page.screenshot({path:'docs/qa-output/minimap-navigation.png'});console.log('PASS: minimap renderer draws east navigation arrow');
}finally{await browser.close();}
