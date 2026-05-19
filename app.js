const STORAGE_KEY = "dnd-battle-table-v1";
const CLIENT_KEY = "dnd-battle-table-client-id";
const ROOM_KEY = "dnd-battle-table-room";
const MAP_LIMITS = {
  minCols: 8,
  maxCols: 160,
  minRows: 8,
  maxRows: 160,
  minCell: 16,
  maxCell: 160,
};

const canvas = document.querySelector("#battleCanvas");
const ctx = canvas.getContext("2d");
const canvasShell = document.querySelector("#canvasShell");
const toast = document.querySelector("#toast");
const appRoot = document.querySelector(".app");

const els = {
  autosaveStatus: document.querySelector("#autosaveStatus"),
  topDrawerToggle: document.querySelector("#topDrawerToggle"),
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
  mapBackgroundInput: document.querySelector("#mapBackgroundInput"),
  clearBackgroundBtn: document.querySelector("#clearBackgroundBtn"),
  brushColorInput: document.querySelector("#brushColorInput"),
  brushOpacityInput: document.querySelector("#brushOpacityInput"),
  brushOpacityValue: document.querySelector("#brushOpacityValue"),
  brushSizeInput: document.querySelector("#brushSizeInput"),
  brushSizeValue: document.querySelector("#brushSizeValue"),
  brushPreview: document.querySelector("#brushPreview"),
  sceneNameInput: document.querySelector("#sceneNameInput"),
  sceneList: document.querySelector("#sceneList"),
  newSceneBtn: document.querySelector("#newSceneBtn"),
  duplicateSceneBtn: document.querySelector("#duplicateSceneBtn"),
  deleteSceneBtn: document.querySelector("#deleteSceneBtn"),
  tokenNameInput: document.querySelector("#tokenNameInput"),
  tokenSizeInput: document.querySelector("#tokenSizeInput"),
  tokenImageInput: document.querySelector("#tokenImageInput"),
  handoutImageInput: document.querySelector("#handoutImageInput"),
  handoutWidthInput: document.querySelector("#handoutWidthInput"),
  handoutHeightInput: document.querySelector("#handoutHeightInput"),
  tokenAssets: document.querySelector("#tokenAssets"),
  handoutAssets: document.querySelector("#handoutAssets"),
  templateShapeInput: document.querySelector("#templateShapeInput"),
  templateSizeInput: document.querySelector("#templateSizeInput"),
  templateCenterInput: document.querySelector("#templateCenterInput"),
  templateColorInput: document.querySelector("#templateColorInput"),
  templateOpacityInput: document.querySelector("#templateOpacityInput"),
  clearMeasureBtn: document.querySelector("#clearMeasureBtn"),
  clearTemplatesBtn: document.querySelector("#clearTemplatesBtn"),
  nextInitiativeBtn: document.querySelector("#nextInitiativeBtn"),
  collectInitiativeBtn: document.querySelector("#collectInitiativeBtn"),
  clearInitiativeBtn: document.querySelector("#clearInitiativeBtn"),
  initiativeList: document.querySelector("#initiativeList"),
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
  measure: "Линейка",
  template: "Шаблон",
  ping: "Пинг",
};

const TEMPLATE_COVERAGE_THRESHOLD = 0.5;
const TEMPLATE_COVERAGE_SAMPLES = 9;
const TEMPLATE_CONE_SPREAD = Math.PI / 6;
const initiativeSides = ["red", "blue", "gray", "green"];
const initiativeSideLabels = {
  red: "Красная команда",
  blue: "Синяя команда",
  gray: "Серая команда",
  green: "Зеленая команда",
};

const defaultState = {
  sceneName: "Засада у старой дороги",
  cols: 24,
  rows: 16,
  cell: 42,
  zoom: 100,
  showGrid: true,
  background: null,
  backgroundHidden: false,
  activeTool: "paint",
  brushColor: "#6f8f53",
  brushLight: 100,
  brushOpacity: 100,
  brushSize: 1,
  terrain: {},
  tokenAssets: [],
  handoutAssets: [],
  tokens: [],
  handouts: [],
  templates: [],
  measurement: null,
  pings: [],
  initiative: [],
  activeInitiativeId: null,
  selectedTemplateShape: "circle",
  selectedTemplateSize: 20,
  selectedTemplateCenter: "cell",
  selectedTemplateColor: "#d1a850",
  selectedTemplateOpacity: 35,
  selectedTokenAssetId: null,
  selectedHandoutAssetId: null,
  selectedObject: null,
  activeSceneId: null,
  scenes: [],
  musicTracks: [],
  currentTrackId: null,
  rollLog: [],
};

let state = loadState();
normalizeScenes(state);
let drag = null;
let draftTemplate = null;
let imageCache = new Map();
let saveTimer = null;
let toastTimer = null;
let transientUrls = new Set();
let syncTimer = null;
let heartbeatTimer = null;
let pingAnimationTimer = null;
const undoStack = [];
const UNDO_LIMIT = 20;
const PING_DURATION = 1600;

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

