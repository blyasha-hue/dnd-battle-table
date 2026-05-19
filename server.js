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
const PRESENCE_TTL = 45 * 1000;
const PLAYER_STATE_FIELDS = new Set(["playerNotes", "pings", "measurement", "templates", "rollLog"]);
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const TOKEN_MOVE_MODES = new Set(["all", "owned", "master"]);

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

function cleanProfile(profile = {}, role = "player") {
  const rawName = String(profile.name || "Игрок").trim().slice(0, 32);
  const color = /^#[0-9a-f]{6}$/i.test(profile.color || "") ? profile.color : "#d1a850";
  const avatar = typeof profile.avatar === "string" && profile.avatar.startsWith("data:image/") && profile.avatar.length < 350000
    ? profile.avatar
    : null;
  return {
    name: rawName || "Игрок",
    role,
    color,
    avatar,
  };
}

function cleanCursor(cursor = null) {
  if (!cursor) return null;
  const x = Number(cursor.x);
  const y = Number(cursor.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x,
    y,
    sceneId: String(cursor.sceneId || "").slice(0, 80),
    tool: String(cursor.tool || "").slice(0, 24),
    updatedAt: Date.now(),
  };
}

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
  let masterClientId = null;
  const file = roomFile(id);
  if (fs.existsSync(file)) {
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8"));
      state = stored.state || null;
      revision = Number(stored.revision || 0);
      masterClientId = stored.masterClientId || null;
    } catch {
      state = null;
      revision = 0;
      masterClientId = null;
    }
  }

  const room = {
    id,
    clients: new Map(),
    masterClientId,
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
        masterClientId: room.masterClientId,
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
  for (const [id, client] of room.clients.entries()) {
    try {
      const payload = event === "state" ? { ...data, state: stateForClient(room, client) } : data;
      sendSse(client, event, payload);
    } catch {
      room.clients.delete(id);
    }
  }
}

function requestedRole(profile = {}) {
  return profile.role === "master" ? "master" : "player";
}

function roleForClient(room, clientId, profile = {}) {
  const wantsMaster = requestedRole(profile) === "master";
  const masterMissing = !room.masterClientId || !room.clients.has(room.masterClientId);
  if (room.masterClientId === clientId || (wantsMaster && masterMissing)) {
    room.masterClientId = clientId;
    return "master";
  }
  return "player";
}

function updateClientProfile(room, clientId, profile = {}) {
  const role = roleForClient(room, clientId, profile);
  return cleanProfile(profile, role);
}

function pruneStaleClients(room) {
  const now = Date.now();
  let changed = false;
  for (const [id, client] of room.clients.entries()) {
    if (now - Number(client.updatedAt || 0) <= PRESENCE_TTL) continue;
    if (client.res && !client.res.destroyed) continue;
    room.clients.delete(id);
    changed = true;
  }
  return changed;
}

function broadcastClients(room) {
  pruneStaleClients(room);
  broadcast(room, "clients", {
    clients: room.clients.size,
    players: playersPayload(room),
    revision: room.revision,
    masterClientId: room.masterClientId,
  });
}

