import type { Env, Comment, ThreadEntry, Version, UploadResponse } from "./types";
import { mintSlug, isValidSlug, shortId } from "./slug";
import { injectOverlay } from "./inject";
import { renderOgImage } from "./og";

const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" };

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    try {
      if (pathname === "/api/upload" && req.method === "POST") {
        return await handleUpload(req, env);
      }

      const commentsMatch = pathname.match(/^\/api\/comments\/([a-z0-9]+)$/);
      if (commentsMatch) {
        const slug = commentsMatch[1];
        if (!isValidSlug(slug)) return notFound();
        if (req.method === "GET") return await handleGetComments(slug, env);
        if (req.method === "POST") return await handlePostComment(req, slug, env);
        return methodNotAllowed();
      }

      const versionsMatch = pathname.match(/^\/api\/versions\/([a-z0-9]+)$/);
      if (versionsMatch && req.method === "GET") {
        const slug = versionsMatch[1];
        if (!isValidSlug(slug)) return notFound();
        return await handleGetVersions(slug, env);
      }

      const ogMatch = pathname.match(/^\/og\/([a-z0-9]+)\.png$/);
      if (ogMatch && req.method === "GET" && isValidSlug(ogMatch[1])) {
        return await handleOgImage(req, ogMatch[1], env, ctx);
      }

      const slugMatch = pathname.match(/^\/([a-z0-9]+)\/?$/);
      if (slugMatch && req.method === "GET" && isValidSlug(slugMatch[1])) {
        return await handleServeShareable(slugMatch[1], env, url.origin);
      }

      if (pathname === "/robots.txt") {
        // Disallow every crawler. These docs are private-by-URL, not for indexing.
        return new Response("User-agent: *\nDisallow: /\n", {
          headers: { "Content-Type": "text/plain; charset=utf-8", ...NOINDEX },
        });
      }

      // Static assets (landing page, overlay JS/CSS). Stamp noindex on every one
      // so nothing served by this worker is ever indexable.
      const assetResp = await env.ASSETS.fetch(req);
      const out = new Response(assetResp.body, assetResp);
      for (const [k, v] of Object.entries(NOINDEX)) out.headers.set(k, v);
      return out;
    } catch (err) {
      console.error(err);
      return json({ error: "internal" }, 500);
    }
  },
};

async function handleUpload(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== env.UPLOAD_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  const ctype = req.headers.get("Content-Type") || "";
  if (!ctype.includes("text/html") && !ctype.includes("application/octet-stream")) {
    return json({ error: "expected text/html body" }, 400);
  }

  const html = await req.text();
  if (!html || html.length > 5 * 1024 * 1024) {
    return json({ error: "body empty or too large (max 5MB)" }, 400);
  }

  const title = extractTitle(html);

  let slug = (req.headers.get("Shareable-Slug") || req.headers.get("Draft-Slug") || "").trim();
  if (slug && !isValidSlug(slug)) {
    return json({ error: "invalid slug" }, 400);
  }

  if (!slug) {
    for (let i = 0; i < 5; i++) {
      const candidate = mintSlug();
      const existing = await env.KV.get(`versions:${candidate}`);
      if (!existing) {
        slug = candidate;
        break;
      }
    }
    if (!slug) return json({ error: "slug collision; try again" }, 500);
  }

  const versionsKey = `versions:${slug}`;
  const existing = await env.KV.get<Version[]>(versionsKey, "json");
  const nextV = (existing?.length ?? 0) + 1;

  await env.R2.put(`${slug}/v${nextV}.html`, html, {
    httpMetadata: { contentType: "text/html; charset=utf-8" },
  });

  const versions: Version[] = [
    ...(existing ?? []),
    { v: nextV, uploadedAt: Date.now(), size: html.length },
  ];
  await env.KV.put(versionsKey, JSON.stringify(versions));
  await env.KV.put(`title:${slug}`, title);

  const origin = new URL(req.url).origin;
  const body: UploadResponse = {
    slug,
    version: nextV,
    url: `${origin}/${slug}`,
  };
  return json(body);
}

async function handleServeShareable(slug: string, env: Env, origin: string): Promise<Response> {
  const versions = await env.KV.get<Version[]>(`versions:${slug}`, "json");
  if (!versions || versions.length === 0) return notFound();
  const latest = versions[versions.length - 1].v;

  const obj = await env.R2.get(`${slug}/v${latest}.html`);
  if (!obj) return notFound();

  let title = await env.KV.get(`title:${slug}`);
  if (title === null) {
    // Lazy backfill for pre-existing slugs uploaded before titles were stored.
    const html = await obj.text();
    title = extractTitle(html);
    await env.KV.put(`title:${slug}`, title);
    const baseResp = new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", ...NOINDEX },
    });
    return injectOverlay(baseResp, slug, latest, title, origin);
  }

  const baseResp = new Response(obj.body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...NOINDEX,
    },
  });

  return injectOverlay(baseResp, slug, latest, title, origin);
}

