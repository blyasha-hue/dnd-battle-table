const STORAGE_KEY = "dnd-battle-table-v1";
const CLIENT_KEY = "dnd-battle-table-client-id";
const ROOM_KEY = "dnd-battle-table-room";
const GM_NOTES_KEY = "dnd-battle-table-gm-notes";
const SAVE_SLOTS_KEY = "dnd-battle-table-save-slots";
const PROFILE_KEY = "dnd-battle-table-player-profile";
const ROLE_KEY = "dnd-battle-table-role";
const PLAYER_TOKEN_ASSETS_KEY = "dnd-battle-table-player-token-assets";
const PLAYER_TOOLS = new Set(["select", "ping", "measure", "template", "token", "paint", "erase"]);
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
  playerViewToggle: document.querySelector("#playerViewToggle"),
  onlineStatus: document.querySelector("#onlineStatus"),
  roomInput: document.querySelector("#roomInput"),
  profileNameInput: document.querySelector("#profileNameInput"),
  profileRoleInput: document.querySelector("#profileRoleInput"),
  profileColorInput: document.querySelector("#profileColorInput"),
  profileAvatarInput: document.querySelector("#profileAvatarInput"),
  playerList: document.querySelector("#playerList"),
  tokenMoveModeInput: document.querySelector("#tokenMoveModeInput"),
  joinRoomBtn: document.querySelector("#joinRoomBtn"),
  copyInviteBtn: document.querySelector("#copyInviteBtn"),
  forceSyncBtn: document.querySelector("#forceSyncBtn"),
  roomStats: document.querySelector("#roomStats"),
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
  toggleFogModeBtn: document.querySelector("#toggleFogModeBtn"),
  fogSizeInput: document.querySelector("#fogSizeInput"),
  fogSizeValue: document.querySelector("#fogSizeValue"),
  coverFogBtn: document.querySelector("#coverFogBtn"),
  clearFogBtn: document.querySelector("#clearFogBtn"),
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
  initiativeTracker: document.querySelector("#initiativeTracker"),
  tokenDetailsEmpty: document.querySelector("#tokenDetailsEmpty"),
  tokenDetailsForm: document.querySelector("#tokenDetailsForm"),
  selectedTokenNameInput: document.querySelector("#selectedTokenNameInput"),
  selectedTokenHpInput: document.querySelector("#selectedTokenHpInput"),
  selectedTokenMaxHpInput: document.querySelector("#selectedTokenMaxHpInput"),
  selectedTokenNoteInput: document.querySelector("#selectedTokenNoteInput"),
  selectedTokenHiddenInput: document.querySelector("#selectedTokenHiddenInput"),
  selectedTokenOwnerInput: document.querySelector("#selectedTokenOwnerInput"),
  deleteSelectedTokenBtn: document.querySelector("#deleteSelectedTokenBtn"),
  compactRoomBtn: document.querySelector("#compactRoomBtn"),
  tokenConditionGrid: document.querySelector("#tokenConditionGrid"),
  musicUrlInput: document.querySelector("#musicUrlInput"),
  musicNameInput: document.querySelector("#musicNameInput"),
  musicFileInput: document.querySelector("#musicFileInput"),
  musicList: document.querySelector("#musicList"),
  audioPlayer: document.querySelector("#audioPlayer"),
  gmNotesInput: document.querySelector("#gmNotesInput"),
  playerNotesInput: document.querySelector("#playerNotesInput"),
  saveSlotNameInput: document.querySelector("#saveSlotNameInput"),
  createSaveSlotBtn: document.querySelector("#createSaveSlotBtn"),
  saveSlotList: document.querySelector("#saveSlotList"),
  diceFormulaInput: document.querySelector("#diceFormulaInput"),
  clearRollLogBtn: document.querySelector("#clearRollLogBtn"),
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
  fog: "Туман",
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
const tokenConditions = [
  { id: "unconscious", label: "Бессозн." },
  { id: "frightened", label: "Испуг." },
  { id: "exhaustion", label: "Истощ." },
  { id: "invisible", label: "Невид." },
  { id: "incapacitated", label: "Недеесп." },
  { id: "deafened", label: "Оглох." },
  { id: "petrified", label: "Окамен." },
  { id: "restrained", label: "Опут." },
  { id: "blinded", label: "Ослеп." },
  { id: "poisoned", label: "Отрав." },
  { id: "charmed", label: "Очаров." },
  { id: "stunned", label: "Ошелом." },
  { id: "paralyzed", label: "Парализ." },
  { id: "prone", label: "Сбит" },
  { id: "grappled", label: "Схвачен" },
];

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
  fog: {},
  fogMode: "reveal",
  fogSize: 3,
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
  initiativeRound: 1,
  tokenMoveMode: "all",
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
  playerNotes: "",
  rollLog: [],
};

let state = loadState();
normalizeScenes(state);
let gmNotes = safeStorageGet(localStorage, GM_NOTES_KEY) || "";
let saveSlots = loadSaveSlots();
let profile = loadProfile();
let playerTokenAssets = loadPlayerTokenAssets();
let playerViewPreview = safeStorageGet(localStorage, "dnd-battle-table-player-view-preview") === "1";
let drag = null;
let draftTemplate = null;
let imageCache = new Map();
let canvasLayoutKey = "";
let saveTimer = null;
let toastTimer = null;
let transientUrls = new Set();
let syncTimer = null;
let heartbeatTimer = null;
let presenceTimer = null;
let presencePending = false;
let syncPending = false;
let syncDirty = false;
let imageOptimizationQueued = false;
let lastPresenceSent = 0;
let lastCursor = null;
let pingAnimationTimer = null;
let pendingCellPatch = {
  terrainSet: {},
  terrainDelete: new Set(),
  fogSet: new Set(),
  fogDelete: new Set(),
};
let forceFullPatchFields = new Set();
const undoStack = [];
const UNDO_LIMIT = 20;
const PING_DURATION = 1600;
const PATCH_FIELDS = [
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
];
const IMAGE_PRESETS = {
  avatar: { maxSize: 256, quality: 0.78, mimeType: "image/webp", label: "Аватар" },
  token: { maxSize: 720, quality: 0.82, mimeType: "image/webp", label: "Фигурка" },
  handout: { maxSize: 1400, quality: 0.84, mimeType: "image/webp", label: "Картинка" },
  background: { maxSize: 2400, quality: 0.86, mimeType: "image/webp", label: "Фон" },
};

const sync = {
  online: location.protocol === "http:" || location.protocol === "https:",
  clientId: getClientId(),
  roomId: getRoomFromUrl(),
  revision: 0,
  source: null,
  applyingRemote: false,
  ready: false,
  players: [],
  masterClientId: null,
  imageSignature: "",
  lastSyncSnapshot: null,
  lastSyncAt: null,
  lastPayloadBytes: 0,
  lastPatchFields: [],
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function dataUrlBytes(value) {
  if (typeof value !== "string") return 0;
  const comma = value.indexOf(",");
  const payload = comma >= 0 ? value.slice(comma + 1) : value;
  return Math.round((payload.length * 3) / 4);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function textBytes(value) {
  try {
    return new Blob([value]).size;
  } catch {
    return String(value || "").length;
  }
}

function markTerrainCell(key, value) {
  if (forceFullPatchFields.has("terrain")) return;
  if (value) {
    pendingCellPatch.terrainSet[key] = structuredClone(value);
    pendingCellPatch.terrainDelete.delete(key);
  } else {
    delete pendingCellPatch.terrainSet[key];
    pendingCellPatch.terrainDelete.add(key);
  }
}

function markFogCell(key, visible) {
  if (forceFullPatchFields.has("fog")) return;
  if (visible) {
    pendingCellPatch.fogSet.add(key);
    pendingCellPatch.fogDelete.delete(key);
  } else {
    pendingCellPatch.fogSet.delete(key);
    pendingCellPatch.fogDelete.add(key);
  }
}

function markFullPatchField(field) {
  forceFullPatchFields.add(field);
  if (field === "terrain") {
    pendingCellPatch.terrainSet = {};
    pendingCellPatch.terrainDelete.clear();
  }
  if (field === "fog") {
    pendingCellPatch.fogSet.clear();
    pendingCellPatch.fogDelete.clear();
  }
}

function resetPendingCellPatch() {
  pendingCellPatch = {
    terrainSet: {},
    terrainDelete: new Set(),
    fogSet: new Set(),
    fogDelete: new Set(),
  };
  forceFullPatchFields = new Set();
}

async function imageSrcToDataUrl(original, { maxSize = 900, quality = 0.82, mimeType = "image/webp" } = {}) {
  try {
    const img = await loadImage(original);
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1 && original.length < maxSize * maxSize * 2) return original;
    const canvasEl = document.createElement("canvas");
    canvasEl.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvasEl.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvasCtx = canvasEl.getContext("2d");
    canvasCtx.imageSmoothingEnabled = true;
    canvasCtx.imageSmoothingQuality = "high";
    canvasCtx.drawImage(img, 0, 0, canvasEl.width, canvasEl.height);
    const compressed = canvasEl.toDataURL(mimeType, quality);
    return dataUrlBytes(compressed) < dataUrlBytes(original) ? compressed : original;
  } catch {
    return original;
  }
}

async function imageFileToDataUrl(file, options = {}) {
  return imageSrcToDataUrl(await readFileAsDataUrl(file), options);
}

async function compressImageFile(file, presetName) {
  const preset = IMAGE_PRESETS[presetName] || IMAGE_PRESETS.handout;
  const src = await imageFileToDataUrl(file, preset);
  const before = file.size || dataUrlBytes(src);
  const after = dataUrlBytes(src);
  return {
    src,
    before,
    after,
    compressed: after > 0 && before > after * 1.15,
    label: preset.label,
  };
}

async function compressDataUrlValue(src, presetName) {
  if (typeof src !== "string" || !src.startsWith("data:image/")) return { src, changed: false };
  const preset = IMAGE_PRESETS[presetName] || IMAGE_PRESETS.handout;
  const next = await imageSrcToDataUrl(src, preset);
  return {
    src: next,
    changed: next !== src && dataUrlBytes(next) < dataUrlBytes(src),
    before: dataUrlBytes(src),
    after: dataUrlBytes(next),
  };
}

async function optimizeCurrentImages() {
  let changed = false;
  const optimizeAssetList = async (assets, presetName) => {
    if (!Array.isArray(assets)) return;
    for (const asset of assets) {
      const result = await compressDataUrlValue(asset.src, presetName);
      if (!result.changed) continue;
      asset.src = result.src;
      changed = true;
    }
  };

  await optimizeAssetList(state.tokenAssets, "token");
  await optimizeAssetList(state.handoutAssets, "handout");
  await optimizeAssetList(playerTokenAssets, "token");
  if (state.background?.src) {
    const result = await compressDataUrlValue(state.background.src, "background");
    if (result.changed) {
      state.background.src = result.src;
      changed = true;
    }
  }
  for (const scene of state.scenes || []) {
    if (!scene.background?.src) continue;
    const result = await compressDataUrlValue(scene.background.src, "background");
    if (!result.changed) continue;
    scene.background.src = result.src;
    changed = true;
  }

  if (!changed) return false;
  persistPlayerTokenAssets();
  imageCache = new Map();
  saveActiveScene();
  safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(serializeState(state)));
  renderAll();
  showToast("Старые изображения в комнате сжаты.");
  return true;
}

