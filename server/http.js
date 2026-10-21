/*
 * Small HTTP helpers shared by the API routes: JSON in and out, the caller's
 * address, and simple per-key rate limits.
 */
"use strict";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};

const sendJson = (response, status, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    ...CORS,
  });
  response.end(payload);
};

const sendPreflight = (response) => {
  response.writeHead(204, CORS);
  response.end();
};

// The body as JSON, refusing anything larger than `limit` bytes.
const readJson = (request, limit) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, "send JSON"));
      }
    });
    request.on("error", reject);
  });

// Behind Coolify's proxy the caller is the first x-forwarded-for address.
const clientAddress = (request) =>
  String(request.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
  request.socket.remoteAddress;

const bearer = (request) => {
  const header = String(request.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
};

// At most `max` uses per key in each window. Only counts are kept, and they
// are all forgotten when the window turns over.
const limiter = (max, windowMs) => {
  const counts = new Map();
  setInterval(() => counts.clear(), windowMs).unref();
  return (key) => {
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    return count <= max;
  };
};

module.exports = {
  HttpError,
  sendJson,
  sendPreflight,
  readJson,
  clientAddress,
  bearer,
  limiter,
};
