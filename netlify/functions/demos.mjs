/* Demo list API for the site's demo library.
 *
 * Storage: Netlify Blobs — built into Netlify, configured automatically, so
 * there is no token or key for anyone to create or paste.
 * Publishing is protected by the ADMIN_PASSWORD environment variable, checked
 * here on the server. The browser never holds a credential.
 *
 *   GET  /api/demos              -> { demos: [...] }
 *   POST /api/demos              -> { demos: [...], removed?: n }
 *        body: { action: "add" | "remove", demo: {...}, password: "..." }
 */
import { getStore } from "@netlify/blobs";

const STORE = "whiterose-demos";
const KEY = "list";
const MAX_DEMOS = 200;
const LIMIT = { title: 90, url: 500, desc: 400, tag: 24, tags: 8 };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

const clip = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === "http:" || x.protocol === "https:" ? x.href : "";
  } catch (e) {
    return "";
  }
}

/* keeps anything unexpected out of the published list */
export function cleanDemo(input) {
  const d = input && typeof input === "object" ? input : {};
  const tags = (Array.isArray(d.tags) ? d.tags : String(d.tags || "").split(","))
    .map(t => clip(t, LIMIT.tag))
    .filter(Boolean)
    .slice(0, LIMIT.tags);
  return {
    title: clip(d.title, LIMIT.title),
    url: safeUrl(d.url),
    desc: clip(d.desc, LIMIT.desc),
    tags,
    live: d.live !== false
  };
}

const sha = async s => {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
};

export async function checkPassword(given, expected) {
  if (!expected) return { ok: false, reason: "not-configured" };
  const [a, b] = await Promise.all([sha(String(given == null ? "" : given)), sha(String(expected))]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, reason: "wrong" };
}

/* the stored list, or the list shipped with the site the first time round */
async function readList(url, store) {
  const stored = await store.get(KEY, { type: "json" });
  if (Array.isArray(stored)) return stored.map(cleanDemo);
  try {
    const r = await fetch(new URL("/demos.json", url), { headers: { accept: "application/json" } });
    if (r.ok) {
      const v = await r.json();
      if (Array.isArray(v)) return v.map(cleanDemo);
    }
  } catch (e) {}
  return [];
}

export async function handle(request, deps) {
  const { store, adminPassword } = deps;

  if (request.method === "GET") {
    try {
      return json({ demos: await readList(request.url, store) });
    } catch (e) {
      return json({ error: "could not read the demo list" }, 500);
    }
  }
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body = null;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "bad request" }, 400);
  }
  body = body && typeof body === "object" ? body : {};

  const check = await checkPassword(body.password, adminPassword);
  if (!check.ok) {
    if (check.reason === "not-configured") {
      return json({ error: "publishing is not set up yet — add an ADMIN_PASSWORD environment variable in Netlify" }, 503);
    }
    return json({ error: "wrong password" }, 401);
  }

  let list;
  try {
    list = await readList(request.url, store);
  } catch (e) {
    return json({ error: "could not read the demo list" }, 500);
  }

  const action = String(body.action || "");
  let next;
  let removed;

  if (action === "add") {
    const demo = cleanDemo(body.demo);
    if (!demo.title) return json({ error: "a demo needs a name" }, 400);
    if (!demo.url) return json({ error: "a demo needs a full http:// or https:// link" }, 400);
    if (list.length >= MAX_DEMOS) return json({ error: "the list is full — remove a demo first" }, 400);
    next = list.concat([demo]);
  } else if (action === "remove") {
    const target = cleanDemo(body.demo);
    next = list.filter(d => !(d.url === target.url && d.title === target.title));
    removed = list.length - next.length;
    if (!removed) return json({ demos: list, removed: 0 });     // already gone; nothing to write
  } else {
    return json({ error: "unknown action" }, 400);
  }

  try {
    await store.setJSON(KEY, next);
  } catch (e) {
    return json({ error: "could not save the demo list" }, 500);
  }
  return json({ demos: next, removed });
}

export default async function handler(request) {
  let store;
  try {
    store = getStore(STORE);
  } catch (e) {
    return json({ error: "storage is not available" }, 500);
  }
  return handle(request, { store, adminPassword: Netlify.env.get("ADMIN_PASSWORD") });
}
