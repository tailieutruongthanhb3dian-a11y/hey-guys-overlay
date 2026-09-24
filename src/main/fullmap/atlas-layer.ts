import L from 'leaflet';
import {atlasImageAnchors,type Anchor} from '../../lib/atlas-geometry';
export {atlasPoint,type Anchor} from '../../lib/atlas-geometry';
export function hdLayer(anchors:Anchor[],onerror:()=>void){
  const [o,x,y]=atlasImageAnchors(anchors),a=(x.px-o.px)/16384,b=(x.py-o.py)/16384,c=(y.px-o.px)/16384,d=(y.py-o.py)/16384,det=a*d-b*c;
  if(!Number.isFinite(det)||Math.abs(det)<1e-12)throw new Error('Invalid Atlas transform');
  const cache=new Map<string,Promise<HTMLImageElement>>();
  function load(z:number,x:number,y:number){const key=`${z}/${x}/${y}`;let p=cache.get(key);if(!p){p=new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.decoding="async";i.onload=()=>resolve(i);i.onerror=()=>{cache.delete(key);reject(new Error("Atlas tile unavailable"));};i.src=`https://raidatlas.app/uploads/games/theisle/maps/gateway/layers/surface/tiles/${key}.png`;});cache.set(key,p);if(cache.size>128)cache.delete(cache.keys().next().value!);}return p;}
  const layer=L.gridLayer({tileSize:256,keepBuffer:2,pane:'tilePane',updateWhenIdle:true,updateWhenZooming:false,updateInterval:100,minZoom:-10,maxZoom:4});
  layer.on('tileunload',(e:any)=>{e.tile.dataset.cancelled='true';});
  (layer as unknown as {createTile:(coords:L.Coords,done:L.DoneCallback)=>HTMLElement}).createTile=(coords:L.Coords,done:L.DoneCallback)=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;
    const scale=2**coords.z,tx=coords.x*256,ty=coords.y*256;
    const inverse=(px:number,py:number)=>{const dx=px/scale-o.px,dy=py/scale-o.py;return {x:(d*dx-c*dy)/det,y:(-b*dx+a*dy)/det};};
    const corners=[inverse(tx,ty),inverse(tx+256,ty),inverse(tx,ty+256),inverse(tx+256,ty+256)];
    const zoom=Math.max(0,Math.min(6,Math.ceil(6+Math.log2(scale*Math.max(Math.hypot(a,b),Math.hypot(c,d))))));
    const factor=2**(6-zoom),span=256*factor,limit=2**zoom;
    const left=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x))/span)),right=Math.min(limit-1,Math.floor(Math.max(...corners.map(p=>p.x))/span));
    const top=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y))/span)),bottom=Math.min(limit-1,Math.floor(Math.max(...corners.map(p=>p.y))/span));
    const jobs:Promise<void>[]=[];
    for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)jobs.push(load(zoom,col,row).then(img=>{if(canvas.dataset.cancelled)return;ctx.setTransform(a*scale*factor,b*scale*factor,c*scale*factor,d*scale*factor,o.px*scale-tx,o.py*scale-ty);ctx.drawImage(img,col*256,row*256,256,256);}));
    void Promise.all(jobs).then(()=>{if(!canvas.dataset.cancelled)done(undefined,canvas);}).catch(()=>{if(!canvas.dataset.cancelled){onerror();done(undefined,canvas);}});return canvas;
  };return layer;
}
