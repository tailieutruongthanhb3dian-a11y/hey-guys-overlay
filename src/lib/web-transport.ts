// Trình duyệt gọi cầu nối loopback; cookie Steam luôn ở WebView2 của ứng dụng.
const BASE = "http://127.0.0.1:17864";
import { rpcTimeout, reconnectDelay } from "./connection-policy";
const globals = window as any;
export const isBrowser = !globals.__TAURI_INTERNALS__;
let token = "";
const callbacks = new Map<number, (value: any) => void>();
const subscriptions = new Map<number, { event: string; handler: number }>();
const assets = new Map<string, Promise<string>>();
let nextId = 1, cursor = 0;
class RpcError extends Error { constructor(message: string, public status: number) { super(message); } }

async function rpc(command: string, args: unknown = {}) {
  const response = await fetch(`${BASE}/rpc`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ command, args }), signal: AbortSignal.timeout(rpcTimeout(command)) });
  const body = await response.json();
  if (!response.ok || body.error) throw new RpcError(body.error || `HTTP ${response.status}`, response.status);
  return body.result;
}

async function localAsset(url: string): Promise<string> {
  if (!url.startsWith(`${BASE}/asset/`)) return url;
  let promise = assets.get(url);
  if (!promise) {
    promise = fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) }).then(async r => {
      if (!r.ok) throw new Error(`Asset HTTP ${r.status}`);
      return URL.createObjectURL(await r.blob());
    });
    assets.set(url, promise);
    void promise.catch(() => assets.delete(url));
  }
  return promise;
}

async function invoke(command: string, args: any = {}) {
  if (command === "plugin:event|listen") { const id = nextId++; subscriptions.set(id, { event: args.event, handler: args.handler }); return id; }
  if (command === "plugin:event|unlisten") { subscriptions.delete(args.eventId); return; }
  if (command === "plugin:dialog|ask" || command === "plugin:dialog|confirm") return window.confirm(args.message);
  if (command === "plugin:dialog|message") {
    const buttons = args.buttons;
    if (buttons === "YesNo") return window.confirm(args.message) ? "Yes" : "No";
    if (buttons === "OkCancel") return window.confirm(args.message) ? "Ok" : "Cancel";
    if (buttons?.OkCancelCustom) return buttons.OkCancelCustom[window.confirm(args.message) ? 0 : 1];
    if (buttons === "YesNoCancel" || buttons?.YesNoCancelCustom) throw new Error("Hộp thoại ba lựa chọn cần mở trong ứng dụng Windows.");
    window.alert(args.message); return buttons?.OkCustom || "Ok";
  }
  if (command === "plugin:updater|check") return null;
  if (command.startsWith("plugin:log|") || ["track_feature", "submit_crash"].includes(command)) return;
  if (command === "plugin:opener|open_url") {
    const url = new URL(args.url);
    if (url.protocol !== "https:") throw new Error("Chỉ mở liên kết HTTPS.");
    window.open(url.href, "_blank", "noopener,noreferrer"); return;
  }
  if (command.startsWith("plugin:window|")) {
    if (command.endsWith("|is_focused")) return document.hasFocus();
    throw new Error("Thao tác cửa sổ này chỉ có trong ứng dụng Windows.");
  }
  const value = await rpc(command, args);
  if (command === "islepilot_cdn_asset") return localAsset(value);
  if (command === "get_basemap_paths") { value.minimap = await localAsset(value.minimap); value.fullmap = await localAsset(value.fullmap); }
  if (command === "get_map_info") await Promise.all(value.overlays.map(async (o: any) => { o.path = await localAsset(o.path); }));
  return value;
}

function emit(event: string, payload: unknown) {
  for (const [id, sub] of subscriptions) if (sub.event === event) {
    try { callbacks.get(sub.handler)?.({ event, id, payload }); }
    catch { console.error("Web event handler failed", event); }
  }
}

