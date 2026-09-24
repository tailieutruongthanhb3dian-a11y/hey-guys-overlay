// Chỉ chạy rAF trong lúc zoom; lưu thiết lập một lần sau khi thao tác kết thúc.
export function minimapZoom(read: () => number, write: (radius: number) => void, save: (radius: number) => void) {
  let frame = 0, target = read(), previous = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const clamp = (n: number) => Math.max(100, Math.min(3000, n));
  function step(now: number) {
    const dt = Math.min(50, previous ? now - previous : 16.67); previous = now;
    const current = read();
    const next = current + (target - current) * (1 - Math.exp(-dt / 65));
    write(Math.abs(target - next) < .5 ? target : next);
    if (Math.abs(target - read()) >= .5) frame = requestAnimationFrame(step);
    else { frame = 0; previous = 0; }
  }
  return {
    sync(radius: number) {
      if (!Number.isFinite(radius)) return;
      cancelAnimationFrame(frame); clearTimeout(timer);
      frame = 0; previous = 0; timer = undefined;
      target = clamp(radius); write(target);
    },
    change(delta: number) {
      if (!Number.isFinite(delta)) return;
      if (!frame) target = read();
      target = clamp(target * Math.exp(Math.max(-1, Math.min(1, delta))));
      if (!frame) frame = requestAnimationFrame(step);
      clearTimeout(timer); timer = setTimeout(() => save(Math.round(target)), 350);
    },
    dispose() { cancelAnimationFrame(frame); clearTimeout(timer); frame = 0; previous = 0; timer = undefined; },
  };
}
