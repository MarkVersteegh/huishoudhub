import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");
export const testDir = path.join(repoRoot, "tests", ".tmp");
export const testDataDir = path.join(testDir, "pb_data");
export const baseUrl = "http://127.0.0.1:8091";

const pocketbaseExe = path.join(repoRoot, "pocketbase.exe");
let currentServer = null;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function rmWithRetry(target) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === 7) throw err;
      await sleep(250);
    }
  }
}

// Health polling houdt de tests onafhankelijk van vaste sleeps.
async function fetchOk(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch (_) {
    return false;
  }
}

// PocketBase CLI-commando's worden gebruikt voor setup, niet voor appdata.
async function runPocketBase(args) {
  await new Promise((resolve, reject) => {
    const proc = spawn(pocketbaseExe, args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    proc.stdout.on("data", (chunk) => { output += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { output += chunk.toString(); });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("PocketBase command failed (" + code + "): " + output));
    });
  });
}

async function waitForHealth(proc) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) break;
    if (await fetchOk(baseUrl + "/api/health")) return;
    await sleep(250);
  }
  throw new Error("PocketBase testserver startte niet op poort 8091.");
}

// Start altijd een geïsoleerde PocketBase, zodat de echte pb_data nooit geraakt wordt.
export async function startTestServer(options = {}) {
  const reset = options.reset !== false;
  if (currentServer) return currentServer;
  if (reset) await rmWithRetry(testDataDir);
  await fs.mkdir(testDataDir, { recursive: true });
  // Voorkomt dat PocketBase een interactieve pbinstall-link in de browser opent.
  await runPocketBase([
    "superuser",
    "upsert",
    "test@example.invalid",
    "test-password-12345",
    "--dir=tests/.tmp/pb_data",
    "--migrationsDir=pb_migrations",
    "--publicDir=pb_public",
  ]);

  const proc = spawn(pocketbaseExe, [
    "serve",
    "--http=127.0.0.1:8091",
    "--dir=tests/.tmp/pb_data",
    "--migrationsDir=pb_migrations",
    "--publicDir=pb_public",
  ], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let output = "";
  proc.stdout.on("data", (chunk) => { output += chunk.toString(); });
  proc.stderr.on("data", (chunk) => { output += chunk.toString(); });

  await waitForHealth(proc);

  currentServer = {
    baseUrl,
    output: () => output,
    async stop() {
      if (proc.exitCode === null) {
        proc.kill();
        await sleep(300);
      }
      currentServer = null;
    },
  };
  return currentServer;
}

export async function stopTestServer(server) {
  if (server) await server.stop();
}

// REST-helper met duidelijke foutmelding voor API-tests.
export async function requestJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (_) { body = text; }
  }
  if (!res.ok) throw new Error("HTTP " + res.status + " voor " + url + ": " + text);
  return body;
}
