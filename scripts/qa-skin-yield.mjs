import { chromium } from '../.tools/qa/node_modules/playwright/index.mjs';
import ts from 'typescript';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=(await readFile('src/lib/dino3d/skin.ts','utf8')).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
const js=ts.transpile(source, {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();
 const result=await page.evaluate(async(js)=>{
  const make=new Function(js+'; return {compositeMap,compositeNormal};');const {compositeMap,compositeNormal}=make();
  const pattern=new ImageData(512,512);for(let i=0;i<pattern.data.length;i+=4){pattern.data[i]=255;pattern.data[i+3]=255;}
  const palette={display:'#ffffff',underbelly:'#ffffff',flank:'#ffffff',body:'#ffffff',markings:'#ffffff',detail:'#ffffff',teeth:'#ffffff',mouth:'#ffffff',claws:'#ffffff'};
  let ticks=0;const timer=setInterval(()=>ticks++,0);
  const canvas=await compositeMap(pattern,palette,null,null);clearInterval(timer);
  const pixel=Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data);
  return {ticks,pixel,original:pattern.data[0],width:canvas.width};
 },js);
 assert.deepEqual(result.pixel,[140,140,140,255]);assert.equal(result.original,255);assert.equal(result.width,512);assert.ok(result.ticks>0);console.log('PASS: skin recoloring preserves pixels and source, yields main thread.',result);
}finally{await browser.close();}