function hexToRgb(hex) {
  const clean = String(hex || "#000000").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(full, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function brushColorString(color = state.brushColor, light = state.brushLight, opacity = state.brushOpacity) {
  const rgb = hexToRgb(color);
  const factor = clamp(Number(light) || 100, 40, 160) / 100;
  const alpha = clamp(Number(opacity) || 100, 10, 100) / 100;
  const r = Math.round(clamp(rgb.r * factor, 0, 255));
  const g = Math.round(clamp(rgb.g * factor, 0, 255));
  const b = Math.round(clamp(rgb.b * factor, 0, 255));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function terrainFill(value) {
  if (!value || typeof value === "string") return value || state.brushColor;
  return brushColorString(value.color, value.light, value.opacity);
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

function sceneFromState(source, overrides = {}) {
  return {
    id: overrides.id || source.activeSceneId || uid("scene"),
    name: overrides.name || source.sceneName || "Новая сцена",
    cols: Number(source.cols) || 24,
    rows: Number(source.rows) || 16,
    cell: Number(source.cell) || 42,
    showGrid: source.showGrid !== false,
    background: source.background || null,
    backgroundHidden: source.backgroundHidden === true,
    terrain: structuredClone(source.terrain || {}),
    tokens: structuredClone(source.tokens || []),
    handouts: structuredClone(source.handouts || []),
    templates: structuredClone(source.templates || []),
    measurement: source.measurement ? structuredClone(source.measurement) : null,
    initiative: structuredClone(source.initiative || []),
    activeInitiativeId: source.activeInitiativeId || null,
  };
}

function blankScene(name = "Новая сцена") {
  return {
    id: uid("scene"),
    name,
    cols: 24,
    rows: 16,
    cell: 42,
    showGrid: true,
    background: null,
    backgroundHidden: false,
    terrain: {},
    tokens: [],
    handouts: [],
    templates: [],
    measurement: null,
    initiative: [],
    activeInitiativeId: null,
  };
}

function normalizeScenes(target) {
  if (!Array.isArray(target.scenes) || !target.scenes.length) {
    const sceneId = target.activeSceneId || uid("scene");
    target.activeSceneId = sceneId;
    target.scenes = [sceneFromState(target, { id: sceneId, name: target.sceneName || "Стартовая сцена" })];
  }

  target.scenes = target.scenes.map((scene, index) => ({
    ...blankScene(index === 0 ? "Стартовая сцена" : `Сцена ${index + 1}`),
    ...scene,
    terrain: scene.terrain || {},
    tokens: scene.tokens || [],
    handouts: scene.handouts || [],
    templates: scene.templates || [],
    measurement: scene.measurement || null,
    initiative: scene.initiative || [],
    activeInitiativeId: scene.activeInitiativeId || null,
    background: scene.background || null,
    backgroundHidden: scene.backgroundHidden === true,
  }));

  if (!target.scenes.some((scene) => scene.id === target.activeSceneId)) {
    target.activeSceneId = target.scenes[0].id;
  }

  applySceneToState(target, target.scenes.find((scene) => scene.id === target.activeSceneId));
}

function getActiveScene() {
  return state.scenes.find((scene) => scene.id === state.activeSceneId);
}

function saveActiveScene() {
  const scene = state.scenes?.find((item) => item.id === state.activeSceneId);
  if (!scene) return;
  Object.assign(scene, sceneFromState(state, { id: scene.id, name: state.sceneName || scene.name }));
}

function applySceneToState(target, scene) {
  if (!scene) return;
  target.sceneName = scene.name;
  target.cols = scene.cols;
  target.rows = scene.rows;
  target.cell = scene.cell;
  target.showGrid = scene.showGrid !== false;
  target.background = scene.background || null;
  target.backgroundHidden = scene.backgroundHidden === true;
  target.terrain = structuredClone(scene.terrain || {});
  target.tokens = structuredClone(scene.tokens || []);
  target.handouts = structuredClone(scene.handouts || []);
  target.templates = structuredClone(scene.templates || []);
  target.measurement = scene.measurement ? structuredClone(scene.measurement) : null;
  target.initiative = structuredClone(scene.initiative || []);
  target.activeInitiativeId = scene.activeInitiativeId || null;
  normalizeInitiative(target);
  target.selectedObject = null;
}

function tokenFootprint(token) {
  return clamp(Math.ceil(Number(token.size) || 1), 1, 6);
}

function tokenVisualSize(token) {
  const footprint = tokenFootprint(token);
  return clamp(Number(token.visualSize ?? token.size) || footprint, 0.5, footprint);
}

function tokenDisplayName(token) {
  const asset = state.tokenAssets.find((item) => item.id === token.assetId);
  return token.name || asset?.name?.replace(/\.[^.]+$/, "") || "Фигурка";
}

function initiativeSide(value) {
  const legacySides = {
    enemy: "red",
    ally: "blue",
    neutral: "gray",
  };
  const nextValue = legacySides[value] || value;
  return initiativeSides.includes(nextValue) ? nextValue : "gray";
}

function normalizeInitiative(target = state) {
  const tokens = Array.isArray(target.tokens) ? target.tokens : [];
  const tokenById = new Map(tokens.map((token) => [token.id, token]));
  const seen = new Set();

  target.initiative = (target.initiative || [])
    .filter((entry) => entry?.tokenId && tokenById.has(entry.tokenId) && !seen.has(entry.tokenId) && seen.add(entry.tokenId))
    .map((entry) => {
      const token = tokenById.get(entry.tokenId);
      const asset = target.tokenAssets?.find((item) => item.id === token.assetId);
      return {
        id: entry.id || uid("initiative"),
        tokenId: entry.tokenId,
        name: entry.name || token.name || asset?.name?.replace(/\.[^.]+$/, "") || "Фигурка",
        value: Number.isFinite(Number(entry.value)) ? Number(entry.value) : 10,
        side: initiativeSide(entry.side),
      };
    });

  if (!target.initiative.some((entry) => entry.id === target.activeInitiativeId)) {
    target.activeInitiativeId = target.initiative[0]?.id || null;
  }
}

function sortInitiative() {
  const activeId = state.activeInitiativeId;
  state.initiative.sort((a, b) => Number(b.value) - Number(a.value) || a.name.localeCompare(b.name, "ru"));
  state.activeInitiativeId = state.initiative.some((entry) => entry.id === activeId) ? activeId : state.initiative[0]?.id || null;
}

function initiativeGroupRange() {
  normalizeInitiative(state);
  if (!state.initiative.length) return null;
  const activeIndex = Math.max(0, state.initiative.findIndex((entry) => entry.id === state.activeInitiativeId));
  const active = state.initiative[activeIndex];
  let start = activeIndex;
  let end = activeIndex;

  while (start > 0 && state.initiative[start - 1].side === active.side) start -= 1;
  while (end < state.initiative.length - 1 && state.initiative[end + 1].side === active.side) end += 1;

  return { start, end };
}

function currentInitiativeTokenIds() {
  const range = initiativeGroupRange();
  if (!range) return new Set();
  return new Set(state.initiative.slice(range.start, range.end + 1).map((entry) => entry.tokenId));
}

function currentInitiativeFocusTokenId() {
  normalizeInitiative(state);
  return state.initiative.find((entry) => entry.id === state.activeInitiativeId)?.tokenId || null;
}

function backgroundSize() {
  const width = Number(state.background?.width || state.background?.naturalWidth || 0);
  const height = Number(state.background?.height || state.background?.naturalHeight || 0);
  return width > 0 && height > 0 ? { width, height } : null;
}

function fitGridToBackground() {
  const size = backgroundSize();
  if (!size) return false;
  state.cols = clamp(Math.round(size.width / state.cell), MAP_LIMITS.minCols, MAP_LIMITS.maxCols);
  state.rows = clamp(Math.round(size.height / state.cell), MAP_LIMITS.minRows, MAP_LIMITS.maxRows);
  clampObjectsToMap();
  return true;
}

function clampObjectsToMap() {
  state.tokens.forEach((token) => {
    const size = tokenFootprint(token);
    token.size = size;
    token.visualSize = tokenVisualSize(token);
    token.x = clamp(token.x, 0, Math.max(0, state.cols - size));
    token.y = clamp(token.y, 0, Math.max(0, state.rows - size));
  });
  state.handouts.forEach((handout) => {
    handout.x = clamp(handout.x, 0, Math.max(0, state.cols - handout.w));
    handout.y = clamp(handout.y, 0, Math.max(0, state.rows - handout.h));
  });
  Object.keys(state.terrain).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (x >= state.cols || y >= state.rows) delete state.terrain[key];
  });
  state.templates = (state.templates || []).map((template) => {
    const x = Number.isFinite(Number(template.x)) ? Number(template.x) : 0;
    const y = Number.isFinite(Number(template.y)) ? Number(template.y) : 0;
    const endX = Number.isFinite(Number(template.endX)) ? Number(template.endX) : x;
    const endY = Number.isFinite(Number(template.endY)) ? Number(template.endY) : y;
    const maxX = template.center === "corner" ? state.cols : state.cols - 1;
    const maxY = template.center === "corner" ? state.rows : state.rows - 1;
    return {
      ...template,
      x: clamp(x, 0, maxX),
      y: clamp(y, 0, maxY),
      endX: clamp(endX, 0, maxX),
      endY: clamp(endY, 0, maxY),
    };
  });
  if (state.measurement) {
    const startX = Number.isFinite(Number(state.measurement.startX)) ? Number(state.measurement.startX) : 0;
    const startY = Number.isFinite(Number(state.measurement.startY)) ? Number(state.measurement.startY) : 0;
    const endX = Number.isFinite(Number(state.measurement.endX)) ? Number(state.measurement.endX) : startX;
    const endY = Number.isFinite(Number(state.measurement.endY)) ? Number(state.measurement.endY) : startY;
    state.measurement = {
      startX: clamp(startX, 0, state.cols - 1),
      startY: clamp(startY, 0, state.rows - 1),
      endX: clamp(endX, 0, state.cols - 1),
      endY: clamp(endY, 0, state.rows - 1),
    };
  }
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
    scenes: structuredClone(source.scenes || []),
    pings: (source.pings || []).filter((ping) => Date.now() - Number(ping.createdAt || 0) < PING_DURATION),
    musicTracks: (source.musicTracks || []).filter((track) => !track.transient),
  };
}

function captureUndo() {
  saveActiveScene();
  const snapshot = JSON.stringify(serializeState(state));
  if (undoStack[undoStack.length - 1] === snapshot) return;
  undoStack.push(snapshot);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function undoLastAction() {
  const snapshot = undoStack.pop();
  if (!snapshot) {
    showToast("Отменять пока нечего.");
    return;
  }

  const currentTool = state.activeTool;
  const previous = JSON.parse(snapshot);
  state = {
    ...structuredClone(defaultState),
    ...previous,
    activeTool: currentTool,
    selectedObject: null,
    musicTracks: (previous.musicTracks || []).filter((track) => !track.transient),
  };
  normalizeScenes(state);
  imageCache = new Map();
  renderAll();
  showToast("Отменено.");
}

function applyRemoteState(nextState, revision = sync.revision) {
  if (!nextState) return;
  sync.applyingRemote = true;
  const localTool = state.activeTool;
  const localSelection = state.selectedObject;
  state = {
    ...structuredClone(defaultState),
    ...nextState,
    activeTool: localTool || nextState.activeTool || "paint",
    selectedObject: localSelection,
    pings: nextState.pings || [],
    musicTracks: (nextState.musicTracks || []).filter((track) => !track.transient),
  };
  normalizeScenes(state);
  sync.revision = Math.max(sync.revision, Number(revision || 0));
  imageCache = new Map();
  renderAll();
  sync.applyingRemote = false;
}

function saveState() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      saveActiveScene();
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
  const backgroundMeta = state.background ? (state.backgroundHidden ? " · фон скрыт" : " · фон карты") : "";
  els.sceneMeta.textContent = `${state.cols} x ${state.rows} клеток${backgroundMeta}`;
  els.modeChip.textContent = toolNames[state.activeTool];
  els.colsInput.value = state.cols;
  els.rowsInput.value = state.rows;
  els.cellInput.value = state.cell;
  els.zoomInput.value = state.zoom;
  els.gridToggle.checked = state.showGrid;
  els.clearBackgroundBtn.textContent = state.backgroundHidden ? "Показать фон" : "Скрыть фон";
  els.clearBackgroundBtn.disabled = !state.background;
  els.brushColorInput.value = state.brushColor;
  els.brushOpacityInput.value = state.brushOpacity;
  els.brushOpacityValue.textContent = `${state.brushOpacity}%`;
  els.brushSizeInput.value = state.brushSize;
  els.brushSizeValue.textContent = state.brushSize;
  els.brushPreview.style.setProperty("--brush-preview", brushColorString());
  els.templateShapeInput.value = state.selectedTemplateShape;
  els.templateSizeInput.value = state.selectedTemplateSize;
  els.templateCenterInput.value = state.selectedTemplateCenter;
  els.templateColorInput.value = state.selectedTemplateColor;
  els.templateOpacityInput.value = state.selectedTemplateOpacity;
  els.sceneNameInput.value = state.sceneName;

  document.querySelectorAll(".tool-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.activeTool);
  });
}

