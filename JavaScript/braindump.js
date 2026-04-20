const viewport = document.getElementById("braindump-viewport");
const canvas = document.getElementById("braindump-canvas");
const svgLayer = document.getElementById("braindump-svg-layer");
const toolbarButtons = document.querySelectorAll(".braindump-toolbar button");
const fileInput = document.getElementById("braindump-import");
const toolbarToast = document.getElementById("braindump-toolbar-toast");
const recommendationPanel = document.getElementById("braindump-recommend-panel");
const recommendationSummaryInput = document.getElementById("braindump-recommend-summary");
const recommendationSubmitButton = document.getElementById("braindump-recommend-submit");
const recommendationModal = document.getElementById("braindump-modal");
const recommendationModalFilename = document.getElementById("braindump-recommend-file-name");
const recommendationModalCancelButton = document.getElementById("braindump-modal-cancel");
const recommendationModalConfirmButton = document.getElementById("braindump-modal-confirm");
const recommendationModalDismissCheckbox = document.getElementById("braindump-modal-dismiss");

const boardConfig = {
  slug: viewport?.dataset.boardSlug || "braindump",
  title: viewport?.dataset.boardTitle || "Braindump",
  sourcePath: viewport?.dataset.boardSource || "content/boards/braindump/current.canvas",
  legacySourcePath: viewport?.dataset.boardLegacySource || "content/braindump-state.json",
  repoPath: viewport?.dataset.boardRepoPath || "content/boards/braindump/current.canvas",
  storageKey: viewport?.dataset.boardStorageKey || "board:braindump",
  legacyStorageKey: viewport?.dataset.boardLegacyStorageKey || "braindump-canvas",
  saveEndpoint: viewport?.dataset.boardSaveEndpoint || "/api/save-board",
  allowRecommendations: viewport?.dataset.boardAllowRecommendations === "true"
};

const recommendationConfig = {
  type: viewport?.dataset.recommendationType || "",
  owner: viewport?.dataset.recommendationOwner || "",
  repo: viewport?.dataset.recommendationRepo || "",
  labels: String(viewport?.dataset.recommendationLabels || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};

let toolbarToastTimeout = null;
let viewportSaveTimeout = null;
let pendingRecommendation = null;
const RECOMMENDATION_MODAL_DISMISS_SUFFIX = ":recommendation-modal-dismissed";

function scheduleViewportSave() {
  if (viewportSaveTimeout) clearTimeout(viewportSaveTimeout);
  viewportSaveTimeout = setTimeout(() => persistLocalState(serializeState()), 400);
}
let comparisonBaselineState = { nodes: [], edges: [] };

function cloneState(state) {
  return JSON.parse(JSON.stringify(state || { nodes: [], edges: [] }));
}

function setComparisonBaseline(state) {
  comparisonBaselineState = cloneState(state);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function countChangedCollection(baseItems = [], currentItems = [], prefix = "item") {
  const baseMap = new Map();
  const currentMap = new Map();

  baseItems.forEach((item, index) => {
    const key = item?.id ? `${prefix}:${item.id}` : `${prefix}:base:${index}:${stableStringify(item)}`;
    baseMap.set(key, stableStringify(item));
  });

  currentItems.forEach((item, index) => {
    const key = item?.id ? `${prefix}:${item.id}` : `${prefix}:current:${index}:${stableStringify(item)}`;
    currentMap.set(key, stableStringify(item));
  });

  const keys = new Set([...baseMap.keys(), ...currentMap.keys()]);
  let changed = 0;

  keys.forEach((key) => {
    if (baseMap.get(key) !== currentMap.get(key)) {
      changed += 1;
    }
  });

  return changed;
}

function getChangedElementCount() {
  const currentState = serializeState();
  return (
    countChangedCollection(comparisonBaselineState.nodes, currentState.nodes, "node") +
    countChangedCollection(comparisonBaselineState.edges, currentState.edges, "edge")
  );
}

function showToolbarToast(message, variant = "info") {
  if (!toolbarToast) return;

  toolbarToast.textContent = message;
  toolbarToast.dataset.variant = variant;
  toolbarToast.hidden = false;
  toolbarToast.classList.add("is-visible");

  if (toolbarToastTimeout) {
    window.clearTimeout(toolbarToastTimeout);
  }

  toolbarToastTimeout = window.setTimeout(() => {
    toolbarToast.classList.remove("is-visible");
    toolbarToast.hidden = true;
  }, 3200);
}

function setRecommendationPanelOpen(isOpen) {
  if (!recommendationPanel) return;

  recommendationPanel.hidden = !isOpen;
  recommendationPanel.classList.toggle("is-open", isOpen);
  if (isOpen) {
    recommendationSummaryInput?.focus();
    recommendationSummaryInput?.select();
  }
}

function setRecommendationModalOpen(isOpen) {
  if (!recommendationModal) return;

  recommendationModal.hidden = !isOpen;
  recommendationModal.classList.toggle("is-open", isOpen);
  if (isOpen) {
    if (recommendationModalDismissCheckbox) {
      recommendationModalDismissCheckbox.checked = shouldSkipRecommendationModal();
    }
    recommendationModalConfirmButton?.focus();
  }
}

function getRecommendationModalDismissKey() {
  return `${boardConfig.storageKey}${RECOMMENDATION_MODAL_DISMISS_SUFFIX}`;
}

function shouldSkipRecommendationModal() {
  try {
    return localStorage.getItem(getRecommendationModalDismissKey()) === "true";
  } catch (error) {
    return false;
  }
}

function setRecommendationModalDismissed(shouldDismiss) {
  try {
    const key = getRecommendationModalDismissKey();
    if (shouldDismiss) {
      localStorage.setItem(key, "true");
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    // Ignore storage failures and keep default modal behavior.
  }
}

function openRecommendationIssue(issueUrl, recommendationFilename) {
  window.open(issueUrl, "_blank", "noopener,noreferrer");
  showToolbarToast(`Recommendation sent — attach ${recommendationFilename} to the form that just opened.`, "success");
}

function closeRecommendationModal() {
  pendingRecommendation = null;
  setRecommendationModalOpen(false);
}

function openRecommendationModal(issueUrl, filename) {
  if (!recommendationModal) {
    openRecommendationIssue(issueUrl, filename);
    return;
  }

  pendingRecommendation = { issueUrl, filename };
  if (recommendationModalFilename) {
    recommendationModalFilename.textContent = filename;
  }
  setRecommendationModalOpen(true);
}

function confirmRecommendationNavigation() {
  if (!pendingRecommendation?.issueUrl) {
    closeRecommendationModal();
    return;
  }

  const { issueUrl, filename } = pendingRecommendation;
  const shouldDismiss = recommendationModalDismissCheckbox?.checked === true;
  setRecommendationModalDismissed(shouldDismiss);
  pendingRecommendation = null;
  setRecommendationModalOpen(false);
  if (recommendationSummaryInput) {
    recommendationSummaryInput.value = "";
  }
  openRecommendationIssue(issueUrl, filename);
}

function sanitizeFileSegment(value) {
  return String(value || "board")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "board";
}

function padTimestampSegment(value) {
  return String(value).padStart(2, "0");
}

function formatTimestamp(date = new Date()) {
  return `${date.getFullYear()}-${padTimestampSegment(date.getMonth() + 1)}-${padTimestampSegment(date.getDate())}_${padTimestampSegment(date.getHours())}-${padTimestampSegment(date.getMinutes())}-${padTimestampSegment(date.getSeconds())}`;
}

function buildExportFilename() {
  const boardName = sanitizeFileSegment(boardConfig.slug || boardConfig.title || document.title);
  return `${boardName}_${formatTimestamp()}.canvas`;
}

function buildRecommendationFilename() {
  const boardName = sanitizeFileSegment(boardConfig.slug || boardConfig.title || document.title);
  return `${boardName}_${formatTimestamp()}.canvas.json`;
}

function getPublicPageUrl() {
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.href;
  if (canonicalHref) {
    return canonicalHref;
  }

  const ogUrl = document.querySelector('meta[property="og:url"]')?.content;
  if (ogUrl) {
    return ogUrl;
  }

  return window.location.href;
}

function getYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return parsed.pathname.slice(1) || "";
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v") || "";
      }

      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || "";
      }
    }
  } catch (error) {
    return "";
  }

  return "";
}

