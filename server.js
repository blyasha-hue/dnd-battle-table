const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || ROOT;
const ROOMS_DIR = path.join(DATA_DIR, ".rooms");
const MAX_BODY = 25 * 1024 * 1024;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

const rooms = new Map();

function ensureRoomsDir() {
  if (!fs.existsSync(ROOMS_DIR)) {
    fs.mkdirSync(ROOMS_DIR, { recursive: true });
  }
}

function cleanRoomId(roomId) {
  return String(roomId || "table")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "table";
}

function roomFile(roomId) {
  return path.join(ROOMS_DIR, `${roomId}.json`);
}

function loadRoom(roomId) {
  const id = cleanRoomId(roomId);
  if (rooms.has(id)) return rooms.get(id);

  let state = null;
  let revision = 0;
  const file = roomFile(id);
  if (fs.existsSync(file)) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8"));
      state = stored.state || null;
      revision = Number(stored.revision || 0);
    } catch {
      state = null;
      revision = 0;
    }
  }

  const room = {
    id,
    clients: new Map(),
    revision,
    state,
    updatedAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

function persistRoom(room) {
  ensureRoomsDir();
  fs.writeFileSync(
    roomFile(room.id),
    JSON.stringify(
      {
        id: room.id,
        revision: room.revision,
        updatedAt: room.updatedAt,
        state: room.state,
      },
      null,
      2,
    ),
  );
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendSse(client, event, data) {
  client.res.write(`event: ${event}\n`);
  client.res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(room, event, data) {
  for (const client of room.clients.values()) {
    sendSse(client, event, data);
  }
}

function broadcastClients(room) {
  broadcast(room, "clients", {
    clients: room.clients.size,
    revision: room.revision,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveFile(req, res, url) {
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT) || filePath.includes(`${path.sep}.rooms${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(events|state))?$/);

  if (roomMatch) {
    const room = loadRoom(roomMatch[1]);
    const action = roomMatch[2] || "info";

    if (req.method === "GET" && action === "info") {
      sendJson(res, 200, {
        room: room.id,
        revision: room.revision,
        clients: room.clients.size,
        state: room.state,
      });
      return;
    }

    if (req.method === "GET" && action === "events") {
      const clientId = cleanRoomId(url.searchParams.get("client") || `client-${Date.now()}`);
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.write("\n");
      room.clients.set(clientId, { id: clientId, res });
      sendSse(room.clients.get(clientId), "hello", {
        room: room.id,
        revision: room.revision,
        clients: room.clients.size,
        state: room.state,
      });
      broadcastClients(room);
      req.on("close", () => {
        room.clients.delete(clientId);
        broadcastClients(room);
      });
      return;
    }

    if (req.method === "POST" && action === "state") {
      try {
        const payload = await readBody(req);
        room.state = payload.state || null;
        room.revision += 1;
        room.updatedAt = Date.now();
        persistRoom(room);
        const event = {
          room: room.id,
          revision: room.revision,
          state: room.state,
          sourceClientId: payload.clientId || null,
          clients: room.clients.size,
        };
        broadcast(room, "state", event);
        sendJson(res, 200, event);
      } catch (error) {
        sendJson(res, error.message === "Body too large" ? 413 : 400, {
          error: error.message,
        });
      }
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  serveFile(req, res, url);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`D&D Battle Table is running at http://localhost:${PORT}`);
    console.log(`Open a room: http://localhost:${PORT}/?room=main`);
  });
}

module.exports = { createServer };