function renderAll() {
  saveActiveScene();
  syncInputs();
  resizeCanvas();
  renderScenes();
  renderAssets();
  renderInitiative();
  renderMusic();
  renderRollLog();
  saveState();
}

function setDrawerCollapsed(collapsed) {
  appRoot.classList.toggle("drawer-collapsed", collapsed);
  els.topDrawerToggle.textContent = collapsed ? "⌄" : "⌃";
  els.topDrawerToggle.title = collapsed ? "Развернуть верх" : "Свернуть верх";
  els.topDrawerToggle.setAttribute("aria-label", collapsed ? "Развернуть верх" : "Свернуть верх");
  safeStorageSet(localStorage, "dnd-battle-table-drawer-collapsed", collapsed ? "1" : "0");
}

function activateDrawerTab(tabName) {
  document.querySelectorAll(".drawer-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.drawerTab === tabName);
  });
  document.querySelectorAll(".drawer-page").forEach((page) => {
    page.classList.toggle("active", page.dataset.drawerPage === tabName);
  });
  safeStorageSet(localStorage, "dnd-battle-table-drawer-tab", tabName);
}

function renderCanvas() {
  const width = state.cols * state.cell;
  const height = state.rows * state.cell;
  prunePings();
  ctx.clearRect(0, 0, width, height);

  drawBase(width, height);
  drawTerrain();
  drawHandouts();
  drawGrid(width, height);
  drawTemplates();
  drawTokens();
  drawPings();
  drawMeasurement();
  drawSelection();
}

function screenPx(value) {
  return value / Math.max(0.3, state.zoom / 100);
}

