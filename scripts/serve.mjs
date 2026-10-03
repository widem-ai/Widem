// Local preview of the built site exactly as GitHub Pages serves it: dist/ mounted at /Widem/.
// usage: node scripts/serve.mjs [port]   (no dependencies; for checks and screenshots only)
// scripts/check.mjs imports startServer() and closes it when the browser checks finish.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const BASE = "/Widem/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json" };

/** Serve dist/ at /Widem/. Port 0 = any free port. Resolves to { server, port }. */
export function startServer(port = 0) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/Widem") { res.writeHead(301, { Location: BASE }).end(); return; }
    if (!path.startsWith(BASE)) { res.writeHead(404).end("not under /Widem/"); return; }
    let file = normalize(join(DIST, path.slice(BASE.length)));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startServer(Number(process.argv[2] ?? 9137));
  console.log(`serving dist/ at http://127.0.0.1:${port}${BASE}`);
}