function applyBookmarkPreview(nodeObj, el, preview) {
  if (!el) return;

  const titleEl = el.querySelector(".bd-bookmark-title");
  const descEl = el.querySelector(".bd-bookmark-desc");
  const linkEl = el.querySelector(".bd-bookmark-link");

  if (preview.title) {
    nodeObj.title = preview.title;
    if (titleEl) titleEl.textContent = preview.title;
  }

  if (preview.description !== undefined) {
    nodeObj.description = preview.description || "";
    if (descEl) descEl.textContent = nodeObj.description;
  }

  if (linkEl) {
    linkEl.href = nodeObj.url;
    linkEl.textContent = nodeObj.url || "#";
  }

  if (preview.image) {
    nodeObj.image = preview.image;
    let imageEl = el.querySelector(".bd-bookmark-image");
    if (!imageEl) {
      el.insertAdjacentHTML(
        "afterbegin",
        `<img class="bd-bookmark-image" src="${nodeObj.image}" draggable="false" alt="${nodeObj.title || "Link preview"}">`
      );
      imageEl = el.querySelector(".bd-bookmark-image");
      if (!nodeObj.hasAdjustedRatio) {
        nodeObj.height += 160;
        nodeObj.hasAdjustedRatio = true;
        el.style.height = `${nodeObj.height}px`;
      }
    } else if (imageEl.getAttribute("src") !== nodeObj.image) {
      imageEl.setAttribute("src", nodeObj.image);
    }
  }

  persistLocalState(serializeState());
}

async function fetchBookmarkPreview(nodeObj, el) {
  const videoId = getYouTubeVideoId(nodeObj.url);

  if (videoId) {
    const fallbackTitle = nodeObj.title || "YouTube video";
    applyBookmarkPreview(nodeObj, el, {
      title: fallbackTitle,
      description: nodeObj.description || "Video recommendation",
      image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    });

    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(nodeObj.url)}&format=json`
      );
      if (!response.ok) return;

      const data = await response.json();
      applyBookmarkPreview(nodeObj, el, {
        title: data.title || fallbackTitle,
        description: nodeObj.description || "YouTube video",
        image: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      });
      return;
    } catch (error) {
      console.warn("Failed to fetch YouTube preview", error);
      return;
    }
  }

  try {
    const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(nodeObj.url)}`);
    const data = await response.json();
    if (data.status !== "success" || !data.data) return;

    applyBookmarkPreview(nodeObj, el, {
      title: data.data.title || nodeObj.title || "Link Preview",
      description: data.data.description || nodeObj.description || "",
      image: data.data.image?.url || nodeObj.image || ""
    });
  } catch (error) {
    console.warn("Failed to fetch bookmark preview", error);
  }
}

function normalizeRecommendationSummary(value, maxLength = 50) {
  const summary = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!summary) {
    return "";
  }

  return summary.slice(0, maxLength).trim();
}

function buildRecommendationIssueTitle(summary) {
  const normalizedSummary = normalizeRecommendationSummary(summary);
  return normalizedSummary
    ? `Recommendation: ${boardConfig.title} (${normalizedSummary})`
    : `Recommendation: ${boardConfig.title}`;
}

function buildRecommendationIssueBody(summary, details, exportFilename) {
  const timestamp = formatTimestamp().replace("_", " ");
  const changedElements = getChangedElementCount();
  const lines = [
    "## Board",
    boardConfig.title,
    "",
    "## Page",
    getPublicPageUrl(),
    "",
    "## Timestamp",
    timestamp,
    "",
    "## Board file",
    exportFilename,
    "",
    "## Estimated changed elements",
    String(changedElements),
    "",
    "## Short summary",
    normalizeRecommendationSummary(summary) || "Describe the recommendation in one sentence.",
    "",
    "## Details",
    details || "If you'd like to include further notes, add them here.",
    "",
    "## Attachment",
    `Please attach the exported recommendation file \`${exportFilename}\` to this issue.`,
    "This recommendation flow exports a **.canvas.json file** because GitHub issue attachments do not accept `.canvas` files directly.",
    "Local import already accepts the **.canvas.json file** directly, so no conversion is required to bring it back into the board.",
    "If you want to turn it back into a normal board file outside the site, remove the trailing `.json` so it ends with `.canvas`.",
    "",
    "## Notes",
    "- If you already opened a recommendation issue for this board, update that issue instead of creating a new one.",
    "- This recommendation will be reviewed before it appears on the live site."
  ];

  return lines.join("\n");
}

function buildRecommendationIssueUrl(summary, details, exportFilename) {
  const url = new URL(
    `https://github.com/${recommendationConfig.owner}/${recommendationConfig.repo}/issues/new`
  );

  url.searchParams.set("title", buildRecommendationIssueTitle(summary));
  if (recommendationConfig.labels.length > 0) {
    url.searchParams.set("labels", recommendationConfig.labels.join(","));
  }
  url.searchParams.set("body", buildRecommendationIssueBody(summary, details, exportFilename));

  return url.toString();
}

