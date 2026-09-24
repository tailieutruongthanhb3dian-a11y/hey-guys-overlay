<script lang="ts">
  import { patchSettings, type PoiLayer, type PositionUpdate } from "$lib/api";
  import { eraLive } from "$lib/era-live";
  import { mapModes, navigation } from "$lib/tactical";
  import { onMount } from "svelte";
  let { pois, position, layers, available, onlayers, onlocate }: {pois:PoiLayer[];position:PositionUpdate|null;layers:Record<string,boolean>;available:string[];onlayers:(layers:Record<string,boolean>)=>Promise<void>;onlocate:(px:number,py:number)=>void} = $props();
  let busy=$state(false),message=$state(""),previous=$state<Record<string,boolean>|null>(null),now=$state(Date.now());
  const fresh=$derived(!!position && $eraLive?.status==="online" && now-$eraLive.receivedAt<5000);
  onMount(()=>{const timer=setInterval(()=>now=Date.now(),1000);return()=>clearInterval(timer);});
  async function mode(key:string) {if(busy)return;busy=true;try{const before=Object.fromEntries(available.map(k=>[k,layers[k] ?? true]));await onlayers(Object.fromEntries(available.map(k=>[k,mapModes[key].includes(k)])));previous=before;message="Đã đổi lớp bản đồ. Bạn có thể hoàn tác.";}catch(e){message=String(e);}finally{busy=false;}}
  async function undo(){if(!previous||busy)return;busy=true;try{await onlayers(previous);previous=null;message="Đã khôi phục các lớp trước đó.";}catch(e){message=String(e);}finally{busy=false;}}
  async function nearest(key:string,label:string){
    if(!fresh||!position||busy)return;busy=true;
    try{
      const points=pois.filter(p=>p.key===key).flatMap(p=>p.items).filter(p=>[p.xCm,p.yCm,p.px,p.py].every(Number.isFinite));
      const closest=points.sort((a,b)=>navigation(position!,a).distanceM-navigation(position!,b).distanceM)[0];
      if(!closest){message=`Chưa có điểm ${label.toLowerCase()} trong dữ liệu bản đồ.`;return;}
      await patchSettings({minimap:{era_target:null,destination:{xCm:closest.xCm,yCm:closest.yCm,name:label}}});
      await onlayers({[key]:true});onlocate(closest.px,closest.py);
      message=`${label}: ${Math.round(navigation(position,closest).distanceM)} m đường thẳng · Đã dẫn hướng trên minimap.`;
    }catch(e){message=String(e);}finally{busy=false;}
  }
  async function stop(){try{await patchSettings({minimap:{era_target:null,destination:null}});message="Đã dừng dẫn đường.";}catch(e){message=String(e);}}
</script>
<section class="tactical" aria-label="Công cụ sinh tồn">
  <div><span>Chế độ</span><button disabled={busy} onclick={()=>void mode("survival")}>Sinh tồn</button><button disabled={busy} onclick={()=>void mode("squad")}>Đi nhóm</button><button disabled={busy} onclick={()=>void mode("explore")}>Khám phá</button><button disabled={busy||!previous} onclick={()=>void undo()}>Hoàn tác</button></div>
  <div><span>Gần nhất</span><button disabled={busy||!fresh} onclick={()=>void nearest("water","Nước")}>Nước</button><button disabled={busy||!fresh} onclick={()=>void nearest("saltlick","Muối")}>Muối</button><button disabled={busy||!fresh} onclick={()=>void nearest("mudwallow","Bùn")}>Bùn</button><button disabled={busy} onclick={()=>void stop()}>Dừng dẫn</button></div>
  {#if message}<p role="status">{message}</p>{:else if !fresh}<p>Vào ERA để tìm điểm gần vị trí hiện tại.</p>{/if}
</section>
<style>.tactical{position:absolute;z-index:500;bottom:12px;left:50%;transform:translateX(-50%);max-width:calc(100% - 24px);width:470px;background:var(--color-panel);border:1px solid var(--color-border);border-radius:12px;padding:10px;font-size:12px}.tactical div{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.tactical div+div{margin-top:6px}span{width:54px;color:var(--color-muted)}button{min-height:32px;padding:5px 8px;border:1px solid var(--color-border);border-radius:8px;cursor:pointer}button:disabled{opacity:.4;cursor:default}p{margin-top:6px;color:var(--color-muted)}</style>
