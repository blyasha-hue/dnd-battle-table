const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const zlib = require("node:zlib");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || ROOT;
const ROOMS_DIR = path.join(DATA_DIR, ".rooms");
const MAX_BODY = 25 * 1024 * 1024;
const PRESENCE_TTL = 45 * 1000;
const STATE_LIMITS = {
  maxScenes: 16,
  maxTokens: 120,
  maxHandouts: 80,
  maxAssets: 80,
  maxTemplates: 80,
  maxPings: 8,
  maxRolls: 20,
  maxText: 8000,
  maxNote: 160,
  maxImageBytes: 650 * 1024,
  maxBackgroundBytes: 3 * 1024 * 1024,
};
const PLAYER_STATE_FIELDS = new Set(["playerNotes", "pings", "measurement", "templates", "rollLog", "terrain"]);
const MASTER_PATCH_FIELDS = new Set([
  "sceneName",
  "cols",
  "rows",
  "cell",
  "showGrid",
  "background",
  "backgroundHidden",
  "fog",
  "terrain",
  "tokens",
  "handouts",
  "templates",
  "measurement",
  "pings",
  "initiative",
  "activeInitiativeId",
  "initiativeRound",
  "tokenAssets",
  "handoutAssets",
  "tokenMoveMode",
  "playerNotes",
  "rollLog",
  "terrainPatch",
  "fogPatch",
]);
const SCENE_PATCH_FIELDS = new Set([
  "cols",
  "rows",
  "cell",
  "showGrid",
  "background",
  "backgroundHidden",
  "fog",
  "terrain",
  "tokens",
  "handouts",
  "templates",
  "measurement",
  "initiative",
  "activeInitiativeId",
  "initiativeRound",
]);
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
    persistTimer: null,
    persistPending: false,
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

function schedulePersistRoom(room, delay = 1200) {
  room.persistPending = true;
  if (room.persistTimer) clearTimeout(room.persistTimer);
  room.persistTimer = setTimeout(() => {
    room.persistTimer = null;
    room.persistPending = false;
    persistRoom(room);
  }, delay);
  room.persistTimer.unref?.();
}

function persistPendingRooms() {
  for (const room of rooms.values()) {
    if (!room.persistPending) continue;
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }
    room.persistPending = false;
    persistRoom(room);
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  sendMaybeCompressed(res, status, headers, Buffer.from(body));
}

function bufferBytes(value) {
  return Buffer.byteLength(String(value || ""), "utf8");
}

function dataUrlBytes(value) {
  if (typeof value !== "string") return 0;
  const comma = value.indexOf(",");
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  return Math.round((payload.length * 3) / 4);
}

function cleanText(value, max = STATE_LIMITS.maxText) {
  return String(value || "").slice(0, max);
}

function cleanDataImage(src, maxBytes = STATE_LIMITS.maxImageBytes) {
  if (typeof src !== "string" || !src.startsWith("data:image/")) return null;
  return dataUrlBytes(src) <= maxBytes ? src : null;
}

function sendMaybeCompressed(res, status, headers, body, req = null) {
  const request = req || res.req;
  const acceptsGzip = /\bgzip\b/i.test(request?.headers?.["accept-encoding"] || "");
  if (!acceptsGzip || body.length < 1024) {
    res.writeHead(status, headers);
    res.end(body);
    return;
  }
  zlib.gzip(body, (error, compressed) => {
    if (error) {
      res.writeHead(status, headers);
      res.end(body);
      return;
    }
    res.writeHead(status, {
      ...headers,
      "content-encoding": "gzip",
      vary: "Accept-Encoding",
    });
    res.end(compressed);
  });
}

