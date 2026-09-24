// Nhãn ngắn theo C1–C10 trong client ERA; chỉ server quyết định hoàn thành.
export const primeLabels = ["Vào khu trú ẩn khi còn nhỏ", "Nở từ tổ của người chơi", "Đủ ba chất dinh dưỡng", "Tham gia đại di cư", "Qua hai vùng di cư", "Qua bốn vùng tuần tra", "Không bị vô sinh", "Không bị co giật cơ", "Nuôi con đến gần trưởng thành", "Điều kiện riêng của loài"];
export function primeHudRows(prime: unknown, fresh: boolean) {
  const p = prime as { available?: boolean; conditions?: { id?: number | string; complete?: boolean }[] } | undefined;
  return primeLabels.map((label, index) => {
    const condition = fresh && p?.available === true && Array.isArray(p.conditions) ? p.conditions.find(c => Number(c?.id) === index + 1) : undefined;
    return { text: `C${index + 1} · ${label}`, textVi: `C${index + 1} · ${label}`, completed: condition?.complete === true, unknown: typeof condition?.complete !== "boolean" };
  });
}