function playersPayload(room) {
  return [...room.clients.values()].map((client) => ({
    id: client.id,
    profile: client.profile || cleanProfile(),
    cursor: client.cursor || null,
    updatedAt: client.updatedAt || Date.now(),
  }));
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function tokenMoveMode(state = {}) {
  return TOKEN_MOVE_MODES.has(state.tokenMoveMode) ? state.tokenMoveMode : "all";
}

function canPlayerMoveToken(baseToken, clientId, state = {}) {
  if (!baseToken || baseToken.hidden) return false;
  const mode = tokenMoveMode(state);
  if (mode === "master") return false;
  if (mode === "all") return true;
  const ownerId = String(baseToken.ownerId || "");
  return !ownerId || ownerId === clientId;
}

function tokenMovePatch(baseToken, incomingToken, clientId, sourceState) {
  if (!baseToken || !incomingToken) return baseToken;
  if (!canPlayerMoveToken(baseToken, clientId, sourceState)) return baseToken;
  const next = { ...baseToken };
  const x = Number(incomingToken.x);
  const y = Number(incomingToken.y);
  const size = Math.min(6, Math.max(1, Math.ceil(Number(baseToken.size) || 1)));
  const maxX = Math.max(0, Number(sourceState?.cols || 0) - size);
  const maxY = Math.max(0, Number(sourceState?.rows || 0) - size);
  if (Number.isFinite(x)) next.x = Math.min(maxX, Math.max(0, x));
  if (Number.isFinite(y)) next.y = Math.min(maxY, Math.max(0, y));
  return next;
}

function cleanPlayerToken(token, clientId, sourceState = {}) {
  if (!token || token.hidden || token.ownerId !== clientId || !token.assetId) return null;
  const x = Number(token.x);
  const y = Number(token.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const size = Math.min(6, Math.max(1, Math.ceil(Number(token.size) || 1)));
  const visualSize = Math.min(size, Math.max(0.5, Number(token.visualSize) || size));
  const maxX = Math.max(0, Number(sourceState.cols || 0) - size);
  const maxY = Math.max(0, Number(sourceState.rows || 0) - size);
  return {
    id: String(token.id || `token-${Date.now()}`).slice(0, 80),
    assetId: String(token.assetId).slice(0, 80),
    name: String(token.name || "Фигурка").trim().slice(0, 28) || "Фигурка",
    ownerId: clientId,
    playerCreated: true,
    size,
    visualSize,
    x: Math.min(maxX, Math.max(0, x)),
    y: Math.min(maxY, Math.max(0, y)),
  };
}

function cleanPlayerTokenAsset(asset, clientId) {
  if (!asset || asset.ownerId !== clientId || asset.playerCreated !== true) return null;
  if (typeof asset.src !== "string" || !asset.src.startsWith("data:image/") || asset.src.length > 350000) return null;
  return {
    id: String(asset.id || `asset-${Date.now()}`).slice(0, 80),
    name: String(asset.name || "Фигурка").trim().slice(0, 64) || "Фигурка",
    src: asset.src,
    ownerId: clientId,
    playerCreated: true,
  };
}

function mergePlayerTokenList(baseTokens = [], incomingTokens = [], clientId, sourceState) {
  const incomingById = new Map(incomingTokens.map((token) => [token?.id, token]));
  const existingIds = new Set(baseTokens.map((token) => token.id));
  const merged = baseTokens.map((token) => tokenMovePatch(token, incomingById.get(token.id), clientId, sourceState));
  const addedAssetIds = new Set();

  for (const incomingToken of incomingTokens) {
    if (!incomingToken?.id || existingIds.has(incomingToken.id)) continue;
    const token = cleanPlayerToken(incomingToken, clientId, sourceState);
    if (!token) continue;
    merged.push(token);
    existingIds.add(token.id);
    addedAssetIds.add(token.assetId);
  }

  return { tokens: merged, addedAssetIds };
}

function mergePlayerScene(baseScene = {}, incomingScene = {}, clientId, sourceState) {
  const merged = cloneJson(baseScene) || {};
  for (const field of PLAYER_STATE_FIELDS) {
    if (hasOwn(incomingScene, field)) merged[field] = cloneJson(incomingScene[field]);
  }

  if (Array.isArray(baseScene.tokens) && Array.isArray(incomingScene.tokens)) {
    merged.tokens = mergePlayerTokenList(baseScene.tokens, incomingScene.tokens, clientId, sourceState).tokens;
  }

  return merged;
}

function mergePlayerState(baseState, incomingState, clientId) {
  if (!baseState || !incomingState) return baseState || null;
  const merged = cloneJson(baseState);
  for (const field of PLAYER_STATE_FIELDS) {
    if (hasOwn(incomingState, field)) merged[field] = cloneJson(incomingState[field]);
  }

  if (Array.isArray(baseState.tokens) && Array.isArray(incomingState.tokens)) {
    const tokenResult = mergePlayerTokenList(baseState.tokens, incomingState.tokens, clientId, baseState);
    merged.tokens = tokenResult.tokens;

    if (tokenResult.addedAssetIds.size && Array.isArray(incomingState.tokenAssets)) {
      const existingAssets = new Set((merged.tokenAssets || []).map((asset) => asset.id));
      const incomingAssets = new Map(incomingState.tokenAssets.map((asset) => [asset?.id, asset]));
      merged.tokenAssets = [...(merged.tokenAssets || [])];
      for (const assetId of tokenResult.addedAssetIds) {
        if (existingAssets.has(assetId)) continue;
        const asset = cleanPlayerTokenAsset(incomingAssets.get(assetId), clientId);
        if (!asset || asset.id !== assetId) continue;
        merged.tokenAssets.push(asset);
        existingAssets.add(asset.id);
      }
      const availableAssets = new Set(merged.tokenAssets.map((asset) => asset.id));
      merged.tokens = merged.tokens.filter((token) => !token.playerCreated || availableAssets.has(token.assetId));
    }
  }

  if (Array.isArray(baseState.scenes) && Array.isArray(incomingState.scenes)) {
    const incomingScenes = new Map(incomingState.scenes.map((scene) => [scene?.id, scene]));
    merged.scenes = baseState.scenes.map((scene) => mergePlayerScene(scene, incomingScenes.get(scene.id), clientId, baseState));
  }

  const availableAssets = new Set((merged.tokenAssets || []).map((asset) => asset.id));
  merged.tokens = (merged.tokens || []).filter((token) => !token.playerCreated || availableAssets.has(token.assetId));
  merged.scenes = (merged.scenes || []).map((scene) => ({
    ...scene,
    tokens: (scene.tokens || []).filter((token) => !token.playerCreated || availableAssets.has(token.assetId)),
  }));

  return merged;
}

function collectVisibleAssetIds(state) {
  const tokenIds = new Set();
  const handoutIds = new Set();
  const scenes = Array.isArray(state?.scenes) ? state.scenes : [];

  for (const token of state?.tokens || []) {
    if (!token?.hidden && token.assetId) tokenIds.add(token.assetId);
  }
  for (const handout of state?.handouts || []) {
    if (!handout?.hidden && handout.assetId) handoutIds.add(handout.assetId);
  }
  for (const scene of scenes) {
    for (const token of scene?.tokens || []) {
      if (!token?.hidden && token.assetId) tokenIds.add(token.assetId);
    }
    for (const handout of scene?.handouts || []) {
      if (!handout?.hidden && handout.assetId) handoutIds.add(handout.assetId);
    }
  }

  return { tokenIds, handoutIds };
}

function sanitizeSceneForPlayer(scene = {}) {
  const sanitized = cloneJson(scene) || {};
  sanitized.tokens = (sanitized.tokens || []).filter((token) => !token.hidden);
  sanitized.handouts = (sanitized.handouts || []).filter((handout) => !handout.hidden);
  if (sanitized.backgroundHidden) {
    sanitized.background = null;
  }
  return sanitized;
}

function sanitizeStateForPlayer(state) {
  if (!state) return null;
  const sanitized = cloneJson(state);
  const { tokenIds, handoutIds } = collectVisibleAssetIds(sanitized);

  sanitized.tokens = (sanitized.tokens || []).filter((token) => !token.hidden);
  sanitized.handouts = (sanitized.handouts || []).filter((handout) => !handout.hidden);
  if (sanitized.backgroundHidden) {
    sanitized.background = null;
  }
  sanitized.scenes = (sanitized.scenes || []).map(sanitizeSceneForPlayer);
  sanitized.tokenAssets = (sanitized.tokenAssets || []).filter((asset) => tokenIds.has(asset.id));
  sanitized.handoutAssets = (sanitized.handoutAssets || []).filter((asset) => handoutIds.has(asset.id));
  sanitized.selectedTokenAssetId = null;
  sanitized.selectedHandoutAssetId = null;
  sanitized.selectedObject = null;

  return sanitized;
}

function stateForClient(room, client) {
  if (!client || client.profile?.role === "master") return room.state;
  return sanitizeStateForPlayer(room.state);
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
  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(events|state|presence))?$/);

  if (roomMatch) {
    const room = loadRoom(roomMatch[1]);
    const action = roomMatch[2] || "info";

    if (req.method === "GET" && action === "info") {
      pruneStaleClients(room);
      const clientId = cleanRoomId(url.searchParams.get("client") || "");
      const existingClient = room.clients.get(clientId);
      const inferredRole = existingClient?.profile?.role === "master" ||
        (room.masterClientId === clientId) ||
        (!room.masterClientId && requestedRole({ role: url.searchParams.get("role") }) === "master")
        ? "master"
        : "player";
      const client = existingClient || { profile: cleanProfile({}, inferredRole) };
      sendJson(res, 200, {
        room: room.id,
        revision: room.revision,
        clients: room.clients.size,
        players: playersPayload(room),
        masterClientId: room.masterClientId,
        state: stateForClient(room, client),
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
      const existing = room.clients.get(clientId);
      const profile = updateClientProfile(room, clientId, existing?.profile || {
        name: url.searchParams.get("name") || "Игрок",
        role: url.searchParams.get("role") || (room.masterClientId ? "player" : "master"),
        color: url.searchParams.get("color") || undefined,
      });
      room.clients.set(clientId, {
        id: clientId,
        res,
        profile,
        cursor: existing?.cursor || null,
        updatedAt: Date.now(),
      });
      sendSse(room.clients.get(clientId), "hello", {
        room: room.id,
        revision: room.revision,
        clients: room.clients.size,
        players: playersPayload(room),
        masterClientId: room.masterClientId,
        state: stateForClient(room, room.clients.get(clientId)),
      });
      broadcastClients(room);
      req.on("close", () => {
        room.clients.delete(clientId);
        broadcastClients(room);
      });
      return;
    }

    if (req.method === "POST" && action === "presence") {
      try {
        const payload = await readBody(req);
        const clientId = cleanRoomId(payload.clientId || `client-${Date.now()}`);
        const client = room.clients.get(clientId);
        if (client) {
          client.profile = updateClientProfile(room, clientId, payload.profile || client.profile);
          client.cursor = cleanCursor(payload.cursor);
          client.updatedAt = Date.now();
        }
        broadcastClients(room);
        sendJson(res, 200, {
          room: room.id,
          clients: room.clients.size,
          players: playersPayload(room),
          masterClientId: room.masterClientId,
        });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === "POST" && action === "state") {
      try {
        const payload = await readBody(req);
        const clientId = cleanRoomId(payload.clientId || `client-${Date.now()}`);
        const client = room.clients.get(clientId);
        const role = client?.profile?.role === "master" || !room.masterClientId || room.masterClientId === clientId
          ? "master"
          : "player";
        if (role === "master" && !room.masterClientId) {
          room.masterClientId = clientId;
        }
        room.state = role === "master"
          ? payload.state || null
          : mergePlayerState(room.state, payload.state, clientId);
        room.revision += 1;
        room.updatedAt = Date.now();
        persistRoom(room);
        const event = {
          room: room.id,
          revision: room.revision,
          state: room.state,
          sourceClientId: clientId,
          clients: room.clients.size,
          players: playersPayload(room),
          masterClientId: room.masterClientId,
        };
        broadcast(room, "state", event);
        sendJson(res, 200, {
          ...event,
          state: stateForClient(room, client || { profile: { role } }),
        });
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