function sendSse(client, event, data) {
  client.res.write(`event: ${event}\n`);
  client.res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(room, event, data) {
  for (const [id, client] of room.clients.entries()) {
    try {
      const payload = event === "state" ? { ...data, state: stateForClient(room, client, data.options || {}) } : data;
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

function roomStatsPayload(room) {
  const stateJson = JSON.stringify(room.state || {});
  const imageSources = new Set();
  const addImage = (src) => {
    if (typeof src === "string" && src.startsWith("data:image/")) imageSources.add(src);
  };
  const state = room.state || {};
  (state.tokenAssets || []).forEach((asset) => addImage(asset.src));
  (state.handoutAssets || []).forEach((asset) => addImage(asset.src));
  addImage(state.background?.src);
  (state.scenes || []).forEach((scene) => addImage(scene?.background?.src));
  return {
    room: room.id,
    revision: room.revision,
    clients: room.clients.size,
    stateBytes: bufferBytes(stateJson),
    imageBytes: [...imageSources].reduce((sum, src) => sum + dataUrlBytes(src), 0),
    tokens: (state.tokens || []).length,
    tokenAssets: (state.tokenAssets || []).length,
    handoutAssets: (state.handoutAssets || []).length,
    terrainCells: Object.keys(state.terrain || {}).length,
    fogCells: Object.keys(state.fog || {}).length,
    scenes: (state.scenes || []).length,
    updatedAt: room.updatedAt,
    persistPending: Boolean(room.persistPending),
  };
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

function stripImagePayload(state) {
  if (!state) return state;
  const stripped = cloneJson(state);
  const stripAsset = (asset) => {
    if (!asset || typeof asset !== "object") return asset;
    const next = { ...asset };
    if (typeof next.src === "string" && next.src.startsWith("data:image/")) {
      next.src = null;
      next.srcOmitted = true;
    }
    return next;
  };
  const stripBackground = (background) => {
    if (!background || typeof background !== "object") return background || null;
    const next = { ...background };
    if (typeof next.src === "string" && next.src.startsWith("data:image/")) {
      next.src = null;
      next.srcOmitted = true;
    }
    return next;
  };

  stripped.tokenAssets = (stripped.tokenAssets || []).map(stripAsset);
  stripped.handoutAssets = (stripped.handoutAssets || []).map(stripAsset);
  stripped.background = stripBackground(stripped.background);
  stripped.scenes = (stripped.scenes || []).map((scene) => ({
    ...scene,
    background: stripBackground(scene.background),
  }));
  return stripped;
}

function hydrateImagePayload(incomingState, baseState) {
  if (!incomingState || !baseState) return incomingState || null;
  const hydrated = cloneJson(incomingState);
  const tokenSources = new Map((baseState.tokenAssets || []).map((asset) => [asset.id, asset.src]));
  const handoutSources = new Map((baseState.handoutAssets || []).map((asset) => [asset.id, asset.src]));
  const backgroundSources = new Map();
  if (baseState.background?.id && baseState.background?.src) {
    backgroundSources.set(baseState.background.id, baseState.background.src);
  }
  (baseState.scenes || []).forEach((scene) => {
    if (scene?.background?.id && scene.background.src) {
      backgroundSources.set(scene.background.id, scene.background.src);
    }
  });

  const hydrateAsset = (asset, sources) => {
    if (!asset || asset.src) return asset;
    const src = sources.get(asset.id);
    return src ? { ...asset, src, srcOmitted: false } : asset;
  };
  const hydrateBackground = (background) => {
    if (!background || background.src) return background || null;
    const src = backgroundSources.get(background.id);
    return src ? { ...background, src, srcOmitted: false } : background;
  };

  hydrated.tokenAssets = (hydrated.tokenAssets || []).map((asset) => hydrateAsset(asset, tokenSources));
  hydrated.handoutAssets = (hydrated.handoutAssets || []).map((asset) => hydrateAsset(asset, handoutSources));
  hydrated.background = hydrateBackground(hydrated.background);
  hydrated.scenes = (hydrated.scenes || []).map((scene) => ({
    ...scene,
    background: hydrateBackground(scene.background),
  }));
  return hydrated;
}

function normalizeAsset(asset, maxBytes = STATE_LIMITS.maxImageBytes) {
  if (!asset?.id) return null;
  const src = cleanDataImage(asset.src, maxBytes);
  if (!src) return null;
  return {
    ...asset,
    id: cleanText(asset.id, 80),
    name: cleanText(asset.name || "Asset", 80),
    src,
  };
}

function normalizeToken(token) {
  if (!token?.id || !token.assetId) return null;
  const size = Math.min(6, Math.max(1, Math.ceil(Number(token.size) || 1)));
  return {
    ...token,
    id: cleanText(token.id, 80),
    assetId: cleanText(token.assetId, 80),
    name: token.name ? cleanText(token.name, 40) : undefined,
    note: token.note ? cleanText(token.note, STATE_LIMITS.maxNote) : undefined,
    size,
    visualSize: Math.min(size, Math.max(0.5, Number(token.visualSize) || size)),
    x: Math.max(0, Number(token.x) || 0),
    y: Math.max(0, Number(token.y) || 0),
    conditions: Array.isArray(token.conditions) ? token.conditions.map((id) => cleanText(id, 40)).slice(0, 12) : [],
  };
}

function normalizeHandout(handout) {
  if (!handout?.id || !handout.assetId) return null;
  return {
    ...handout,
    id: cleanText(handout.id, 80),
    assetId: cleanText(handout.assetId, 80),
    x: Math.max(0, Number(handout.x) || 0),
    y: Math.max(0, Number(handout.y) || 0),
    w: Math.min(80, Math.max(1, Number(handout.w) || 4)),
    h: Math.min(80, Math.max(1, Number(handout.h) || 4)),
  };
}

function normalizeScene(scene) {
  if (!scene?.id) return null;
  const normalized = {
    ...scene,
    id: cleanText(scene.id, 80),
    name: cleanText(scene.name || "Сцена", 80),
    tokens: (scene.tokens || []).map(normalizeToken).filter(Boolean).slice(0, STATE_LIMITS.maxTokens),
    handouts: (scene.handouts || []).map(normalizeHandout).filter(Boolean).slice(0, STATE_LIMITS.maxHandouts),
    templates: (scene.templates || []).slice(-STATE_LIMITS.maxTemplates),
    pings: (scene.pings || []).slice(-STATE_LIMITS.maxPings),
    initiative: (scene.initiative || []).slice(0, STATE_LIMITS.maxTokens),
    initiativeRound: Math.max(1, Number(scene.initiativeRound) || 1),
  };
  if (normalized.background?.src) {
    const src = cleanDataImage(normalized.background.src, STATE_LIMITS.maxBackgroundBytes);
    normalized.background = src ? { ...normalized.background, src } : null;
  }
  return normalized;
}

function normalizeRoomState(state) {
  if (!state) return null;
  const normalized = cloneJson(state);
  normalized.sceneName = cleanText(normalized.sceneName || "Сцена", 80);
  normalized.playerNotes = cleanText(normalized.playerNotes || "", STATE_LIMITS.maxText);
  normalized.tokenAssets = (normalized.tokenAssets || []).map((asset) => normalizeAsset(asset)).filter(Boolean).slice(0, STATE_LIMITS.maxAssets);
  normalized.handoutAssets = (normalized.handoutAssets || []).map((asset) => normalizeAsset(asset)).filter(Boolean).slice(0, STATE_LIMITS.maxAssets);
  normalized.tokens = (normalized.tokens || []).map(normalizeToken).filter(Boolean).slice(0, STATE_LIMITS.maxTokens);
  normalized.handouts = (normalized.handouts || []).map(normalizeHandout).filter(Boolean).slice(0, STATE_LIMITS.maxHandouts);
  normalized.templates = (normalized.templates || []).slice(-STATE_LIMITS.maxTemplates);
  normalized.pings = (normalized.pings || []).slice(-STATE_LIMITS.maxPings);
  normalized.rollLog = (normalized.rollLog || []).slice(0, STATE_LIMITS.maxRolls).map((roll) => ({
    ...roll,
    label: cleanText(roll?.label || "", 80),
    detail: cleanText(roll?.detail || "", 240),
  }));
  normalized.initiative = (normalized.initiative || []).slice(0, STATE_LIMITS.maxTokens);
  normalized.initiativeRound = Math.max(1, Number(normalized.initiativeRound) || 1);
  if (normalized.background?.src) {
    const src = cleanDataImage(normalized.background.src, STATE_LIMITS.maxBackgroundBytes);
    normalized.background = src ? { ...normalized.background, src } : null;
  }
  normalized.scenes = (normalized.scenes || []).map(normalizeScene).filter(Boolean).slice(0, STATE_LIMITS.maxScenes);
  return normalized;
}

function applyMasterPatch(baseState, patch) {
  if (!baseState || !patch || typeof patch !== "object") return baseState || null;
  const merged = cloneJson(baseState);
  for (const [field, value] of Object.entries(patch)) {
    if (!MASTER_PATCH_FIELDS.has(field)) continue;
    if (field === "terrainPatch" || field === "fogPatch") continue;
    merged[field] = cloneJson(value);
  }

  if (patch.terrainPatch && typeof patch.terrainPatch === "object") {
    merged.terrain = { ...(merged.terrain || {}) };
    for (const key of patch.terrainPatch.delete || []) {
      delete merged.terrain[key];
    }
    for (const [key, value] of Object.entries(patch.terrainPatch.set || {})) {
      merged.terrain[key] = cloneJson(value);
    }
  }

  if (patch.fogPatch && typeof patch.fogPatch === "object") {
    merged.fog = { ...(merged.fog || {}) };
    for (const key of patch.fogPatch.delete || []) {
      delete merged.fog[key];
    }
    for (const key of patch.fogPatch.set || []) {
      merged.fog[key] = true;
    }
  }

  const activeId = merged.activeSceneId;
  const activeScene = Array.isArray(merged.scenes)
    ? merged.scenes.find((scene) => scene?.id === activeId)
    : null;
  if (activeScene) {
    if (hasOwn(patch, "sceneName")) activeScene.name = String(patch.sceneName || activeScene.name || "Сцена");
    for (const field of SCENE_PATCH_FIELDS) {
      if (hasOwn(patch, field)) activeScene[field] = cloneJson(patch[field]);
    }
    if (patch.terrainPatch) activeScene.terrain = cloneJson(merged.terrain || {});
    if (patch.fogPatch) activeScene.fog = cloneJson(merged.fog || {});
  }

  return hydrateImagePayload(merged, baseState);
}

function imagePayloadSignature(state) {
  if (!state) return "";
  const parts = [];
  const addAsset = (type, asset) => {
    if (!asset?.id || typeof asset.src !== "string") return;
    parts.push(`${type}:${asset.id}:${asset.src.length}`);
  };
  const addBackground = (type, background) => {
    if (!background?.id || typeof background.src !== "string") return;
    parts.push(`${type}:${background.id}:${background.src.length}`);
  };

  (state.tokenAssets || []).forEach((asset) => addAsset("token", asset));
  (state.handoutAssets || []).forEach((asset) => addAsset("handout", asset));
  addBackground("background", state.background);
  (state.scenes || []).forEach((scene) => addBackground(`scene:${scene?.id || ""}`, scene?.background));
  return parts.sort().join("|");
}

function stateForClient(room, client, options = {}) {
  const fullState = !client || client.profile?.role === "master" ? room.state : sanitizeStateForPlayer(room.state);
  return options.stripImages ? stripImagePayload(fullState) : fullState;
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
    const headers = {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-cache",
    };
    const compressible = /^(text\/|application\/json|text\/javascript)/.test(headers["content-type"]);
    if (compressible) {
      sendMaybeCompressed(res, 200, headers, data, req);
    } else {
      res.writeHead(200, headers);
      res.end(data);
    }
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(events|state|presence|stats))?$/);

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

    if (req.method === "GET" && action === "stats") {
      pruneStaleClients(room);
      sendJson(res, 200, roomStatsPayload(room));
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
        const previousImageSignature = imagePayloadSignature(room.state);
        room.state = role === "master"
          ? (payload.patch ? applyMasterPatch(room.state, payload.patch) : hydrateImagePayload(payload.state, room.state))
          : mergePlayerState(room.state, payload.state, clientId);
        room.state = normalizeRoomState(room.state);
        const nextImageSignature = imagePayloadSignature(room.state);
        const stripImages = previousImageSignature && previousImageSignature === nextImageSignature;
        room.revision += 1;
        room.updatedAt = Date.now();
        schedulePersistRoom(room);
        const event = {
          room: room.id,
          revision: room.revision,
          state: room.state,
          sourceClientId: clientId,
          clients: room.clients.size,
          players: playersPayload(room),
          masterClientId: room.masterClientId,
          options: { stripImages },
        };
        broadcast(room, "state", event);
        sendJson(res, 200, {
          ...event,
          options: undefined,
          state: stateForClient(room, client || { profile: { role } }, { stripImages }),
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

process.on("beforeExit", persistPendingRooms);
process.on("SIGTERM", () => {
  persistPendingRooms();
  process.exit(0);
});

module.exports = { createServer };
