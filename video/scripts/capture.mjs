// Screenshots of the live ShowUp site through Chrome DevTools Protocol (Node's built-in WebSocket).
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";

const CHROME = new URL("../node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell", import.meta.url).pathname;
const SITE = "https://showup-lake.vercel.app";
const DOOR_HEX = process.env.DOOR_HEX ?? "";

const SHOTS = [
  { name: "home", path: "/", w: 1440, h: 900 },
  { name: "event", path: "/e/1", w: 1440, h: 900 },
  { name: "event-rsvp", path: "/e/1", w: 1440, h: 900, scrollTo: "aside" },
  { name: "door", path: "/e/5/door", w: 1440, h: 900, door: true },
  { name: "ticket-phone", path: "/t/6", w: 390, h: 844, mobile: true },
  { name: "receipt", path: "/e/5/receipt", w: 1440, h: 900, scrollY: 240 },
  { name: "receipt-4", path: "/e/4/receipt", w: 1440, h: 900, scrollY: 240 },
  { name: "proof", path: "/proof", w: 1440, h: 900 },
  { name: "proof-steps", path: "/proof", w: 1440, h: 900, scrollY: 560 },
  { name: "sponsor", path: "/sponsor", w: 1440, h: 900, scrollY: 380 },
  { name: "pledge", path: "/e/1/sponsor", w: 1440, h: 900, scrollY: 300 },
];

const PROFILE = process.env.PROFILE_DIR ?? "/tmp/showup-capture-profile";
const chrome = spawn(CHROME, ["--remote-debugging-port=9333", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${PROFILE}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 30 && !targets.length; i++) {
  await sleep(500);
  targets = await fetch("http://127.0.0.1:9333/json").then((r) => r.json()).catch(() => []);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = (expression) => send("Runtime.evaluate", { expression, awaitPromise: true });

await send("Page.enable");
for (const s of SHOTS) {
  await send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: s.mobile ? 3 : 2, mobile: !!s.mobile });
  if (s.door) {
    await send("Page.navigate", { url: SITE + "/" });
    await sleep(2500);
    await evalJs(`localStorage.setItem('showup-door-5', ${JSON.stringify(DOOR_HEX)})`);
  }
  await send("Page.navigate", { url: SITE + s.path });
  await sleep(s.path.startsWith("/e/") || s.path.startsWith("/t/") || s.door ? 9000 : 6000);
  if (s.scrollTo) await evalJs(`document.querySelector(${JSON.stringify(s.scrollTo)})?.scrollIntoView({block:'center'})`);
  if (s.scrollY) await evalJs(`window.scrollTo(0, ${s.scrollY})`);
  await sleep(800);
  const { result } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(new URL(`../public/shots/${s.name}.png`, import.meta.url), Buffer.from(result.data, "base64"));
  console.log("shot", s.name);
}
ws.close();
chrome.kill();