function drawBase(width, height) {
  ctx.fillStyle = "#272216";
  ctx.fillRect(0, 0, width, height);

  const background = state.background?.src && !state.backgroundHidden ? getImage(state.background.src) : null;
  if (background?.complete && background.naturalWidth) {
    ctx.drawImage(background, 0, 0, width, height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
    for (let y = 0; y < height; y += state.cell * 2) {
      ctx.fillRect(0, y, width, state.cell);
    }
  }
}

function drawTerrain() {
  Object.entries(state.terrain).forEach(([key, color]) => {
    const [x, y] = key.split(",").map(Number);
    ctx.fillStyle = terrainFill(color);
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
  const currentTurnTokens = currentInitiativeTokenIds();
  const focusTokenId = currentInitiativeFocusTokenId();
  state.tokens.forEach((token) => {
    const asset = state.tokenAssets.find((item) => item.id === token.assetId);
    const isCurrentTurn = currentTurnTokens.has(token.id);
    const isFocusTurn = focusTokenId === token.id;
    const px = token.x * state.cell;
    const py = token.y * state.cell;
    const footprint = tokenFootprint(token) * state.cell;
    const visualSize = tokenVisualSize(token) * state.cell;
    const centerX = px + footprint / 2;
    const centerY = py + footprint / 2;
    const visualX = centerX - visualSize / 2;
    const visualY = centerY - visualSize / 2;
    const padding = clamp(visualSize * 0.12, 2, 5);
    const radius = Math.max(5, visualSize / 2 - padding);

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.clip();
    const img = getImage(asset?.src);
    if (img?.complete && img.naturalWidth) {
      drawCoverImage(img, visualX + padding, visualY + padding, visualSize - padding * 2, visualSize - padding * 2);
    } else {
      ctx.fillStyle = "#6f8f53";
      ctx.fillRect(visualX + padding, visualY + padding, visualSize - padding * 2, visualSize - padding * 2);
    }
    ctx.restore();

    ctx.save();
    ctx.lineWidth = isFocusTurn ? 5 : isCurrentTurn ? 4 : 3;
    ctx.shadowColor = isFocusTurn ? "rgba(255, 218, 112, 0.95)" : isCurrentTurn ? "rgba(209, 168, 80, 0.75)" : "transparent";
    ctx.shadowBlur = isFocusTurn ? 26 : isCurrentTurn ? 18 : 0;
    ctx.strokeStyle = isCurrentTurn || state.selectedObject?.id === token.id ? "#d1a850" : "#11100f";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + (isFocusTurn ? 3 : isCurrentTurn ? 2 : 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = isFocusTurn ? 3 : isCurrentTurn ? 2 : 1;
    ctx.strokeStyle = isCurrentTurn ? "rgba(255, 248, 214, 0.96)" : "rgba(243, 234, 215, 0.85)";
    ctx.stroke();
    ctx.restore();

    if (token.name) {
      ctx.save();
      ctx.font = "12px Inter, system-ui, sans-serif";
      const label = token.name.slice(0, 20);
      const metrics = ctx.measureText(label);
      const labelWidth = Math.min(footprint + 36, metrics.width + 14);
      const labelX = px + footprint / 2 - labelWidth / 2;
      const labelY = py + footprint + 4;
      ctx.fillStyle = "rgba(17, 16, 15, 0.82)";
      roundRect(labelX, labelY, labelWidth, 20, 5);
      ctx.fill();
      ctx.fillStyle = "#f3ead7";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, px + footprint / 2, labelY + 10, labelWidth - 8);
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

function prunePings() {
  const now = Date.now();
  state.pings = (state.pings || []).filter((ping) => now - Number(ping.createdAt || 0) < PING_DURATION);
}

function drawPings() {
  const now = Date.now();
  const visiblePings = (state.pings || []).filter((ping) => ping.sceneId === state.activeSceneId);
  visiblePings
    .forEach((ping) => {
      const age = now - Number(ping.createdAt || now);
      const progress = clamp(age / PING_DURATION, 0, 1);
      const x = ping.x * state.cell + state.cell / 2;
      const y = ping.y * state.cell + state.cell / 2;
      const radius = state.cell * (0.28 + progress * 0.55);
      const alpha = clamp(1 - progress, 0, 1);
      const coreAlpha = clamp(1 - progress * 0.55, 0, 1);

      ctx.save();
      ctx.shadowBlur = screenPx(14);
      ctx.shadowColor = `rgba(255, 218, 92, ${alpha * 0.85})`;
      ctx.strokeStyle = `rgba(255, 231, 126, ${alpha})`;
      ctx.fillStyle = `rgba(255, 192, 67, ${alpha * 0.28})`;
      ctx.lineWidth = screenPx(3.5);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = screenPx(10);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(screenPx(6), state.cell * 0.1), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 248, 204, ${coreAlpha})`;
      ctx.fill();
      ctx.lineWidth = screenPx(1.5);
      ctx.strokeStyle = `rgba(255, 217, 88, ${coreAlpha})`;
      ctx.stroke();
      ctx.restore();
    });
  if (visiblePings.length) schedulePingFrame();
}

function schedulePingFrame() {
  if (pingAnimationTimer) return;
  pingAnimationTimer = window.setTimeout(() => {
    pingAnimationTimer = null;
    renderCanvas();
  }, 80);
}

function templateColor(template, alphaMultiplier = 1) {
  const rgb = hexToRgb(template.color || state.selectedTemplateColor);
  const alpha = clamp(Number(template.opacity ?? state.selectedTemplateOpacity) || 35, 5, 100) / 100;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha * alphaMultiplier, 0, 1)})`;
}

function cellCenter(cellX, cellY) {
  return {
    x: cellX * state.cell + state.cell / 2,
    y: cellY * state.cell + state.cell / 2,
  };
}

function gridIntersection(point) {
  return {
    x: clamp(Math.round(point.x / state.cell), 0, state.cols),
    y: clamp(Math.round(point.y / state.cell), 0, state.rows),
  };
}

function templatePoint(template, xKey = "x", yKey = "y") {
  const x = Number(template[xKey] ?? template.x ?? 0);
  const y = Number(template[yKey] ?? template.y ?? 0);
  if (template.center === "corner") {
    return {
      x: clamp(x, 0, state.cols) * state.cell,
      y: clamp(y, 0, state.rows) * state.cell,
    };
  }
  return cellCenter(clamp(x, 0, state.cols - 1), clamp(y, 0, state.rows - 1));
}

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function templateGeometry(template) {
  const sizeCells = Math.max(1, Number(template.sizeFt || 20) / 5);
  const start = templatePoint(template);
  const end = templatePoint(template, "endX", "endY");
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx || (dy ? 0 : 1));
  return {
    sizeCells,
    start,
    end,
    angle,
    length: sizeCells * state.cell,
  };
}

function templateContainsPoint(template, x, y, geometry = templateGeometry(template)) {
  const { start, angle, length } = geometry;
  const dx = x - start.x;
  const dy = y - start.y;

  if (template.shape === "circle") {
    return Math.hypot(dx, dy) <= length;
  }

  if (template.shape === "square") {
    const halfSide = length / 2;
    return Math.abs(dx) <= halfSide && Math.abs(dy) <= halfSide;
  }

  if (template.shape === "line") {
    const projection = dx * Math.cos(angle) + dy * Math.sin(angle);
    const perpendicular = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    return projection >= 0 && projection <= length && perpendicular <= state.cell / 2;
  }

  if (template.shape === "cone") {
    const distance = Math.hypot(dx, dy);
    if (distance <= 0.001) return true;
    return distance <= length && Math.abs(angleDifference(Math.atan2(dy, dx), angle)) <= TEMPLATE_CONE_SPREAD;
  }

  return false;
}

function templateCellCoverage(template, cellX, cellY, geometry = templateGeometry(template)) {
  let hits = 0;
  const total = TEMPLATE_COVERAGE_SAMPLES * TEMPLATE_COVERAGE_SAMPLES;
  const sampleSize = state.cell / TEMPLATE_COVERAGE_SAMPLES;
  for (let y = 0; y < TEMPLATE_COVERAGE_SAMPLES; y += 1) {
    for (let x = 0; x < TEMPLATE_COVERAGE_SAMPLES; x += 1) {
      const sampleX = cellX * state.cell + (x + 0.5) * sampleSize;
      const sampleY = cellY * state.cell + (y + 0.5) * sampleSize;
      if (templateContainsPoint(template, sampleX, sampleY, geometry)) hits += 1;
    }
  }
  return hits / total;
}

function templateCellBounds(template, geometry = templateGeometry(template)) {
  const { start, angle, length } = geometry;
  let minX = start.x - length;
  let minY = start.y - length;
  let maxX = start.x + length;
  let maxY = start.y + length;

  if (template.shape === "square") {
    const halfSide = length / 2;
    minX = start.x - halfSide;
    minY = start.y - halfSide;
    maxX = start.x + halfSide;
    maxY = start.y + halfSide;
  } else if (template.shape === "line") {
    const x2 = start.x + Math.cos(angle) * length;
    const y2 = start.y + Math.sin(angle) * length;
    const halfWidth = state.cell / 2;
    minX = Math.min(start.x, x2) - halfWidth;
    minY = Math.min(start.y, y2) - halfWidth;
    maxX = Math.max(start.x, x2) + halfWidth;
    maxY = Math.max(start.y, y2) + halfWidth;
  }

  return {
    minCellX: clamp(Math.floor(minX / state.cell), 0, state.cols - 1),
    minCellY: clamp(Math.floor(minY / state.cell), 0, state.rows - 1),
    maxCellX: clamp(Math.ceil(maxX / state.cell) - 1, 0, state.cols - 1),
    maxCellY: clamp(Math.ceil(maxY / state.cell) - 1, 0, state.rows - 1),
  };
}

function drawTemplateAffectedCells(template) {
  const geometry = templateGeometry(template);
  const bounds = templateCellBounds(template, geometry);

  ctx.save();
  ctx.fillStyle = templateColor(template, 0.45);
  ctx.strokeStyle = templateColor(template, 3);
  ctx.lineWidth = screenPx(2);
  ctx.setLineDash(template.draft ? [screenPx(5), screenPx(4)] : []);

  for (let y = bounds.minCellY; y <= bounds.maxCellY; y += 1) {
    for (let x = bounds.minCellX; x <= bounds.maxCellX; x += 1) {
      const coverage = templateCellCoverage(template, x, y, geometry);
      if (coverage < TEMPLATE_COVERAGE_THRESHOLD) continue;
      const px = x * state.cell;
      const py = y * state.cell;
      ctx.fillRect(px, py, state.cell, state.cell);
      ctx.strokeRect(px + screenPx(1), py + screenPx(1), state.cell - screenPx(2), state.cell - screenPx(2));
    }
  }

  ctx.restore();
}

function drawTemplates() {
  [...(state.templates || []), draftTemplate].filter(Boolean).forEach((template) => {
    const { sizeCells, start, angle } = templateGeometry(template);

    ctx.save();
    ctx.fillStyle = templateColor(template, 1);
    ctx.strokeStyle = templateColor(template, 2.2);
    ctx.lineWidth = 2;
    ctx.setLineDash(template.draft ? [8, 6] : []);

    if (template.shape === "circle") {
      const radius = sizeCells * state.cell;
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      drawTemplateAffectedCells(template);
      drawTemplateLabel(`${template.sizeFt} ft`, start.x, start.y - radius - screenPx(18));
    } else if (template.shape === "square") {
      const side = sizeCells * state.cell;
      ctx.fillRect(start.x - side / 2, start.y - side / 2, side, side);
      ctx.strokeRect(start.x - side / 2, start.y - side / 2, side, side);
      drawTemplateAffectedCells(template);
      drawTemplateLabel(`${template.sizeFt} ft`, start.x, start.y - side / 2 - screenPx(18));
    } else if (template.shape === "line") {
      const length = sizeCells * state.cell;
      const width = state.cell;
      const x2 = start.x + Math.cos(angle) * length;
      const y2 = start.y + Math.sin(angle) * length;
      ctx.lineCap = "round";
      ctx.lineWidth = width;
      ctx.strokeStyle = templateColor(template, 1);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = templateColor(template, 2.4);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      drawTemplateAffectedCells(template);
      drawTemplateLabel(`${template.sizeFt} ft`, (start.x + x2) / 2, (start.y + y2) / 2 - screenPx(18));
    } else if (template.shape === "cone") {
      const length = sizeCells * state.cell;
      const spread = TEMPLATE_CONE_SPREAD;
      const left = {
        x: start.x + Math.cos(angle - spread) * length,
        y: start.y + Math.sin(angle - spread) * length,
      };
      const right = {
        x: start.x + Math.cos(angle + spread) * length,
        y: start.y + Math.sin(angle + spread) * length,
      };
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(left.x, left.y);
      ctx.arc(start.x, start.y, length, angle - spread, angle + spread);
      ctx.lineTo(start.x, start.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawTemplateAffectedCells(template);
      drawTemplateLabel(`${template.sizeFt} ft`, start.x + Math.cos(angle) * length * 0.65, start.y + Math.sin(angle) * length * 0.65);
    }

    ctx.restore();
  });
}

function drawTemplateLabel(label, x, y) {
  ctx.save();
  const fontSize = screenPx(17);
  const padX = screenPx(10);
  const height = screenPx(28);
  ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  const width = ctx.measureText(label).width + padX * 2;
  ctx.fillStyle = "rgba(17, 16, 15, 0.9)";
  roundRect(x - width / 2, y - height / 2, width, height, screenPx(7));
  ctx.fill();
  ctx.lineWidth = screenPx(1.5);
  ctx.strokeStyle = "rgba(209, 168, 80, 0.72)";
  ctx.stroke();
  ctx.fillStyle = "#fff2c4";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  ctx.restore();
}

function drawMeasurement() {
  if (!state.measurement) return;
  const { startX, startY, endX, endY } = state.measurement;
  const start = cellCenter(startX, startY);
  const end = cellCenter(endX, endY);
  const distance = Math.round(Math.hypot(endX - startX, endY - startY) * 5);

  ctx.save();
  ctx.strokeStyle = "#f3ead7";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.fillStyle = "#d1a850";
  ctx.beginPath();
  ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
  ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
  ctx.fill();

  drawTemplateLabel(`${distance} ft`, (start.x + end.x) / 2, (start.y + end.y) / 2 - screenPx(20));
  ctx.restore();
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
  const w = (state.selectedObject.type === "token" ? tokenFootprint(object) : object.w) * state.cell;
  const h = (state.selectedObject.type === "token" ? tokenFootprint(object) : object.h) * state.cell;
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
  const size = clamp(Number(state.brushSize) || 1, 1, 8);
  const offset = Math.floor((size - 1) / 2);
  for (let y = point.cellY - offset; y < point.cellY - offset + size; y += 1) {
    for (let x = point.cellX - offset; x < point.cellX - offset + size; x += 1) {
      if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) continue;
      const key = `${x},${y}`;
      if (state.activeTool === "erase") {
        delete state.terrain[key];
      } else {
        state.terrain[key] = {
          color: state.brushColor,
          light: state.brushLight,
          opacity: state.brushOpacity,
        };
      }
    }
  }
  renderCanvas();
  saveState();
}

function objectAt(point) {
  for (let i = state.tokens.length - 1; i >= 0; i -= 1) {
    const token = state.tokens[i];
    const size = tokenFootprint(token);
    if (
      point.cellX >= token.x &&
      point.cellX < token.x + size &&
      point.cellY >= token.y &&
      point.cellY < token.y + size
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

function tokenSizeInputValue() {
  const raw = Number(String(els.tokenSizeInput.value).replace(",", "."));
  return clamp(raw || 1, 0.5, 6);
}

function placeToken(point) {
  const asset = state.tokenAssets.find((item) => item.id === state.selectedTokenAssetId);
  if (!asset) {
    showToast("Сначала добавь и выбери изображение фигурки.");
    return;
  }
  captureUndo();
  const visualSize = tokenSizeInputValue();
  const size = Math.max(1, Math.ceil(visualSize));
  const token = {
    id: uid("token"),
    assetId: asset.id,
    name: els.tokenNameInput.value.trim() || asset.name.replace(/\.[^.]+$/, ""),
    size,
    visualSize,
    x: clamp(point.cellX, 0, Math.max(0, state.cols - size)),
    y: clamp(point.cellY, 0, Math.max(0, state.rows - size)),
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
  captureUndo();
  const w = clamp(Number(els.handoutWidthInput.value) || 5, 2, 16);
  const h = clamp(Number(els.handoutHeightInput.value) || 4, 2, 16);
  const handout = {
    id: uid("handout"),
    assetId: asset.id,
    x: clamp(point.cellX, 0, Math.max(0, state.cols - w)),
    y: clamp(point.cellY, 0, Math.max(0, state.rows - h)),
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
    const w = drag.type === "token" ? tokenFootprint(object) : object.w;
    const h = drag.type === "token" ? tokenFootprint(object) : object.h;
    object.x = clamp(point.cellX - drag.offsetX, 0, Math.max(0, state.cols - w));
    object.y = clamp(point.cellY - drag.offsetY, 0, Math.max(0, state.rows - h));
  }
  renderCanvas();
}

function templateSizeFt() {
  const raw = Number(els.templateSizeInput.value || state.selectedTemplateSize || 20);
  return clamp(Math.round(raw / 5) * 5, 5, 150);
}

function startMeasurement(point) {
  state.measurement = {
    startX: point.cellX,
    startY: point.cellY,
    endX: point.cellX,
    endY: point.cellY,
  };
  drag = { type: "measure" };
  renderCanvas();
}

function updateMeasurement(point) {
  if (!state.measurement) return;
  state.measurement.endX = point.cellX;
  state.measurement.endY = point.cellY;
  renderCanvas();
}

function startTemplate(point) {
  const sizeFt = templateSizeFt();
  const sizeCells = Math.max(1, Math.round(sizeFt / 5));
  const center = state.selectedTemplateCenter === "corner" ? "corner" : "cell";
  const start = center === "corner" ? gridIntersection(point) : { x: point.cellX, y: point.cellY };
  const maxX = center === "corner" ? state.cols : state.cols - 1;
  const maxY = center === "corner" ? state.rows : state.rows - 1;
  draftTemplate = {
    id: uid("template"),
    shape: state.selectedTemplateShape,
    center,
    x: start.x,
    y: start.y,
    endX: clamp(start.x + sizeCells, 0, maxX),
    endY: clamp(start.y, 0, maxY),
    sizeFt,
    color: state.selectedTemplateColor,
    opacity: state.selectedTemplateOpacity,
    draft: true,
  };
  drag = { type: "template" };
  renderCanvas();
}

function updateDraftTemplate(point) {
  if (!draftTemplate) return;
  const end = draftTemplate.center === "corner" ? gridIntersection(point) : { x: point.cellX, y: point.cellY };
  draftTemplate.endX = end.x;
  draftTemplate.endY = end.y;
  renderCanvas();
}

function commitDraftTemplate() {
  if (!draftTemplate) return;
  const template = { ...draftTemplate };
  delete template.draft;
  state.templates.push(template);
  draftTemplate = null;
  renderAll();
}

function placePing(point) {
  state.pings = [
    ...(state.pings || []).filter((ping) => ping.sceneId === state.activeSceneId),
    {
      id: uid("ping"),
      sceneId: state.activeSceneId,
      x: point.cellX,
      y: point.cellY,
      createdAt: Date.now(),
    },
  ].slice(-6);
  renderAll();
  window.setTimeout(() => {
    prunePings();
    renderAll();
  }, PING_DURATION + 80);
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  const hit = objectAt(point);

  if (hit && ["select", "token", "image"].includes(state.activeTool)) {
    captureUndo();
    beginDrag(hit.type, hit.object, point);
    return;
  }

  if (state.activeTool === "paint" || state.activeTool === "erase") {
    captureUndo();
    drag = { type: "paint" };
    setTerrainAt(point);
    return;
  }

  if (state.activeTool === "measure") {
    captureUndo();
    startMeasurement(point);
    return;
  }

  if (state.activeTool === "template") {
    captureUndo();
    startTemplate(point);
    return;
  }

  if (state.activeTool === "ping") {
    placePing(point);
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
  } else if (drag.type === "measure") {
    updateMeasurement(point);
  } else if (drag.type === "template") {
    updateDraftTemplate(point);
  } else {
    moveDrag(point);
  }
});

canvas.addEventListener("pointerup", () => {
  if (drag?.type === "template") {
    commitDraftTemplate();
  }
  if (drag) saveState();
  drag = null;
});

canvas.addEventListener("pointercancel", () => {
  if (drag?.type === "template") {
    draftTemplate = null;
    renderCanvas();
  } else if (drag) {
    saveState();
  }
  drag = null;
});

function renderScenes() {
  els.sceneList.innerHTML = "";
  state.scenes.forEach((scene) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `scene-item ${scene.id === state.activeSceneId ? "selected" : ""}`;
    item.innerHTML = `
      <div>
        <div class="asset-title">${escapeHtml(scene.name)}</div>
        <div class="asset-meta">${scene.cols} x ${scene.rows}${scene.background ? (scene.backgroundHidden ? " · фон скрыт" : " · фон") : ""}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      if (scene.id === state.activeSceneId) return;
      switchScene(scene.id);
    });
    els.sceneList.appendChild(item);
  });
}

function switchScene(sceneId) {
  const nextScene = state.scenes.find((scene) => scene.id === sceneId);
  if (!nextScene) return;
  saveActiveScene();
  state.activeSceneId = nextScene.id;
  applySceneToState(state, nextScene);
  imageCache = new Map();
  renderAll();
  showToast("Сцена переключена.");
}

function createSceneFromCurrent(copyContent = false) {
  saveActiveScene();
  const baseName = copyContent ? `${state.sceneName} копия` : `Сцена ${state.scenes.length + 1}`;
  const scene = copyContent
    ? sceneFromState(state, { id: uid("scene"), name: baseName })
    : blankScene(baseName);
  state.scenes.push(scene);
  state.activeSceneId = scene.id;
  applySceneToState(state, scene);
  imageCache = new Map();
  renderAll();
}

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

function renderInitiative() {
  normalizeInitiative(state);
  els.initiativeList.innerHTML = "";

  if (!state.tokens.length) {
    const empty = document.createElement("div");
    empty.className = "initiative-empty";
    empty.textContent = "Поставь фигурки на карту.";
    els.initiativeList.appendChild(empty);
    return;
  }

  if (!state.initiative.length) {
    const empty = document.createElement("div");
    empty.className = "initiative-empty";
    empty.textContent = "Нажми «Собрать с карты».";
    els.initiativeList.appendChild(empty);
    return;
  }

  const activeGroup = currentInitiativeTokenIds();
  state.initiative.forEach((entry, index) => {
    const token = state.tokens.find((item) => item.id === entry.tokenId);
    const asset = state.tokenAssets.find((item) => item.id === token?.assetId);
    const isActive = activeGroup.has(entry.tokenId);
    const isFocus = entry.id === state.activeInitiativeId;
    const sideButtons = initiativeSides
      .map(
        (side) =>
          `<button class="initiative-side-button team-${side} ${entry.side === side ? "active" : ""}" type="button" data-side="${side}" aria-label="${initiativeSideLabels[side]}" title="${initiativeSideLabels[side]}"></button>`
      )
      .join("");
    const item = document.createElement("div");
    item.className = `initiative-item ${isActive ? "active-turn" : ""} ${isFocus ? "active-focus" : ""} side-${entry.side}`;
    item.innerHTML = `
      <div class="initiative-rank">${index + 1}</div>
      ${
        asset
          ? `<img class="initiative-thumb" src="${asset.src}" alt="">`
          : `<div class="initiative-thumb initiative-fallback">${escapeHtml(entry.name.slice(0, 1).toUpperCase())}</div>`
      }
      <div class="initiative-main">
        <button class="initiative-name" type="button">${escapeHtml(entry.name)}</button>
        <div class="initiative-controls">
          <input class="initiative-score" type="number" value="${Number(entry.value)}" aria-label="Инициатива">
          <div class="initiative-side-picker" role="group" aria-label="Команда">${sideButtons}</div>
        </div>
      </div>
      <button class="icon-action initiative-remove" type="button" aria-label="Убрать из инициативы">×</button>
    `;

    item.querySelector(".initiative-name").addEventListener("click", () => {
      captureUndo();
      state.activeInitiativeId = entry.id;
      if (token) state.selectedObject = { type: "token", id: token.id };
      renderAll();
    });

    item.querySelector(".initiative-score").addEventListener("change", (event) => {
      captureUndo();
      entry.value = Number(event.target.value) || 0;
      sortInitiative();
      renderAll();
    });

    item.querySelectorAll(".initiative-side-button").forEach((button) => {
      button.addEventListener("click", () => {
        const nextSide = initiativeSide(button.dataset.side);
        if (entry.side === nextSide) return;
        captureUndo();
        entry.side = nextSide;
        renderAll();
      });
    });

    item.querySelector(".initiative-remove").addEventListener("click", () => {
      captureUndo();
      state.initiative = state.initiative.filter((itemEntry) => itemEntry.id !== entry.id);
      if (state.activeInitiativeId === entry.id) {
        state.activeInitiativeId = state.initiative[0]?.id || null;
      }
      renderAll();
    });

    els.initiativeList.appendChild(item);
  });
}

function collectInitiativeFromMap() {
  if (!state.tokens.length) {
    showToast("Сначала поставь фигурки на карту.");
    return;
  }

  captureUndo();
  const previous = new Map((state.initiative || []).map((entry) => [entry.tokenId, entry]));
  state.initiative = state.tokens.map((token) => {
    const old = previous.get(token.id);
    return {
      id: old?.id || uid("initiative"),
      tokenId: token.id,
      name: old?.name || tokenDisplayName(token),
      value: Number.isFinite(Number(old?.value)) ? Number(old.value) : 10,
      side: initiativeSide(old?.side),
    };
  });
  sortInitiative();
  state.activeInitiativeId = state.activeInitiativeId || state.initiative[0]?.id || null;
  renderAll();
}

function nextInitiativeTurn() {
  normalizeInitiative(state);
  if (!state.initiative.length) {
    showToast("Сначала собери инициативу с карты.");
    return;
  }

  captureUndo();
  if (!state.activeInitiativeId) {
    state.activeInitiativeId = state.initiative[0].id;
    renderAll();
    return;
  }

  const range = initiativeGroupRange();
  const nextIndex = range ? (range.end + 1) % state.initiative.length : 0;
  state.activeInitiativeId = state.initiative[nextIndex].id;
  renderAll();
}

function addImageFiles(files, type) {
  [...files].forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      captureUndo();
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

els.mapBackgroundInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    const src = reader.result;
    const img = new Image();
    img.onload = () => {
      captureUndo();
      state.background = {
        id: uid("background"),
        name: file.name,
        src,
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      state.backgroundHidden = false;
      fitGridToBackground();
      imageCache = new Map();
      renderAll();
      showToast("Фон карты добавлен, сетка подстроена под картинку.");
    };
    img.onerror = () => {
      captureUndo();
      state.background = {
        id: uid("background"),
        name: file.name,
        src,
      };
      state.backgroundHidden = false;
      imageCache = new Map();
      renderAll();
      showToast("Фон карты добавлен.");
    };
    img.src = src;
  };
  reader.readAsDataURL(file);
  event.target.value = "";
});

els.clearBackgroundBtn.addEventListener("click", () => {
  if (!state.background) {
    showToast("Фон ещё не загружен.");
    return;
  }
  captureUndo();
  state.backgroundHidden = !state.backgroundHidden;
  renderAll();
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

els.brushColorInput.addEventListener("input", (event) => {
  state.brushColor = event.target.value;
  syncInputs();
  saveState();
});

els.brushOpacityInput.addEventListener("input", (event) => {
  state.brushOpacity = Number(event.target.value);
  syncInputs();
  saveState();
});

els.brushSizeInput.addEventListener("input", (event) => {
  state.brushSize = Number(event.target.value);
  syncInputs();
  saveState();
});

els.templateShapeInput.addEventListener("change", (event) => {
  state.selectedTemplateShape = event.target.value;
  syncInputs();
  saveState();
});

els.templateSizeInput.addEventListener("input", (event) => {
  state.selectedTemplateSize = clamp(Math.round(Number(event.target.value || 20) / 5) * 5, 5, 150);
  syncInputs();
  saveState();
});

els.templateCenterInput.addEventListener("change", (event) => {
  state.selectedTemplateCenter = event.target.value === "corner" ? "corner" : "cell";
  syncInputs();
  saveState();
});

els.templateColorInput.addEventListener("input", (event) => {
  state.selectedTemplateColor = event.target.value;
  syncInputs();
  saveState();
});

els.templateOpacityInput.addEventListener("input", (event) => {
  state.selectedTemplateOpacity = Number(event.target.value);
  syncInputs();
  saveState();
});

els.clearMeasureBtn.addEventListener("click", () => {
  captureUndo();
  state.measurement = null;
  renderAll();
});

els.clearTemplatesBtn.addEventListener("click", () => {
  captureUndo();
  state.templates = [];
  draftTemplate = null;
  renderAll();
});

els.collectInitiativeBtn.addEventListener("click", collectInitiativeFromMap);

els.nextInitiativeBtn.addEventListener("click", nextInitiativeTurn);

els.clearInitiativeBtn.addEventListener("click", () => {
  captureUndo();
  state.initiative = [];
  state.activeInitiativeId = null;
  renderAll();
});

els.topDrawerToggle.addEventListener("click", () => {
  setDrawerCollapsed(!appRoot.classList.contains("drawer-collapsed"));
});

document.querySelectorAll(".drawer-tab").forEach((button) => {
  button.addEventListener("click", () => {
    activateDrawerTab(button.dataset.drawerTab);
  });
});

els.sceneNameInput.addEventListener("input", (event) => {
  state.sceneName = event.target.value || "Без названия";
  const scene = getActiveScene();
  if (scene) scene.name = state.sceneName;
  syncInputs();
  renderScenes();
  saveState();
});

els.newSceneBtn.addEventListener("click", () => {
  captureUndo();
  createSceneFromCurrent(false);
  showToast("Создана новая пустая сцена.");
});

els.duplicateSceneBtn.addEventListener("click", () => {
  captureUndo();
  createSceneFromCurrent(true);
  showToast("Сцена продублирована.");
});

els.deleteSceneBtn.addEventListener("click", () => {
  if (state.scenes.length <= 1) {
    showToast("Нужна хотя бы одна сцена.");
    return;
  }
  captureUndo();
  const currentId = state.activeSceneId;
  const currentIndex = state.scenes.findIndex((scene) => scene.id === currentId);
  state.scenes = state.scenes.filter((scene) => scene.id !== currentId);
  const nextScene = state.scenes[Math.max(0, currentIndex - 1)] || state.scenes[0];
  state.activeSceneId = nextScene.id;
  applySceneToState(state, nextScene);
  imageCache = new Map();
  renderAll();
  showToast("Сцена удалена.");
});

els.gridToggle.addEventListener("change", (event) => {
  captureUndo();
  state.showGrid = event.target.checked;
  renderAll();
});

els.zoomInput.addEventListener("input", (event) => {
  state.zoom = Number(event.target.value);
  renderAll();
});

function applyMapInputs(shouldCapture = true) {
  if (shouldCapture) captureUndo();
  state.cols = clamp(Number(els.colsInput.value) || state.cols, MAP_LIMITS.minCols, MAP_LIMITS.maxCols);
  state.rows = clamp(Number(els.rowsInput.value) || state.rows, MAP_LIMITS.minRows, MAP_LIMITS.maxRows);
  state.cell = clamp(Number(els.cellInput.value) || state.cell, MAP_LIMITS.minCell, MAP_LIMITS.maxCell);
  clampObjectsToMap();
  renderAll();
}

["colsInput", "rowsInput"].forEach((id) => {
  els[id].addEventListener("change", applyMapInputs);
});

els.cellInput.addEventListener("change", () => {
  captureUndo();
  state.cell = clamp(Number(els.cellInput.value) || state.cell, MAP_LIMITS.minCell, MAP_LIMITS.maxCell);
  if (fitGridToBackground()) {
    renderAll();
    showToast("Размер клетки изменён, ряды и колонки пересчитаны по фону.");
  } else {
    applyMapInputs(false);
  }
});

document.querySelector("#newMapBtn").addEventListener("click", () => {
  captureUndo();
  state.cols = clamp(Number(els.colsInput.value) || state.cols, MAP_LIMITS.minCols, MAP_LIMITS.maxCols);
  state.rows = clamp(Number(els.rowsInput.value) || state.rows, MAP_LIMITS.minRows, MAP_LIMITS.maxRows);
  state.cell = clamp(Number(els.cellInput.value) || state.cell, MAP_LIMITS.minCell, MAP_LIMITS.maxCell);
  clampObjectsToMap();
  state.terrain = {};
  state.tokens = [];
  state.handouts = [];
  state.templates = [];
  state.measurement = null;
  state.initiative = [];
  state.activeInitiativeId = null;
  state.selectedObject = null;
  renderAll();
  showToast("Создана чистая карта с выбранным размером.");
});

document.querySelector("#clearPaintBtn").addEventListener("click", () => {
  captureUndo();
  state.terrain = {};
  renderAll();
});

document.querySelector("#clearTokensBtn").addEventListener("click", () => {
  captureUndo();
  state.tokens = [];
  state.handouts = [];
  state.initiative = [];
  state.activeInitiativeId = null;
  state.selectedObject = null;
  renderAll();
});

document.querySelector("#resetSceneBtn").addEventListener("click", () => {
  if (!confirm("Сбросить карту, изображения, музыку и историю бросков?")) return;
  captureUndo();
  transientUrls.forEach((src) => URL.revokeObjectURL(src));
  transientUrls.clear();
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(defaultState);
  normalizeScenes(state);
  imageCache = new Map();
  els.audioPlayer.removeAttribute("src");
  renderAll();
});

document.querySelector("#exportSceneBtn").addEventListener("click", () => {
  saveActiveScene();
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
  link.download = `${state.sceneName.replace(/[^\p{L}\p{N}]+/gu, "-") || "dnd-campaign"}.json`;
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
      captureUndo();
      state = {
        ...structuredClone(defaultState),
        ...imported,
        musicTracks: (imported.musicTracks || []).filter((track) => !track.transient),
      };
      normalizeScenes(state);
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
  if (event.target?.matches?.("input, textarea, select")) return;
  const key = event.key.toLowerCase();
  const isUndoKey = key === "z" || key === "я" || event.code === "KeyZ";
  if ((event.ctrlKey || event.metaKey) && isUndoKey && !event.shiftKey) {
    event.preventDefault();
    undoLastAction();
    return;
  }
  const toolShortcutMap = {
    Digit1: "select",
    Numpad1: "select",
    Digit2: "paint",
    Numpad2: "paint",
    Digit3: "erase",
    Numpad3: "erase",
    Digit4: "measure",
    Numpad4: "measure",
    Digit5: "template",
    Numpad5: "template",
    Digit6: "ping",
    Numpad6: "ping",
  };
  const keyMap = {
    v: "select",
    b: "paint",
    e: "erase",
    l: "measure",
    t: "template",
    p: "ping",
    м: "select",
    и: "paint",
    у: "erase",
    д: "measure",
    е: "template",
    з: "ping",
  };
  const nextTool = toolShortcutMap[event.code] || keyMap[key];
  if (nextTool) {
    state.activeTool = nextTool;
    renderAll();
  }
  if (event.key === "Delete" && state.selectedObject) {
    captureUndo();
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

setDrawerCollapsed(safeStorageGet(localStorage, "dnd-battle-table-drawer-collapsed") === "1");
activateDrawerTab(safeStorageGet(localStorage, "dnd-battle-table-drawer-tab") || "room");
renderAll();
connectOnline();