async function handleOgImage(
  req: Request,
  slug: string,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(req);
  if (cached) return cached;

  let title = await env.KV.get(`title:${slug}`);
  if (title === null) {
    const versions = await env.KV.get<Version[]>(`versions:${slug}`, "json");
    if (!versions || versions.length === 0) return notFound();
    const latest = versions[versions.length - 1].v;
    const obj = await env.R2.get(`${slug}/v${latest}.html`);
    if (!obj) return notFound();
    title = extractTitle(await obj.text());
    await env.KV.put(`title:${slug}`, title);
  }

  const resp = await renderOgImage(title || "Untitled", slug, new URL(req.url).host);
  resp.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  resp.headers.set("X-Robots-Tag", "noindex, nofollow");
  ctx.waitUntil(cache.put(req, resp.clone()));
  return resp;
}

function extractTitle(html: string): string {
  const m = html.match(
    // <title>…</title>, case-insensitive, captures inner text (any chars except </title>).
    // Example match: "<title>Pricing plan</title>" → "Pricing plan"
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  );
  if (!m) return "";
  return decodeEntities(m[1].trim()).slice(0, 200);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function handleGetComments(slug: string, env: Env): Promise<Response> {
  const comments = (await env.KV.get<Comment[]>(`comments:${slug}`, "json")) ?? [];
  return json({ comments });
}

async function handlePostComment(req: Request, slug: string, env: Env): Promise<Response> {
  const versions = await env.KV.get<Version[]>(`versions:${slug}`, "json");
  if (!versions || versions.length === 0) return notFound();
  const currentVersion = versions[versions.length - 1].v;

  type Payload =
    | { kind: "new"; range: Comment["range"]; entry: { author: string; body: string } }
    | { kind: "reply"; commentId: string; entry: { author: string; body: string } }
    | { kind: "resolve"; commentId: string; resolved: boolean };

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const key = `comments:${slug}`;
  const comments = (await env.KV.get<Comment[]>(key, "json")) ?? [];

  if (payload.kind === "new") {
    const author = sanitizeAuthor(payload.entry?.author);
    const body = sanitizeBody(payload.entry?.body);
    if (!author || !body || !payload.range) return json({ error: "invalid payload" }, 400);
    const entry: ThreadEntry = {
      id: shortId(),
      author,
      body,
      createdAt: Date.now(),
    };
    const c: Comment = {
      id: shortId(),
      version: currentVersion,
      range: payload.range,
      thread: [entry],
      resolved: false,
      createdAt: Date.now(),
    };
    comments.push(c);
    await env.KV.put(key, JSON.stringify(comments));
    return json({ comment: c });
  }

  if (payload.kind === "reply") {
    const target = comments.find((c) => c.id === payload.commentId);
    if (!target) return json({ error: "comment not found" }, 404);
    const author = sanitizeAuthor(payload.entry?.author);
    const body = sanitizeBody(payload.entry?.body);
    if (!author || !body) return json({ error: "invalid payload" }, 400);
    const entry: ThreadEntry = {
      id: shortId(),
      author,
      body,
      createdAt: Date.now(),
    };
    target.thread.push(entry);
    await env.KV.put(key, JSON.stringify(comments));
    return json({ comment: target });
  }

  if (payload.kind === "resolve") {
    const target = comments.find((c) => c.id === payload.commentId);
    if (!target) return json({ error: "comment not found" }, 404);
    target.resolved = !!payload.resolved;
    await env.KV.put(key, JSON.stringify(comments));
    return json({ comment: target });
  }

  return json({ error: "unknown kind" }, 400);
}

async function handleGetVersions(slug: string, env: Env): Promise<Response> {
  const versions = (await env.KV.get<Version[]>(`versions:${slug}`, "json")) ?? [];
  return json({ versions });
}

function sanitizeAuthor(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, 60);
}

function sanitizeBody(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.trim().slice(0, 5000);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...NOINDEX },
  });
}

function notFound(): Response {
  return new Response("not found", { status: 404, headers: NOINDEX });
}

function methodNotAllowed(): Response {
  return new Response("method not allowed", { status: 405, headers: NOINDEX });
}
