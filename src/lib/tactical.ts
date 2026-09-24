export function shortSpecies(value?: string) {
  const name = (value ?? "").replace(/^BP_/, "").replace(/_C$/, "");
  const aliases: Record<string,string> = {tyrannosaurus:"Rex",tyrannosaurusrex:"Rex",omniraptor:"Omni",utahraptor:"Utah",carnotaurus:"Carno",ceratosaurus:"Cera",dilophosaurus:"Dilo",deinosuchus:"Deino",stegosaurus:"Stego",tenontosaurus:"Teno",pteranodon:"Ptera",gallimimus:"Galli",triceratops:"Trike"};
  return aliases[name.toLowerCase().replace(/[^a-z]/g, "")] ?? (name.slice(0,5) || "—");
}
export function compactPercent(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? `${Math.round(value)}%` : "—"; }
export function navigation(from: {xCm:number;yCm:number}, to: {xCm:number;yCm:number}) {
  const dx=to.xCm-from.xCm,dy=to.yCm-from.yCm;
  return {distanceM:Math.hypot(dx,dy)/100,bearingDeg:(Math.atan2(dy,-dx)*180/Math.PI+360)%360};
}
export const mapModes: Record<string,string[]> = {
  survival:["freshwater","water","saltlick","mudwallow","sanctuary","landmark"],
  squad:["water","landmark"],
  explore:["freshwater","water","saltlick","mudwallow","sanctuary","migration","food","animal","landmark","region"],
};
