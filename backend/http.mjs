// HTTP helpers: error type, JSON responses, body reading, static files, security headers.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { LIMITS } from "./config.mjs";

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
};
// The app is fully self-hosted: no third-party scripts, styles, fonts or connections.
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://apod.nasa.gov https://*.nasa.gov; "
  + "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8"
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept-Encoding, If-None-Match"
};

/** JSON response. Successful GETs get a weak ETag (304 on match), 60 s caching and gzip when accepted. */
export function sendJson(res, status, body, extraHeaders = {}) {
  const req = res.req;
  const payload = JSON.stringify(body);
  const headers = { ...SECURITY_HEADERS, ...CORS, "Content-Type": "application/json; charset=utf-8", Vary: "Accept-Encoding", ...extraHeaders };
  const readable = req.method === "GET" || req.method === "HEAD";
  if (status !== 200 || !readable) {
    res.writeHead(status, { ...headers, "Cache-Control": "no-store" });
    return res.end(req.method === "HEAD" ? undefined : payload);
  }
  headers.ETag = `W/"${crypto.createHash("sha1").update(payload).digest("hex")}"`;
  headers["Cache-Control"] = "public, max-age=60";
  if (req.headers["if-none-match"] === headers.ETag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const gzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "") && payload.length > 1024;
  if (gzip) headers["Content-Encoding"] = "gzip";
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  res.end(gzip ? zlib.gzipSync(payload) : payload);
}

/** CORS preflight. */
export function sendPreflight(res) {
  res.writeHead(204, { ...SECURITY_HEADERS, ...CORS, "Access-Control-Max-Age": "86400" });
  res.end();
}

/** Every API failure has the same shape: { error: { code, message } }. */
export function sendError(res, error) {
  const known = error instanceof HttpError;
  if (!known) console.error(error);                     // unexpected: log, but do not leak details
  if (res.headersSent) return res.end();
  const status = known ? error.status : 500;
  const body = { error: { code: known ? error.code : "internal_error", message: known ? error.message : "Internal server error" } };
  sendJson(res, status, body, known && error.allow ? { Allow: error.allow } : {});
}

export async function readJson(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > LIMITS.bodyBytes) throw new HttpError(413, "payload_too_large", `Request body exceeds ${LIMITS.bodyBytes / 1024} KiB.`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

/** Serve a file from `root`; unknown paths and path-traversal attempts are plain 404s. */
export function serveStatic(req, res, root, pathname) {
  let relative;
  try {
    relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    relative = "";
  }
  const file = path.resolve(root, relative);
  const inside = file === root || file.startsWith(root + path.sep);
  if (!relative || !inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
  const ext = path.extname(file);
  const html = ext === ".html";
  res.writeHead(200, {
    ...SECURITY_HEADERS, ...(html ? { "Content-Security-Policy": CSP } : {}),
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": html ? "no-cache" : "public, max-age=3600"
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}
