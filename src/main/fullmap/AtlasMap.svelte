<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import L from "leaflet";
  import { eraLive } from "$lib/era-live";
  import { shortSpecies,compactPercent } from "$lib/tactical";
  let {visible=true}=$props<{visible?:boolean}>();
  let element:HTMLDivElement;
  let map=$state.raw<L.Map|null>(null),error=$state(""),loading=$state(true),follow=$state(true),now=$state(Date.now());
  let data:any=null,alive=true;
  const groups=new Map<number,L.LayerGroup>(),markers=new Map<string,L.CircleMarker>();
  let categories=$state<{id:number;name:string}[]>([]),enabled=$state<number[]>([24,115]);
  const categoryNames:Record<string,string>={Labels:"Tên địa danh",Locations:"Địa điểm",Animals:"Điểm thú (tĩnh)",Plants:"Thực vật",Zones:"Vùng",'Dino Spawns':"Điểm spawn"};
  const ll=(x:number,y:number):L.LatLngTuple=>[-y*163.84,x*163.84];
  function project(xCm:number,yCm:number):L.LatLngTuple|null{const c=data?.coordLocator;if(!c||![xCm,yCm].every(Number.isFinite))return null;const x=xCm/1000,y=yCm/1000;const px=Number(c.matrix_m11)*x+Number(c.matrix_m12)*y+Number(c.matrix_m13),py=Number(c.matrix_m21)*x+Number(c.matrix_m22)*y+Number(c.matrix_m23);return [px,py].every(Number.isFinite)?ll(px,py):null;}
  const text=(value:unknown)=>{const span=document.createElement('span');span.textContent=String(value??'');return span;};
  function toggle(id:number){enabled=enabled.includes(id)?enabled.filter(k=>k!==id):[...enabled,id];}
  $effect(()=>{const ids=enabled,m=map;if(m)untrack(()=>{for(const [id,g]of groups){if(ids.includes(id))g.addTo(m);else g.remove();}});});
  $effect(()=>{const show=visible,m=map;if(show&&m)untrack(()=>m.invalidateSize());});
  $effect(()=>{
    const snapshot=$eraLive,m=map,currentTime=now,active=visible,bound=follow;
    if(!m||!active)return;
    untrack(()=>{
      const valid=snapshot && currentTime-snapshot.receivedAt<5000 && ['online','offline'].includes(snapshot.status);
      const people: {id:string;label:string;point:L.LatLngTuple;self:boolean}[]=[];
      const own=snapshot?.data?.player;
      if(valid&&snapshot?.status==='online'&&own?.location){const p=project(own.location.y,own.location.x);if(p)people.push({id:'self',label:own.name||'Bạn',point:p,self:true});}
      if(valid)for(const f of snapshot?.data?.mapFriends??[]){const p=project(f.xCm,f.yCm);if(p)people.push({id:f.steamId,label:`${f.name} · ${shortSpecies(f.class)} · G ${compactPercent(f.growthPercent)} · HP ${compactPercent(f.healthPercent)}`,point:p,self:false});}
      const ids=new Set(people.map(p=>p.id));for(const [id,marker]of markers)if(!ids.has(id)){marker.remove();markers.delete(id);}
      for(const p of people){let marker=markers.get(p.id);if(!marker){marker=L.circleMarker(p.point,{radius:p.self?7:5,color:'#fff',weight:2,fillColor:p.self?'#ffe600':'#5e6ad2',fillOpacity:1}).addTo(m);markers.set(p.id,marker);}marker.setLatLng(p.point);marker.unbindTooltip();marker.bindTooltip(text(p.label),{permanent:true,direction:'top'});if(p.self&&bound)m.panTo(p.point,{animate:false});}
    });
  });
  onMount(()=>{
    const timer=setInterval(()=>now=Date.now(),1000);
    void (async()=>{try{
      data=await invoke('era_atlas');if(!alive)return;
      const m=L.map(element,{crs:L.CRS.Simple,minZoom:-6,maxZoom:0,zoomSnap:1,attributionControl:true});
      const bounds:L.LatLngBoundsExpression=[[-16384,0],[0,16384]];
      m.fitBounds(bounds);m.setMaxBounds([[-18000,-1600],[1600,18000]]);
      L.tileLayer('https://raidatlas.app/uploads/games/theisle/maps/gateway/layers/surface/tiles/{z}/{x}/{y}.png',{tileSize:256,zoomOffset:6,minZoom:-6,maxZoom:0,noWrap:true,bounds,attribution:'RaidAtlas · ERA',keepBuffer:1}).on('tileerror',()=>error='Một số ô ảnh HD chưa tải được. Có thể chuyển về bản đồ đã lưu.').addTo(m);
      categories=data.categories.filter((c:any)=>c.is_active===1);
      for(const c of categories)groups.set(c.id,L.layerGroup());
      for(const item of [...data.markers,...data.texts]){const x=Number(item.x),y=Number(item.y),g=groups.get(item.category_id);if(!g||![x,y].every(Number.isFinite)||item.is_active===0)continue;L.circleMarker(ll(x,y),{radius:3,weight:1,color:'#202632',fillColor:'#78bf86',fillOpacity:.9}).bindTooltip(text(item.name||item.text)).addTo(g);}
      for(const zone of data.zones){const g=groups.get(zone.category_id);if(!g||zone.is_active===0)continue;try{const points=JSON.parse(zone.points_json).filter((p:any)=>[Number(p.x),Number(p.y)].every(Number.isFinite)).map((p:any)=>ll(Number(p.x),Number(p.y)));if(points.length<2)continue;const style={color:/^#[a-f\d]{6}$/i.test(zone.stroke_color)?zone.stroke_color:'#5e6ad2',weight:2,fillOpacity:.12};(zone.shape_type==='line'?L.polyline(points,style):L.polygon(points,style)).bindTooltip(text(zone.name)).addTo(g);}catch{}}
      m.on('dragstart',()=>follow=false);map=m;
    }catch(e){error=String(e);}finally{loading=false;}})();
    return()=>{alive=false;clearInterval(timer);map?.remove();map=null;};
  });
</script>
<div class="atlas"><div class="canvas" bind:this={element}></div><aside><strong>Gateway HD · 16K</strong><p>Điểm thú và vùng là dữ liệu tĩnh.</p><button onclick={()=>{follow=true;}}>Bám vị trí tôi</button><button onclick={()=>{follow=false;map?.fitBounds([[-16384,0],[0,16384]]);}}>Toàn bản đồ</button>{#each categories as c}<label><input type="checkbox" checked={enabled.includes(c.id)} onchange={()=>toggle(c.id)}/>{categoryNames[c.name]||c.name}</label>{/each}{#if loading}<p>Đang tải Atlas…</p>{/if}{#if error}<p role="alert">{error}</p>{/if}</aside></div>
<style>.atlas{position:relative;height:100%;min-height:200px}.canvas{position:absolute;inset:0}aside{position:absolute;right:12px;top:12px;z-index:500;width:220px;padding:14px;background:var(--color-panel);border:1px solid var(--color-border);border-radius:12px;font-size:13px}label{display:flex;gap:8px;margin-top:12px}p{color:var(--color-muted);margin:10px 0}button{border:1px solid var(--color-border);border-radius:8px;padding:7px;margin:4px 0;min-height:32px}</style>
