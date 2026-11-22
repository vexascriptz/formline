// Formline Daki connection check — deliberately read-only.
// No file upload, command execution, deployment or power operations.
const PANEL = "https://portal.daki.cc";
const SERVER = "ffe0e9f7";
const key = process.env.DAKI_API_KEY;
if (!key || key.length < 20) {
  console.error("DAKI_API_KEY secret is missing or unexpectedly short.");
  process.exitCode = 1;
} else {
  const headers = {
    Authorization: "Bearer " + key,
    Accept: "Application/vnd.pterodactyl.v1+json",
    "User-Agent": "Formline-Daki-ReadOnly-Check/1.0"
  };
  const safe = (x) => String(x ?? "").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 90);
  async function get(path) {
    const url = new URL(path, PANEL);
    if (url.origin !== PANEL) throw new Error("Refusing unexpected API host.");
    const res = await fetch(url, {
      method: "GET", headers, redirect: "error",
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("HTTP 401: API key invalid or not accepted.");
      if (res.status === 403) throw new Error("HTTP 403: API key lacks access.");
      if (res.status === 404) throw new Error("HTTP 404: Server ID or API route not found.");
      throw new Error("Daki returned HTTP " + res.status + ".");
    }
    const data = await res.json();
    if (!data || typeof data !== "object") throw new Error("Unexpected Daki API response.");
    return data;
  }
  try {
    const details = (await get("/api/client/servers/" + SERVER)).attributes;
    if (!details || details.identifier !== SERVER) {
      throw new Error("API response did not match Formline's configured server ID.");
    }
    console.log("Daki API connection: SUCCESS");
    console.log("Server:", safe(details.name));
    console.log("Server identifier:", safe(details.identifier));
    console.log("Limits: RAM", Number(details.limits?.memory ?? 0), "MB, disk", Number(details.limits?.disk ?? 0), "MB");
    try {
      const state = (await get("/api/client/servers/" + SERVER + "/resources")).attributes;
      console.log("Server state:", safe(state?.current_state || "unknown"));
      console.log("Memory used:", Math.round(Number(state?.resources?.memory_bytes || 0) / 1048576), "MiB");
      console.log("CPU used:", Number(state?.resources?.cpu_absolute || 0), "%");
    } catch (error) {
      console.log("Resource usage unavailable:", safe(error.message));
    }
    try {
      const files = (await get("/api/client/servers/" + SERVER + "/files/list?directory=%2F")).data;
      if (Array.isArray(files)) {
        const names = new Set(files.map(x => x?.attributes?.name).filter(Boolean));
        console.log("Bot file checks (names only):");
        for (const file of ["package.json", "index.js", "bot.js", "main.js"]) {
          console.log("  " + file + ":", names.has(file) ? "present" : "not found in root");
        }
      }
    } catch (error) {
      console.log("File listing unavailable:", safe(error.message));
    }
    console.log("READ ONLY: No files or server state were changed.");
  } catch (error) {
    console.error("Daki connection test failed:", safe(error.message));
    process.exitCode = 1;
  }
}
