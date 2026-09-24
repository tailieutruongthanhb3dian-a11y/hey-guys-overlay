// Gộp các yêu cầu vẽ, tối đa 60 lần/giây; không chạy vòng lặp khi không có thay đổi.
export function frameBudget(draw: () => void, fps = 60) {
  const interval = 1000 / fps;
  let frame = 0, timer: ReturnType<typeof setTimeout> | undefined;
  let previous = -Infinity;
  function request() {
    if (frame || timer !== undefined) return;
    // 60 Hz phải bám thẳng vào nhịp compositor. Thêm setTimeout trước rAF
    // có thể lỡ một v-sync và vô tình tụt về 30 Hz trên màn hình 60 Hz.
    if (fps >= 60) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        previous = performance.now();
        draw();
      });
      return;
    }
    const delay = Math.max(0, interval - (performance.now() - previous));
    timer = setTimeout(() => {
      timer = undefined;
      frame = requestAnimationFrame(() => {
        frame = 0;
        previous = performance.now();
        draw();
      });
    }, delay);
  }
  request.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    cancelAnimationFrame(frame);
    timer = undefined;
    frame = 0;
  };
  return request;
}
