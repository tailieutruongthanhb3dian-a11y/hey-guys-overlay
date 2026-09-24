// Lệnh thay đổi dữ liệu không được tự lặp lại khi hết thời gian chờ.
export function rpcTimeout(command: string): number {
  if (command === "web_events" || command === "era_live_state" || command === "get_settings") return 4000;
  if (command === "era_garage_action" || command.startsWith("islepilot_garage_") || command === "islepilot_cdn_asset") return 120000;
  if (command === "era_skin_apply") return 60000;
  return 30000;
}
export function reconnectDelay(failures: number, authenticationFailed = false): number {
  if (authenticationFailed) return 30000;
  return Math.min(10000, 1000 * 2 ** Math.max(0, Math.min(4, failures - 1)));
}
