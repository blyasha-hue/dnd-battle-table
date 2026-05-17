const STORAGE_KEY = "dnd-battle-table-v1";
const CLIENT_KEY = "dnd-battle-table-client-id";
const ROOM_KEY = "dnd-battle-table-room";

const canvas = document.querySelector("#battleCanvas");
const ctx = canvas.getContext("2d");
const canvasShell = document.querySelector("#canvasShell");
const toast = document.querySelector("#toast");

const els = {
  autosaveStatus: document.querySelector("#autosaveStatus"),
  onlineStatus: document.querySelector("#onlineStatus"),
  roomInput: document.querySelector("#roomInput"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  copyInviteBtn: document.querySelector("#copyInviteBtn"),
  onlineHint: document.querySelector("#onlineHint"),
  connectedCount: document.querySelector("#connectedCount"),
  sceneTitle: document.querySelector("#sceneTitle"),
  sceneMeta: document.querySelector("#sceneMeta"),
  modeChip: document.querySelector("#modeChip"),
  colsInput: document.querySelector("#colsInput"),
  rowsInput: document.querySelector("#rowsInput"),
  cellInput: document.querySelector("#cellInput"),
  zoomInput: document.querySelector("#zoomInput"),
  gridToggle: document.querySelector("#gridToggle"),
  brushColorInput: document.querySelector("#brushColorInput"),
  sceneNameInput: document.querySelector("#sceneNameInput"),
  tokenNameInput: document.querySelector("#tokenNameInput"),
  tokenSizeInput: document.querySelector("#tokenSizeInput"),
  tokenImageInput: document.querySelector("#tokenImageInput"),
  handoutImageInput: document.querySelector("#handoutImageInput"),
  handoutWidthInput: document.querySelector("#handoutWidthInput"),
  handoutHeightInput: document.querySelector("#handoutHeightInput"),
  tokenAssets: document.querySelector("#tokenAssets"),
  handoutAssets: document.querySelector("#handoutAssets"),
  musicUrlInput: document.querySelector("#musicUrlInput"),
  musicNameInput: document.querySelector("#musicNameInput"),
  musicFileInput: document.querySelector("#musicFileInput"),
  musicList: document.querySelector("#musicList"),
  audioPlayer: document.querySelector("#audioPlayer"),
  diceFormulaInput: document.querySelector("#diceFormulaInput"),
  rollLog: document.querySelector("#rollLog"),
};

const toolNames = {
  paint: "Кисть",
  erase: "Ластик",
  token: "Фигурки",
  image: "Картинки",
  select: "Выбор",
};

const defaultState = {
  sceneName: "Засада у старой дороги",
  cols: 24,
  rows: 16,
  cell: 42,
  zoom: 100,
  showGrid: true,
  activeTool: "paint",
  brushColor: "#6f8f53",
  terrain: {},
  tokenAssets: [],
  handoutAssets: [],
  tokens: [],
  handouts: [],
  selectedTokenAssetId: null,
  selectedHandoutAssetId: null,
  selectedObject: null,
  musicTracks: [],
  currentTrackId: null,
  rollLog: [],
};

let state = loadState();
let drag = null;
let imageCache = new Map();
let saveTimer = null;
let toastTimer = null;
let transientUrls = new Set();
let syncTimer = null;
let heartbeatTimer = null;

const sync = {
  online: location.protocol === "http:" || location.protocol === "https:",
  clientId: getClientId(),
  roomId: getRoomFromUrl(),
  revision: 0,
  source: null,
  applyingRemote: false,
  ready: false,
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeStorageGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be blocked in private modes; the table still works without it.
  }
}

function getClientId() {
  const stored = safeStorageGet(sessionStorage, CLIENT_KEY);
  if (stored) return stored;
  const id = uid("client");
  safeStorageSet(sessionStorage, CLIENT_KEY, id);
  return id;
}

function cleanRoomId(value) {
  return (
    String(value || "main")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "main"
  );
}

function getRoomFromUrl() {
  const params = new URLSearchParams(location.search);
  return cleanRoomId(params.get("room") || safeStorageGet(localStorage, ROOM_KEY) || "main");
}

