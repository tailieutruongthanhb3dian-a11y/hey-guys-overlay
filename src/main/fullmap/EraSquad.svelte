<script lang="ts">
  import { onMount, untrack } from "svelte";
  import L from "leaflet";
  import { eraLive, type EraMapFriend } from "$lib/era-live";
  import { normalizeSearch } from "$lib/search";
  import { addWaypointAtPixel, patchSettings, type PositionUpdate } from "$lib/api";
  import { shortSpecies, compactPercent } from "$lib/tactical";
  let { map, visible, source, position, pauseFollow, onself } = $props<{ map: L.Map; visible: boolean; source: string; position: PositionUpdate | null; pauseFollow: () => void; onself: () => void }>();
  let now = $state(Date.now()), query = $state(""), target = $state<string | null>(null), expanded = $state(true), labels = $state(true), show = $state(true), busy = $state(false), message = $state("");
  const markers = new Map<string,L.CircleMarker>();
  const labelKeys = new Map<string,string>();
  const fresh = $derived(!!$eraLive && ["online","offline"].includes($eraLive.status) && now - $eraLive.receivedAt < 5000 && $eraLive.data?.mapSource === source);
  const friends = $derived(fresh ? ($eraLive?.data?.mapFriends ?? []).filter(f => typeof f.steamId === "string" && [f.px,f.py,f.xCm,f.yCm].every(Number.isFinite)) : []);
  const self = $derived($eraLive?.status === "online" ? $eraLive.data?.player?.location : null);
  function distance(f: EraMapFriend) { return self && Number.isFinite(self.x) && Number.isFinite(self.y) ? Math.hypot(f.xCm-self.y,f.yCm-self.x)/100 : Infinity; }
  const filtered = $derived([...friends].filter(f => normalizeSearch(f.name ?? "").includes(normalizeSearch(query))).sort((a,b) => distance(a)-distance(b) || (a.name ?? "").localeCompare(b.name ?? "")));
  function focus(f: EraMapFriend) { pauseFollow(); target = target === f.steamId ? null : f.steamId; if (target) map.panTo([-f.py,f.px], {animate:false}); }
  function all() { target = null; pauseFollow(); const points: L.LatLngTuple[] = friends.map(f => [-f.py,f.px]); if (position && self) points.push([-position.py,position.px]); if(points.length) map.fitBounds(L.latLngBounds(points),{padding:[50,50],maxZoom:0,animate:false}); }
  async function guide(f: EraMapFriend) { try { await patchSettings({minimap:{era_target:f.steamId,destination:null}});message="Dẫn tới " + f.name + " trên minimap."; } catch(e) {message=String(e);} }
  async function pin(f: EraMapFriend) { if(busy || !fresh) return; busy=true; try { await addWaypointAtPixel(f.px,f.py,`Hẹn · ${f.name}`); message="Đã lưu điểm hẹn tại vị trí hiện tại của đồng đội."; } catch(e) { message=String(e); } finally {busy=false;} }
  $effect(() => {
    const list = friends, names = labels, display = show, active = visible, selected = target;
    untrack(() => {
      const keep = new Set(active && display ? list.map(f=>f.steamId) : []);
      for (const [id,marker] of markers) if (!keep.has(id)) {marker.remove(); markers.delete(id); labelKeys.delete(id);}
      if(!active) return;
      for(const f of display ? list : []) {
        let marker = markers.get(f.steamId);
        if(!marker) { marker=L.circleMarker([-f.py,f.px],{radius:7,color:"#fff",weight:2,fillColor:"#5e6ad2",fillOpacity:1}).addTo(map); markers.set(f.steamId,marker); marker.on("click",()=>{const current=friends.find(p=>p.steamId===f.steamId);if(current)focus(current);}); }
        const previous = marker.getLatLng();
        if (previous.lat !== -f.py || previous.lng !== f.px) marker.setLatLng([-f.py,f.px]);
        // Giữ nhãn DOM khi tên, chỉ số và chế độ hiển thị chưa đổi.
        const labelKey = JSON.stringify([f.name,f.class,f.growthPercent,f.healthPercent,names]);
        if (labelKeys.get(f.steamId) !== labelKey) {
        const label=document.createElement("div");
        const title=document.createElement("strong");title.textContent=f.name || "Đồng đội";title.style.cssText="display:block;max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const stats=document.createElement("span");stats.textContent=`${shortSpecies(f.class)} · G ${compactPercent(f.growthPercent)} · HP ${compactPercent(f.healthPercent)}`;stats.style.cssText="display:block;font-size:10px;white-space:nowrap";
        label.title=`${f.name || "Đồng đội"} · ${f.class || "Chưa rõ loài"}\nPhát triển: ${compactPercent(f.growthPercent)} · Máu: ${compactPercent(f.healthPercent)}\n—: ERA chưa cung cấp chỉ số`;
        label.append(title,stats);
        marker.unbindTooltip();marker.bindTooltip(label,{permanent:names,direction:"top"});
        labelKeys.set(f.steamId,labelKey);
        }
        const radius = selected === f.steamId ? 10 : 7;
        if (marker.getRadius() !== radius) marker.setRadius(radius);
      }
      const tracked = list.find(f=>f.steamId===selected);
      if(tracked) {
        const point = L.latLng(-tracked.py,tracked.px);
        if (!map.getContainer().dataset.wheelZooming && !map.getCenter().equals(point, 0.01)) map.panTo(point,{animate:true,duration:0.25});
      }
      else if(selected) target=null;
    });
  });
  onMount(()=>{const timer=setInterval(()=>now=Date.now(),1000); const stop=()=>target=null;map.on("dragstart",stop);map.on("era:follow-self",stop);return()=>{clearInterval(timer);map.off("dragstart",stop);map.off("era:follow-self",stop);for(const m of markers.values())m.remove();};});
