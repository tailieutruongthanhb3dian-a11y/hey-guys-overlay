<script lang="ts">
  import { onMount } from "svelte";
  import { eraLive } from "$lib/era-live";
  import { getSettings, patchSettings, onSettingsChanged, listenerBag, listWaypoints, addWaypointHere, deleteWaypoint, onWaypointsChanged, type Waypoint } from "$lib/api";
  import { config, alerts, isFresh, nearestFriend, destination, direction, focusedPrime, vitalNames, startJourney, sampleJourney, routePath, restoreJourney, type Journey, type VitalKey } from "$lib/companion";
  let { visible = false } = $props<{visible?: boolean}>();
  let settings = $state<any>({}), now = $state(Date.now()), message = $state(""), busy = $state(false), points = $state<Waypoint[]>([]);
  let markName = $state("Điểm hẹn"), note = $state(""), active = $state<Journey | null>(null), history = $state<Journey[]>([]), recording = $state(false);
  const c = $derived(config(settings.companion));
  const fresh = $derived(isFresh($eraLive, now));
  const warnings = $derived(alerts($eraLive, c, now));
  const friend = $derived(nearestFriend($eraLive, now));
  const target = $derived(destination($eraLive, settings, now));
  const prime = $derived(focusedPrime($eraLive, {...c, primeFocus:true}, now));
  const storageKey = "heyGuys.journeys.v1";
  function persist() { try { localStorage.setItem(storageKey, JSON.stringify(history.slice(0,20))); } catch { message = "Không lưu được lịch sử. Bộ nhớ có thể đã đầy."; } }
  async function run(fn:()=>Promise<unknown>) { if(busy)return; busy=true; try { await fn(); } catch(e) {message=String(e);} finally {busy=false;} }
  async function save(patch:any) { settings=await patchSettings(patch); }
  async function option(key:string,value:unknown) { await run(()=>save({companion:{[key]:value}})); }
  async function refreshPoints() { try {const result=await listWaypoints();points=Array.isArray(result)?result:[];} catch(e){message=String(e);} }
  function finish() { if(active) {history=[active,...history].slice(0,20);persist();} active=null;recording=false;try{localStorage.removeItem(storageKey+".active");}catch{} }
  function tick() {
    now=Date.now();
    const live=$eraLive;
    if(!recording || !live || !isFresh(live,now))return;
    const p=live.data?.player;
    if(active && (active.name !== (p?.name || "Nhân vật") || active.species !== (p?.class || "Chưa rõ loài") || now-active.end>120000 || (typeof p?.growthPercent === "number" && active.growthEnd !== null && p.growthPercent<active.growthEnd-10))) {
      history=[active,...history].slice(0,20);persist();active=null;
    }
    if(!active)active=startJourney(live,live.receivedAt);
    active=sampleJourney(active,live,now);
  }
  async function mark() { await run(async()=>{if(!fresh)throw new Error("Chưa có vị trí mới để đánh dấu.");const wp=await addWaypointHere(`${markName}${note.trim()?" · "+note.trim().slice(0,60):""}`);if(!wp)throw new Error("Không có vị trí nhân vật.");message="Đã lưu điểm và thời gian đánh dấu.";await refreshPoints();}); }
  async function layout(name:string,store=false) { await run(async()=>{
    if(store){const keys=["size_px","opacity","desktop_x","desktop_y","free_position","corner","margin_px","show_trail","show_waypoints","radius_m"];const minimap=Object.fromEntries(keys.filter(k=>settings.minimap?.[k]!==undefined).map(k=>[k,settings.minimap[k]]));await save({companion:{layouts:{[name]:{minimap,dino_hud:settings.dino_hud??{}}}}});message="Đã lưu bố cục "+name;return;}
    const saved=settings.companion?.layouts?.[name];
    await save(saved ? {minimap:saved.minimap,dino_hud:saved.dino_hud,companion:{layout:name}} : {minimap:{opacity:name==="Tối giản"?.65:.85,show_trail:name==="Khám phá",size_px:name==="Tối giản"?200:280},dino_hud:{show_prime:name!=="Tối giản"},companion:{layout:name}});
  }); }
  function exportImage(j:Journey) {
    const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=620;
    const ctx=canvas.getContext("2d");if(!ctx)return;
    ctx.fillStyle="#0f1011";ctx.fillRect(0,0,1000,620);ctx.fillStyle="#f7f8f8";ctx.font="bold 30px Segoe UI";ctx.fillText("HEY GUYS · TỔNG KẾT PHIÊN",40,65);
    ctx.font="22px Segoe UI";[`${j.name} · ${j.species}`,`${new Date(j.start).toLocaleString("vi-VN")}`,`Đã ghi nhận ${Math.round(j.observedMs/60000)} phút · ${(j.distance/1000).toFixed(2)} km`,`Tăng trưởng: ${j.growthStart??"—"}% → ${j.growthEnd??"—"}% · Prime: ${j.primeStart??"—"} → ${j.primeEnd??"—"}`].forEach((line,i)=>ctx.fillText(line,40,110+i*38,920));
    ctx.save();ctx.translate(40,275);ctx.strokeStyle="#828fff";ctx.lineWidth=3;ctx.stroke(new Path2D(routePath(j.route,920,250)));ctx.restore();
    ctx.font="16px Segoe UI";ctx.fillStyle="#8a8f98";ctx.fillText("Quãng đường từ các mẫu vị trí nhận được; có thể thiếu khi mất kết nối.",40,585);
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`HeyGuys-${j.id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);});
  }
  onMount(()=>{
    const bag=listenerBag();let mounted=true;
    void getSettings().then(s=>{if(mounted)settings=s;}).catch(e=>message=String(e));void bag.add(onSettingsChanged(s=>settings=s)).catch(e=>message=String(e));void bag.add(onWaypointsChanged(()=>void refreshPoints())).catch(e=>message=String(e));void refreshPoints();
    try { const saved=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(saved))history=saved.slice(0,20).map(restoreJourney).filter((j):j is Journey=>j!==null); } catch { message="Lịch sử cũ không đọc được; có thể bắt đầu phiên mới."; }
    // Sau sự cố, phục hồi phần đã ghi thành một phiên kết thúc, không tự ghi tiếp.
    try { const j=restoreJourney(JSON.parse(localStorage.getItem(storageKey+".active")||"null"));if(j){history=[j,...history.filter(h=>h.id!==j.id)].slice(0,20);persist();}localStorage.removeItem(storageKey+".active"); } catch {}
    const checkpoint=()=>{try{if(active)localStorage.setItem(storageKey+".active",JSON.stringify(active));else localStorage.removeItem(storageKey+".active");}catch{message="Không lưu được bản phục hồi phiên.";}};
    const timer=setInterval(tick,1000),backup=setInterval(checkpoint,10000);window.addEventListener("pagehide",checkpoint);return()=>{mounted=false;checkpoint();clearInterval(timer);clearInterval(backup);window.removeEventListener("pagehide",checkpoint);bag.dispose();};
  });
</script>

<div class="companion" style:display={visible?null:"none"}>
  <header><p>HEY GUYS · TRỢ LÝ SINH TỒN</p><h1>Chuẩn bị tốt. Chơi chủ động.</h1><span>Cảnh báo, nhiệm vụ và hành trình trong một chỗ.</span></header>
  {#if message}<p role="status">{message}</p>{/if}
  <div class="grid">
    <section><h2>Kết nối</h2><strong>{fresh?"Đang nhận dữ liệu ERA":$eraLive?.status==="login"?"Cần đăng nhập ERA":"Đang chờ dữ liệu mới"}</strong><p>Độ trễ: {$eraLive?.latencyMs??"—"} ms · Tuổi dữ liệu: {$eraLive?.receivedAt?Math.max(0,Math.floor((now-$eraLive.receivedAt)/1000))+" giây":"—"}</p><p>Chu kỳ: {($eraLive?.intervalMs??2000)/1000} giây. Dữ liệu quá 5 giây sẽ không dùng để cảnh báo hoặc dẫn đường.</p></section>
    <section><h2>Cảnh báo sinh tồn</h2><label><input type="checkbox" checked={c.alerts} onchange={e=>void option("alerts",e.currentTarget.checked)}> Bật cảnh báo</label><label><input type="checkbox" checked={c.sound} onchange={e=>void option("sound",e.currentTarget.checked)}> Âm báo nhẹ trên HUD</label>
      <div class="thresholds">{#each Object.entries(vitalNames) as [key,label]}<label>{label} dưới (%)<input type="number" min="1" max="90" value={c.thresholds[key as VitalKey]} onchange={e=>void run(()=>save({companion:{thresholds:{[key]:Number(e.currentTarget.value)}}}))}></label>{/each}</div>
      <label>Nghỉ giữa hai âm báo (giây)<input type="number" min="15" max="600" value={c.cooldown} onchange={e=>void option("cooldown",Number(e.currentTarget.value))}></label><p>{warnings.join(" · ")|| (fresh?"Chỉ số chưa chạm ngưỡng cảnh báo.":"Chờ dữ liệu mới.")}</p>
    </section>
    <section><h2>Trợ lý Prime</h2><label><input type="checkbox" checked={c.primeFocus} onchange={e=>void option("primeFocus",e.currentTarget.checked)}> HUD chỉ hiện tối đa 3 việc còn lại</label>
      {#each prime as row}<p>{row.unknown?"—": "○"} {row.text}</p>{/each}<p>Ghim tối đa 3 điều kiện để ưu tiên:</p><div class="row">{#each Array.from({length:10},(_,i)=>i+1) as id}<button class:selected={c.pinned.includes(id)} disabled={busy||(!c.pinned.includes(id)&&c.pinned.length>=3)} onclick={()=>void option("pinned",c.pinned.includes(id)?c.pinned.filter(n=>n!==id):[...c.pinned,id])}>C{id}</button>{/each}</div><p>Chỉ server xác nhận hoàn thành. HUD tự đưa điều kiện còn lại lên trước.</p>
    </section>
    <section><h2>Điểm hẹn & dẫn đường</h2><div class="row"><select aria-label="Loại điểm" bind:value={markName}><option>Điểm hẹn</option><option>Thức ăn</option><option>Nguy hiểm</option><option>Nơi trú ẩn</option></select><input aria-label="Ghi chú điểm" maxlength="60" bind:value={note} placeholder="Ghi chú ngắn"><button disabled={busy||!fresh} onclick={()=>void mark()}>Lưu vị trí</button></div><p>Phím toàn cục: Ctrl+Alt+B — đánh dấu vị trí hiện tại.</p>
      <p>{target?`${direction(target.bearingDeg)} · ${Math.round(target.distanceM)} m → ${target.name}`:"Chọn điểm bên dưới để dẫn hướng trên HUD và minimap."}</p>
      {#each points.slice(-20).reverse() as point}<div class="row"><span>{point.name}<small>{point.created??""}</small></span><button disabled={busy} onclick={()=>void run(()=>save({minimap:{era_target:null,destination:{name:point.name,xCm:point.x,yCm:point.y}}}))}>Dẫn tới</button><button disabled={busy} onclick={()=>void run(async()=>{await deleteWaypoint(point.id);await refreshPoints();})}>Xóa</button></div>{/each}
      <button disabled={busy} onclick={()=>void run(()=>save({minimap:{destination:null,era_target:null}}))}>Dừng dẫn đường</button>
    </section>
    <section><h2>Giữ đội hình</h2><label>Cảnh báo khi cách người gần nhất (m)<input type="number" min="100" max="10000" value={c.squadDistance} onchange={e=>void option("squadDistance",Number(e.currentTarget.value))}></label><p>{friend?`${friend.distanceM>c.squadDistance?"Bạn đang xa đội · ":""}${friend.name} · ${Math.round(friend.distanceM)} m · ${direction(friend.bearingDeg)}`:"Chưa có vị trí đồng đội mới được chia sẻ."}</p>{#if friend}<button disabled={busy} onclick={()=>void run(()=>save({minimap:{era_target:friend!.steamId,destination:null}}))}>Dẫn tới đồng đội gần nhất</button>{/if}</section>
    <section><h2>Bố cục HUD</h2><label><input type="checkbox" checked={c.hud} onchange={e=>void option("hud",e.currentTarget.checked)}> Thanh cảnh báo và la bàn dưới HUD</label>{#each ["Khám phá","Đi cùng đội","Tối giản"] as name}<div class="row"><button disabled={busy} onclick={()=>void layout(name)}>{name}</button><button disabled={busy} onclick={()=>void layout(name,true)}>Lưu bố cục hiện tại</button></div>{/each}<p>Lưu kích thước, vị trí và độ trong suốt. Ctrl+Alt+L chuyển lần lượt các bố cục đã lưu.</p></section>
    <section class="wide"><h2>Nhật ký & tổng kết phiên</h2><div class="row"><button disabled={!fresh||recording} onclick={()=>{recording=true;tick();}}>Bắt đầu ghi phiên</button><button disabled={!recording} onclick={finish}>Kết thúc & lưu tổng kết</button><button onclick={()=>{if(confirm("Xóa toàn bộ lịch sử phiên đã lưu?")){history=[];persist();}}}>Xóa lịch sử</button></div><p>Chỉ ghi khi bạn bật. Giữ tối đa 20 phiên; tự tách phiên khi phát hiện đổi nhân vật hoặc gián đoạn trên 2 phút.</p>
      {#each [...(active?[active]:[]),...history] as j}<article><h3>{j===active?"Đang ghi · ":""}{j.name} · {j.species}</h3><p>{new Date(j.start).toLocaleString("vi-VN")} · {Math.round(j.observedMs/60000)} phút có dữ liệu · {(j.distance/1000).toFixed(2)} km</p><p>Tăng trưởng {j.growthStart??"—"}% → {j.growthEnd??"—"}% · Prime {j.primeStart??"—"} → {j.primeEnd??"—"}</p><svg viewBox="0 0 600 200" role="img" aria-label="Đường đi đã ghi nhận"><path d={routePath(j.route)} fill="none" stroke="currentColor" stroke-width="2"/></svg><p>{j.milestones.join(" · ")||"Chưa ghi nhận mốc mới."}</p><button onclick={()=>exportImage(j)}>Xuất ảnh tổng kết</button></article>{/each}
    </section>
  </div>
</div>
<style>
 .companion{padding:28px;max-width:1440px;margin:auto}header{margin-bottom:24px}header p{font-size:12px;letter-spacing:.1em;color:var(--color-muted)}h1{font-size:28px;font-weight:650;margin:8px 0}h2{font-size:18px;margin-bottom:12px}h3{font-size:16px}p,small,header span{color:var(--color-muted);font-size:13px;line-height:1.6}p{margin:8px 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}section{padding:20px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-panel);min-width:0}.wide{grid-column:1/-1}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0}.row span{flex:1;overflow-wrap:anywhere}small{display:block}button,input,select{border:1px solid var(--color-border);border-radius:6px;background:var(--color-panel);padding:8px;color:inherit;font-size:13px;max-width:100%}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}button.selected{background:#5e6ad2;color:white}label{display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px}input[type=number]{width:76px}.thresholds{display:grid;grid-template-columns:1fr 1fr;gap:8px}.thresholds label{flex-wrap:wrap}article{border-top:1px solid var(--color-border);padding-top:18px;margin-top:18px}svg{width:100%;max-height:220px;background:#0f1011;color:#828fff;border-radius:8px}@media(max-width:800px){.grid{grid-template-columns:1fr}.companion{padding:16px}}
</style>