function beginRecommendationFlow() {
  if (!boardConfig.allowRecommendations || recommendationConfig.type !== "issue" || !recommendationConfig.owner || !recommendationConfig.repo) {
    showToolbarToast("Recommendations are not set up for this board.", "error");
    return;
  }

  const summary = normalizeRecommendationSummary(recommendationSummaryInput?.value);
  if (!summary) {
    showToolbarToast("Add a short description for the recommendation.", "error");
    recommendationSummaryInput?.focus();
    return;
  }

  const recommendationFilename = buildRecommendationFilename();
  const issueUrl = buildRecommendationIssueUrl(summary, "", recommendationFilename);
  downloadStateFile(recommendationFilename, "application/json");
  setRecommendationPanelOpen(false);
  if (shouldSkipRecommendationModal()) {
    if (recommendationSummaryInput) {
      recommendationSummaryInput.value = "";
    }
    openRecommendationIssue(issueUrl, recommendationFilename);
  } else {
    openRecommendationModal(issueUrl, recommendationFilename);
  }
}

function downloadStateFile(filename, mimeType = "application/octet-stream") {
  const state = serializeState();
  const jsonStr = JSON.stringify(state, null, 2);
  const blob = new Blob([jsonStr], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);

  return { filename, jsonStr };
}

function serializeState() {
  return { nodes, edges, viewport: { x: camera.x, y: camera.y, z: camera.z } };
}

function persistLocalState(state) {
  const serialized = JSON.stringify(state);
  localStorage.setItem(boardConfig.storageKey, serialized);
  if (boardConfig.legacyStorageKey && boardConfig.legacyStorageKey !== boardConfig.storageKey) {
    localStorage.setItem(boardConfig.legacyStorageKey, serialized);
  }
  return serialized;
}

function getSavedState() {
  return (
    localStorage.getItem(boardConfig.storageKey) ||
    (boardConfig.legacyStorageKey ? localStorage.getItem(boardConfig.legacyStorageKey) : null)
  );
}

async function fetchBoardState(sourcePath) {
  if (!sourcePath) return null;
  const response = await fetch(sourcePath, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

function buildSaveUrl() {
  const url = new URL(boardConfig.saveEndpoint, window.location.origin);
  if (boardConfig.slug) url.searchParams.set("slug", boardConfig.slug);
  return url.toString();
}

let camera = { x: 0, y: 0, z: 1 };
let isPanning = false;
let isDrawing = false;
let activeTool = "select"; // default mode is select
let startPan = { x: 0, y: 0 };
let currentPath = null;
let currentPathData = "";
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
let selectionBox = null;
let dragRect = { x: 0, y: 0, w: 0, h: 0, startX: 0, startY: 0, active: false };

let nodes = [];
let edges = [];

// Undo/Redo history
let undoHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 200;
let isLoadingState = false; // Flag to prevent recording during load
const TEXT_NODE_PLACEHOLDER = "Type here...";

function normalizeTextEditorValue(value) {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u200B/g, "")
    .replace(/\u00A0/g, " ");

  if (normalized === "\n") return "";
  return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized;
}

function syncTextEditorValue(editor, text = "") {
  const normalizedText = normalizeTextEditorValue(text);
  if (editor.innerText !== normalizedText) {
    editor.innerText = normalizedText;
  }
  editor.classList.toggle("is-empty", normalizedText.length === 0);
  return normalizedText;
}

function placeCaretAtEnd(editor) {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function beginTextEditing(nodeObj, editor, options = {}) {
  if (!nodeObj || !editor || editor.contentEditable === "true") return;

  editor.dataset.undoText = nodeObj.text || "";
  editor.contentEditable = "true";
  syncTextEditorValue(editor, nodeObj.text || "");
  editor.focus();

  if (options.placeCaretAtEnd) {
    placeCaretAtEnd(editor);
  }
}

function finishTextEditing(nodeObj, editor) {
  if (!nodeObj || !editor || editor.contentEditable !== "true") return;

  const oldText = editor.dataset.undoText || "";
  const newText = syncTextEditorValue(editor, editor.innerText);
  nodeObj.text = newText;
  editor.contentEditable = "false";
  delete editor.dataset.undoText;

  if (oldText !== newText) {
    pushAction({ type: "editText", nodeId: nodeObj.id, oldText, newText });
  }
}

function focusTextEditor(nodeId, options = {}) {
  const nodeObj = nodes.find(n => n.id === nodeId);
  const el = document.getElementById(nodeId);
  const editor = el?.querySelector(".bd-text-editor");

  if (!nodeObj || !el || !editor || nodeObj.type !== "text" || nodeObj.text?.includes("<svg")) {
    return;
  }

  document.querySelectorAll(".bd-item").forEach(item => item.classList.remove("selected"));
  el.classList.add("selected");
  beginTextEditing(nodeObj, editor, options);
}

function pushAction(action) {
  undoHistory = undoHistory.slice(0, historyIndex + 1);
  undoHistory.push(action);
  if (undoHistory.length > MAX_HISTORY) { undoHistory.shift(); historyIndex--; }
  historyIndex = undoHistory.length - 1;
}

function removeNodeById(nodeId) {
  const el = document.getElementById(nodeId);
  if (el) el.remove();
  nodes = nodes.filter(n => n.id !== nodeId);
}

function restoreNode(nodeData) {
  const d = JSON.parse(JSON.stringify(nodeData));
  const type = d.type === 'text' && d.text?.includes('<svg') ? 'draw' :
               d.type === 'link' ? 'link' :
               d.type === 'file' ? 'image' : d.type;
  isLoadingState = true;
  createNode(type, d.x, d.y, d);
  isLoadingState = false;
}

function applyReverse(action) {
  if (action.type === 'create') {
    removeNodeById(action.nodeId);
  } else if (action.type === 'delete') {
    restoreNode(action.nodeData);
  } else if (action.type === 'move') {
    action.nodeIds.forEach((id, i) => {
      const node = nodes.find(n => n.id === id);
      const el = document.getElementById(id);
      if (node && el) {
        node.x = action.fromPositions[i].x;
        node.y = action.fromPositions[i].y;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
    });
  } else if (action.type === 'resize') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = document.getElementById(action.nodeId);
    if (node && el) {
      node.width = action.fromSize.w;
      node.height = action.fromSize.h;
      el.style.width = `${node.width}px`;
      el.style.height = `${node.height}px`;
    }
  } else if (action.type === 'editText') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = document.getElementById(action.nodeId);
    if (node && el) {
      node.text = action.oldText;
      const ta = el.querySelector(".bd-text-editor");
      if (ta) syncTextEditorValue(ta, action.oldText || "");
    }
  } else if (action.type === 'batch') {
    for (let i = action.actions.length - 1; i >= 0; i--) applyReverse(action.actions[i]);
  }
}

function applyForward(action) {
  if (action.type === 'create') {
    restoreNode(action.nodeData);
  } else if (action.type === 'delete') {
    removeNodeById(action.nodeId);
  } else if (action.type === 'move') {
    action.nodeIds.forEach((id, i) => {
      const node = nodes.find(n => n.id === id);
      const el = document.getElementById(id);
      if (node && el) {
        node.x = action.toPositions[i].x;
        node.y = action.toPositions[i].y;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
    });
  } else if (action.type === 'resize') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = document.getElementById(action.nodeId);
    if (node && el) {
      node.width = action.toSize.w;
      node.height = action.toSize.h;
      el.style.width = `${node.width}px`;
      el.style.height = `${node.height}px`;
    }
  } else if (action.type === 'editText') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = document.getElementById(action.nodeId);
    if (node && el) {
      node.text = action.newText;
      const ta = el.querySelector(".bd-text-editor");
      if (ta) syncTextEditorValue(ta, action.newText || "");
    }
  } else if (action.type === 'batch') {
    action.actions.forEach(a => applyForward(a));
  }
}

