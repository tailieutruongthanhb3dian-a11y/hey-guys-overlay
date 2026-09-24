// Kiểm tra gộp cập nhật, giới hạn nhịp và hủy tác vụ đang chờ bằng đồng hồ giả lập.
import assert from 'node:assert/strict';
import { frameBudget } from '../src/lib/frame-budget.ts';
let now=0,id=0;const jobs=new Map();
globalThis.performance={now:()=>now};
globalThis.setTimeout=(fn,delay)=>{jobs.set(++id,{fn,time:now+delay});return id;};
globalThis.clearTimeout=id=>jobs.delete(id);
globalThis.requestAnimationFrame=fn=>{jobs.set(++id,{fn,time:Math.ceil((now+.01)/16.6667)*16.6667});return id;};
globalThis.cancelAnimationFrame=id=>jobs.delete(id);
function advance(end){while(true){const entry=[...jobs].sort((a,b)=>a[1].time-b[1].time)[0];if(!entry||entry[1].time>end)break;now=entry[1].time;jobs.delete(entry[0]);entry[1].fn(now);}now=end;}
const times=[];let value=0,last=0;const draw=frameBudget(()=>{times.push(now);last=value;});
for(let t=0;t<1000;t++){advance(t);value=t;draw();draw();}
advance(1100);assert.equal(last,999);assert.ok(times.length<=61&&times.length>=45);assert.ok(times.slice(1).every((t,i)=>t-times[i]>=1000/60-.001));
const count=times.length;advance(2100);assert.equal(times.length,count);
draw();draw.cancel();advance(2200);assert.equal(times.length,count);
draw();advance(2201);draw.cancel();advance(2300);assert.equal(times.length,count);
draw();advance(2400);assert.equal(times.length,count+1);
console.log('PASS: burst coalescing, latest state, 60 Hz ceiling, idle, cancel and resume.');
