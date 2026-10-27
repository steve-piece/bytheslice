// Dev-only data switch: ?data=demo|worst|empty|one|many swaps fixtures at the data boundary. Ignored outside local development.
export const DATA_STATES = ["demo", "worst", "empty", "one", "many"];

export function readDataState(search = location.search) {
  const dev = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (!dev) return "demo";
  const value = new URLSearchParams(search).get("data");
  return DATA_STATES.includes(value) ? value : "demo";
}
