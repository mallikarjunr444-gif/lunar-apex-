// Vercel serverless entry: the same Node server that `npm start` runs, mounted behind /api/*.
import { server } from "../backend/server.mjs";

export default function handler(req, res) {
  server.emit("request", req, res);
}