function loadState() {
  try {
    const raw = safeStorageGet(localStorage, STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      activeTool: parsed.activeTool || "paint",
      musicTracks: (parsed.musicTracks || []).filter((track) => !track.transient),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function serializeState(source) {
  return {
    ...source,
    selectedObject: source.selectedObject || null,
    musicTracks: (source.musicTracks || []).filter((track) => !track.transient),
  };
}

function applyRemoteState(nextState, revision = sync.revision) {
  if (!nextState) return;
  sync.applyingRemote = true;
  state = {
    ...structuredClone(defaultState),
    ...nextState,
    activeTool: state.activeTool || nextState.activeTool || "paint",
    selectedObject: state.selectedObject,
    musicTracks: (nextState.musicTracks || []).filter((track) => !track.transient),
  };
  sync.revision = Math.max(sync.revision, Number(revision || 0));
  imageCache = new Map();
  renderAll();
  sync.applyingRemote = false;
}

function saveState() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const serializable = serializeState(state);
      safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(serializable));
      els.autosaveStatus.textContent = sync.online ? "Автосохранено и синхронизируется" : "Автосохранено";
      if (sync.online && !sync.applyingRemote && sync.ready) {
        scheduleSync();
      }
    } catch {
      els.autosaveStatus.textContent = "Автосохранение переполнено";
      showToast("Сцена работает, но браузер не смог сохранить ее целиком.");
    }
  }, 180);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function setOnlineStatus(kind, text, clients = null) {
  els.onlineStatus.className = `status-pill ${kind}`;
  els.onlineStatus.textContent = text;
  if (clients !== null) {
    els.connectedCount.textContent = `Игроков: ${clients}`;
  }
}

function roomUrl(roomId = sync.roomId) {
  const url = new URL(location.href);
  url.searchParams.set("room", cleanRoomId(roomId));
  return url.toString();
}

function updateRoomUi() {
  els.roomInput.value = sync.roomId;
  if (sync.online) {
    els.onlineHint.textContent = "Отправь игрокам ссылку на эту комнату.";
  } else {
    els.onlineHint.textContent = "Открой через server.js, чтобы играть вместе.";
  }
}

async function connectOnline() {
  updateRoomUi();
  if (!sync.online) {
    setOnlineStatus("offline", "Офлайн", 1);
    return;
  }

  safeStorageSet(localStorage, ROOM_KEY, sync.roomId);
  setOnlineStatus("connecting", "Подключение");

  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(sync.roomId)}`);
    if (!response.ok) throw new Error("Room unavailable");
    const data = await response.json();
    sync.revision = Number(data.revision || 0);
    sync.ready = true;
    if (data.state) {
      applyRemoteState(data.state, data.revision);
    } else {
      scheduleSync(20);
    }
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
    openEventStream();
    startHeartbeat();
  } catch {
    sync.ready = false;
    setOnlineStatus("offline", "Нет связи", 1);
    els.onlineHint.textContent = "Сервер не отвечает. Запусти: node server.js";
  }
}

function startHeartbeat() {
  window.clearInterval(heartbeatTimer);
  heartbeatTimer = window.setInterval(() => {
    if (!sync.online || !sync.ready) return;
    fetch(`/api/rooms/${encodeURIComponent(sync.roomId)}`).catch(() => {
      setOnlineStatus("connecting", "Переподключение");
    });
  }, 4 * 60 * 1000);
}

function openEventStream() {
  if (sync.source) {
    sync.source.close();
  }

  sync.source = new EventSource(
    `/api/rooms/${encodeURIComponent(sync.roomId)}/events?client=${encodeURIComponent(sync.clientId)}`,
  );

  sync.source.addEventListener("hello", (event) => {
    const data = JSON.parse(event.data);
    if (data.state && Number(data.revision || 0) > sync.revision) {
      applyRemoteState(data.state, data.revision);
    }
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  });

  sync.source.addEventListener("clients", (event) => {
    const data = JSON.parse(event.data);
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  });

  sync.source.addEventListener("state", (event) => {
    const data = JSON.parse(event.data);
    const nextRevision = Number(data.revision || 0);
    if (data.sourceClientId === sync.clientId) {
      sync.revision = Math.max(sync.revision, nextRevision);
      setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
      return;
    }
    if (nextRevision > sync.revision) {
      applyRemoteState(data.state, nextRevision);
    }
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  });

  sync.source.onerror = () => {
    setOnlineStatus("connecting", "Переподключение");
  };
}

function scheduleSync(delay = 260) {
  if (!sync.online || !sync.ready) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(pushState, delay);
}

async function pushState() {
  if (!sync.online || !sync.ready || sync.applyingRemote) return;
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(sync.roomId)}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: sync.clientId,
        revision: sync.revision,
        state: serializeState(state),
      }),
    });
    if (!response.ok) throw new Error("Sync failed");
    const data = await response.json();
    sync.revision = Number(data.revision || sync.revision);
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  } catch {
    setOnlineStatus("offline", "Нет связи");
  }
}

function getImage(src) {
  if (!src) return null;
  if (imageCache.has(src)) return imageCache.get(src);
  const img = new Image();
  img.onload = renderCanvas;
  img.onerror = renderCanvas;
  img.src = src;
  imageCache.set(src, img);
  return img;
}

function resizeCanvas() {
  const width = state.cols * state.cell;
  const height = state.rows * state.cell;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  canvas.style.width = `${width * (state.zoom / 100)}px`;
  canvas.style.height = `${height * (state.zoom / 100)}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  renderCanvas();
}

