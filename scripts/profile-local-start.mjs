import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

// Never open the running app's database in a profiling process.
process.env.MOTI_DATA_DIR = await mkdtemp(join(tmpdir(), 'moti-start-profile-'));
delete process.env.DATABASE_URL;
process.env.MOTI_PROFILE_STARTUP = '1';
const started = performance.now();
const { createServer } = await import('vite');
const timings = {};
const server = await createServer({
  cacheDir: 'node_modules/.vite-start-profile',
  server: { port: 8097, strictPort: true, open: false },
  plugins: [{
    name: 'moti:profile-start',
    configResolved(config) {
      timings.configMs = Math.round(performance.now() - started);
      if (process.argv.includes('--watch-all')) config.server.watch.ignored = [];
      for (const plugin of config.plugins) {
        if (typeof plugin.configureServer !== 'function') continue;
        const hook = plugin.configureServer;
        plugin.configureServer = async function (...args) {
          const start = performance.now();
          const result = await hook.apply(this, args);
          timings[plugin.name] = Math.round(performance.now() - start);
          return result;
        };
      }
    },
  }],
});
try {
  await server.listen();
  timings.listenMs = Math.round(performance.now() - started);
  const response = await fetch('http://127.0.0.1:8097/');
  await response.text();
  timings.firstHtmlMs = Math.round(performance.now() - started);
  const watched = server.watcher.getWatched();
  timings.watchedDirectories = Object.keys(watched).length;
  timings.watchedEntries = Object.values(watched).reduce((count, entries) => count + entries.length, 0);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  console.log(JSON.stringify(timings));
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(timings, null, 2));
} finally {
  const db = await server.ssrLoadModule('/src/lib/db.ts');
  await (await db.getPglite()).close();
  await server.close();
}
