import L from "leaflet";
import { frameBudget } from "../../lib/frame-budget";

// Phóng lớp đã vẽ bằng compositor; chỉ tính lại hình học/tile khi kết thúc thao tác.
export function smoothWheel(map: L.Map) {
  const container = map.getContainer();
  const pane = map.getPane("mapPane")!;
  let active = false, base = 0, current = 0, target = 0, last = 0, inputAt = 0;
  let point = L.point(0, 0), origin = L.point(0, 0), anchor = L.latLng(0, 0);
  let transform = "", transformOrigin = "", willChange = "";
  const clamp = (zoom: number) => Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom));
  function restore() {
    pane.style.transform = transform;
    pane.style.transformOrigin = transformOrigin;
    pane.style.willChange = willChange;
    delete container.dataset.wheelZooming;
  }
  function cancel() {
    frame.cancel();
    if (!active) return;
    active = false;
    restore();
  }
  function finish() {
    if (!active) return;
    const zoom = current;
    const center = map.unproject(map.project(anchor, zoom).subtract(point.subtract(map.getSize().divideBy(2))), zoom);
    cancel();
    map.setView(center, zoom, { animate: false });
  }
  const frame = frameBudget(() => {
    if (!active) return;
    const now = performance.now(), elapsed = Math.min(80, now - last);
    last = now;
    current += (target - current) * (1 - Math.exp(-elapsed / 55));
    const scale = 2 ** (current - base);
    pane.style.transform = `${transform} translate(${origin.x}px, ${origin.y}px) scale(${scale}) translate(${-origin.x}px, ${-origin.y}px)`;
    if (now - inputAt > 100 && Math.abs(target - current) < 0.002) {
      current = target;
      finish();
    } else frame();
  });
  function begin(delta: number, at: L.Point) {
    if (!active) {
      map.stop();
      base = current = target = map.getZoom();
      point = at;
      origin = map.containerPointToLayerPoint(point);
      anchor = map.containerPointToLatLng(point);
      transform = pane.style.transform;
      transformOrigin = pane.style.transformOrigin;
      willChange = pane.style.willChange;
      pane.style.transformOrigin = "0 0";
      pane.style.willChange = "transform";
      active = true;
      container.dataset.wheelZooming = "true";
      last = performance.now() - 16;
    }
    inputAt = performance.now();
    target = clamp(target + delta);
    frame();
  }
  function wheel(event: WheelEvent) {
    const el = event.target as HTMLElement;
    if (el.closest("button,input,select,textarea,.leaflet-control,.squad,.era-map-tools,aside")) return;
    event.preventDefault();
    event.stopPropagation();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
    if (Number.isFinite(pixels) && pixels !== 0) begin(Math.max(-0.75, Math.min(0.75, -pixels / 480)), map.mouseEventToContainerPoint(event));
  }
  function click(event: MouseEvent) {
    const el = (event.target as HTMLElement).closest(".leaflet-control-zoom-in,.leaflet-control-zoom-out");
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    begin(el.classList.contains("leaflet-control-zoom-in") ? 0.25 : -0.25, map.getSize().divideBy(2));
  }
  // Chốt đúng tỷ lệ đang nhìn thấy trước khi Leaflet bắt đầu kéo bằng chuột/chạm.
  const pointer = () => finish();
  container.addEventListener("wheel", wheel, { passive: false });
  container.addEventListener("click", click, true);
  container.addEventListener("pointerdown", pointer, true);
  map.on("movestart resize", cancel);
  return {
    cancel,
    destroy() {
      cancel();
      container.removeEventListener("wheel", wheel);
      container.removeEventListener("click", click, true);
      container.removeEventListener("pointerdown", pointer, true);
      map.off("movestart resize", cancel);
    },
  };
}
