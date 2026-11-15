import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// বাইরের লিংক থেকে ফাইল আনা: শুধু https আর ইন্টারনেটের ঠিকানা (সার্ভারের ভেতরের ঠিকানায় যাওয়া যাবে না)

export class UnsafeUrlError extends Error {}

function privateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function privateIp(ip: string) {
  if (isIP(ip) === 4) return privateV4(ip);
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

export async function assertPublicUrl(raw: string | URL) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That is not a valid link.");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https:// links are allowed.");
  if (url.username || url.password) throw new UnsafeUrlError("Links with a username or password are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new UnsafeUrlError("Couldn't find that website.");
  if (addrs.some((a) => privateIp(a.address))) throw new UnsafeUrlError("That link points to a private address.");
  return url;
}

// redirect নিজে ধরে, প্রতিটা ধাপে ঠিকানা আবার যাচাই করে
export async function safeFetch(raw: string, timeoutMs = 60_000) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "HookAds/1.0" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new UnsafeUrlError("The link redirected without an address.");
      url = await assertPublicUrl(new URL(loc, url));
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("The link redirected too many times.");
}

// সর্বোচ্চ maxBytes পর্যন্ত পড়া, বেশি হলে থামা
export async function readLimited(res: Response, maxBytes: number) {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new UnsafeUrlError(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeUrlError(`The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