function optimizeCurrentImagesSoon() {
  if (imageOptimizationQueued) return;
  imageOptimizationQueued = true;
  window.setTimeout(() => {
    optimizeCurrentImages().catch(() => {}).finally(() => {
      imageOptimizationQueued = false;
    });
  }, 800);
}

function collectUsedAssetIds(source = state) {
  const tokenIds = new Set();
  const handoutIds = new Set();
  const collect = (tokens = [], handouts = []) => {
    tokens.forEach((token) => {
      if (token?.assetId) tokenIds.add(token.assetId);
    });
    handouts.forEach((handout) => {
      if (handout?.assetId) handoutIds.add(handout.assetId);
    });
  };
  collect(source.tokens || [], source.handouts || []);
  (source.scenes || []).forEach((scene) => collect(scene?.tokens || [], scene?.handouts || []));
  return { tokenIds, handoutIds };
}

function pruneUnusedAssets() {
  const { tokenIds, handoutIds } = collectUsedAssetIds(state);
  const beforeTokenAssets = state.tokenAssets.length;
  const beforeHandoutAssets = state.handoutAssets.length;
  state.tokenAssets = state.tokenAssets.filter((asset) => tokenIds.has(asset.id));
  state.handoutAssets = state.handoutAssets.filter((asset) => handoutIds.has(asset.id));
  if (state.selectedTokenAssetId && !state.tokenAssets.some((asset) => asset.id === state.selectedTokenAssetId)) {
    state.selectedTokenAssetId = null;
  }
  if (state.selectedHandoutAssetId && !state.handoutAssets.some((asset) => asset.id === state.selectedHandoutAssetId)) {
    state.selectedHandoutAssetId = null;
  }
  return {
    tokenAssets: beforeTokenAssets - state.tokenAssets.length,
    handoutAssets: beforeHandoutAssets - state.handoutAssets.length,
  };
}

async function compactRoom() {
  if (!isMaster()) return;
  captureUndo();
  const removed = pruneUnusedAssets();
  state.pings = [];
  state.rollLog = (state.rollLog || []).slice(0, 12);
  const optimized = await optimizeCurrentImages().catch(() => false);
  imageCache = new Map();
  saveActiveScene();
  renderAll();
  const removedTotal = removed.tokenAssets + removed.handoutAssets;
  showToast(`Комната уплотнена: удалено ассетов ${removedTotal}${optimized ? ", картинки пережаты" : ""}.`);
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
    fog: structuredClone(source.fog || {}),
    terrain: structuredClone(source.terrain || {}),
    tokens: structuredClone(source.tokens || []),
    handouts: structuredClone(source.handouts || []),
    templates: structuredClone(source.templates || []),
    measurement: source.measurement ? structuredClone(source.measurement) : null,
    initiative: structuredClone(source.initiative || []),
    activeInitiativeId: source.activeInitiativeId || null,
    initiativeRound: Math.max(1, Number(source.initiativeRound) || 1),
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
    fog: {},
    terrain: {},
    tokens: [],
    handouts: [],
    templates: [],
    measurement: null,
    initiative: [],
    activeInitiativeId: null,
    initiativeRound: 1,
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
    fog: scene.fog || {},
    tokens: scene.tokens || [],
    handouts: scene.handouts || [],
    templates: scene.templates || [],
    measurement: scene.measurement || null,
    initiative: scene.initiative || [],
    activeInitiativeId: scene.activeInitiativeId || null,
    initiativeRound: Math.max(1, Number(scene.initiativeRound) || 1),
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
  target.fog = structuredClone(scene.fog || {});
  target.terrain = structuredClone(scene.terrain || {});
  target.tokens = structuredClone(scene.tokens || []);
  target.handouts = structuredClone(scene.handouts || []);
  target.templates = structuredClone(scene.templates || []);
  target.measurement = scene.measurement ? structuredClone(scene.measurement) : null;
  target.initiative = structuredClone(scene.initiative || []);
  target.activeInitiativeId = scene.activeInitiativeId || null;
  target.initiativeRound = Math.max(1, Number(scene.initiativeRound) || 1);
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
  const asset = findTokenAsset(token.assetId);
  return token.name || asset?.name?.replace(/\.[^.]+$/, "") || "Фигурка";
}

function findTokenAsset(assetId) {
  return state.tokenAssets.find((item) => item.id === assetId) || playerTokenAssets.find((item) => item.id === assetId);
}

function currentTokenAssets() {
  return isPlayerView() ? playerTokenAssets : state.tokenAssets;
}

function tokenConditionsList(token) {
  return Array.isArray(token.conditions) ? token.conditions.filter((id) => tokenConditions.some((item) => item.id === id)) : [];
}

function tokenMoveMode() {
  return ["all", "owned", "master"].includes(state.tokenMoveMode) ? state.tokenMoveMode : "all";
}

function tokenOwnerName(ownerId) {
  if (!ownerId) return "общий";
  return sync.players.find((player) => player.id === ownerId)?.profile?.name || "игрок";
}

function canMoveMapObject(type, object) {
  if (!isPlayerView()) return true;
  if (type !== "token") return false;
  if (!object || object.hidden) return false;
  const mode = tokenMoveMode();
  if (mode === "master") return false;
  if (mode === "all") return true;
  return !object.ownerId || object.ownerId === sync.clientId;
}

function selectedToken() {
  if (state.selectedObject?.type !== "token") return null;
  return state.tokens.find((token) => token.id === state.selectedObject.id) || null;
}

function selectedMapObject() {
  if (!state.selectedObject) return null;
  const collection = state.selectedObject.type === "token" ? state.tokens : state.handouts;
  return collection.find((item) => item.id === state.selectedObject.id) || null;
}

function isVisibleToPlayer(object) {
  return !object?.hidden;
}

function visibleTokens() {
  return isPlayerView() ? state.tokens.filter(isVisibleToPlayer) : state.tokens;
}