function undo() {
  if (historyIndex < 0) return;
  applyReverse(undoHistory[historyIndex]);
  historyIndex--;
}

function redo() {
  if (historyIndex >= undoHistory.length - 1) return;
  historyIndex++;
  applyForward(undoHistory[historyIndex]);
}

function deleteSelected() {
  const selected = document.querySelectorAll('.bd-item.selected');
  if (selected.length === 0) return;
  const actions = [];
  selected.forEach(el => {
    const node = nodes.find(n => n.id === el.id);
    if (node) {
      actions.push({ type: 'delete', nodeId: node.id, nodeData: JSON.parse(JSON.stringify(node)) });
      removeNodeById(node.id);
    }
  });
  if (actions.length === 1) pushAction(actions[0]);
  else if (actions.length > 1) pushAction({ type: 'batch', actions });
}

function cutSelected() {
  const selected = document.querySelectorAll('.bd-item.selected');
  if (selected.length === 0) return;
  // Copy data to clipboard as JSON
  const cutData = [];
  selected.forEach(el => {
    const node = nodes.find(n => n.id === el.id);
    if (node) cutData.push(JSON.parse(JSON.stringify(node)));
  });
  navigator.clipboard.writeText(JSON.stringify(cutData)).catch(() => {});
  deleteSelected();
}

function copySelected() {
  const selected = document.querySelectorAll('.bd-item.selected');
  if (selected.length === 0) return;
  // Copy data to clipboard as JSON
  const copyData = [];
  selected.forEach(el => {
    const node = nodes.find(n => n.id === el.id);
    if (node) copyData.push(JSON.parse(JSON.stringify(node)));
  });
  navigator.clipboard.writeText(JSON.stringify(copyData)).catch(() => {});
}

// Apply Camera Transform
function updateTransform() {
  canvas.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
  viewport.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
  viewport.style.backgroundSize = `${30 * camera.z}px ${30 * camera.z}px`;
}

// Convert screen constraints
function screenToCanvas(x, y) {
  const rect = viewport.getBoundingClientRect();
  return {
    x: (x - rect.left - camera.x) / camera.z,
    y: (y - rect.top - camera.y) / camera.z
  };
}

// Generate zoom-scaled pen cursor
function getDrawCursor() {
  const r = Math.min(Math.max(Math.round(4 * camera.z / 2), 3), 20);
  const size = r * 2 + 4;
  const cx = size / 2;
  return `url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="%233fdaca" stroke-width="1.5"/><circle cx="${cx}" cy="${cx}" r="1" fill="%233fdaca"/></svg>') ${cx} ${cx}, crosshair`;
}

// Handle Mouse & Touch Pan/Zoom
viewport.addEventListener("wheel", (e) => {
  e.preventDefault(); // Default to zoom for all scroll actions
  // Trackpad pinch-to-zoom sends ctrlKey with small deltaY — use a larger multiplier
  const sensitivity = e.ctrlKey ? -0.016 : -0.002;
  const zoomAmount = e.deltaY * sensitivity;
  const newZ = Math.min(Math.max(camera.z + zoomAmount * camera.z, 0.1), 3);
  
  const rect = viewport.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const dx = (mouseX - camera.x) * (newZ / camera.z - 1);
  const dy = (mouseY - camera.y) * (newZ / camera.z - 1);
  
  camera.x -= dx;
  camera.y -= dy;
  camera.z = newZ;
  updateTransform();
  if (activeTool === "draw") viewport.style.cursor = getDrawCursor();
  scheduleViewportSave();
}, { passive: false });

let initialPinchDistance = null;
let initialCameraZ = 1;

viewport.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    isPanning = false;
    isDrawing = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    initialPinchDistance = Math.hypot(dx, dy);
    initialCameraZ = camera.z;
  } else if (e.touches.length === 1) {
    if (activeTool === "draw") {
      e.preventDefault();
      startDrawing(e.touches[0].clientX, e.touches[0].clientY);
    } else if (activeTool === "pan" || e.target === viewport) {
      if (e.target === viewport) {
        isPanning = true;
        startPan = { x: e.touches[0].clientX - camera.x, y: e.touches[0].clientY - camera.y };
      }
    }
  }
}, { passive: false });

viewport.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialPinchDistance) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.hypot(dx, dy);
    let scale = distance / initialPinchDistance;
    scale = 1 + (scale - 1) * 8.0; // 4x faster pinch zoom
    camera.z = Math.min(Math.max(initialCameraZ * scale, 0.1), 5);
    updateTransform();
  } else if (e.touches.length === 1) {
    if (isDrawing) {
      e.preventDefault();
      draw(e.touches[0].clientX, e.touches[0].clientY);
    } else if (isPanning) {
      e.preventDefault();
      camera.x = e.touches[0].clientX - startPan.x;
      camera.y = e.touches[0].clientY - startPan.y;
      updateTransform();
    }
  }
}, { passive: false });

viewport.addEventListener("touchend", () => {
  initialPinchDistance = null;
  isPanning = false;
  if (isDrawing) stopDrawing();
});

// Global middle-click, right-click, and pan-tool panning
window.addEventListener("pointerdown", (e) => {
  const isItem = e.target.closest ? e.target.closest(".bd-item") : false;
  const isToolbar = e.target.closest ? e.target.closest(".braindump-toolbar") : false;
  const isBackgroundClick = !isItem && !isToolbar;
  // Middle-click or right-click anywhere, OR left-click with pan tool active
  const shouldPan = e.button === 1 || e.button === 2 ||
    (e.button === 0 && activeTool === "pan" && !isToolbar);
  if (shouldPan) {
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
    isPanning = true;
    startPan = { x: e.clientX - camera.x, y: e.clientY - camera.y };
    viewport.dataset.cursorBeforePan = viewport.style.cursor;
    viewport.style.cursor = "grabbing";
  }
});

// Prevent context menu on the viewport so right-click can pan
viewport.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