function syncInputs() {
  els.sceneTitle.textContent = state.sceneName;
  els.sceneMeta.textContent = `${state.cols} x ${state.rows} клеток`;
  els.modeChip.textContent = toolNames[state.activeTool];
  els.colsInput.value = state.cols;
  els.rowsInput.value = state.rows;
  els.cellInput.value = state.cell;
  els.zoomInput.value = state.zoom;
  els.gridToggle.checked = state.showGrid;
  els.brushColorInput.value = state.brushColor;
  els.sceneNameInput.value = state.sceneName;

  document.querySelectorAll(".tool-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.activeTool);
  });
  document.querySelectorAll(".swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.color === state.brushColor);
  });
}

function renderAll() {
  syncInputs();
  resizeCanvas();
  renderAssets();
  renderMusic();
  renderRollLog();
  saveState();
}

function renderCanvas() {
  const width = state.cols * state.cell;
  const height = state.rows * state.cell;
  ctx.clearRect(0, 0, width, height);

  drawBase(width, height);
  drawTerrain();
  drawHandouts();
  drawGrid(width, height);
  drawTokens();
  drawSelection();
}

function drawBase(width, height) {
  ctx.fillStyle = "#272216";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
  for (let y = 0; y < height; y += state.cell * 2) {
    ctx.fillRect(0, y, width, state.cell);
  }
}

function drawTerrain() {
  Object.entries(state.terrain).forEach(([key, color]) => {
    const [x, y] = key.split(",").map(Number);
    ctx.fillStyle = color;
    ctx.fillRect(x * state.cell, y * state.cell, state.cell, state.cell);
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(x * state.cell, y * state.cell + state.cell * 0.72, state.cell, state.cell * 0.28);
  });
}