let eventFailures = 0, pollBusy = false, stopped = false;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
async function pollEvents() {
  if (pollBusy || stopped) return;
  clearTimeout(pollTimer); pollBusy = true;
  let delay = 500;
  try {
    const events = await rpc("web_events", { after: cursor });
    if (!Array.isArray(events)) throw new Error("Invalid event response");
    for (const item of events) { cursor = Math.max(cursor, item.id); emit(item.event, item.payload); }
    if (eventFailures) {
      // Đọc lại trạng thái hiện tại, kể cả khi hàng đợi đã bỏ các sự kiện cũ.
      const [settings, live] = await Promise.all([rpc("get_settings"), rpc("era_live_state")]);
      emit("settings://changed", settings);
      if (live) emit("era://live", live);
      emit("waypoints://changed", null);
    }
    eventFailures = 0;
    document.querySelector("#web-disconnected")?.remove();
  } catch (error) {
    const authFailed = error instanceof RpcError && (error.status === 401 || error.status === 403);
    delay = reconnectDelay(++eventFailures, authFailed);
    emit("era://live", { status: "error", receivedAt: 0, error: "Cầu nối Windows mất kết nối" });
    if (!document.querySelector("#web-disconnected")) {
      const banner = document.createElement("div"); banner.id = "web-disconnected";
      banner.style.cssText = "position:fixed;bottom:35px;left:16px;right:16px;z-index:10000;padding:16px;background:#381e26;border:1px solid #e68c9c;border-radius:8px";
      document.body.append(banner);
    }
    document.querySelector("#web-disconnected")!.textContent = authFailed
      ? "Phiên ghép đôi đã hết hiệu lực. Trong ứng dụng Windows, bấm Mở bản web để ghép đôi lại."
      : `Tạm mất kết nối ứng dụng Windows. Tự thử lại sau ${delay / 1000} giây; giữ ứng dụng đang chạy.`;
  } finally { pollBusy = false; if (!stopped) pollTimer = setTimeout(() => void pollEvents(), delay); }
}

export async function prepareWeb(): Promise<void> {
  if (!isBrowser) return;
  const hash = new URLSearchParams(location.hash.slice(1));
  token = hash.get("connect") || sessionStorage.getItem("heyguys-pair") || "";
  if (hash.has("connect")) history.replaceState(null, "", location.pathname + "#era");
  const root = document.querySelector("#app")!;
  root.innerHTML = `<main class="web-connect"><img src="${new URL('../assets/hey-guys-logo.svg', import.meta.url).href}" alt=""><p>HEY GUYS OVERLAY · WEB</p><h1>Cùng ứng dụng.<br>Cùng cuộc chơi.</h1><p>Mở Hey Guys Overlay trên máy Windows, bấm <strong>Mở bản web</strong> để kết nối bản đồ, bạn bè, Garage, Skin Studio và chỉ số khủng long.</p><p><a href="/downloads/Hey-Guys-Overlay.zip" style="color:var(--color-accent)">Tải ứng dụng Windows có cầu nối web ↓</a></p><form><label for="pair-code">Hoặc dán mã ghép đôi từ ứng dụng</label><div><input id="pair-code" autocomplete="off" spellcheck="false" placeholder="Mã ghép đôi" type="password" required><button>Kết nối</button></div></form><p role="status"></p><small>Giữ ứng dụng chạy trên cùng máy. Trình duyệt có thể yêu cầu quyền truy cập mạng cục bộ. Phiên Steam không được tải lên Cloudflare.</small></main>`;
  const status = root.querySelector('[role="status"]')!;
  await new Promise<void>(resolve => {
    let busy = false;
    async function connect(code: string) {
      if (busy) return; busy = true;
      const button = root.querySelector("button")! as HTMLButtonElement; button.disabled = true;
      token = code.trim(); status.textContent = "Đang kết nối ứng dụng…";
      try {
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Dán mã ghép đôi từ nút Mở bản web trong ứng dụng mới.");
        await rpc("get_settings"); sessionStorage.setItem("heyguys-pair", token); resolve();
      } catch (e) { status.textContent = e instanceof TypeError ? "Chưa kết nối được. Hãy mở ứng dụng mới, kiểm tra quyền mạng cục bộ và thử lại." : String(e).replace(/^Error: /, ""); }
      finally { busy = false; button.disabled = false; }
    }
    root.querySelector("form")!.addEventListener("submit", e => { e.preventDefault(); void connect((root.querySelector("input") as HTMLInputElement).value); });
    if (token) void connect(token);
  });
  globals.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener(_event: string, id: number) { subscriptions.delete(id); } };
  globals.__TAURI_INTERNALS__ = {
    invoke, convertFileSrc: (path: string) => path,
    metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
    transformCallback(fn: (v: any) => void, once = false) { const id = nextId++; callbacks.set(id, value => { if (once) callbacks.delete(id); fn(value); }); return id; },
    unregisterCallback(id: number) { callbacks.delete(id); },
  };
  root.replaceChildren();
  window.addEventListener("online", () => void pollEvents());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void pollEvents(); });
  window.addEventListener("pagehide", () => { stopped = true; clearTimeout(pollTimer); });
  window.addEventListener("pageshow", () => { if (stopped) { stopped = false; void pollEvents(); } });
  void pollEvents();
}
