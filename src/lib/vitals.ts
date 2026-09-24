export function exactVital(vitals: Record<string, unknown> | undefined, key: string, reference: unknown): string | null {
  const current=vitals?.[key], max=vitals?.[`max${key[0].toUpperCase()}${key.slice(1)}`];
  if(typeof current!=="number" || typeof max!=="number" || !Number.isFinite(current) || !Number.isFinite(max) || current<0 || max<=0 || current>max) return null;
  if(typeof reference==="number" && Number.isFinite(reference) && Math.abs(current/max*100-reference)>5) return null;
  const fmt=(n:number)=>Number(n.toFixed(3)).toLocaleString("vi-VN");
  return `${fmt(current)} / ${fmt(max)}`;
}