function drawGrid(width, height) {
  if (!state.showGrid) return;
  ctx.save();
  ctx.strokeStyle = "rgba(246, 234, 211, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x += state.cell) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += state.cell) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

function drawTokens() {
  state.tokens.forEach((token) => {
    const asset = state.tokenAssets.find((item) => item.id === token.assetId);
    const px = token.x * state.cell;
    const py = token.y * state.cell;
    const size = token.size * state.cell;
    const centerX = px + size / 2;
    const centerY = py + size / 2;
    const radius = size / 2 - 4;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(8, radius), 0, Math.PI * 2);
    ctx.clip();
    const img = getImage(asset?.src);
    if (img?.complete && img.naturalWidth) {
      drawCoverImage(img, px + 4, py + 4, size - 8, size - 8);
    } else {
      ctx.fillStyle = "#6f8f53";
      ctx.fillRect(px + 4, py + 4, size - 8, size - 8);
    }
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = state.selectedObject?.id === token.id ? "#d1a850" : "#11100f";
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(8, radius), 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(243, 234, 215, 0.85)";
    ctx.stroke();
    ctx.restore();

    if (token.name) {
      ctx.save();
      ctx.font = "12px Inter, system-ui, sans-serif";
      const label = token.name.slice(0, 20);
      const metrics = ctx.measureText(label);
      const labelWidth = Math.min(size + 36, metrics.width + 14);
      const labelX = px + size / 2 - labelWidth / 2;
      const labelY = py + size + 4;
      ctx.fillStyle = "rgba(17, 16, 15, 0.82)";
      roundRect(labelX, labelY, labelWidth, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#f3ead7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, px + size / 2, labelY + 10, labelWidth - 8);
      ctx.restore();
    }
  });
}

function drawHandouts() {
  state.handouts.forEach((handout) => {
    const asset = state.handoutAssets.find((item) => item.id === handout.assetId);
    const px = handout.x * state.cell;
    const py = handout.y * state.cell;
    const w = handout.w * state.cell;
    const h = handout.h * state.cell;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(px + 5, py + 5, w, h);
    ctx.fillStyle = "#151412";
    ctx.fillRect(px, py, w, h);
    const img = getImage(asset?.src);
    if (img?.complete && img.naturalWidth) {
      drawContainImage(img, px, py, w, h);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = state.selectedObject?.id === handout.id ? "#d1a850" : "rgba(243, 234, 215, 0.75)";
    ctx.strokeRect(px + 1, py + 1, w - 2, h - 2);

    if (state.selectedObject?.id === handout.id) {
      ctx.fillStyle = "#d1a850";
      ctx.fillRect(px + w - 13, py + h - 13, 10, 10);
    }
    ctx.restore();
  });
}

function drawSelection() {
  if (!state.selectedObject) return;
  const object =
    state.selectedObject.type === "token"
      ? state.tokens.find((item) => item.id === state.selectedObject.id)
      : state.handouts.find((item) => item.id === state.selectedObject.id);
  if (!object) return;
  const px = object.x * state.cell;
  const py = object.y * state.cell;
  const w = (object.size || object.w) * state.cell;
  const h = (object.size || object.h) * state.cell;
  ctx.save();
  ctx.strokeStyle = "rgba(209, 168, 80, 0.55)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeRect(px - 4, py - 4, w + 8, h + 8);
  ctx.restore();
}

function drawCoverImage(img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function drawContainImage(img, x, y, w, h) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * scale;
  const ih = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const zoom = state.zoom / 100;
  const x = (event.clientX - rect.left) / zoom;
  const y = (event.clientY - rect.top) / zoom;
  return {
    x: clamp(x, 0, state.cols * state.cell),
    y: clamp(y, 0, state.rows * state.cell),
    cellX: clamp(Math.floor(x / state.cell), 0, state.cols - 1),
    cellY: clamp(Math.floor(y / state.cell), 0, state.rows - 1),
  };
}

function setTerrainAt(point) {
  const key = `${point.cellX},${point.cellY}`;
  if (state.activeTool === "erase") {
    delete state.terrain[key];
  } else {
    state.terrain[key] = state.brushColor;
  }
  renderCanvas();
  saveState();
}

function objectAt(point) {
  for (let i = state.tokens.length - 1; i >= 0; i -= 1) {
    const token = state.tokens[i];
    if (
      point.cellX >= token.x &&
      point.cellX < token.x + token.size &&
      point.cellY >= token.y &&
      point.cellY < token.y + token.size
    ) {
      return { type: "token", object: token };
    }
  }
  for (let i = state.handouts.length - 1; i >= 0; i -= 1) {
    const handout = state.handouts[i];
    if (
      point.cellX >= handout.x &&
      point.cellX < handout.x + handout.w &&
      point.cellY >= handout.y &&
      point.cellY < handout.y + handout.h
    ) {
      return { type: "handout", object: handout };
    }
  }
  return null;
}

function selectObject(type, object) {
  state.selectedObject = { type, id: object.id };
  renderCanvas();
  saveState();
}

function placeToken(point) {
  const asset = state.tokenAssets.find((item) => item.id === state.selectedTokenAssetId);
  if (!asset) {
    showToast("Сначала добавь и выбери изображение фигурки.");
    return;
  }
  const size = clamp(Number(els.tokenSizeInput.value) || 1, 1, 6);
  const token = {
    id: uid("token"),
    assetId: asset.id,
    name: els.tokenNameInput.value.trim() || asset.name.replace(/\.[^.]+$/, ""),
    size,
    x: clamp(point.cellX, 0, state.cols - size),
    y: clamp(point.cellY, 0, state.rows - size),
  };
  state.tokens.push(token);
  selectObject("token", token);
  showToast("Фигурка поставлена на поле.");
}

function placeHandout(point) {
  const asset = state.handoutAssets.find((item) => item.id === state.selectedHandoutAssetId);
  if (!asset) {
    showToast("Сначала добавь и выбери картинку.");
    return;
  }
  const w = clamp(Number(els.handoutWidthInput.value) || 5, 2, 16);
  const h = clamp(Number(els.handoutHeightInput.value) || 4, 2, 16);
  const handout = {
    id: uid("handout"),
    assetId: asset.id,
    x: clamp(point.cellX, 0, state.cols - w),
    y: clamp(point.cellY, 0, state.rows - h),
    w,
    h,
  };
  state.handouts.push(handout);
  selectObject("handout", handout);
  showToast("Картинка размещена на поле.");
}

function beginDrag(type, object, point) {
  selectObject(type, object);
  const resizing =
    type === "handout" &&
    point.cellX >= object.x + object.w - 1 &&
    point.cellY >= object.y + object.h - 1;
  drag = {
    type,
    id: object.id,
    mode: resizing ? "resize" : "move",
    offsetX: point.cellX - object.x,
    offsetY: point.cellY - object.y,
  };
}

function moveDrag(point) {
  if (!drag) return;
  const collection = drag.type === "token" ? state.tokens : state.handouts;
  const object = collection.find((item) => item.id === drag.id);
  if (!object) return;

  if (drag.mode === "resize" && drag.type === "handout") {
    object.w = clamp(point.cellX - object.x + 1, 2, state.cols - object.x);
    object.h = clamp(point.cellY - object.y + 1, 2, state.rows - object.y);
  } else {
    const w = object.size || object.w;
    const h = object.size || object.h;
    object.x = clamp(point.cellX - drag.offsetX, 0, state.cols - w);
    object.y = clamp(point.cellY - drag.offsetY, 0, state.rows - h);
  }
  renderCanvas();
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  const hit = objectAt(point);

  if (hit && ["select", "token", "image"].includes(state.activeTool)) {
    beginDrag(hit.type, hit.object, point);
    return;
  }

  if (state.activeTool === "paint" || state.activeTool === "erase") {
    drag = { type: "paint" };
    setTerrainAt(point);
    return;
  }

  if (state.activeTool === "token") {
    placeToken(point);
    return;
  }

  if (state.activeTool === "image") {
    placeHandout(point);
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const point = canvasPoint(event);
  if (drag.type === "paint") {
    setTerrainAt(point);
  } else {
    moveDrag(point);
  }
});

canvas.addEventListener("pointerup", () => {
  if (drag) saveState();
  drag = null;
});

canvas.addEventListener("pointercancel", () => {
  if (drag) saveState();
  drag = null;
});

function renderAssets() {
  renderAssetList({
    container: els.tokenAssets,
    assets: state.tokenAssets,
    selectedId: state.selectedTokenAssetId,
    type: "token",
  });
  renderAssetList({
    container: els.handoutAssets,
    assets: state.handoutAssets,
    selectedId: state.selectedHandoutAssetId,
    type: "handout",
  });
}

function renderAssetList({ container, assets, selectedId, type }) {
  container.innerHTML = "";
  if (!assets.length) {
    const empty = document.createElement("div");
    empty.className = "asset-item";
    empty.innerHTML = `<div></div><div><div class="asset-title">Пока пусто</div><div class="asset-meta">Нажми +, чтобы добавить</div></div><div></div>`;
    container.appendChild(empty);
    return;
  }
  assets.forEach((asset) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `asset-item ${selectedId === asset.id ? "selected" : ""}`;
    item.innerHTML = `
      <img class="asset-thumb" src="${asset.src}" alt="">
      <div>
        <div class="asset-title">${escapeHtml(asset.name)}</div>
        <div class="asset-meta">${type === "token" ? "Фигурка" : "Картинка"}</div>
      </div>
      <span class="icon-action" aria-hidden="true">+</span>
    `;
    item.addEventListener("click", () => {
      if (type === "token") {
        state.selectedTokenAssetId = asset.id;
        state.activeTool = "token";
      } else {
        state.selectedHandoutAssetId = asset.id;
        state.activeTool = "image";
      }
      renderAll();
      showToast(type === "token" ? "Кликни по клетке, чтобы поставить фигурку." : "Кликни по полю, чтобы показать картинку.");
    });
    container.appendChild(item);
  });
}

function addImageFiles(files, type) {
  [...files].forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const asset = {
        id: uid(type),
        name: file.name,
        src: reader.result,
      };
      if (type === "token") {
        state.tokenAssets.push(asset);
        state.selectedTokenAssetId = asset.id;
        state.activeTool = "token";
        if (!els.tokenNameInput.value) {
          els.tokenNameInput.value = file.name.replace(/\.[^.]+$/, "").slice(0, 24);
        }
      } else {
        state.handoutAssets.push(asset);
        state.selectedHandoutAssetId = asset.id;
        state.activeTool = "image";
      }
      renderAll();
    };
    reader.readAsDataURL(file);
  });
}