viewport.addEventListener("mousedown", (e) => {
  if (e.button === 0 && (e.shiftKey || activeTool === "pan")) {
    isPanning = true;
    startPan = { x: e.clientX - camera.x, y: e.clientY - camera.y };
    viewport.style.cursor = "grabbing";
    e.preventDefault();
  } else if (e.button === 0 && isPanning) {
    // handled by window mousedown
  } else if (e.button === 0) {
    if (activeTool === "draw") {
      startDrawing(e.clientX, e.clientY);
    } else if (activeTool === "select" && e.target.closest && !e.target.closest(".bd-item") && !e.target.closest(".braindump-toolbar")) {
      if (!e.shiftKey) { 
        document.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      }
      let pos = screenToCanvas(e.clientX, e.clientY);
      dragRect = { x: pos.x, y: pos.y, w: 0, h: 0, startX: pos.x, startY: pos.y, active: true };
      
      if (!selectionBox) {
        selectionBox = document.createElement("div");
        selectionBox.style.position = "absolute";
        selectionBox.style.border = "1px solid #3fdaca";
        selectionBox.style.backgroundColor = "rgba(63, 218, 202, 0.1)";
        selectionBox.style.pointerEvents = "none";
        selectionBox.style.zIndex = "1000";
        canvas.appendChild(selectionBox);
      }
      selectionBox.style.left = `${pos.x}px`;
      selectionBox.style.top = `${pos.y}px`;
      selectionBox.style.width = `0px`;
      selectionBox.style.height = `0px`;
      selectionBox.style.display = "block";
    } else if (activeTool === "text" && e.target.closest && !e.target.closest(".bd-item") && !e.target.closest(".braindump-toolbar")) {
      let pos = screenToCanvas(e.clientX, e.clientY);
      const newNode = createNode("text", pos.x, pos.y, { text: "", width: 250, height: 150 });
      window.requestAnimationFrame(() => focusTextEditor(newNode.id, { placeCaretAtEnd: true }));
      setActiveTool("select");
    } else if (activeTool !== "pan" && activeTool !== "select" && activeTool !== "text" && e.target.closest && !e.target.closest(".bd-item") && !e.target.closest(".braindump-toolbar")) {
      let pos = screenToCanvas(e.clientX, e.clientY);
      createNode(activeTool, pos.x, pos.y);
      setActiveTool("select");
    }
  }
});

// Mouse position tracking for exact paste locations
let lastMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

window.addEventListener("pointermove", (e) => {
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
  if (isPanning) {
    camera.x = e.clientX - startPan.x;
    camera.y = e.clientY - startPan.y;
    updateTransform();
  } else if (isDrawing) {
    draw(e.clientX, e.clientY);
  } else if (dragRect.active) {
    let pos = screenToCanvas(e.clientX, e.clientY);
    dragRect.x = Math.min(pos.x, dragRect.startX);
    dragRect.y = Math.min(pos.y, dragRect.startY);
    dragRect.w = Math.abs(pos.x - dragRect.startX);
    dragRect.h = Math.abs(pos.y - dragRect.startY);
    selectionBox.style.left = `${dragRect.x}px`;
    selectionBox.style.top = `${dragRect.y}px`;
    selectionBox.style.width = `${dragRect.w}px`;
    selectionBox.style.height = `${dragRect.h}px`;
  }
});

window.addEventListener("pointerup", (e) => {
  if (isPanning) {
    isPanning = false;
    // Restore cursor to the tool's correct cursor
    if (activeTool === "draw") viewport.style.cursor = getDrawCursor();
    else if (activeTool === "pan") viewport.style.cursor = "grab";
    else viewport.style.cursor = "default";
    scheduleViewportSave();
  } else {
    isPanning = false;
  }
  
  if (isDrawing) stopDrawing();
  
  if (dragRect.active) {
    dragRect.active = false;
    if (selectionBox) selectionBox.style.display = "none";
    // Check collisions
    nodes.forEach(n => {
      let el = document.getElementById(n.id);
      if (!el) return;
      if (n.x < dragRect.x + dragRect.w && n.x + n.width > dragRect.x &&
          n.y < dragRect.y + dragRect.h && n.y + n.height > dragRect.y) {
        el.classList.add("selected");
      }
    });
  }
});

// Shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.isContentEditable) return;
  // Undo/Redo/Cut/Copy/Delete
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveBoard(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelected(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { copySelected(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
  
  if (e.key === "p" || e.key === "P") setActiveTool("draw");
  if (e.key === "t" || e.key === "T") setActiveTool("text");
  if (e.key === "v" || e.key === "V") setActiveTool("select");
  if (e.key === "l" || e.key === "L") setActiveTool("bookmark");
  if (e.code === "Space") {
    e.preventDefault();
    if (activeTool !== "pan") {
      viewport.dataset.prevTool = activeTool;
      setActiveTool("pan");
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.isContentEditable) return;
  if (e.code === "Space" && viewport.dataset.prevTool) {
    setActiveTool(viewport.dataset.prevTool);
    viewport.dataset.prevTool = "";
    if (!isPanning) {
      if (activeTool === "draw") viewport.style.cursor = getDrawCursor();
      else if (activeTool !== "pan") viewport.style.cursor = "default";
    }
  }
});

// Tools logic
function setActiveTool(tool) {
  if (tool === "export" || tool === "import" || tool === "save" || tool === "recommend") return;
  activeTool = tool;
  toolbarButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  viewport.dataset.mode = tool;
  if (tool === "draw") viewport.style.cursor = getDrawCursor();
  else if (tool === "pan") viewport.style.cursor = "grab";
  else viewport.style.cursor = "default";
}

toolbarButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tool === "save") return saveBoard();
    if (btn.dataset.tool === "recommend") {
      const shouldOpen = recommendationPanel?.hidden ?? true;
      setRecommendationPanelOpen(shouldOpen);
      return;
    }
    if (btn.dataset.tool === "export") return exportCanvas();
    setActiveTool(btn.dataset.tool);
  });
});

if (recommendationSummaryInput) {
  recommendationSummaryInput.addEventListener("input", () => {
    recommendationSummaryInput.value = normalizeRecommendationSummary(recommendationSummaryInput.value);
  });

  recommendationSummaryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      beginRecommendationFlow();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setRecommendationPanelOpen(false);
    }
  });
}

if (recommendationSubmitButton) {
  recommendationSubmitButton.addEventListener("click", beginRecommendationFlow);
}

if (recommendationModalCancelButton) {
  recommendationModalCancelButton.addEventListener("click", closeRecommendationModal);
}

if (recommendationModalConfirmButton) {
  recommendationModalConfirmButton.addEventListener("click", confirmRecommendationNavigation);
}

if (recommendationModal) {
  recommendationModal.addEventListener("click", (event) => {
    if (event.target === recommendationModal) {
      closeRecommendationModal();
    }
  });
}

