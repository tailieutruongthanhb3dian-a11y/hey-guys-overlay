<script lang="ts">
  import { onMount } from "svelte";
  import { eraLive } from "$lib/era-live";
  let now = $state(Date.now());
  const fresh = $derived($eraLive?.status === "online" && now - ($eraLive.receivedAt || 0) < 5000);
  const prime = $derived($eraLive?.data?.player?.prime);
  const available = $derived(fresh && prime?.available === true);
  const total = $derived(typeof prime?.total === "number" && Number.isInteger(prime.total) && prime.total > 0 && prime.total <= 100 ? prime.total : 10);
  const completed = $derived(available && typeof prime?.completed === "number" && Number.isInteger(prime.completed) && prime.completed >= 0 && prime.completed <= total ? prime.completed : null);
  const eligible = $derived(available && prime?.eligible === true);
  const rows = $derived(Array.from({ length: total }, (_, index) => {
    const condition = available && Array.isArray(prime?.conditions) ? prime.conditions.find(c => c?.id === index + 1 || c?.id === String(index + 1)) : undefined;
    return { id: index + 1, name: typeof condition?.name === "string" && condition.name.trim() ? condition.name : `Điều kiện C${index + 1}`, done: typeof condition?.complete === "boolean" ? condition.complete : null };
  }));
  onMount(() => { const timer = setInterval(() => now = Date.now(), 1000); return () => clearInterval(timer); });
</script>
<section class="prime-tracker" aria-label="Theo dõi nhiệm vụ Prime">
  <div class="prime-heading"><div><h2>Nhiệm vụ Prime</h2><p>{eligible ? "Prime Elder · Máy chủ xác nhận đủ điều kiện" : "Tự động theo dõi theo nhân vật hiện tại"}</p></div><strong class:eligible>{completed ?? "—"} / {total}</strong></div>
  {#if completed !== null}<progress max={total} value={completed} aria-label="Tiến độ nhiệm vụ Prime"></progress>{/if}
  {#if !available}<p class="prime-note" role="status">{!fresh ? "Chờ dữ liệu mới từ nhân vật đang online. Tiến độ cũ không được coi là hiện tại." : prime?.message || "Máy chủ chưa cung cấp trạng thái nhiệm vụ Prime."}</p>{/if}
  <div class="prime-list">{#each rows as row (row.id)}<div class="prime-row" class:done={row.done === true}><span class="prime-mark" aria-label={row.done === true ? "Hoàn thành" : row.done === false ? "Chưa hoàn thành" : "Chưa có dữ liệu"}>{row.done === true ? "✓" : row.done === false ? "○" : "—"}</span><span>{row.name}</span><small>C{row.id}</small></div>{/each}</div>
  <p class="prime-note">Checklist do ERA xác nhận, không cần tự đánh dấu. Hoàn thành checklist chưa thay thế xác nhận Prime Elder của máy chủ.</p>
</section>
<style>.prime-tracker{margin-top:28px;padding:20px;border:1px solid var(--color-border);border-radius:12px}.prime-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}.prime-heading h2{font-size:20px;font-weight:600}.prime-heading p,.prime-note{font-size:12px;color:var(--color-muted);line-height:1.6;margin-top:8px}.prime-heading strong{font-size:26px;white-space:nowrap}.eligible,.prime-row.done .prime-mark{color:var(--color-success)}progress{display:block;width:100%;height:8px;margin:16px 0;accent-color:var(--color-success)}.prime-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:16px 0}.prime-row{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid var(--color-border);border-radius:8px;font-size:13px}.prime-row small{margin-left:auto;color:var(--color-muted)}.prime-mark{width:18px;flex-shrink:0}.prime-row.done{background:#55d98b08}@media(max-width:680px){.prime-list{grid-template-columns:1fr}}</style>
