<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { eraGarageGet, eraGarageAction, eraOpen, eraFinishLogin, type EraGarageData, type EraSlot } from "$lib/era";
  let { visible = true } = $props<{ visible?: boolean }>();
  let data = $state<EraGarageData | null>(null);
  let loading = $state(false), busy = $state(false), login = $state(false), connecting = $state(false), stale = $state(true);
  let error = $state(""), notice = $state("");
  let alive = true, deadline = 0, loadedAt = 0;
  async function refresh() {
    if (loading || busy || !alive) return;
    loading = true;
    try {
      const result = await eraGarageGet();
      if (!Array.isArray(result.data.slots) || !Number.isInteger(result.data.slotCount) || result.data.slotCount < 1) throw new Error("ERA trả về dữ liệu Garage không hợp lệ.");
      if (!alive) return;
      if (result.data.slotCount > 100) throw new Error("ERA trả về số ô không hợp lệ.");
      data = { ...result.data, slots: Array.from({ length: result.data.slotCount }, (_, i) => result.data.slots.find(s => s.slot === i + 1) ?? { slot: i + 1, stored: false }) }; stale = false; login = false; error = "";
      if (connecting) void eraFinishLogin().catch(() => {});
      connecting = false;
      loadedAt = Date.now();
    } catch (e) {
      stale = true;
      login = String(e).includes("ERA_LOGIN_REQUIRED");
      error = login ? "" : String(e).includes("ERA_NETWORK") ? "Chưa tải được Garage ERA. Kiểm tra mạng và thử lại." : String(e);
    } finally { loading = false; }
  }
  async function connect() {
    try { await eraOpen(true); connecting = true; deadline = Date.now() + 180000; }
    catch (e) { error = String(e); }
  }
  function blocked(slot: EraSlot) { return busy || loading || stale || !!data?.restoreInProgress || !!slot.restoreInProgress; }
  async function act(action: "park" | "restore" | "delete", slot: EraSlot) {
    if (blocked(slot)) return;
    busy = true;
    try {
      const message = action === "park" ? "Lưu dino hiện tại vào ô này và kết thúc dino đang chơi?" : action === "restore" ? "Nhận lại dino đã lưu? Bạn cần đang chơi đúng loài và giới tính theo yêu cầu ERA." : "Xóa vĩnh viễn dino trong ô này? Dino sẽ không được trả lại vào game.";
      if (!(await ask(message, { title: `ERA · Ô ${slot.slot}`, kind: "warning" }))) return;
      error = ""; notice = "Đang chờ ERA xử lý. Không gửi lại lệnh hoặc đóng ứng dụng.";
      await eraGarageAction(action, slot.slot, slot.storedDino?.stateHash);
      notice = "ERA đã xác nhận hoàn tất.";
    } catch (e) {
      stale = true; notice = "";
      error = `Chưa xác nhận được kết quả: ${String(e)}. Tải lại Garage trước khi thao tác tiếp.`;
    } finally { busy = false; }
    if (!stale) await refresh();
  }
  $effect(() => {
    if (visible) untrack(() => {
      if (!data || stale || Date.now() - loadedAt > 30000) void refresh();
    });
  });
  onMount(() => {
    const timer = setInterval(() => {
      if (connecting && Date.now() > deadline) { connecting = false; error = "Chưa hoàn tất đăng nhập. Bạn có thể kết nối lại."; }
      if (visible && !busy && connecting) void refresh();
    }, 5000);
    return () => { alive = false; clearInterval(timer); };
  });
</script>
<section class="garage">
  <header><div><h1>Garage ERA</h1><p>Dino đã lưu trên ERA Gaming VN · Dùng chung phiên Steam ERA</p></div><button disabled={loading || busy} onclick={() => void refresh()}>{loading ? "Đang tải…" : "Tải lại"}</button></header>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p role="status">{notice}</p>{/if}
  {#if login}<div class="card"><h2>Kết nối Steam với ERA</h2><p>Đăng nhập một lần để tải các ô Garage của bạn.</p><button disabled={connecting} onclick={() => void connect()}>{connecting ? "Đang chờ đăng nhập…" : "Kết nối Steam ERA"}</button></div>
  {:else if data}
    <p>{data.slotCount} ô · {data.isVip ? "VIP" : "Thường"} · {data.onlinePawn ? "Dino đang online" : "Vào server ERA để lưu hoặc nhận dino"}{stale ? " · Dữ liệu cần tải lại" : ""}</p>
    <div class="slots">{#each data.slots as slot (slot.slot)}
      <article class="card"><h2>Ô {slot.slot} <span>{slot.restoreInProgress ? "Đang nhận lại" : slot.stored && slot.parkCommitted === false ? "Đang hoàn tất lưu" : slot.stored ? "Đã lưu" : "Trống"}</span></h2>
        {#if slot.stored}<h3>{slot.storedDino?.species || "Dino đã lưu"}</h3><p>{slot.storedDino?.growthPercent ?? "—"}% · {slot.storedDino?.gender || "—"}</p><p>Prime: {slot.storedDino?.primeEligible ? "Đủ điều kiện" : "Chưa đủ điều kiện"}</p>{#if slot.storedDino?.mutations?.length}<p>{slot.storedDino.mutations.join(" · ")}</p>{/if}
        {:else}<p>Ô sẵn sàng để lưu dino hiện tại.</p>{/if}
        <div class="actions">{#if slot.stored}<button disabled={blocked(slot) || !data.onlinePawn || slot.parkCommitted === false} onclick={() => void act("restore", slot)}>Nhận lại dino</button><button class="delete" disabled={blocked(slot) || !/^[a-f\d]{64}$/i.test(slot.storedDino?.stateHash ?? "")} onclick={() => void act("delete", slot)}>Xóa</button>{:else}<button disabled={blocked(slot) || !data.onlinePawn} onclick={() => void act("park", slot)}>Lưu dino vào ô này</button>{/if}</div>
      </article>
    {/each}</div>
  {:else if loading}<p role="status">Đang tải thông tin Garage ERA…</p>{/if}
</section>
<style>
  .garage{max-width:1200px;margin:auto;padding:28px;font-size:14px}header{display:flex;justify-content:space-between;align-items:center;gap:16px}h1{font-size:28px;font-weight:600}h2{font-size:18px;font-weight:600}h3{font-size:20px;margin-top:20px}p{margin:12px 0;color:var(--color-muted)}.slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:20px}.card{padding:20px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-panel)}h2 span{float:right;font-size:12px;font-weight:400}.actions{display:flex;gap:8px;margin-top:20px}button{min-height:36px;padding:8px 12px;border:1px solid var(--color-border);border-radius:8px;cursor:pointer}button:disabled{opacity:.4;cursor:default}.error,.delete{color:var(--color-danger,#f87171)}
</style>