els.tokenImageInput.addEventListener("change", (event) => {
  addImageFiles(event.target.files, "token");
  event.target.value = "";
});

els.handoutImageInput.addEventListener("change", (event) => {
  addImageFiles(event.target.files, "handout");
  event.target.value = "";
});

function renderMusic() {
  els.musicList.innerHTML = "";
  const current = state.musicTracks.find((track) => track.id === state.currentTrackId);
  if (current && els.audioPlayer.src !== current.src) {
    els.audioPlayer.src = current.src;
  }

  if (!state.musicTracks.length) {
    const empty = document.createElement("div");
    empty.className = "track-item";
    empty.innerHTML = `<div></div><div><div class="track-title">Плейлист пуст</div><div class="track-meta">Добавь URL или файл</div></div><div></div>`;
    els.musicList.appendChild(empty);
    return;
  }

  state.musicTracks.forEach((track) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `track-item ${state.currentTrackId === track.id ? "selected" : ""}`;
    item.innerHTML = `
      <span class="brand-mark" aria-hidden="true">♪</span>
      <div>
        <div class="track-title">${escapeHtml(track.name)}</div>
        <div class="track-meta">${track.transient ? "Локальный файл" : "Открытая ссылка"}</div>
      </div>
      <span class="icon-action" aria-hidden="true">▶</span>
    `;
    item.addEventListener("click", async () => {
      state.currentTrackId = track.id;
      els.audioPlayer.src = track.src;
      renderMusic();
      saveState();
      try {
        await els.audioPlayer.play();
      } catch {
        showToast("Браузер попросит нажать Play вручную.");
      }
    });
    els.musicList.appendChild(item);
  });
}

