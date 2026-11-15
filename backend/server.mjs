// LunaSight server: static frontend + JSON API. Zero dependencies.
//   npm start  ->  http://localhost:3000   (PORT and NASA_API_KEY are optional)
import http from "node:http";
import { fileURLToPath } from "node:url";
import { FRONTEND_DIR, PORT } from "./config.mjs";
import { HttpError, sendError, serveStatic } from "./http.mjs";
import { handleApi } from "./routes.mjs";

export const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");   // fixed base: never trust the Host header
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (req.method !== "GET" && req.method !== "HEAD") {
      const error = new HttpError(405, "method_not_allowed", "Use GET or HEAD.");
      error.allow = "GET, HEAD";
      throw error;
    }
    return serveStatic(req, res, FRONTEND_DIR, url.pathname);
  } catch (error) {
    sendError(res, error);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`LunaSight running at http://localhost:${PORT}`));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => server.close(() => process.exit(0)));   // finish in-flight requests, then exit
  }
}
