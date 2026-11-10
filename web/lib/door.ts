import { ed25519 } from "@noble/curves/ed25519";
import { DOOR_WINDOW_MS, doorMessage } from "./near";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58(bytes: Uint8Array): string {
  let n = BigInt("0x" + (Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || "0"));
  let out = "";
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

/** This browser's door key for an event, kept in localStorage. It only ever signs door codes. */
export function doorKey(eventId: number): { secret: Uint8Array; publicKey: string } {
  const slot = `showup-door-${eventId}`;
  let hex = localStorage.getItem(slot);
  if (!hex) {
    hex = toHex(ed25519.utils.randomPrivateKey());
    localStorage.setItem(slot, hex);
  }
  const secret = fromHex(hex);
  return { secret, publicKey: `ed25519:${base58(ed25519.getPublicKey(secret))}` };
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The check-in link for the current 20-second window, signed by this door. */
export function doorLink(site: string, eventId: number, secret: Uint8Array, now = Date.now()): { url: string; window: number; msLeft: number } {
  const window = Math.floor(now / DOOR_WINDOW_MS);
  const sig = ed25519.sign(new TextEncoder().encode(doorMessage(eventId, window)), secret);
  return { url: `${site}/c?e=${eventId}&w=${window}&s=${base64url(sig)}`, window, msLeft: DOOR_WINDOW_MS - (now % DOOR_WINDOW_MS) };
}
