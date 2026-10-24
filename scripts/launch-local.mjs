import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const url = "http://127.0.0.1:8080/";
let server;

async function portInUse() {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port: 8080 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", error => {
      if (error.code === "ECONNREFUSED") resolve(false);
      else reject(error);
    });
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("Port check timed out.")); });
  });
}

async function waitForPage(exited) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (exited.value) throw new Error("The server stopped before it was ready. See the log above.");
    let html;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) html = await response.text();
    } catch { /* The development server may still be starting. */ }
    if (html !== undefined) {
      if (!/<title>\s*\u89e3\u96c6\s*<\/title>/u.test(html)) {
        throw new Error("Port 8080 is occupied by another application. Close it and try again.");
      }
      return;
    }
    await delay(1000);
  }
  throw new Error(`The page did not become ready within 2 minutes. Check ${url} and the log above.`);
}

try {
  const running = await portInUse();
  const exited = { value: false };
  let completion;
  if (!running) {
    if (!existsSync(vite)) throw new Error("Dependencies are missing. Run npm install in the project folder first.");
    console.log("Starting Moti. Keep this window open while using the project.");
    server = spawn(process.execPath, [vite, "dev", "--host", "127.0.0.1", "--port", "8080", "--strictPort"], {
      cwd: root, stdio: "inherit", windowsHide: true,
    });
    completion = new Promise(resolve => {
      server.once("error", error => { console.error(error.message); exited.value = true; resolve(1); });
      server.once("exit", code => { exited.value = true; resolve(code ?? 1); });
    });
  } else {
    console.log("Port 8080 is already in use. Checking the existing project...");
  }
  await waitForPage(exited);
  console.log(`Ready: ${url}`);
  if (!process.argv.includes("--no-open")) {
    const opener = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { stdio: "ignore", windowsHide: true });
    opener.on("error", () => console.error(`Could not open the browser. Open ${url} manually.`));
  }
  if (completion) process.exitCode = await completion;
} catch (error) {
  console.error(error.message);
  if (server && server.exitCode === null) server.kill();
  process.exitCode = 1;
}
