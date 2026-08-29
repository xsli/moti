import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const entry = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
if (!existsSync(entry)) {
  console.error("Vite is not installed. Run npm install first.");
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(`Failed to start Vite: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