function visibleHandouts() {
  return isPlayerView() ? state.handouts.filter(isVisibleToPlayer) : state.handouts;
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

function nextInitiativeSide(value) {
  const currentIndex = initiativeSides.indexOf(initiativeSide(value));
  return initiativeSides[(currentIndex + 1) % initiativeSides.length];
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
  Object.keys(state.fog || {}).forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x >= state.cols || y >= state.rows) delete state.fog[key];
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

function loadSaveSlots() {
  try {
    const raw = safeStorageGet(localStorage, SAVE_SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((slot) => slot?.id && slot?.state) : [];
  } catch {
    return [];
  }
}

function loadPlayerTokenAssets() {
  try {
    const parsed = JSON.parse(safeStorageGet(localStorage, PLAYER_TOKEN_ASSETS_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((asset) => asset?.id && asset?.src?.startsWith?.("data:image/")).slice(0, 24)
      : [];
  } catch {
    return [];
  }
}

function persistPlayerTokenAssets() {
  safeStorageSet(localStorage, PLAYER_TOKEN_ASSETS_KEY, JSON.stringify(playerTokenAssets.slice(0, 24)));
}

function loadProfile() {
  try {
    const parsed = JSON.parse(safeStorageGet(localStorage, PROFILE_KEY) || "{}");
    const color = /^#[0-9a-f]{6}$/i.test(parsed.color || "") ? parsed.color : "#d1a850";
    const role = safeStorageGet(localStorage, ROLE_KEY) || parsed.role || "master";
    return {
      name: String(parsed.name || (role === "master" ? "Мастер" : "Игрок")).slice(0, 32),
      role: role === "player" ? "player" : "master",
      color,
      avatar: typeof parsed.avatar === "string" && parsed.avatar.startsWith("data:image/") ? parsed.avatar : null,
    };
  } catch {
    return { name: "Мастер", role: "master", color: "#d1a850", avatar: null };
  }
}

function saveProfile() {
  profile = {
    name: String(els.profileNameInput.value || "Игрок").trim().slice(0, 32) || "Игрок",
    role: els.profileRoleInput.value === "player" ? "player" : "master",
    color: /^#[0-9a-f]{6}$/i.test(els.profileColorInput.value) ? els.profileColorInput.value : "#d1a850",
    avatar: profile.avatar || null,
  };
  safeStorageSet(localStorage, PROFILE_KEY, JSON.stringify(profile));
  safeStorageSet(localStorage, ROLE_KEY, profile.role);
}

function persistSaveSlots() {
  safeStorageSet(localStorage, SAVE_SLOTS_KEY, JSON.stringify(saveSlots.slice(0, 6)));
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

function imagePayloadSignature(source) {
  if (!source) return "";
  const parts = [];
  const addAsset = (type, asset) => {
    if (!asset?.id || typeof asset.src !== "string") return;
    parts.push(`${type}:${asset.id}:${asset.src.length}`);
  };
  const addBackground = (type, background) => {
    if (!background?.id || typeof background.src !== "string") return;
    parts.push(`${type}:${background.id}:${background.src.length}`);
  };
  (source.tokenAssets || []).forEach((asset) => addAsset("token", asset));
  (source.handoutAssets || []).forEach((asset) => addAsset("handout", asset));
  addBackground("background", source.background);
  (source.scenes || []).forEach((scene) => addBackground(`scene:${scene?.id || ""}`, scene?.background));
  return parts.sort().join("|");
}

function stripImagePayload(source) {
  const stripped = structuredClone(source);
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

function serializeStateForSync({ forceFullImages = false } = {}) {
  const serializable = serializeState(state);
  const signature = imagePayloadSignature(serializable);
  const canStripImages = !forceFullImages && Boolean(sync.imageSignature) && signature === sync.imageSignature;
  const canPatch = canStripImages &&
    sync.lastSyncSnapshot &&
    sync.lastSyncSnapshot.activeSceneId === serializable.activeSceneId &&
    Array.isArray(sync.lastSyncSnapshot.scenes) &&
    Array.isArray(serializable.scenes) &&
    sync.lastSyncSnapshot.scenes.length === serializable.scenes.length;

  if (canPatch) {
    const patch = {};
    const terrainDelete = [...pendingCellPatch.terrainDelete];
    const terrainSet = structuredClone(pendingCellPatch.terrainSet);
    const hasTerrainCellPatch = !forceFullPatchFields.has("terrain") && (Object.keys(terrainSet).length || terrainDelete.length);
    const fogSet = [...pendingCellPatch.fogSet];
    const fogDelete = [...pendingCellPatch.fogDelete];
    const hasFogCellPatch = !forceFullPatchFields.has("fog") && (fogSet.length || fogDelete.length);
    for (const field of PATCH_FIELDS) {
      if (field === "terrain" && hasTerrainCellPatch) {
        patch.terrainPatch = { set: terrainSet, delete: terrainDelete };
        continue;
      }
      if (field === "fog" && hasFogCellPatch) {
        patch.fogPatch = { set: fogSet, delete: fogDelete };
        continue;
      }
      if (JSON.stringify(sync.lastSyncSnapshot[field]) !== JSON.stringify(serializable[field])) {
        patch[field] = structuredClone(serializable[field]);
      }
    }
    if (
      patch.terrain &&
      hasTerrainCellPatch
    ) {
      delete patch.terrain;
      patch.terrainPatch = { set: terrainSet, delete: terrainDelete };
    }
    if (
      patch.fog &&
      hasFogCellPatch
    ) {
      delete patch.fog;
      patch.fogPatch = { set: fogSet, delete: fogDelete };
    }
    if (Object.keys(patch).length) {
      return {
        patch,
        imageSignature: signature,
        snapshot: serializable,
        resetCellPatch: Boolean(patch.terrainPatch || patch.fogPatch || patch.terrain || patch.fog),
        patchFields: Object.keys(patch),
      };
    }
  }

  return {
    state: canStripImages ? stripImagePayload(serializable) : serializable,
    imageSignature: signature,
    snapshot: serializable,
    resetCellPatch: true,
    patchFields: [],
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

function hydrateRemoteImages(nextState, currentState) {
  if (!nextState || !currentState) return nextState;
  const hydrated = structuredClone(nextState);
  const tokenSources = new Map((currentState.tokenAssets || []).map((asset) => [asset.id, asset.src]));
  const handoutSources = new Map((currentState.handoutAssets || []).map((asset) => [asset.id, asset.src]));
  const backgroundSources = new Map();
  if (currentState.background?.id && currentState.background?.src) {
    backgroundSources.set(currentState.background.id, currentState.background.src);
  }
  (currentState.scenes || []).forEach((scene) => {
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

function applyRemoteState(nextState, revision = sync.revision) {
  if (!nextState) return;
  const previousImageSignature = imagePayloadSignature(state);
  nextState = hydrateRemoteImages(nextState, state);
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
  sync.imageSignature = imagePayloadSignature(state);
  sync.lastSyncSnapshot = serializeState(state);
  resetPendingCellPatch();
  if (sync.imageSignature !== previousImageSignature) {
    imageCache = new Map();
  }
  renderAll({ shouldSave: false });
  safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(serializeState(state)));
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

function ensureRoomStatsNode() {
  if (els.roomStats) return els.roomStats;
  if (!els.playerList?.parentElement) return null;
  if (!els.compactRoomBtn) {
    const controls = document.createElement("div");
    controls.className = "button-row room-maintenance";
    controls.setAttribute("data-master-only", "");
    controls.innerHTML = `<button id="compactRoomBtn" type="button">Уплотнить</button>`;
    els.playerList.parentElement.insertBefore(controls, els.playerList);
    els.compactRoomBtn = controls.querySelector("#compactRoomBtn");
    els.compactRoomBtn.addEventListener("click", compactRoom);
  }
  const node = document.createElement("div");
  node.id = "roomStats";
  node.className = "room-stats";
  node.setAttribute("data-master-only", "");
  node.setAttribute("aria-label", "Статистика комнаты");
  els.playerList.parentElement.insertBefore(node, els.playerList);
  els.roomStats = node;
  return node;
}

function collectRoomStats() {
  saveActiveScene();
  const serializable = serializeState(state);
  const imageSources = new Set();
  const addImage = (src) => {
    if (typeof src === "string" && src.startsWith("data:image/")) imageSources.add(src);
  };
  (serializable.tokenAssets || []).forEach((asset) => addImage(asset.src));
  (serializable.handoutAssets || []).forEach((asset) => addImage(asset.src));
  addImage(serializable.background?.src);
  (serializable.scenes || []).forEach((scene) => addImage(scene?.background?.src));
  return {
    stateBytes: textBytes(JSON.stringify(serializable)),
    imageBytes: [...imageSources].reduce((sum, src) => sum + dataUrlBytes(src), 0),
    lastPayloadBytes: sync.lastPayloadBytes || 0,
    tokens: (serializable.tokens || []).length,
    tokenAssets: (serializable.tokenAssets || []).length,
    handoutAssets: (serializable.handoutAssets || []).length,
    terrainCells: Object.keys(serializable.terrain || {}).length,
    fogCells: Object.keys(serializable.fog || {}).length,
  };
}

function renderRoomStats() {
  const node = ensureRoomStatsNode();
  if (!node) return;
  if (!isMaster()) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  const stats = collectRoomStats();
  const warnings = [];
  if (stats.stateBytes > 2 * 1024 * 1024) warnings.push("state > 2 MB");
  if (stats.imageBytes > 1536 * 1024) warnings.push("images > 1.5 MB");
  if (stats.lastPayloadBytes > 200 * 1024) warnings.push("sync > 200 KB");
  const patchLabel = sync.lastPatchFields.length ? sync.lastPatchFields.join(", ") : "full";
  const syncTime = sync.lastSyncAt
    ? new Date(sync.lastSyncAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "-";
  node.innerHTML = `
    <div><span>State</span><strong>${formatBytes(stats.stateBytes)}</strong></div>
    <div><span>Images</span><strong>${formatBytes(stats.imageBytes)}</strong></div>
    <div><span>Tokens</span><strong>${stats.tokens}/${stats.tokenAssets}</strong></div>
    <div><span>Fog</span><strong>${stats.fogCells}</strong></div>
    <div><span>Paint</span><strong>${stats.terrainCells}</strong></div>
    <div><span>Last sync</span><strong>${formatBytes(sync.lastPayloadBytes)} · ${syncTime}</strong></div>
    <div class="room-stats-wide"><span>Patch</span><strong>${escapeHtml(patchLabel)}</strong></div>
    ${warnings.length ? `<div class="room-stats-wide room-stats-warning"><span>Warning</span><strong>${escapeHtml(warnings.join(", "))}</strong></div>` : ""}
  `;
}

function isMaster() {
  return profile.role === "master" && (!sync.masterClientId || sync.masterClientId === sync.clientId);
}

function isPlayerView() {
  return !isMaster() || playerViewPreview;
}

function canUseTool(tool = state.activeTool) {
  return !isPlayerView() || PLAYER_TOOLS.has(tool);
}

function normalizeToolForRole() {
  if (!canUseTool(state.activeTool)) {
    state.activeTool = "select";
  }
}

function roomUrl(roomId = sync.roomId) {
  const url = new URL(location.href);
  url.searchParams.set("room", cleanRoomId(roomId));
  return url.toString();
}

function updateRoomUi() {
  els.roomInput.value = sync.roomId;
  els.profileNameInput.value = profile.name;
  els.profileRoleInput.value = profile.role;
  els.profileColorInput.value = profile.color;
  if (sync.online) {
    els.onlineHint.textContent = "Отправь игрокам ссылку на эту комнату.";
  } else {
    els.onlineHint.textContent = "Открой через server.js, чтобы играть вместе.";
  }
}

function applyRoleUi() {
  const master = isMaster();
  const playerView = isPlayerView();
  appRoot.classList.toggle("player-role", playerView);
  appRoot.classList.toggle("preview-player-view", master && playerViewPreview);
  normalizeToolForRole();

  document.querySelectorAll("[data-master-only]").forEach((node) => {
    node.hidden = playerView;
    node.querySelectorAll?.("button, input, select, textarea").forEach((control) => {
      control.disabled = playerView && control !== els.playerViewToggle;
    });
  });

  document.querySelectorAll("[data-master-tool]").forEach((button) => {
    button.hidden = playerView;
    button.disabled = playerView;
  });

  if (els.playerViewToggle) {
    els.playerViewToggle.hidden = !master;
    els.playerViewToggle.disabled = false;
    els.playerViewToggle.textContent = playerViewPreview ? "Вид мастера" : "Вид игрока";
  }

  if (playerView && ["sound"].includes(safeStorageGet(localStorage, "dnd-battle-table-drawer-tab"))) {
    activateDrawerTab("room");
  }
}

function renderPlayers() {
  if (!els.playerList) return;
  els.playerList.innerHTML = "";
  const players = sync.players.length
    ? sync.players
    : [{
      id: sync.clientId,
      profile,
      cursor: lastCursor,
      updatedAt: Date.now(),
    }];

  players.forEach((player) => {
    const item = document.createElement("div");
    const playerProfile = player.profile || {};
    const color = /^#[0-9a-f]{6}$/i.test(playerProfile.color || "") ? playerProfile.color : "#d1a850";
    const role = playerProfile.role === "master" ? "Мастер" : "Игрок";
    item.className = `player-item ${player.id === sync.clientId ? "self" : ""}`;
    item.style.setProperty("--player-color", color);
    item.innerHTML = `
      ${
        playerProfile.avatar
          ? `<img class="player-avatar" src="${playerProfile.avatar}" alt="">`
          : `<div class="player-avatar player-avatar-fallback">${escapeHtml((playerProfile.name || "И").slice(0, 1).toUpperCase())}</div>`
      }
      <div>
        <div class="player-name">${escapeHtml(playerProfile.name || "Игрок")}</div>
        <div class="player-meta">${role}${player.id === sync.clientId ? " · ты" : ""}</div>
      </div>
    `;
    els.playerList.appendChild(item);
  });
}

function updatePlayers(data) {
  sync.players = Array.isArray(data.players) ? data.players : sync.players;
  sync.masterClientId = data.masterClientId || sync.masterClientId;
  const self = sync.players.find((player) => player.id === sync.clientId);
  if (self?.profile?.role && self.profile.role !== profile.role) {
    profile.role = self.profile.role;
    safeStorageSet(localStorage, ROLE_KEY, profile.role);
    els.profileRoleInput.value = profile.role;
  }
  applyRoleUi();
  renderPlayers();
  renderTokenDetails();
  renderCanvas();
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
    const response = await fetch(
      `/api/rooms/${encodeURIComponent(sync.roomId)}?client=${encodeURIComponent(sync.clientId)}&role=${encodeURIComponent(profile.role)}`,
    );
    if (!response.ok) throw new Error("Room unavailable");
    const data = await response.json();
    sync.revision = Number(data.revision || 0);
    updatePlayers(data);
    sync.ready = true;
    if (data.state) {
      applyRemoteState(data.state, data.revision);
      optimizeCurrentImagesSoon();
    } else {
      scheduleSync(20);
    }
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
    openEventStream();
    startHeartbeat();
    startPresence();
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

function startPresence() {
  window.clearInterval(presenceTimer);
  sendPresence({ includeProfile: true });
  presenceTimer = window.setInterval(() => sendPresence(), 3000);
}

async function sendPresence({ includeProfile = false } = {}) {
  if (!sync.online || !sync.ready || presencePending) return;
  presencePending = true;
  lastPresenceSent = Date.now();
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(sync.roomId)}/presence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: sync.clientId,
        profile: includeProfile ? profile : undefined,
        cursor: lastCursor,
      }),
    });
    if (response.ok) {
      updatePlayers(await response.json());
    }
  } catch {
    setOnlineStatus("connecting", "Переподключение");
  } finally {
    presencePending = false;
  }
}

function openEventStream() {
  if (sync.source) {
    sync.source.close();
  }

  sync.source = new EventSource(
    `/api/rooms/${encodeURIComponent(sync.roomId)}/events?client=${encodeURIComponent(sync.clientId)}&role=${encodeURIComponent(profile.role)}&name=${encodeURIComponent(profile.name)}&color=${encodeURIComponent(profile.color)}`,
  );

  sync.source.addEventListener("hello", (event) => {
    const data = JSON.parse(event.data);
    if (data.state && Number(data.revision || 0) > sync.revision) {
      applyRemoteState(data.state, data.revision);
    }
    updatePlayers(data);
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  });

  sync.source.addEventListener("clients", (event) => {
    const data = JSON.parse(event.data);
    updatePlayers(data);
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  });

  sync.source.addEventListener("state", (event) => {
    const data = JSON.parse(event.data);
    const nextRevision = Number(data.revision || 0);
    if (data.sourceClientId === sync.clientId) {
      sync.revision = Math.max(sync.revision, nextRevision);
      updatePlayers(data);
      setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
      return;
    }
    if (nextRevision > sync.revision) {
      applyRemoteState(data.state, nextRevision);
    }
    updatePlayers(data);
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  });

  sync.source.onerror = () => {
    setOnlineStatus("connecting", "Переподключение");
  };
}

function scheduleSync(delay = 260) {
  if (!sync.online || !sync.ready) return;
  syncDirty = true;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(pushState, delay);
}

async function pushState(options = {}) {
  if (!sync.online || !sync.ready || sync.applyingRemote) return;
  if (syncPending) {
    syncDirty = true;
    return;
  }
  syncPending = true;
  syncDirty = false;
  const payloadState = serializeStateForSync(options);
  const body = JSON.stringify({
    clientId: sync.clientId,
    profile,
    revision: sync.revision,
    state: payloadState.state,
    patch: payloadState.patch,
  });
  try {
    const response = await fetch(`/api/rooms/${encodeURIComponent(sync.roomId)}/state`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!response.ok) throw new Error("Sync failed");
    const data = await response.json();
    sync.revision = Number(data.revision || sync.revision);
    sync.imageSignature = payloadState.imageSignature;
    sync.lastSyncSnapshot = structuredClone(payloadState.snapshot);
    sync.lastPayloadBytes = textBytes(body);
    sync.lastPatchFields = payloadState.patchFields || [];
    sync.lastSyncAt = Date.now();
    if (payloadState.resetCellPatch) resetPendingCellPatch();
    updatePlayers(data);
    renderRoomStats();
    setOnlineStatus("online", "Онлайн", Number(data.clients || 1));
  } catch {
    setOnlineStatus("offline", "Нет связи");
  } finally {
    syncPending = false;
    if (syncDirty) scheduleSync(80);
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
  const zoom = state.zoom / 100;
  const nextLayoutKey = `${width}:${height}:${ratio}:${zoom}`;
  if (nextLayoutKey !== canvasLayoutKey) {
    canvas.width = Math.floor(width * ratio * zoom);
    canvas.height = Math.floor(height * ratio * zoom);
    canvas.style.width = `${width * zoom}px`;
    canvas.style.height = `${height * zoom}px`;
    canvasLayoutKey = nextLayoutKey;
  }
  ctx.setTransform(ratio * zoom, 0, 0, ratio * zoom, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
  els.toggleFogModeBtn.textContent = state.fogMode === "hide" ? "Закрывать" : "Открывать";
  els.toggleFogModeBtn.classList.toggle("danger-button", state.fogMode === "hide");
  els.toggleFogModeBtn.classList.toggle("ghost-button", state.fogMode !== "hide");
  els.toggleFogModeBtn.title = state.fogMode === "hide" ? "Сейчас туман закрывает клетки. Нажми, чтобы открывать." : "Сейчас туман открывает клетки. Нажми, чтобы закрывать.";
  els.fogSizeInput.value = state.fogSize;
  els.fogSizeValue.textContent = state.fogSize;
  els.templateShapeInput.value = state.selectedTemplateShape;
  els.templateSizeInput.value = state.selectedTemplateSize;
  els.templateCenterInput.value = state.selectedTemplateCenter;
  els.templateColorInput.value = state.selectedTemplateColor;
  els.templateOpacityInput.value = state.selectedTemplateOpacity;
  els.sceneNameInput.value = state.sceneName;
  els.tokenMoveModeInput.value = tokenMoveMode();

  document.querySelectorAll(".tool-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === state.activeTool);
  });
}

function renderAll({ shouldSave = true } = {}) {
  saveActiveScene();
  applyRoleUi();
  syncInputs();
  resizeCanvas();
  renderScenes();
  renderAssets();
  renderInitiative();
  renderInitiativeTracker();
  renderTokenDetails();
  renderMusic();
  renderNotesAndSaves();
  renderPlayers();
  renderRollLog();
  renderRoomStats();
  if (shouldSave) saveState();
}

function renderBoardUpdate({ shouldSave = true } = {}) {
  saveActiveScene();
  syncInputs();
  resizeCanvas();
  renderInitiativeTracker();
  renderTokenDetails();
  renderRoomStats();
  if (shouldSave) saveState();
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
  drawFog(width, height);
  drawPings();
  drawPlayerCursors();
  drawMeasurement();
  drawSelection();
}

function screenPx(value) {
  return value / Math.max(0.3, state.zoom / 100);
}

function drawBase(width, height) {
  ctx.fillStyle = "#2d2416";
  ctx.fillRect(0, 0, width, height);

  const background = state.background?.src && !state.backgroundHidden ? getImage(state.background.src) : null;
  if (background?.complete && background.naturalWidth) {
    ctx.drawImage(background, 0, 0, width, height);
    ctx.fillStyle = "rgba(0, 0, 0, 0.035)";
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.fillStyle = "rgba(255, 232, 176, 0.035)";
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

function drawFog(width, height) {
  const fogEntries = Object.keys(state.fog || {});
  if (!fogEntries.length) return;

  ctx.save();
  fogEntries.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return;
    const px = x * state.cell;
    const py = y * state.cell;
    ctx.fillStyle = "#020203";
    ctx.fillRect(px - 0.5, py - 0.5, state.cell + 1, state.cell + 1);
    ctx.fillStyle = "#070708";
    ctx.fillRect(px - 0.5, py - 0.5, state.cell + 1, Math.max(1, state.cell * 0.08));
  });

  ctx.strokeStyle = "rgba(209, 168, 80, 0.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  ctx.restore();
}

function drawGrid(width, height) {
  if (!state.showGrid) return;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 246, 215, 0.18)";
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
  visibleTokens().forEach((token) => {
    const asset = findTokenAsset(token.assetId);
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
    const ringRadius = radius + screenPx(4);

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = screenPx(10);
    ctx.shadowOffsetY = screenPx(3);
    ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius + screenPx(2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

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
    ctx.lineWidth = isFocusTurn ? screenPx(6) : isCurrentTurn ? screenPx(5) : screenPx(3.5);
    ctx.shadowColor = isFocusTurn ? "rgba(255, 218, 112, 0.98)" : isCurrentTurn ? "rgba(227, 182, 92, 0.82)" : "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = isFocusTurn ? screenPx(28) : isCurrentTurn ? screenPx(18) : screenPx(7);
    ctx.strokeStyle = isCurrentTurn || state.selectedObject?.id === token.id ? "#ffd36d" : "#c9c1ab";
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius + (isFocusTurn ? screenPx(3) : isCurrentTurn ? screenPx(2) : 0), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = screenPx(1.5);
    ctx.strokeStyle = "rgba(20, 12, 7, 0.92)";
    ctx.stroke();
    ctx.lineWidth = screenPx(1);
    ctx.strokeStyle = isCurrentTurn ? "rgba(255, 248, 214, 0.98)" : "rgba(255, 240, 200, 0.78)";
    ctx.stroke();
    ctx.restore();

    if (token.hidden && !isPlayerView()) {
      drawTokenBadge("скрыт", px + footprint / 2, py + footprint / 2 - screenPx(9), "#4f8793", "center");
    }

    if (token.name) {
      ctx.save();
      const labelHeight = screenPx(20);
      ctx.font = `800 ${screenPx(12)}px Inter, system-ui, sans-serif`;
      const label = token.name.slice(0, 20);
      const metrics = ctx.measureText(label);
      const labelWidth = Math.min(footprint + screenPx(44), metrics.width + screenPx(14));
      const labelX = px + footprint / 2 - labelWidth / 2;
      const labelY = py + footprint + screenPx(6);
      ctx.fillStyle = "rgba(18, 10, 6, 0.92)";
      roundRect(labelX, labelY, labelWidth, labelHeight, screenPx(5));
      ctx.fill();
      ctx.lineWidth = screenPx(1);
      ctx.strokeStyle = "rgba(227, 182, 92, 0.56)";
      ctx.stroke();
      ctx.fillStyle = "#fff0cf";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, px + footprint / 2, labelY + labelHeight / 2, labelWidth - screenPx(8));
      ctx.restore();
    }

    drawTokenCombatBadges(token, px, py, footprint, visualX, visualY, visualSize);
  });
}

function drawTokenCombatBadges(token, px, py, footprint, visualX, visualY, visualSize) {
  const hp = Number.isFinite(Number(token.hp)) ? Number(token.hp) : null;
  const maxHp = Number.isFinite(Number(token.maxHp)) ? Number(token.maxHp) : null;
  const conditions = tokenConditionsList(token);
  const note = String(token.note || "").trim();

  ctx.save();
  ctx.font = `800 ${screenPx(11)}px Inter, system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  if (hp !== null && maxHp !== null && maxHp > 0) {
    drawTokenHealthBar(hp, maxHp, visualX, visualY, visualSize);
  }

  const tags = conditions.slice(0, 2).map((id) => tokenConditions.find((item) => item.id === id)?.label).filter(Boolean);
  if (conditions.length > tags.length) tags.push(`+${conditions.length - tags.length}`);
  if (note) tags.push(note.slice(0, 10));
  if (tags.length) {
    drawTokenBadge(tags.slice(0, 3).join(" · "), px + footprint / 2, py - screenPx(24), "#d1a850", "center");
  }

  ctx.restore();
}

function drawTokenHealthBar(hp, maxHp, visualX, visualY, visualSize) {
  const ratio = clamp(hp / maxHp, 0, 1);
  const width = Math.max(screenPx(22), visualSize * 0.78);
  const height = screenPx(5);
  const x = visualX + (visualSize - width) / 2;
  const y = visualY + visualSize - screenPx(2);

  ctx.fillStyle = "rgba(18, 12, 10, 0.88)";
  roundRect(x, y, width, height, screenPx(3));
  ctx.fill();

  ctx.fillStyle = ratio > 0.45 ? "#d65045" : ratio > 0.2 ? "#c33f32" : "#8f211d";
  roundRect(x, y, Math.max(screenPx(2), width * ratio), height, screenPx(3));
  ctx.fill();

  ctx.lineWidth = screenPx(1);
  ctx.strokeStyle = "rgba(255, 214, 196, 0.55)";
  roundRect(x, y, width, height, screenPx(3));
  ctx.stroke();
}

function drawTokenBadge(label, x, y, color, align = "center") {
  const padX = screenPx(6);
  const height = screenPx(18);
  const width = ctx.measureText(label).width + padX * 2;
  const left = align === "left" ? x : align === "right" ? x - width : x - width / 2;
  ctx.fillStyle = "rgba(18, 10, 6, 0.94)";
  roundRect(left, y, width, height, screenPx(5));
  ctx.fill();
  ctx.lineWidth = screenPx(1.2);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = "#fff0cf";
  ctx.textAlign = "center";
  ctx.fillText(label, left + width / 2, y + height / 2);
}

function drawHandouts() {
  visibleHandouts().forEach((handout) => {
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
    if (handout.hidden && !isPlayerView()) {
      ctx.fillStyle = "rgba(17, 16, 15, 0.48)";
      ctx.fillRect(px, py, w, h);
      drawTokenBadge("скрыто", px + w / 2, py + h / 2 - screenPx(9), "#4f8793", "center");
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

function drawPlayerCursors() {
  if (!sync.players?.length) return;
  const now = Date.now();
  sync.players
    .filter((player) => player.id !== sync.clientId && player.cursor?.sceneId === state.activeSceneId)
    .filter((player) => now - Number(player.cursor.updatedAt || player.updatedAt || 0) < 12000)
    .forEach((player) => {
      const cursor = player.cursor;
      const playerProfile = player.profile || {};
      const color = /^#[0-9a-f]{6}$/i.test(playerProfile.color || "") ? playerProfile.color : "#d1a850";
      const label = String(playerProfile.name || "Игрок").slice(0, 18);
      const x = clamp(Number(cursor.x) || 0, 0, state.cols * state.cell);
      const y = clamp(Number(cursor.y) || 0, 0, state.rows * state.cell);
      const size = screenPx(14);
      const fontSize = screenPx(13);

      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(17, 16, 15, 0.92)";
      ctx.lineWidth = screenPx(3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size * 0.35, size * 1.15);
      ctx.lineTo(size * 0.78, size * 0.72);
      ctx.lineTo(size * 1.18, size * 0.66);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();

      ctx.font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
      const width = ctx.measureText(label).width + screenPx(18);
      const height = screenPx(24);
      const labelX = screenPx(16);
      const labelY = screenPx(18);
      ctx.fillStyle = "rgba(17, 16, 15, 0.9)";
      roundRect(labelX, labelY, width, height, screenPx(7));
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = screenPx(1.5);
      ctx.stroke();
      ctx.fillStyle = "#fff2c4";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, labelX + screenPx(9), labelY + height / 2);
      ctx.restore();
    });
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

function cellEdgeToward(cellX, cellY, targetCellX, targetCellY) {
  const center = cellCenter(cellX, cellY);
  const target = cellCenter(targetCellX, targetCellY);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (!dx && !dy) return center;

  const distance = Math.hypot(dx, dy);
  const unitX = dx / distance;
  const unitY = dy / distance;
  const edgeDistance = (state.cell / 2) / Math.max(Math.abs(unitX), Math.abs(unitY), 0.001);
  return {
    x: center.x + unitX * edgeDistance,
    y: center.y + unitY * edgeDistance,
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
  let start = templatePoint(template);
  const end = templatePoint(template, "endX", "endY");
  if ((template.shape === "line" || template.shape === "cone") && template.center !== "corner") {
    start = cellEdgeToward(
      clamp(Number(template.x) || 0, 0, state.cols - 1),
      clamp(Number(template.y) || 0, 0, state.rows - 1),
      clamp(Number(template.endX ?? template.x) || 0, 0, state.cols - 1),
      clamp(Number(template.endY ?? template.y) || 0, 0, state.rows - 1),
    );
  }
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (!dx && !dy && (template.shape === "line" || template.shape === "cone")) {
    dx = 1;
    dy = 0;
  }
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
      ctx.lineCap = "butt";
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
  const start = cellEdgeToward(startX, startY, endX, endY);
  const end = cellEdgeToward(endX, endY, endX + (endX - startX), endY + (endY - startY));
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

function updateLocalCursor(point) {
  lastCursor = {
    x: point.x,
    y: point.y,
    sceneId: state.activeSceneId,
    tool: state.activeTool,
  };
  if (sync.online && sync.ready && Date.now() - lastPresenceSent > 700) sendPresence();
}

function setTerrainAt(point, shouldSave = true) {
  const size = clamp(Number(state.brushSize) || 1, 1, 8);
  const offset = Math.floor((size - 1) / 2);
  for (let y = point.cellY - offset; y < point.cellY - offset + size; y += 1) {
    for (let x = point.cellX - offset; x < point.cellX - offset + size; x += 1) {
      if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) continue;
      const key = `${x},${y}`;
      if (state.activeTool === "erase") {
        delete state.terrain[key];
        markTerrainCell(key, null);
      } else {
        const value = {
          color: state.brushColor,
          light: state.brushLight,
          opacity: state.brushOpacity,
        };
        state.terrain[key] = value;
        markTerrainCell(key, value);
      }
    }
  }
  renderCanvas();
  if (shouldSave) saveState();
}

function setFogAt(point, shouldSave = true) {
  const size = clamp(Number(state.fogSize) || 1, 1, 12);
  const offset = Math.floor((size - 1) / 2);
  if (!state.fog) state.fog = {};
  for (let y = point.cellY - offset; y < point.cellY - offset + size; y += 1) {
    for (let x = point.cellX - offset; x < point.cellX - offset + size; x += 1) {
      if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) continue;
      const key = `${x},${y}`;
      if (state.fogMode === "hide") {
        state.fog[key] = true;
        markFogCell(key, true);
      } else {
        delete state.fog[key];
        markFogCell(key, false);
      }
    }
  }
  renderCanvas();
  if (shouldSave) saveState();
}

function objectAt(point) {
  const tokens = visibleTokens();
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
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
  const handouts = visibleHandouts();
  for (let i = handouts.length - 1; i >= 0; i -= 1) {
    const handout = handouts[i];
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
  renderTokenDetails();
  saveState();
}

function tokenSizeInputValue() {
  const raw = Number(String(els.tokenSizeInput.value).replace(",", "."));
  return clamp(raw || 1, 0.5, 6);
}

function placeToken(point) {
  const asset = findTokenAsset(state.selectedTokenAssetId);
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
  if (isPlayerView()) {
    token.ownerId = sync.clientId;
    token.playerCreated = true;
    if (!state.tokenAssets.some((item) => item.id === asset.id)) {
      state.tokenAssets.push({
        id: asset.id,
        name: asset.name,
        src: asset.src,
        ownerId: sync.clientId,
        playerCreated: true,
      });
    }
  }
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
  if (!canMoveMapObject(type, object)) {
    const reason = tokenMoveMode() === "master"
      ? "Токены сейчас двигает только мастер."
      : `Этот токен закреплён за ${tokenOwnerName(object?.ownerId)}.`;
    showToast(reason);
    return false;
  }
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
  return true;
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
  renderBoardUpdate();
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
  renderBoardUpdate();
  window.setTimeout(() => {
    prunePings();
    renderBoardUpdate();
  }, PING_DURATION + 80);
}

canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  updateLocalCursor(point);
  normalizeToolForRole();
  if (!canUseTool()) {
    showToast("Этот инструмент доступен мастеру.");
    return;
  }
  const hit = objectAt(point);

  if (hit && ["select", "token", "image"].includes(state.activeTool)) {
    if (!isMaster() && hit.type !== "token") return;
    if (!canMoveMapObject(hit.type, hit.object)) {
      beginDrag(hit.type, hit.object, point);
      return;
    }
    captureUndo();
    beginDrag(hit.type, hit.object, point);
    return;
  }

  if (!isMaster() && ["fog", "image"].includes(state.activeTool)) {
    if (state.activeTool === "token" && isPlayerView()) {
      placeToken(point);
      return;
    }
    showToast("Этот инструмент доступен мастеру.");
    return;
  }

  if (state.activeTool === "paint" || state.activeTool === "erase") {
    captureUndo();
    drag = { type: "paint" };
    setTerrainAt(point);
    return;
  }

  if (state.activeTool === "fog") {
    captureUndo();
    drag = { type: "fog" };
    setFogAt(point);
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
  const point = canvasPoint(event);
  updateLocalCursor(point);
  if (!drag) return;
  if (drag.type === "paint") {
    setTerrainAt(point, false);
  } else if (drag.type === "fog") {
    setFogAt(point, false);
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
    assets: currentTokenAssets(),
    selectedId: state.selectedTokenAssetId,
    type: "token",
  });
  if (!isPlayerView()) {
    renderAssetList({
      container: els.handoutAssets,
      assets: state.handoutAssets,
      selectedId: state.selectedHandoutAssetId,
      type: "handout",
    });
  } else {
    els.handoutAssets.innerHTML = "";
  }
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
    const item = document.createElement("div");
    item.role = "button";
    item.tabIndex = 0;
    item.className = `asset-item ${selectedId === asset.id ? "selected" : ""}`;
    item.innerHTML = `
      <img class="asset-thumb" src="${asset.src}" alt="">
      <div>
        <div class="asset-title">${escapeHtml(asset.name)}</div>
        <div class="asset-meta">${type === "token" ? (isPlayerView() ? "Личная фигурка" : "Фигурка") : "Картинка"}</div>
      </div>
      <span class="asset-actions">
        <span class="icon-action add-asset-action" aria-hidden="true">+</span>
        <button class="icon-action asset-delete" type="button" aria-label="Удалить из библиотеки">×</button>
      </span>
    `;
    const selectAsset = () => {
      if (type === "token") {
        state.selectedTokenAssetId = asset.id;
        state.activeTool = "token";
      } else {
        state.selectedHandoutAssetId = asset.id;
        state.activeTool = "image";
      }
      renderAll();
      showToast(type === "token" ? "Кликни по клетке, чтобы поставить фигурку." : "Кликни по полю, чтобы показать картинку.");
    };
    item.addEventListener("click", selectAsset);
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectAsset();
    });
    item.querySelector(".asset-delete").addEventListener("click", (event) => {
      event.stopPropagation();
      removeAsset(asset, type);
    });
    container.appendChild(item);
  });
}

function removeAsset(asset, type) {
  if (!asset) return;
  if (type === "token") {
    const used = state.tokens.some((token) => token.assetId === asset.id);
    if (used && !isPlayerView()) {
      showToast("Эта фигурка уже стоит на карте.");
      return;
    }
    if (isPlayerView()) {
      playerTokenAssets = playerTokenAssets.filter((item) => item.id !== asset.id);
      persistPlayerTokenAssets();
      if (state.selectedTokenAssetId === asset.id) state.selectedTokenAssetId = null;
      renderAll();
      showToast("Фигурка удалена из личной библиотеки.");
      return;
    }
    captureUndo();
    state.tokenAssets = state.tokenAssets.filter((item) => item.id !== asset.id);
    if (state.selectedTokenAssetId === asset.id) state.selectedTokenAssetId = null;
  } else {
    const used = state.handouts.some((handout) => handout.assetId === asset.id);
    if (used) {
      showToast("Эта картинка уже размещена на карте.");
      return;
    }
    captureUndo();
    state.handoutAssets = state.handoutAssets.filter((item) => item.id !== asset.id);
    if (state.selectedHandoutAssetId === asset.id) state.selectedHandoutAssetId = null;
  }
  renderAll();
  showToast("Удалено из библиотеки.");
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
    const side = initiativeSide(entry.side);
    const item = document.createElement("div");
    item.className = `initiative-item ${isActive ? "active-turn" : ""} ${isFocus ? "active-focus" : ""} side-${side}`;
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
          <button class="initiative-side-button team-${side}" type="button" aria-label="Команда: ${initiativeSideLabels[side]}. Нажми, чтобы сменить." title="${initiativeSideLabels[side]}"></button>
        </div>
      </div>
      <button class="icon-action initiative-remove" type="button" aria-label="Убрать из инициативы">×</button>
    `;

    item.querySelector(".initiative-name").addEventListener("click", () => {
      captureUndo();
      state.activeInitiativeId = entry.id;
      if (token) state.selectedObject = { type: "token", id: token.id };
      renderBoardUpdate();
    });

    item.querySelector(".initiative-score").addEventListener("change", (event) => {
      captureUndo();
      entry.value = Number(event.target.value) || 0;
      sortInitiative();
      renderAll();
    });

    item.querySelector(".initiative-side-button").addEventListener("click", () => {
      captureUndo();
      entry.side = nextInitiativeSide(entry.side);
      renderBoardUpdate();
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

function renderInitiativeTracker() {
  if (!els.initiativeTracker) return;
  normalizeInitiative(state);
  els.initiativeTracker.innerHTML = "";

  const round = Math.max(1, Number(state.initiativeRound) || 1);
  const roundBadge = document.createElement("div");
  roundBadge.className = "initiative-round";
  roundBadge.textContent = `Раунд ${round}`;
  els.initiativeTracker.appendChild(roundBadge);

  if (!state.initiative.length) {
    const empty = document.createElement("div");
    empty.className = "initiative-track-empty";
    empty.textContent = "Инициатива не собрана";
    els.initiativeTracker.appendChild(empty);
    return;
  }

  const activeGroup = currentInitiativeTokenIds();
  state.initiative.forEach((entry, index) => {
    const item = document.createElement("button");
    const isActive = activeGroup.has(entry.tokenId);
    const isFocus = entry.id === state.activeInitiativeId;
    item.type = "button";
    item.className = `initiative-track-item ${isActive ? "active-turn" : ""} ${isFocus ? "active-focus" : ""}`;
    item.innerHTML = `
      <span class="initiative-track-rank">${index + 1}</span>
      <span class="initiative-track-name">${escapeHtml(entry.name)}</span>
    `;
    item.addEventListener("click", () => {
      if (isPlayerView()) return;
      const token = state.tokens.find((candidate) => candidate.id === entry.tokenId);
      captureUndo();
      state.activeInitiativeId = entry.id;
      if (token) state.selectedObject = { type: "token", id: token.id };
      renderBoardUpdate();
    });
    els.initiativeTracker.appendChild(item);
  });
}

function renderTokenDetails() {
  const token = selectedToken();
  els.tokenDetailsEmpty.hidden = Boolean(token);
  els.tokenDetailsForm.hidden = !token;
  if (!token) return;
  ensureDeleteSelectedTokenButton();

  renderTokenOwnerOptions(token);
  els.selectedTokenNameInput.value = token.name || tokenDisplayName(token);
  els.selectedTokenHpInput.value = Number.isFinite(Number(token.hp)) ? Number(token.hp) : "";
  els.selectedTokenMaxHpInput.value = Number.isFinite(Number(token.maxHp)) ? Number(token.maxHp) : "";
  els.selectedTokenNoteInput.value = token.note || "";
  els.selectedTokenHiddenInput.checked = Boolean(token.hidden);

  const activeConditions = new Set(tokenConditionsList(token));
  els.tokenConditionGrid.innerHTML = "";
  tokenConditions.forEach((condition) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `condition-chip ${activeConditions.has(condition.id) ? "active" : ""}`;
    button.textContent = condition.label;
    button.addEventListener("click", () => {
      captureUndo();
      const next = new Set(tokenConditionsList(token));
      if (next.has(condition.id)) {
        next.delete(condition.id);
      } else {
        next.add(condition.id);
      }
      token.conditions = [...next];
      renderBoardUpdate();
    });
    els.tokenConditionGrid.appendChild(button);
  });
}

function ensureDeleteSelectedTokenButton() {
  if (els.deleteSelectedTokenBtn || !els.tokenDetailsForm) return;
  const button = document.createElement("button");
  button.id = "deleteSelectedTokenBtn";
  button.type = "button";
  button.className = "danger-button token-delete-button";
  button.textContent = "Удалить с карты";
  button.addEventListener("click", deleteSelectedToken);
  els.tokenDetailsForm.appendChild(button);
  els.deleteSelectedTokenBtn = button;
}

function deleteSelectedToken() {
  const token = selectedToken();
  if (!token || !isMaster()) return;
  if (!confirm(`Удалить "${tokenDisplayName(token)}" с карты?`)) return;
  captureUndo();
  state.tokens = state.tokens.filter((item) => item.id !== token.id);
  state.initiative = state.initiative.filter((entry) => entry.tokenId !== token.id);
  if (!state.initiative.some((entry) => entry.id === state.activeInitiativeId)) {
    state.activeInitiativeId = state.initiative[0]?.id || null;
  }
  state.selectedObject = null;
  normalizeInitiative(state);
  renderAll();
  showToast("Фигурка удалена с карты.");
}

function renderTokenOwnerOptions(token) {
  els.selectedTokenOwnerInput.innerHTML = "";
  const options = [
    { value: "", label: "Общий" },
    ...sync.players
      .filter((player) => player.profile?.role !== "master")
      .map((player) => ({
        value: player.id,
        label: player.profile?.name || "Игрок",
      })),
  ];
  if (token.ownerId && !options.some((option) => option.value === token.ownerId)) {
    options.push({ value: token.ownerId, label: tokenOwnerName(token.ownerId) });
  }
  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    els.selectedTokenOwnerInput.appendChild(item);
  });
  els.selectedTokenOwnerInput.value = token.ownerId || "";
}

function updateSelectedToken(mutator) {
  const token = selectedToken();
  if (!token) return;
  captureUndo();
  mutator(token);
  const initiativeEntry = state.initiative.find((entry) => entry.tokenId === token.id);
  if (initiativeEntry) initiativeEntry.name = tokenDisplayName(token);
  normalizeInitiative(state);
  renderAll();
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
  state.initiativeRound = Math.max(1, Number(state.initiativeRound) || 1);
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
  if (range && nextIndex <= range.end) {
    state.initiativeRound = Math.max(1, Number(state.initiativeRound) || 1) + 1;
  }
  state.activeInitiativeId = state.initiative[nextIndex].id;
  renderAll();
}

function showCompressionToast(result) {
  if (!result?.compressed) return;
  showToast(`${result.label} сжат: ${formatBytes(result.before)} -> ${formatBytes(result.after)}.`);
}

async function addImageFiles(files, type) {
  for (const file of [...files]) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const result = await compressImageFile(file, type === "token" ? "token" : "handout");
      const asset = {
        id: uid(type),
        name: file.name,
        src: result.src,
      };
      if (type === "token") {
        if (isPlayerView()) {
          asset.ownerId = sync.clientId;
          asset.playerCreated = true;
          playerTokenAssets = [asset, ...playerTokenAssets.filter((item) => item.id !== asset.id)].slice(0, 24);
          persistPlayerTokenAssets();
        } else {
          captureUndo();
          state.tokenAssets.push(asset);
        }
        state.selectedTokenAssetId = asset.id;
        state.activeTool = "token";
        if (!els.tokenNameInput.value) {
          els.tokenNameInput.value = file.name.replace(/\.[^.]+$/, "").slice(0, 24);
        }
      } else {
        captureUndo();
        state.handoutAssets.push(asset);
        state.selectedHandoutAssetId = asset.id;
        state.activeTool = "image";
      }
      renderAll();
      showCompressionToast(result);
    } catch {
      showToast("Не удалось прочитать изображение.");
    }
  }
}

els.tokenImageInput.addEventListener("change", (event) => {
  addImageFiles(event.target.files, "token");
  event.target.value = "";
});

els.handoutImageInput.addEventListener("change", (event) => {
  addImageFiles(event.target.files, "handout");
  event.target.value = "";
});

els.selectedTokenNameInput.addEventListener("change", (event) => {
  updateSelectedToken((token) => {
    const value = event.target.value.trim();
    if (value) {
      token.name = value;
    } else {
      delete token.name;
    }
  });
});

els.selectedTokenHpInput.addEventListener("change", (event) => {
  updateSelectedToken((token) => {
    const value = event.target.value === "" ? null : clamp(Number(event.target.value) || 0, 0, 999);
    if (value === null) {
      delete token.hp;
    } else {
      token.hp = value;
    }
  });
});

els.selectedTokenMaxHpInput.addEventListener("change", (event) => {
  updateSelectedToken((token) => {
    const value = event.target.value === "" ? null : clamp(Number(event.target.value) || 0, 0, 999);
    if (value === null) {
      delete token.maxHp;
    } else {
      token.maxHp = value;
    }
  });
});

els.selectedTokenNoteInput.addEventListener("change", (event) => {
  updateSelectedToken((token) => {
    token.note = event.target.value.trim();
  });
});

els.selectedTokenHiddenInput.addEventListener("change", (event) => {
  updateSelectedToken((token) => {
    token.hidden = event.target.checked;
  });
});

els.selectedTokenOwnerInput.addEventListener("change", (event) => {
  updateSelectedToken((token) => {
    token.ownerId = event.target.value;
  });
});

els.tokenMoveModeInput.addEventListener("change", (event) => {
  state.tokenMoveMode = ["all", "owned", "master"].includes(event.target.value) ? event.target.value : "all";
  renderAll();
  showToast("Права движения токенов обновлены.");
});

els.mapBackgroundInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || !file.type.startsWith("image/")) return;
  try {
    const result = await compressImageFile(file, "background");
    const src = result.src;
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
  } catch {
    showToast("Не удалось прочитать фон карты.");
  }
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

function saveSlotLabel(slot) {
  const date = new Date(slot.updatedAt || slot.createdAt || Date.now());
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderNotesAndSaves() {
  els.gmNotesInput.value = gmNotes;
  els.playerNotesInput.value = state.playerNotes || "";
  els.saveSlotList.innerHTML = "";

  if (!saveSlots.length) {
    const empty = document.createElement("div");
    empty.className = "initiative-empty";
    empty.textContent = "Слотов пока нет.";
    els.saveSlotList.appendChild(empty);
    return;
  }

  saveSlots.forEach((slot) => {
    const item = document.createElement("div");
    item.className = "save-slot-item";
    item.innerHTML = `
      <div>
        <div class="save-slot-title">${escapeHtml(slot.name || "Сохранение")}</div>
        <div class="save-slot-meta">${escapeHtml(saveSlotLabel(slot))}</div>
      </div>
      <button class="mini-button save-load" type="button">Загрузить</button>
      <button class="icon-action save-delete" type="button" aria-label="Удалить сохранение">×</button>
    `;
    item.querySelector(".save-load").addEventListener("click", () => {
      captureUndo();
      state = {
        ...structuredClone(defaultState),
        ...structuredClone(slot.state),
        musicTracks: (slot.state.musicTracks || []).filter((track) => !track.transient),
      };
      normalizeScenes(state);
      imageCache = new Map();
      renderAll();
      showToast("Сохранение загружено.");
    });
    item.querySelector(".save-delete").addEventListener("click", () => {
      saveSlots = saveSlots.filter((saved) => saved.id !== slot.id);
      persistSaveSlots();
      renderNotesAndSaves();
      showToast("Сохранение удалено.");
    });
    els.saveSlotList.appendChild(item);
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

els.gmNotesInput.addEventListener("input", (event) => {
  gmNotes = event.target.value;
  safeStorageSet(localStorage, GM_NOTES_KEY, gmNotes);
});

els.playerNotesInput.addEventListener("input", (event) => {
  state.playerNotes = event.target.value;
  saveState();
});

els.createSaveSlotBtn.addEventListener("click", () => {
  saveActiveScene();
  const now = Date.now();
  const name = els.saveSlotNameInput.value.trim() || `${state.sceneName || "Сцена"} ${new Date(now).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
  saveSlots = [
    {
      id: uid("save"),
      name,
      createdAt: now,
      updatedAt: now,
      state: serializeState(state),
    },
    ...saveSlots,
  ].slice(0, 6);
  persistSaveSlots();
  els.saveSlotNameInput.value = "";
  renderNotesAndSaves();
  showToast("Сохранение создано.");
});

els.joinRoomBtn.addEventListener("click", () => {
  saveProfile();
  const nextRoom = cleanRoomId(els.roomInput.value);
  if (!sync.online) {
    applyRoleUi();
    renderPlayers();
    showToast("Профиль сохранён в этом браузере.");
    return;
  }
  if (nextRoom !== sync.roomId) {
    location.href = roomUrl(nextRoom);
    return;
  }
  sendPresence({ includeProfile: true });
  applyRoleUi();
  renderPlayers();
  showToast("Профиль применён.");
});

els.roomInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    els.joinRoomBtn.click();
  }
});

["profileNameInput", "profileRoleInput", "profileColorInput"].forEach((id) => {
  els[id].addEventListener("change", () => {
    saveProfile();
    applyRoleUi();
    renderPlayers();
    sendPresence({ includeProfile: true });
  });
});

els.profileAvatarInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file || !file.type.startsWith("image/")) return;
  try {
    const result = await compressImageFile(file, "avatar");
    profile.avatar = result.src;
    saveProfile();
    renderPlayers();
    sendPresence({ includeProfile: true });
    showToast("Аватар профиля обновлён.");
    window.setTimeout(() => showCompressionToast(result), 400);
  } catch {
    showToast("Не удалось прочитать аватар.");
  }
  event.target.value = "";
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

if (els.forceSyncBtn) {
  els.forceSyncBtn.addEventListener("click", async () => {
    if (!sync.online || !sync.ready) {
      showToast("Сначала подключись к комнате.");
      return;
    }
    if (!isMaster()) {
      showToast("Принудительный синк доступен мастеру.");
      return;
    }
    saveActiveScene();
    safeStorageSet(localStorage, STORAGE_KEY, JSON.stringify(serializeState(state)));
    syncDirty = false;
    await pushState({ forceFullImages: true });
    showToast("Состояние комнаты отправлено.");
  });
}

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

els.clearRollLogBtn.addEventListener("click", () => {
  state.rollLog = [];
  renderRollLog();
  saveState();
  showToast("История бросков очищена.");
});

document.querySelectorAll(".tool-button").forEach((button) => {
  button.addEventListener("click", () => {
    if (isPlayerView() && !PLAYER_TOOLS.has(button.dataset.tool)) {
      showToast("Этот инструмент доступен мастеру.");
      return;
    }
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

els.toggleFogModeBtn.addEventListener("click", () => {
  state.fogMode = state.fogMode === "hide" ? "reveal" : "hide";
  syncInputs();
  saveState();
  showToast(state.fogMode === "hide" ? "Туман закрывает клетки." : "Туман открывает клетки.");
});

els.fogSizeInput.addEventListener("input", (event) => {
  state.fogSize = clamp(Number(event.target.value) || 3, 1, 12);
  syncInputs();
  saveState();
});

els.coverFogBtn.addEventListener("click", () => {
  captureUndo();
  markFullPatchField("fog");
  state.fog = {};
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      state.fog[`${x},${y}`] = true;
    }
  }
  renderAll();
  showToast("Карта закрыта туманом.");
});

els.clearFogBtn.addEventListener("click", () => {
  captureUndo();
  markFullPatchField("fog");
  state.fog = {};
  renderAll();
  showToast("Туман очищен.");
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
  state.initiativeRound = 1;
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

els.playerViewToggle.addEventListener("click", () => {
  playerViewPreview = !playerViewPreview;
  safeStorageSet(localStorage, "dnd-battle-table-player-view-preview", playerViewPreview ? "1" : "0");
  renderAll();
  showToast(playerViewPreview ? "Включён вид игрока." : "Включён вид мастера.");
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
  markFullPatchField("terrain");
  markFullPatchField("fog");
  state.cols = clamp(Number(els.colsInput.value) || state.cols, MAP_LIMITS.minCols, MAP_LIMITS.maxCols);
  state.rows = clamp(Number(els.rowsInput.value) || state.rows, MAP_LIMITS.minRows, MAP_LIMITS.maxRows);
  state.cell = clamp(Number(els.cellInput.value) || state.cell, MAP_LIMITS.minCell, MAP_LIMITS.maxCell);
  clampObjectsToMap();
  state.terrain = {};
  state.fog = {};
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
  markFullPatchField("terrain");
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
    Digit2: "ping",
    Numpad2: "ping",
    Digit3: "measure",
    Numpad3: "measure",
    Digit4: "template",
    Numpad4: "template",
    Digit5: "paint",
    Numpad5: "paint",
    Digit6: "erase",
    Numpad6: "erase",
    Digit7: "fog",
    Numpad7: "fog",
  };
  const keyMap = {
    v: "select",
    b: "paint",
    e: "erase",
    l: "measure",
    t: "template",
    p: "ping",
    f: "fog",
    м: "select",
    и: "paint",
    у: "erase",
    д: "measure",
    е: "template",
    з: "ping",
    а: "fog",
  };
  const nextTool = toolShortcutMap[event.code] || keyMap[key];
  if (nextTool) {
    if (isPlayerView() && !PLAYER_TOOLS.has(nextTool)) {
      showToast("Этот инструмент доступен мастеру.");
      return;
    }
    state.activeTool = nextTool;
    renderAll();
  }
  if (event.key === "Delete" && state.selectedObject && isMaster()) {
    captureUndo();
    if (state.selectedObject.type === "token") {
      state.tokens = state.tokens.filter((item) => item.id !== state.selectedObject.id);
    } else {
      state.handouts = state.handouts.filter((item) => item.id !== state.selectedObject.id);
    }
    state.selectedObject = null;
    renderAll();
  }
  if ((key === "h" || key === "р") && state.selectedObject && isMaster()) {
    const object = selectedMapObject();
    if (!object) return;
    captureUndo();
    object.hidden = !object.hidden;
    renderAll();
    showToast(object.hidden ? "Скрыто от игроков." : "Теперь видно игрокам.");
  }
});

window.addEventListener("beforeunload", () => {
  transientUrls.forEach((src) => URL.revokeObjectURL(src));
});

setDrawerCollapsed(safeStorageGet(localStorage, "dnd-battle-table-drawer-collapsed") === "1");
activateDrawerTab(safeStorageGet(localStorage, "dnd-battle-table-drawer-tab") || "room");
renderAll();
optimizeCurrentImagesSoon();
connectOnline();