document.querySelector("#addMusicUrlBtn").addEventListener("click", () => {
  const src = els.musicUrlInput.value.trim();
  if (!src) {
    showToast("Вставь прямую ссылку на MP3 или OGG.");
    return;
  }
  const name = els.musicNameInput.value.trim() || src.split("/").pop() || "Трек";
  const track = { id: uid("track"), name, src, transient: false };
  state.musicTracks.push(track);
  state.currentTrackId = track.id;
  els.musicUrlInput.value = "";
  els.musicNameInput.value = "";
  renderAll();
  showToast("Трек добавлен в плейлист.");
});

els.joinRoomBtn.addEventListener("click", () => {
  const nextRoom = cleanRoomId(els.roomInput.value);
  if (!sync.online) {
    showToast("Для общей комнаты запусти сайт через server.js.");
    return;
  }
  location.href = roomUrl(nextRoom);
});

els.roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    els.joinRoomBtn.click();
  }
});

els.copyInviteBtn.addEventListener("click", async () => {
  if (!sync.online) {
    showToast("Сначала запусти сервер, потом появится ссылка для игроков.");
    return;
  }
  const invite = roomUrl(cleanRoomId(els.roomInput.value));
  try {
    await navigator.clipboard.writeText(invite);
    showToast("Ссылка на комнату скопирована.");
  } catch {
    window.prompt("Скопируй ссылку для игроков:", invite);
  }
});

