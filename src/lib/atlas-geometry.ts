export interface Anchor {px:number;py:number;xCm:number;yCm:number}
export function atlasPoint(anchors:Anchor[],u:number,v:number){const [o,x,y]=anchors;return {px:o.px+(x.px-o.px)*u/100+(y.px-o.px)*v/100,py:o.py+(x.py-o.py)*u/100+(y.py-o.py)*v/100,xCm:o.xCm+(x.xCm-o.xCm)*u/100+(y.xCm-o.xCm)*v/100,yCm:o.yCm+(x.yCm-o.yCm)*u/100+(y.yCm-o.yCm)*v/100};}
// Atlas data is bottom-origin. Its image tiles are top-origin (ERA's v3 yfix).
export function atlasImageAnchors(anchors:Anchor[]):Anchor[]{return [atlasPoint(anchors,0,100),atlasPoint(anchors,100,100),atlasPoint(anchors,0,0)];}
const number=(v:unknown):number=>v===null||v===undefined||v===''?NaN:Number(v);
export function zonePoints(zone:Record<string,unknown>):{x:number;y:number}[]{
  const shape=String(zone.shape_type??'rectangle');
  if(shape==='polygon'||shape==='line'){try{const pts=Array.isArray(zone.points)?zone.points:JSON.parse(String(zone.points_json??'[]'));return Array.isArray(pts)?pts.filter(p=>p&&[number(p.x),number(p.y)].every(Number.isFinite)).map(p=>({x:number(p.x),y:number(p.y)})):[];}catch{return [];}}
  const x1=number(zone.x1),y1=number(zone.y1),x2=number(zone.x2),y2=number(zone.y2);
  if(![x1,y1].every(Number.isFinite))return [];
  if(shape!=='point'&&![x2,y2].every(Number.isFinite))return [];
  const cx=shape==='circle'||shape==='point'?x1:(x1+x2)/2,cy=shape==='circle'||shape==='point'?y1:(y1+y2)/2;
  let points:{x:number;y:number}[];
  if(['circle','ellipse','point'].includes(shape)){
    const rx=shape==='point'?.32:shape==='circle'?Math.hypot(x2-x1,y2-y1):Math.abs(x2-x1)/2,ry=shape==='ellipse'?Math.abs(y2-y1)/2:rx;
    points=Array.from({length:64},(_,i)=>({x:cx+rx*Math.cos(i*Math.PI/32),y:cy+ry*Math.sin(i*Math.PI/32)}));
  }else if(shape==='rectangle')points=[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
  else return [];
  const angle=['ellipse','rectangle'].includes(shape)?(number(zone.rotation)||0)*Math.PI/180:0;
  return points.map(p=>({x:cx+(p.x-cx)*Math.cos(angle)-(p.y-cy)*Math.sin(angle),y:cy+(p.x-cx)*Math.sin(angle)+(p.y-cy)*Math.cos(angle)}));
}