</script>
<aside class="squad" aria-label="Đồng đội ERA">
  {#if $eraLive?.status === "login"}<p>Chưa đăng nhập ERA. Mở tab ERA &amp; Bạn bè để kết nối Steam.</p>
  {:else if $eraLive?.status === "error"}<p role="status">ERA chưa trả được vị trí: {$eraLive.error || "Lỗi kết nối"}. App đang tự thử lại.</p>
  {:else if $eraLive?.status === "offline"}<p>ERA báo dino của bạn offline. Kiểm tra đúng tài khoản Steam và server ERA đang chơi.</p>{/if}
  <div class="head"><strong>Đồng đội ERA · {friends.length}</strong><button aria-expanded={expanded} onclick={()=>expanded=!expanded}>{expanded?"Thu gọn":"Mở rộng"}</button></div>
  {#if expanded}
    <div class="tools"><button disabled={!position || !self || !fresh} onclick={()=>{target=null;onself();}}>Về tôi</button><button disabled={!friends.length} onclick={all}>Xem cả nhóm</button></div>
    <input aria-label="Tìm đồng đội trên bản đồ" placeholder="Tìm tên đồng đội…" bind:value={query} />
    <div class="options"><label><input type="checkbox" bind:checked={show}/>Hiện vị trí</label><label><input type="checkbox" bind:checked={labels}/>Hiện tên</label></div>
    <div class="people">{#each filtered as friend (friend.steamId)}<div class="person"><div><strong>{friend.name || "Đồng đội"}</strong><small>{friend.class || ""} · {Number.isFinite(distance(friend)) ? `${Math.round(distance(friend))} m` : "Chưa có khoảng cách"}</small></div><div class="tools"><button aria-pressed={target===friend.steamId} onclick={()=>focus(friend)}>{target===friend.steamId?"Dừng bám":"Bám theo"}</button><button onclick={()=>void guide(friend)}>Dẫn tới</button><button disabled={busy} onclick={()=>void pin(friend)}>Điểm hẹn</button></div></div>{/each}</div>
    {#if !friends.length}<p>{fresh?"Chưa có đồng đội chia sẻ vị trí online.":"Đang chờ vị trí mới từ ERA."}</p>{:else if !filtered.length}<p>Không tìm thấy tên này.</p>{/if}
    {#if message}<p role="status">{message}</p>{/if}
  {/if}
</aside>
<style>.squad{position:absolute;z-index:500;top:60px;left:12px;width:280px;max-width:calc(100% - 24px);background:var(--color-panel);border:1px solid var(--color-border);border-radius:12px;padding:12px;font-size:13px;box-shadow:0 8px 24px #0005}.head,.tools,.options{display:flex;align-items:center;gap:8px}.head{justify-content:space-between}.tools,.options{margin-top:8px}button{min-height:32px;padding:5px 8px;border:1px solid var(--color-border);border-radius:8px;cursor:pointer}button:disabled{opacity:.4;cursor:default}button[aria-pressed=true]{color:var(--color-accent)}input:not([type=checkbox]){width:100%;padding:8px;margin-top:12px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg)}label{display:flex;gap:4px;align-items:center}.people{max-height:32vh;overflow:auto}.person{padding:12px 0;border-bottom:1px solid var(--color-border)}small{display:block;color:var(--color-muted)}p{margin-top:12px;color:var(--color-muted)}</style>