els.musicFileInput.addEventListener("change", (event) => {
  [...event.target.files].forEach((file) => {
    if (!file.type.startsWith("audio/")) return;
    const src = URL.createObjectURL(file);
    transientUrls.add(src);
    const track = { id: uid("track"), name: file.name, src, transient: true };
    state.musicTracks.push(track);
    state.currentTrackId = track.id;
  });
  event.target.value = "";
  renderAll();
});

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function parseAndRoll(formula) {
  const clean = formula.toLowerCase().replace(/\s+/g, "");
  const tokens = clean.match(/[+-]?(\d*d\d+|\d+)/g);
  if (!tokens || tokens.join("") !== clean) {
    throw new Error("Формула не распознана");
  }

  let total = 0;
  const parts = [];
  tokens.forEach((token) => {
    const sign = token.startsWith("-") ? -1 : 1;
    const body = token.replace(/^[+-]/, "");
    if (body.includes("d")) {
      const [countRaw, sidesRaw] = body.split("d");
      const count = clamp(Number(countRaw) || 1, 1, 100);
      const sides = clamp(Number(sidesRaw), 2, 1000);
      const rolls = Array.from({ length: count }, () => rollDie(sides));
      const subtotal = rolls.reduce((sum, roll) => sum + roll, 0) * sign;
      total += subtotal;
      parts.push(`${sign < 0 ? "-" : ""}${count}d${sides} [${rolls.join(", ")}]`);
    } else {
      const value = Number(body) * sign;
      total += value;
      parts.push(`${value >= 0 ? "+" : ""}${value}`);
    }
  });

  return { total, detail: parts.join(" ") };
}

function addRoll(label, total, detail) {
  state.rollLog.unshift({
    id: uid("roll"),
    label,
    total,
    detail,
    time: new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  });
  state.rollLog = state.rollLog.slice(0, 12);
  renderRollLog();
  saveState();
}

