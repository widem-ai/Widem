// A minimal Chrome DevTools Protocol driver for the browser checks. No dependencies: Node's built-in
// WebSocket and child_process. Playwright would do the same job but is a dependency nobody approved.
// Chrome is found via CHROME_PATH, then the usual install paths (Windows, Linux CI runners, macOS).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    join(local, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("no Chrome/Chromium found; set CHROME_PATH to run the browser checks");
  return found;
}

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "widem-cdp-"));
  const proc = spawn(
    findChrome(),
    ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
      "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars", "about:blank"],
    { stdio: "ignore" },
  );
  const portFile = join(profile, "DevToolsActivePort");
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await sleep(100);
    if (existsSync(portFile)) port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
  }
  if (!port) { proc.kill(); throw new Error("Chrome did not open a debugging port"); }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP socket failed")); });

  let nextId = 1;
  const pending = new Map(), listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(`${msg.error.message}`)) : res(msg.result);
    } else if (msg.method) for (const fn of listeners.get(msg.method) ?? []) fn(msg.params);
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  // Every console error, uncaught exception and browser-logged error (failed loads) lands here.
  const errors = [];
  on("Runtime.exceptionThrown", (p) => errors.push(`exception: ${p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text}`));
  on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(" ")}`); });
  on("Log.entryAdded", (p) => { if (p.entry.level === "error") errors.push(`log: ${p.entry.text} ${p.entry.url ?? ""}`.trim()); });

  const page_ = {
    errors,
    send,
    /** Viewport width/height, reduced motion on/off, JS on/off. Applied before the next navigation. */
    async emulate({ width, height = 900, reduce = false, js = true }) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }] });
      await send("Emulation.setScriptExecutionDisabled", { value: !js });
    },
    async goto(url) {
      const loaded = new Promise((res) => on("Page.loadEventFired", res));
      await send("Page.navigate", { url });
      await Promise.race([loaded, sleep(10000)]);
    },
    /** Evaluate an expression (string) in the page; returns its JSON value. */
    async evaluate(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`evaluate failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      return r.result.value;
    },
    wait: sleep,
    async close() {
      try { ws.close(); } catch { /* already closed */ }
      proc.kill();
      await sleep(300);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; tmp is cleaned by the OS */ }
    },
  };
  return page_;
}
