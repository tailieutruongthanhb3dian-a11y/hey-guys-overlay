<script lang="ts">
  import { onMount } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { eraSuicideStatus, eraSelfSuicide } from "$lib/era";
  import { eraLive } from "$lib/era-live";
  let available = $state(false), checking = false, sending = $state(false), now = $state(Date.now());
  let cooldownUntil = $state(0), message = $state("Đang kiểm tra quyền tự sát từ ERA…"), error = $state(false);
  const fresh = $derived($eraLive?.status === "online" && now - ($eraLive.receivedAt || 0) < 5000);
  const remaining = $derived(Math.max(0, Math.ceil((cooldownUntil - now) / 1000)));
  async function refresh() {
    if (checking || sending || Date.now() < cooldownUntil) return;
    checking = true;
    try {
      const data = await eraSuicideStatus();
      const age = data.identityAgeSeconds === undefined || data.identityAgeSeconds === null ? NaN : Number(data.identityAgeSeconds);
      available = data.available === true && data.identityReady === true && (data.identitySource === "player-cache" || Number.isFinite(age) && age >= -1 && age <= 3);
      if (!error) message = available ? "Chỉ tác động đến nhân vật của tài khoản Steam đang kết nối." : "ERA chưa sẵn sàng hoặc chưa đồng bộ nhân vật hiện tại.";
    } catch { available = false; if (!error) message = "Chưa kiểm tra được trạng thái tự sát. Kết nối Steam ERA rồi thử lại."; }
    finally { checking = false; }
  }
  async function execute() {
    if (sending || !available || !fresh || remaining) return;
    sending = true;
    try {
      const confirmed = await ask("Nhân vật hiện tại sẽ chết và mất tiến trình. Bạn có chắc muốn tự sát nhân vật này?", { title: "Tự sát nhân vật trong game", kind: "warning" });
      if (!confirmed) return;
      error = false; cooldownUntil = Date.now() + 10000; message = "Đang xác nhận nhân vật và gửi yêu cầu…";
      await eraSelfSuicide();
      message = "ERA đã nhận yêu cầu tự sát. Chờ game cập nhật trạng thái.";
    } catch(e) { error = true; message = `${String(e).replace(/^Error: /, "")} Không tự gửi lại; kiểm tra trạng thái trong game trước.`; }
    finally { sending = false; }
  }
  onMount(() => {
    void refresh();
    const clock = setInterval(() => now = Date.now(), 1000);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => { clearInterval(clock); clearInterval(timer); };
  });
</script>
<div class="suicide-control">
  <button class="suicide" disabled={!available || !fresh || sending || remaining > 0} onclick={() => void execute()}>{sending ? "Đang xử lý…" : remaining ? `Chờ ${remaining}s` : "☠ Tự sát nhân vật"}</button>
  <span role={error ? "alert" : "status"}>{message}</span>
  {#if !available}<button class="refresh" disabled={sending} onclick={() => { error = false; void refresh(); }}>Kiểm tra lại</button>{/if}
</div>
<style>.suicide-control{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-top:24px;padding-top:20px;border-top:1px solid var(--color-border)}button{min-height:36px;padding:8px 14px;border-radius:8px;cursor:pointer}.suicide{border:1px solid #a64956;color:#ff9ca6;background:#421c252e}.suicide:disabled{opacity:.45;cursor:not-allowed}.refresh{border:1px solid var(--color-border);font-size:12px}span{font-size:12px;color:var(--color-muted);max-width:680px}span[role=alert]{color:#ff9ca6}</style>