function renderRollLog() {
  els.rollLog.innerHTML = "";
  state.rollLog.forEach((entry) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <div><strong>${escapeHtml(entry.label)}</strong> <span class="asset-meta">${entry.time}</span></div>
      <div><span class="roll-total">${entry.total}</span> <span class="asset-meta">${escapeHtml(entry.detail)}</span></div>
    `;
    els.rollLog.appendChild(item);
  });
}

function rollFormula(formula) {
  try {
    const result = parseAndRoll(formula);
    addRoll(formula, result.total, result.detail);
  } catch {
    showToast("Пример формулы: 1d20+5, 2d6+3, d100.");
  }
}

document.querySelectorAll("[data-dice]").forEach((button) => {
  button.addEventListener("click", () => rollFormula(button.dataset.dice));
});

document.querySelector("#rollFormulaBtn").addEventListener("click", () => {
  rollFormula(els.diceFormulaInput.value);
});

els.diceFormulaInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") rollFormula(els.diceFormulaInput.value);
});

document.querySelector("#rollAdvBtn").addEventListener("click", () => {
  const first = rollDie(20);
  const second = rollDie(20);
  addRoll("Преимущество", Math.max(first, second), `d20 [${first}, ${second}]`);
});

document.querySelector("#rollDisBtn").addEventListener("click", () => {
  const first = rollDie(20);
  const second = rollDie(20);
  addRoll("Помеха", Math.min(first, second), `d20 [${first}, ${second}]`);
});

document.querySelectorAll(".tool-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeTool = button.dataset.tool;
    renderAll();
  });
});

document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    state.brushColor = button.dataset.color;
    renderAll();
  });
});

els.brushColorInput.addEventListener("input", (event) => {
  state.brushColor = event.target.value;
  syncInputs();
  saveState();
});

els.sceneNameInput.addEventListener("input", (event) => {
  state.sceneName = event.target.value || "Без названия";
  syncInputs();
  saveState();
});

els.gridToggle.addEventListener("change", (event) => {
  state.showGrid = event.target.checked;
  renderAll();
});

els.zoomInput.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  renderAll();
});

function applyMapInputs() {
  state.cols = clamp(Number(els.colsInput.value) || state.cols, 8, 80);
  state.rows = clamp(Number(els.rowsInput.value) || state.rows, 8, 60);
  state.cell = clamp(Number(els.cellInput.value) || state.cell, 28, 80);
  state.tokens.forEach((token) => {
    token.x = clamp(token.x, 0, state.cols - token.size);
    token.y = clamp(token.y, 0, state.rows - token.size);
  });
  state.handouts.forEach((handout) => {
    handout.x = clamp(handout.x, 0, state.cols - handout.w);
    handout.y = clamp(handout.y, 0, state.rows - handout.h);
  });
  Object.keys(state.terrain).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (x >= state.cols || y >= state.rows) delete state.terrain[key];
  });
  renderAll();
}

["colsInput", "rowsInput", "cellInput"].forEach((id) => {
  els[id].addEventListener("change", applyMapInputs);
});

document.querySelector("#newMapBtn").addEventListener("click", () => {
  applyMapInputs();
  state.terrain = {};
  state.tokens = [];
  state.handouts = [];
  state.selectedObject = null;
  renderAll();
  showToast("Создана чистая карта с выбранным размером.");
});

document.querySelector("#clearPaintBtn").addEventListener("click", () => {
  state.terrain = {};
  renderAll();
});

document.querySelector("#clearTokensBtn").addEventListener("click", () => {
  state.tokens = [];
  state.handouts = [];
  state.selectedObject = null;
  renderAll();
});

document.querySelector("#resetSceneBtn").addEventListener("click", () => {
  if (!confirm("Сбросить карту, изображения, музыку и историю бросков?")) return;
  transientUrls.forEach((src) => URL.revokeObjectURL(src));
  transientUrls.clear();
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  imageCache = new Map();
  els.audioPlayer.removeAttribute("src");
  renderAll();
});

document.querySelector("#exportSceneBtn").addEventListener("click", () => {
  const payload = JSON.stringify(
    {
      ...state,
      musicTracks: state.musicTracks.filter((track) => !track.transient),
    },
    null,
    2,
  );
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.sceneName.replace(/[^\p{L}\p{N}]+/gu, "-") || "dnd-scene"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

document.querySelector("#importSceneInput").addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      state = {
        ...structuredClone(defaultState),
        ...imported,
        musicTracks: (imported.musicTracks || []).filter((track) => !track.transient),
      };
      imageCache = new Map();
      renderAll();
      showToast("Сцена импортирована.");
    } catch {
      showToast("Не получилось прочитать JSON сцены.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

window.addEventListener("keydown", (event) => {
  if (event.target.matches("input, textarea")) return;
  const keyMap = {
    b: "paint",
    e: "erase",
    t: "token",
    i: "image",
    v: "select",
  };
  if (keyMap[event.key.toLowerCase()]) {
    state.activeTool = keyMap[event.key.toLowerCase()];
    renderAll();
  }
  if (event.key === "Delete" && state.selectedObject) {
    if (state.selectedObject.type === "token") {
      state.tokens = state.tokens.filter((item) => item.id !== state.selectedObject.id);
    } else {
      state.handouts = state.handouts.filter((item) => item.id !== state.selectedObject.id);
    }
    state.selectedObject = null;
    renderAll();
  }
});

window.addEventListener("beforeunload", () => {
  transientUrls.forEach((src) => URL.revokeObjectURL(src));
});

renderAll();
connectOnline();