window.addEventListener("pointerdown", (event) => {
  if (!recommendationPanel || recommendationPanel.hidden) return;
  const clickedRecommendButton = event.target.closest?.('[data-tool="recommend"]');
  const clickedInsidePanel = event.target.closest?.("#braindump-recommend-panel");
  if (!clickedRecommendButton && !clickedInsidePanel) {
    setRecommendationPanelOpen(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && recommendationModal && !recommendationModal.hidden) {
    event.preventDefault();
    closeRecommendationModal();
  }
});

if (fileInput) {
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        loadState(data);
        persistLocalState(serializeState());
        setComparisonBaseline(serializeState());
        showToolbarToast(`Imported ${file.name}`, "success");
      } catch(err) {
        showToolbarToast("Import failed. Use .canvas, .canvas.json, or .json.", "error");
      }
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

function exportCanvas() {
  const result = downloadStateFile(buildExportFilename(), "application/octet-stream");
  showToolbarToast(`Exported ${result.filename}`, "success");
  return result;
}

function submitRecommendation() {
  if (!boardConfig.allowRecommendations || recommendationConfig.type !== "issue" || !recommendationConfig.owner || !recommendationConfig.repo) {
    showToolbarToast("Recommendations are not set up for this board.", "error");
    return;
  }

  const summary = normalizeRecommendationSummary(recommendationSummaryInput?.value);
  if (!summary) {
    showToolbarToast("Add a short description for the recommendation.", "error");
    recommendationSummaryInput?.focus();
    return;
  }
  const recommendationFilename = buildRecommendationFilename();
  downloadStateFile(recommendationFilename, "application/json");
  const issueUrl = buildRecommendationIssueUrl(summary, "", recommendationFilename);
  window.open(issueUrl, "_blank", "noopener,noreferrer");
  setRecommendationPanelOpen(false);
  if (recommendationSummaryInput) recommendationSummaryInput.value = "";
  showToolbarToast(`Recommendation sent — attach ${recommendationFilename} to the form that just opened.`, "success");
}

// Drawing logic
let lastDrawPoint = { x: 0, y: 0 };
function startDrawing(x, y) {
  isDrawing = true;
  let pos = screenToCanvas(x, y);
  lastDrawPoint = pos;
  minX = pos.x; maxX = pos.x;
  minY = pos.y; maxY = pos.y;
  currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  currentPathData = `M ${pos.x} ${pos.y}`;
  currentPath.setAttribute("d", currentPathData);
  currentPath.setAttribute("fill", "none");
  currentPath.setAttribute("stroke", "#3fdaca");
  currentPath.setAttribute("stroke-width", "4");
  currentPath.setAttribute("stroke-linecap", "round");
  currentPath.setAttribute("stroke-linejoin", "round");
  svgLayer.appendChild(currentPath);
}

function draw(x, y) {
  if (!isDrawing || !currentPath) return;
  let pos = screenToCanvas(x, y);
  
  // Throttle points to reduce DOM repaints and lag
  let dist = Math.hypot(pos.x - lastDrawPoint.x, pos.y - lastDrawPoint.y);
  if (dist < 4 / camera.z) return;
  lastDrawPoint = pos;

  minX = Math.min(minX, pos.x); maxX = Math.max(maxX, pos.x);
  minY = Math.min(minY, pos.y); maxY = Math.max(maxY, pos.y);
  currentPathData += ` L ${pos.x} ${pos.y}`;
  currentPath.setAttribute("d", currentPathData);
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentPath) {
    let w = Math.max(maxX - minX, 10);
    let h = Math.max(maxY - minY, 10);
    const viewBox = `${minX - 5} ${minY - 5} ${w + 10} ${h + 10}`;
    createNode("text", minX - 5, minY - 5, { 
      width: w + 10, 
      height: h + 10, 
      text: `<svg class="bd-drawing" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block;"><path d="${currentPathData}" fill="none" stroke="#3fdaca" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path></svg>` 
    });
    svgLayer.removeChild(currentPath);
  }
  currentPath = null;
}

function uuid() {
  return Math.random().toString(36).substring(2, 18);
}

// Nodes Management
function createNode(type, x, y, data = {}) {
  let nodeObj = {
    id: data.id || uuid(),
    x: x,
    y: y,
    width: data.width || 250,
    height: data.height || 150,
    ...data
  };

  if (type === "text" || type === "draw") {
    nodeObj.type = "text";
    nodeObj.text = data.text || "";
  } else if (type === "bookmark" || type === "page") {
    nodeObj.type = "link";
    nodeObj.url = data.url || "";
  } else if (type === "image") {
    nodeObj.type = "file";
    // Check auto sizing flag to avoid infinite loops if loaded from file
    if (data.file && !data.id && data.width === undefined) {
        let img = new Image();
        img.onload = () => {
            nodeObj.width = img.width;
            nodeObj.height = img.height;
            let el = document.getElementById(nodeObj.id);
            if (el) {
                el.style.width = `${nodeObj.width}px`;
                el.style.height = `${nodeObj.height}px`;
            }
        };
        img.src = data.file;
    }
  }

  nodes.push(nodeObj);
  renderNode(nodeObj);
  // Record in undo history (skip during load)
  if (!isLoadingState) {
    pushAction({ type: 'create', nodeId: nodeObj.id, nodeData: JSON.parse(JSON.stringify(nodeObj)) });
  }
  return nodeObj;
}

function renderNode(nodeObj) {
  let el = document.getElementById(nodeObj.id);
  if (!el) {
    el = document.createElement("div");
    el.className = `bd-item bd-layer-${nodeObj.type}`;
    el.id = nodeObj.id;
    
    // Add specific auto-size class for link to allow fit-content if desired
    if (nodeObj.type === "link") el.classList.add("bd-auto-size-content");

    let handle = document.createElement("div");
    handle.className = "resize-handle";
    el.appendChild(handle);
    canvas.appendChild(el);
    
    // Drag logic
    let isDragging = false;
    let dragStart = {x:0, y:0};
    let dragStartPositions = []; // For undo tracking

    function beginNodeDrag(clientX, clientY, shiftKey = false) {
      if (activeTool === "pan") return false;
      if (activeTool !== "select") return false;

      isDragging = true;
      dragStart = { x: clientX, y: clientY };

      if (!shiftKey && !el.classList.contains("selected")) {
        document.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      }
      el.classList.add("selected");

      dragStartPositions = [];
      document.querySelectorAll(".bd-item.selected").forEach(selEl => {
        const selNode = nodes.find(n => n.id === selEl.id);
        if (selNode) dragStartPositions.push({ id: selNode.id, x: selNode.x, y: selNode.y });
      });

      return true;
    }

    function moveSelectedNodes(clientX, clientY) {
      if (!isDragging) return;

      const dx = (clientX - dragStart.x) / camera.z;
      const dy = (clientY - dragStart.y) / camera.z;
      dragStart = { x: clientX, y: clientY };

      document.querySelectorAll(".bd-item.selected").forEach(selEl => {
        const selNode = nodes.find(n => n.id === selEl.id);
        if (selNode) {
          selNode.x += dx;
          selNode.y += dy;
          selEl.style.left = `${selNode.x}px`;
          selEl.style.top = `${selNode.y}px`;
        }
      });
    }

    function finishNodeDrag() {
      if (isDragging && dragStartPositions.length > 0) {
        const movedIds = [];
        const fromPos = [];
        const toPos = [];
        dragStartPositions.forEach(sp => {
          const node = nodes.find(n => n.id === sp.id);
          if (node && (Math.abs(node.x - sp.x) > 0.5 || Math.abs(node.y - sp.y) > 0.5)) {
            movedIds.push(sp.id);
            fromPos.push({ x: sp.x, y: sp.y });
            toPos.push({ x: node.x, y: node.y });
          }
        });
        if (movedIds.length > 0) {
          pushAction({ type: 'move', nodeIds: movedIds, fromPositions: fromPos, toPositions: toPos });
        }
      }
      dragStartPositions = [];
      isDragging = false;
    }
    
    el.addEventListener("mousedown", (e) => {
      // Pan tool should never drag items — panning is handled globally
      if (activeTool === "pan") return;
      if (activeTool !== "select") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.target.classList.contains("resize-handle")) return; // handled separately
      // Don't start drag if clicking inside an active contenteditable
      if (e.target.isContentEditable && document.activeElement === e.target) return;
      
      if (!beginNodeDrag(e.clientX, e.clientY, e.shiftKey)) return;
      e.stopPropagation();
    });

    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.target.classList.contains("resize-handle")) return; // handled separately
      if (e.target.isContentEditable && document.activeElement === e.target) return;

      const touch = e.touches[0];
      if (!beginNodeDrag(touch.clientX, touch.clientY, false)) return;
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });
    
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      moveSelectedNodes(e.clientX, e.clientY);
    });

    window.addEventListener("touchmove", (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      e.preventDefault();
      moveSelectedNodes(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener("mouseup", finishNodeDrag);
    window.addEventListener("touchend", finishNodeDrag);
    window.addEventListener("touchcancel", finishNodeDrag);

    // Resize logic
    let isResizing = false;
    let resizeStartSize = { w: 0, h: 0 };
    let resizeStartPoint = { x: 0, y: 0 };

    function beginNodeResize(clientX, clientY) {
      isResizing = true;
      resizeStartSize = { w: nodeObj.width, h: nodeObj.height };
      resizeStartPoint = { x: clientX, y: clientY };
      document.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      el.classList.add("selected");
    }

    function resizeNode(clientX, clientY) {
      if (!isResizing) return;

      let deltaX = (clientX - resizeStartPoint.x) / camera.z;
      let deltaY = (clientY - resizeStartPoint.y) / camera.z;
      resizeStartPoint = { x: clientX, y: clientY };

      if (nodeObj.type === "file") {
        let ratio = nodeObj.width / nodeObj.height;
        let newWidth = Math.max(nodeObj.width + deltaX, 50);
        nodeObj.width = newWidth;
        nodeObj.height = newWidth / ratio;
      } else {
        nodeObj.width = Math.max(nodeObj.width + deltaX, 50);
        nodeObj.height = Math.max(nodeObj.height + deltaY, 50);
      }
      el.style.width = `${nodeObj.width}px`;
      el.style.height = `${nodeObj.height}px`;
    }

    function finishNodeResize() {
      if (isResizing) {
        // Push resize action if size actually changed
        if (Math.abs(nodeObj.width - resizeStartSize.w) > 0.5 || Math.abs(nodeObj.height - resizeStartSize.h) > 0.5) {
          pushAction({ type: 'resize', nodeId: nodeObj.id, fromSize: resizeStartSize, toSize: { w: nodeObj.width, h: nodeObj.height } });
        }
      }
      isResizing = false;
    }

    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      beginNodeResize(e.clientX, e.clientY);
    });

    handle.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      beginNodeResize(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      resizeNode(e.clientX, e.clientY);
    });

    window.addEventListener("touchmove", (e) => {
      if (!isResizing || e.touches.length !== 1) return;
      e.preventDefault();
      resizeNode(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener("mouseup", finishNodeResize);
    window.addEventListener("touchend", finishNodeResize);
    window.addEventListener("touchcancel", finishNodeResize);
  }

  el.style.left = `${nodeObj.x}px`;
  el.style.top = `${nodeObj.y}px`;
  el.style.width = `${nodeObj.width}px`;
  el.style.height = `${nodeObj.height}px`;

  if (nodeObj.type === "text") {
    if (nodeObj.text && nodeObj.text.includes("<svg")) {
      el.innerHTML = nodeObj.text;
      el.appendChild(el.querySelector(".resize-handle") || document.createElement("div"));
      el.classList.remove("bd-layer-text");
      el.classList.add("bd-layer-draw");
      el.style.background = "transparent";
      el.style.border = "none";
    } else {
      let ta = el.querySelector(".bd-text-editor");
      if (!ta) {
        ta = document.createElement("div");
        ta.className = "bd-text-editor";
        ta.dataset.placeholder = TEXT_NODE_PLACEHOLDER;
        ta.contentEditable = "true";
        // Inline styles to match the centered opaque look for text boxes without relying on textarea limits
        ta.style.width = "100%";
        ta.style.height = "100%";
        ta.style.outline = "none";
        ta.style.overflow = "hidden";
        ta.style.display = "flex";
        ta.style.alignItems = "center";
        ta.style.justifyContent = "center";
        ta.style.textAlign = "center";
        ta.style.wordBreak = "break-word";
        ta.addEventListener("input", () => {
          nodeObj.text = normalizeTextEditorValue(ta.innerText);
          ta.classList.toggle("is-empty", nodeObj.text.length === 0);
        });
        // Only stop propagation when actively editing (contenteditable=true)
        ta.addEventListener("mousedown", (e) => {
          if (ta.contentEditable === "true") e.stopPropagation();
        });
        ta.addEventListener("blur", () => finishTextEditing(nodeObj, ta));
        ta.contentEditable = "false";
        el.addEventListener("dblclick", () => {
          beginTextEditing(nodeObj, ta);
        });
        
        el.insertBefore(ta, el.firstChild);
      }
      if (document.activeElement !== ta) {
        syncTextEditorValue(ta, nodeObj.text || "");
      }
    }
  } else if (nodeObj.type === "file") {
    let img = el.querySelector("img");
    if (!img) {
      el.insertAdjacentHTML("afterbegin", `<img src="${nodeObj.file}" draggable="false" alt="file preview">`);
      img = el.querySelector("img");
      img.onload = () => {
        let naturalRatio = img.naturalWidth / img.naturalHeight;
        if (!nodeObj.hasAdjustedRatio) {
           nodeObj.width = Math.min(img.naturalWidth, 400);
           nodeObj.height = nodeObj.width / naturalRatio;
           nodeObj.hasAdjustedRatio = true;
           el.style.width = `${nodeObj.width}px`;
           el.style.height = `${nodeObj.height}px`;
        }
      };
    }
  } else if (nodeObj.type === "link") {
    if (!el.querySelector(".bd-bookmark-title")) {
        el.insertAdjacentHTML("afterbegin", `
        <div class="bd-bookmark-content" style="display:flex; flex-direction:column; gap:4px">
          <h3 class="bd-bookmark-title">${nodeObj.title || "Link Preview"}</h3>
          <p class="bd-bookmark-desc" style="font-size:12px;opacity:0.7;margin:0">${nodeObj.description || ""}</p>
          <a class="bd-bookmark-link" href="${nodeObj.url}" target="_blank" draggable="false">${nodeObj.url || '#'}</a>
        </div>
        `);
    }

    if (nodeObj.image && !el.querySelector(".bd-bookmark-image")) {
      el.insertAdjacentHTML(
        "afterbegin",
        `<img class="bd-bookmark-image" src="${nodeObj.image}" draggable="false" alt="${nodeObj.title || "Link preview"}">`
      );
      if (!nodeObj.hasAdjustedRatio) {
        nodeObj.height += 160;
        nodeObj.hasAdjustedRatio = true;
        el.style.height = `${nodeObj.height}px`;
      }
    }

    if (!nodeObj.title || (getYouTubeVideoId(nodeObj.url) && !nodeObj.image)) {
      fetchBookmarkPreview(nodeObj, el);
    }
  }
}

// Paste Handling
document.addEventListener("paste", (e) => {
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.hasAttribute("contenteditable")) {
    return; // Don't intercept if they're actively typing !
  }
  // Track paste location to last mouse coordinate
  let pos = screenToCanvas(lastMousePos.x, lastMousePos.y);
  
  // Handle text / URL
  let textMatch = (e.clipboardData.getData("text") || e.clipboardData.getData("text/plain") || "").trim();
  if (textMatch) {
    // Check if this is internal copied node data from the whiteboard
    try {
      if (textMatch.trim().startsWith("[{")) {
        const parsed = JSON.parse(textMatch);
        if (Array.isArray(parsed) && parsed[0] && parsed[0].id && parsed[0].type) {
          const anchorX = parsed[0].x;
          const anchorY = parsed[0].y;
          const actions = [];
          
          isLoadingState = true;
          parsed.forEach(n => {
            let type = n.type === "text" && n.text?.includes("<svg") ? "draw" : n.type;
            if (type === "file") type = "image";
            
            const offsetX = n.x - anchorX;
            const offsetY = n.y - anchorY;
            delete n.id; // generate new ID to avoid collisions
            delete n.x;  // Delete original coordinates so createNode doesn't overwrite our new positions
            delete n.y;
            
            let newNode = createNode(type, pos.x + offsetX, pos.y + offsetY, n);
            actions.push({ type: 'create', nodeId: newNode.id, nodeData: JSON.parse(JSON.stringify(newNode)) });
          });
          isLoadingState = false;
          
          if (actions.length > 0) {
            pushAction({ type: 'batch', actions: actions });
          }
          return;
        }
      }
    } catch(e) {}
    
    // Regular text / URL paste
    const urlRegex = /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/i;
    if (textMatch.match(urlRegex) && !textMatch.includes(" ")) {
      if (!textMatch.startsWith("http")) textMatch = "https://" + textMatch;
      createNode("bookmark", pos.x, pos.y, { url: textMatch, width: 300, height: 120 });
    } else {
      createNode("text", pos.x, pos.y, { text: textMatch, width: 300, height: 200 });
    }
    return;
  }

  // Handle images
  let items = e.clipboardData?.items;
  if (!items) return;
  for (let item of items) {
    if (item.type.indexOf("image") !== -1) {
      let blob = item.getAsFile();
      let reader = new FileReader();
      reader.onload = (event) => {
        createNode("image", pos.x, pos.y, { file: event.target.result });
      };
      reader.readAsDataURL(blob);
      return;
    }
  }
});

// Load & Save
function loadState(data) {
  isLoadingState = true;
  canvas.querySelectorAll(".bd-item").forEach(n => n.remove());
  svgLayer.innerHTML = "";
  nodes = [];
  edges = [];

  if (data.viewport) {
    if (typeof data.viewport.x === 'number') camera.x = data.viewport.x;
    if (typeof data.viewport.y === 'number') camera.y = data.viewport.y;
    if (typeof data.viewport.z === 'number') camera.z = data.viewport.z;
  }

  if (data.nodes) {
    data.nodes.forEach(n => {
      let type = n.type === "text" && n.text?.includes("<svg") ? "draw" : n.type;
      if (type === "text") createNode("text", n.x, n.y, n);
      else if (type === "link") createNode("link", n.x, n.y, n);
      else if (type === "file") createNode("image", n.x, n.y, n);
      else if (type === "draw") createNode("draw", n.x, n.y, n);
      else createNode(n.type, n.x, n.y, n);
    });
  }
  isLoadingState = false;
}

async function loadBoard() {
  const sources = [...new Set([boardConfig.sourcePath, boardConfig.legacySourcePath].filter(Boolean))];

  try {
    for (const sourcePath of sources) {
      const data = await fetchBoardState(sourcePath);
      if (!data) continue;

      loadState(data);
      persistLocalState(serializeState());
      setComparisonBaseline(serializeState());
      updateTransform();
      return true;
    }
  } catch (err) {
    console.warn("No initial board state found.", err);
  }

  return false;
}

async function saveBoard() {
  const state = serializeState();
  const serialized = persistLocalState(state);
  try {
    let res = await fetch(buildSaveUrl(), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: serialized
    });
    if (res.ok) {
      const result = await res.json().catch(() => null);
      if (result?.path) showToolbarToast(`Saved to ${result.path}`, "success");
      else showToolbarToast("Board saved to local repository copy.", "success");
    } else {
      showToolbarToast("Saved locally. Start dev-server to persist to the repository.", "info");
    }
  } catch(e) {
    showToolbarToast("Saved locally. Start dev-server to persist to the repository.", "info");
  }
}

// Init
setActiveTool("select");
let saved = getSavedState();
if (saved) {
  try {
    loadState(JSON.parse(saved));
    persistLocalState(serializeState());
    setComparisonBaseline(serializeState());
  } catch(e) {
    loadBoard();
  }
} else { loadBoard(); }
updateTransform();
