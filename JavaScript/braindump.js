let _activeBoardViewport = null;
let _mountedBoardCount = 0;
const _boardPreviewStateCache = new Map();
const _boardPreviewRequestCache = new Map();
const BOARD_PREVIEW_VIEWBOX_WIDTH = 100;
const BOARD_PREVIEW_VIEWBOX_HEIGHT = 62;
const BOARD_PREVIEW_VIEWBOX_PADDING = 6;
const BOARD_PREVIEW_MAX_SHAPES = 48;
const BOARD_PREVIEW_MIN_NODE_WIDTH = 320;
const BOARD_PREVIEW_MIN_NODE_HEIGHT = 260;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBoardPreviewVisualType(node) {
  if (node?.type === "text" && String(node?.text || "").includes("<svg")) {
    return "draw";
  }

  if (node?.type === "link" || node?.type === "file" || node?.type === "board-preview") {
    return node.type;
  }

  return "text";
}

function getBoardPreviewNodeDimensions(node, visualType) {
  const width = Number(node?.width);
  const height = Number(node?.height);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width, height };
  }

  if (visualType === "link") {
    return { width: 280, height: 160 };
  }

  if (visualType === "file") {
    return { width: 220, height: 160 };
  }

  if (visualType === "board-preview") {
    return { width: 320, height: 220 };
  }

  return { width: 220, height: 140 };
}

function buildBoardPreviewSnapshot(boardState) {
  if (!boardState || typeof boardState !== "object" || !Array.isArray(boardState.nodes)) {
    return { status: "invalid", totalNodes: 0, shapes: [] };
  }

  if (boardState.nodes.length === 0) {
    return { status: "empty", totalNodes: 0, shapes: [] };
  }

  const viewportState = boardState.viewport && typeof boardState.viewport === "object" ? boardState.viewport : {};
  const viewportScale = Number(viewportState.z);
  const scaleFactor = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1;
  const offsetX = Number.isFinite(Number(viewportState.x)) ? Number(viewportState.x) : 0;
  const offsetY = Number.isFinite(Number(viewportState.y)) ? Number(viewportState.y) : 0;

  const transformedNodes = boardState.nodes
    .map((node) => {
      const visualType = getBoardPreviewVisualType(node);
      const dimensions = getBoardPreviewNodeDimensions(node, visualType);
      const nodeX = Number(node?.x);
      const nodeY = Number(node?.y);
      const x = (Number.isFinite(nodeX) ? nodeX : 0) * scaleFactor + offsetX;
      const y = (Number.isFinite(nodeY) ? nodeY : 0) * scaleFactor + offsetY;
      const width = Math.max(dimensions.width * scaleFactor, 1.4);
      const height = Math.max(dimensions.height * scaleFactor, 1.4);

      return {
        visualType,
        x,
        y,
        width,
        height,
        area: width * height
      };
    })
    .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y));

  if (transformedNodes.length === 0) {
    return { status: "empty", totalNodes: 0, shapes: [] };
  }

  const bounds = transformedNodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.x),
      minY: Math.min(acc.minY, node.y),
      maxX: Math.max(acc.maxX, node.x + node.width),
      maxY: Math.max(acc.maxY, node.y + node.height)
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  const availableWidth = BOARD_PREVIEW_VIEWBOX_WIDTH - BOARD_PREVIEW_VIEWBOX_PADDING * 2;
  const availableHeight = BOARD_PREVIEW_VIEWBOX_HEIGHT - BOARD_PREVIEW_VIEWBOX_PADDING * 2;
  const boundsWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const boundsHeight = Math.max(bounds.maxY - bounds.minY, 1);
  const fitScale = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);

  const shapes = transformedNodes
    .sort((left, right) => right.area - left.area)
    .slice(0, BOARD_PREVIEW_MAX_SHAPES)
    .map((node) => {
      const x = BOARD_PREVIEW_VIEWBOX_PADDING + (node.x - bounds.minX) * fitScale;
      const y = BOARD_PREVIEW_VIEWBOX_PADDING + (node.y - bounds.minY) * fitScale;
      const width = Math.max(node.width * fitScale, 2);
      const height = Math.max(node.height * fitScale, 2);
      const className = `bd-board-preview-shape is-${node.visualType}`;

      if (node.visualType === "draw") {
        return {
          kind: "line",
          className: `${className} bd-board-preview-shape-line`,
          x1: x,
          y1: y + height * 0.78,
          x2: x + width,
          y2: y + height * 0.22
        };
      }

      if (width <= 3.4 && height <= 3.4) {
        return {
          kind: "dot",
          className,
          cx: x + width / 2,
          cy: y + height / 2,
          r: 1.45
        };
      }

      return {
        kind: "rect",
        className,
        x,
        y,
        width,
        height,
        rx: Math.min(width, height, 3.2)
      };
    });

  return {
    status: "ready",
    totalNodes: boardState.nodes.length,
    shapes
  };
}

async function fetchBoardPreviewState(sourcePath) {
  if (!sourcePath) {
    return { status: "missing", totalNodes: 0, shapes: [] };
  }

  if (_boardPreviewStateCache.has(sourcePath)) {
    return _boardPreviewStateCache.get(sourcePath);
  }

  if (_boardPreviewRequestCache.has(sourcePath)) {
    return _boardPreviewRequestCache.get(sourcePath);
  }

  const request = fetch(sourcePath, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        const missingEntry = { status: "missing", totalNodes: 0, shapes: [] };
        _boardPreviewStateCache.set(sourcePath, missingEntry);
        return missingEntry;
      }

      let boardState;
      try {
        boardState = await response.json();
      } catch (error) {
        const invalidEntry = { status: "invalid", totalNodes: 0, shapes: [] };
        _boardPreviewStateCache.set(sourcePath, invalidEntry);
        return invalidEntry;
      }

      const previewEntry = buildBoardPreviewSnapshot(boardState);
      _boardPreviewStateCache.set(sourcePath, previewEntry);
      return previewEntry;
    })
    .catch(() => {
      const invalidEntry = { status: "invalid", totalNodes: 0, shapes: [] };
      _boardPreviewStateCache.set(sourcePath, invalidEntry);
      return invalidEntry;
    })
    .finally(() => {
      _boardPreviewRequestCache.delete(sourcePath);
    });

  _boardPreviewRequestCache.set(sourcePath, request);
  return request;
}

function renderBoardPreviewSnapshotSvg(entry) {
  return `
    <svg class="bd-board-preview-map" viewBox="0 0 ${BOARD_PREVIEW_VIEWBOX_WIDTH} ${BOARD_PREVIEW_VIEWBOX_HEIGHT}" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      ${entry.shapes
        .map((shape) => {
          if (shape.kind === "line") {
            return `<line class="${shape.className}" x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"></line>`;
          }

          if (shape.kind === "dot") {
            return `<circle class="${shape.className}" cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}"></circle>`;
          }

          return `<rect class="${shape.className}" x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.rx}" ry="${shape.rx}"></rect>`;
        })
        .join("")}
    </svg>
  `;
}

function syncBoardPreviewNodeSize(nodeObj, el) {
  if (!nodeObj || nodeObj.type !== "board-preview" || !el) {
    return false;
  }

  let changed = false;

  if (nodeObj.width < BOARD_PREVIEW_MIN_NODE_WIDTH) {
    nodeObj.width = BOARD_PREVIEW_MIN_NODE_WIDTH;
    el.style.width = `${nodeObj.width}px`;
    changed = true;
  }

  const shell = el.querySelector(".bd-board-preview-shell");
  const styles = window.getComputedStyle(el);
  const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
  const borderY = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
  const contentHeight = shell ? shell.getBoundingClientRect().height : 0;
  const targetHeight = Math.max(BOARD_PREVIEW_MIN_NODE_HEIGHT, Math.ceil(contentHeight + paddingY + borderY));

  if (Math.abs(nodeObj.height - targetHeight) > 0.5) {
    nodeObj.height = targetHeight;
    el.style.height = `${nodeObj.height}px`;
    changed = true;
  }

  return changed;
}

function mountCosmoboard(hostElement) {
  if (!hostElement) return null;
  _mountedBoardCount++;

  const viewport = hostElement;

function queryBoard(selector) {
  return viewport?.querySelector(selector) || null;
}

function queryBoardAll(selector) {
  return viewport?.querySelectorAll(selector) || [];
}

function getBoardElementById(elementId) {
  if (!elementId) return null;
  if (viewport && typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return viewport.querySelector(`#${CSS.escape(elementId)}`);
  }
  return document.getElementById(elementId);
}

const canvas =
  queryBoard('[data-board-role="canvas"]') ||
  queryBoard("#braindump-canvas");
const svgLayer =
  queryBoard('[data-board-role="svg-layer"]') ||
  queryBoard("#braindump-svg-layer");
const toolbar =
  queryBoard('[data-board-ui="toolbar"]') ||
  queryBoard(".braindump-toolbar");
const toolbarShell =
  queryBoard('[data-board-ui="toolbar-shell"]') ||
  queryBoard(".braindump-toolbar-shell");
const toolbarButtons = toolbar?.querySelectorAll("button") || queryBoardAll(".braindump-toolbar button");
const toolbarActions =
  queryBoard('[data-board-ui="toolbar-actions"]') ||
  queryBoard("#braindump-toolbar-actions");
const toolbarMoreButton =
  queryBoard('[data-board-ui="toolbar-more"]') ||
  queryBoard("#braindump-toolbar-more");
const fileInput =
  queryBoard('[data-board-ui="import-input"]') ||
  queryBoard("#braindump-import");
const openCanvasInput =
  queryBoard('[data-board-ui="open-canvas-input"]') ||
  queryBoard("#braindump-open-canvas");
const toolbarToast =
  queryBoard('[data-board-ui="toolbar-toast"]') ||
  queryBoard("#braindump-toolbar-toast");
const recommendationPanel =
  queryBoard('[data-board-ui="recommend-panel"]') ||
  queryBoard("#braindump-recommend-panel");
const featureRequestPanel =
  queryBoard('[data-board-ui="feature-panel"]') ||
  queryBoard("#braindump-feature-panel");
const bugReportPanel =
  queryBoard('[data-board-ui="bug-panel"]') ||
  queryBoard("#braindump-bug-panel");
const settingsPanel =
  queryBoard('[data-board-ui="settings-panel"]') ||
  queryBoard("#braindump-settings-panel");
const settingsAutosaveEnabledInput = queryBoard("#braindump-setting-autosave-enabled");
const settingsAutosaveSecondsInput = queryBoard("#braindump-setting-autosave-seconds");
const settingsResetButton = queryBoard("#braindump-settings-reset");
const recommendationSummaryInput = queryBoard("#braindump-recommend-summary");
const recommendationSubmitButton = queryBoard("#braindump-recommend-submit");
const recommendationFullCanvasInput = queryBoard("#braindump-recommend-full-canvas");
const featureRequestSummaryInput = queryBoard("#braindump-feature-summary");
const featureRequestSubmitButton = queryBoard("#braindump-feature-submit");
const bugReportSummaryInput = queryBoard("#braindump-bug-summary");
const bugReportSubmitButton = queryBoard("#braindump-bug-submit");
const recommendationModal =
  queryBoard('[data-board-ui="recommend-modal"]') ||
  queryBoard("#braindump-modal");
const recommendationModalFilename = queryBoard("#braindump-recommend-file-name");
const recommendationModalCancelButton = queryBoard("#braindump-modal-cancel");
const recommendationModalConfirmButton = queryBoard("#braindump-modal-confirm");
const recommendationModalDismissCheckbox = queryBoard("#braindump-modal-dismiss");

const exportModal = queryBoard("#braindump-export-modal");
const exportModalSubpagesCheckbox = queryBoard("#braindump-export-subpages");
const exportModalSizeEstimate = queryBoard("#braindump-export-size-estimate");
const exportModalCancelBtn = queryBoard("#braindump-export-cancel");
const exportModalConfirmBtn = queryBoard("#braindump-export-confirm");

const boardMode = viewport?.dataset.boardMode || "full";
const isPreviewMode = boardMode === "preview";

const boardConfig = {
  slug: viewport?.dataset.boardSlug || "braindump",
  title: viewport?.dataset.boardTitle || "Braindump",
  sourcePath: viewport?.dataset.boardSource || "content/boards/braindump/current.canvas",
  sourceVersion: viewport?.dataset.boardSourceVersion || "",
  legacySourcePath: viewport?.dataset.boardLegacySource != null ? viewport.dataset.boardLegacySource : "content/braindump-state.json",
  repoPath: viewport?.dataset.boardRepoPath || "content/boards/braindump/current.canvas",
  storageKey: viewport?.dataset.boardStorageKey || "board:braindump",
  legacyStorageKey: viewport?.dataset.boardLegacyStorageKey != null ? viewport.dataset.boardLegacyStorageKey : "braindump-canvas",
  saveEndpoint: viewport?.dataset.boardSaveEndpoint || "/api/save-board",
  autosaveSeconds: Math.max(5, Number(viewport?.dataset.boardAutosaveSeconds || 20) || 20),
  allowRecommendations: !isPreviewMode && viewport?.dataset.boardAllowRecommendations === "true",
  fullBoardHref: viewport?.dataset.boardFullHref || ""
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

const featureRequestConfig = {
  type: viewport?.dataset.featureRequestType || "",
  owner: viewport?.dataset.featureRequestOwner || "",
  repo: viewport?.dataset.featureRequestRepo || "",
  labels: String(viewport?.dataset.featureRequestLabels || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};

const bugReportConfig = {
  type: viewport?.dataset.bugReportType || "",
  owner: viewport?.dataset.bugReportOwner || "",
  repo: viewport?.dataset.bugReportRepo || "",
  labels: String(viewport?.dataset.bugReportLabels || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
};

let toolbarToastTimeout = null;
let lastToolbarTouchTime = 0;
let lastViewportTouchTime = 0;
let localStateSaveTimeout = null;
let autosaveIntervalId = null;
let autosaveRepositorySupported = true;
let markdownSidecarSupported = true;
let hasPendingRepositorySave = false;
let isPersistingRepositoryState = false;
let pendingRecommendation = null;
const RECOMMENDATION_MODAL_DISMISS_SUFFIX = ":recommendation-modal-dismissed";
const BOARD_SETTINGS_SUFFIX = ":settings";
const BOARD_STATE_META_SUFFIX = ":meta";
const BOARD_STATE_STALE_SUFFIX = ":stale";
const DEFAULT_AUTOSAVE_SECONDS = boardConfig.autosaveSeconds;
const DEFAULT_BOARD_SETTINGS = Object.freeze({
  autosaveEnabled: true,
  autosaveSeconds: DEFAULT_AUTOSAVE_SECONDS
});
let pendingStartupToast = "";

function clampAutosaveSeconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BOARD_SETTINGS.autosaveSeconds;
  return Math.min(300, Math.max(5, Math.round(parsed)));
}

function getBoardSettingsKey() {
  return `${boardConfig.storageKey}${BOARD_SETTINGS_SUFFIX}`;
}

function getBoardStateMetaKey() {
  return `${boardConfig.storageKey}${BOARD_STATE_META_SUFFIX}`;
}

function buildBoardStateMeta() {
  return {
    slug: boardConfig.slug,
    sourcePath: boardConfig.sourcePath,
    sourceVersion: boardConfig.sourceVersion || "",
    savedAt: new Date().toISOString()
  };
}

function clearSavedStateKeys() {
  localStorage.removeItem(boardConfig.storageKey);
  if (boardConfig.legacyStorageKey && boardConfig.legacyStorageKey !== boardConfig.storageKey) {
    localStorage.removeItem(boardConfig.legacyStorageKey);
  }
  localStorage.removeItem(getBoardStateMetaKey());
}

function archiveSavedState(rawState, reason = "stale") {
  if (!rawState) return;
  const archiveKey = `${boardConfig.storageKey}${BOARD_STATE_STALE_SUFFIX}:${reason}:${Date.now()}`;
  try {
    localStorage.setItem(archiveKey, rawState);
  } catch (error) {
    // Ignore quota errors for stale draft backups.
  }
  clearSavedStateKeys();
}

function isBoardToolbarTarget(target) {
  if (!target || !viewport?.contains(target)) return false;
  return Boolean(
    toolbarShell?.contains(target) ||
      toolbar?.contains(target) ||
      target.closest?.('[data-board-ui="toolbar-shell"]') ||
      target.closest?.('[data-board-ui="toolbar"]') ||
      target.closest?.(".braindump-toolbar-shell") ||
      target.closest?.(".braindump-toolbar")
  );
}

function loadBoardSettings() {
  try {
    const raw = localStorage.getItem(getBoardSettingsKey());
    if (!raw) {
      return { ...DEFAULT_BOARD_SETTINGS };
    }

    const parsed = JSON.parse(raw);
    return {
      autosaveEnabled: parsed?.autosaveEnabled !== false,
      autosaveSeconds: clampAutosaveSeconds(parsed?.autosaveSeconds)
    };
  } catch (error) {
    return { ...DEFAULT_BOARD_SETTINGS };
  }
}

let boardSettings = loadBoardSettings();
boardConfig.autosaveSeconds = boardSettings.autosaveSeconds;

function scheduleLocalStateSave() {
  if (localStateSaveTimeout) clearTimeout(localStateSaveTimeout);
  localStateSaveTimeout = window.setTimeout(() => {
    localStateSaveTimeout = null;
    persistLocalState(serializeState());
  }, 400);
}

function flushLocalStateSave(state = serializeState()) {
  if (localStateSaveTimeout) {
    window.clearTimeout(localStateSaveTimeout);
    localStateSaveTimeout = null;
  }
  return persistLocalState(state);
}

function markBoardDirty(options = {}) {
  const { scheduleLocalSave = true } = options;
  hasPendingRepositorySave = true;
  if (scheduleLocalSave) {
    scheduleLocalStateSave();
  }
}

function startAutosaveLoop() {
  if (autosaveIntervalId) {
    window.clearInterval(autosaveIntervalId);
    autosaveIntervalId = null;
  }
  if (!boardSettings.autosaveEnabled || boardConfig.autosaveSeconds <= 0) return;

  autosaveIntervalId = window.setInterval(() => {
    if (!hasPendingRepositorySave || !autosaveRepositorySupported || isPersistingRepositoryState) {
      return;
    }
    saveBoard({ showFeedback: false, source: "autosave" });
  }, boardConfig.autosaveSeconds * 1000);
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

function persistBoardSettings() {
  try {
    localStorage.setItem(getBoardSettingsKey(), JSON.stringify(boardSettings));
  } catch (error) {
    // Ignore storage failures and keep current session settings in memory.
  }
}

function syncSettingsPanelFromState() {
  if (settingsAutosaveEnabledInput) {
    settingsAutosaveEnabledInput.checked = boardSettings.autosaveEnabled;
  }
  if (settingsAutosaveSecondsInput) {
    settingsAutosaveSecondsInput.value = String(boardSettings.autosaveSeconds);
    settingsAutosaveSecondsInput.disabled = !boardSettings.autosaveEnabled;
  }
}

function applyBoardSettings(options = {}) {
  const { persist = true, announce = false } = options;
  boardSettings.autosaveEnabled = boardSettings.autosaveEnabled !== false;
  boardSettings.autosaveSeconds = clampAutosaveSeconds(boardSettings.autosaveSeconds);
  boardConfig.autosaveSeconds = boardSettings.autosaveSeconds;
  if (persist) {
    persistBoardSettings();
  }
  syncSettingsPanelFromState();
  startAutosaveLoop();
  if (announce) {
    showToolbarToast("Board settings updated.", "success");
  }
}

function setToolbarActionsOpen(isOpen) {
  if (!toolbarActions || !toolbarMoreButton) return;

  toolbarActions.classList.toggle("is-open", isOpen);
  toolbarMoreButton.setAttribute("aria-expanded", String(isOpen));
}

function closeFloatingPanels(options = {}) {
  const { keep = "" } = options;

  if (keep !== "actions") {
    setToolbarActionsOpen(false);
  }

  if (keep !== "recommendation" && recommendationPanel) {
    recommendationPanel.hidden = true;
    recommendationPanel.classList.remove("is-open");
  }

  if (keep !== "feature-request" && featureRequestPanel) {
    featureRequestPanel.hidden = true;
    featureRequestPanel.classList.remove("is-open");
  }

  if (keep !== "bug-report" && bugReportPanel) {
    bugReportPanel.hidden = true;
    bugReportPanel.classList.remove("is-open");
  }

  if (keep !== "settings" && settingsPanel) {
    settingsPanel.hidden = true;
    settingsPanel.classList.remove("is-open");
  }
}

function setSettingsPanelOpen(isOpen) {
  if (!settingsPanel) return;

  if (isOpen) {
    closeFloatingPanels({ keep: "settings" });
    syncSettingsPanelFromState();
  }

  settingsPanel.hidden = !isOpen;
  settingsPanel.classList.toggle("is-open", isOpen);
}

function setRecommendationPanelOpen(isOpen) {
  if (!recommendationPanel) return;

  if (isOpen) {
    closeFloatingPanels({ keep: "recommendation" });
  }
  recommendationPanel.hidden = !isOpen;
  recommendationPanel.classList.toggle("is-open", isOpen);
  if (isOpen) {
    recommendationSummaryInput?.focus();
    recommendationSummaryInput?.select();
  }
}

function setFeatureRequestPanelOpen(isOpen) {
  if (!featureRequestPanel) return;

  if (isOpen) {
    closeFloatingPanels({ keep: "feature-request" });
  }

  featureRequestPanel.hidden = !isOpen;
  featureRequestPanel.classList.toggle("is-open", isOpen);
  if (isOpen) {
    featureRequestSummaryInput?.focus();
    featureRequestSummaryInput?.select();
  }
}

function setBugReportPanelOpen(isOpen) {
  if (!bugReportPanel) return;

  if (isOpen) {
    closeFloatingPanels({ keep: "bug-report" });
  }

  bugReportPanel.hidden = !isOpen;
  bugReportPanel.classList.toggle("is-open", isOpen);
  if (isOpen) {
    bugReportSummaryInput?.focus();
    bugReportSummaryInput?.select();
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
  showToolbarToast(`Recommendation opened. Attach ${recommendationFilename} to the GitHub form.`, "success");
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

function parseYouTubeStartSeconds(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;

  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return (hours * 3600) + (minutes * 60) + seconds;
}

function getYouTubeEmbedUrl(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return "";

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  // Enable the IFrame Player API so the parent can send postMessage commands
  // (play/pause/seek) when a YouTube embed is the selected node and the user
  // presses Space / arrow keys without first clicking inside the iframe.
  embedUrl.searchParams.set("enablejsapi", "1");
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    embedUrl.searchParams.set("origin", location.origin);
  }
  try {
    const parsed = new URL(url);
    const start = parseYouTubeStartSeconds(parsed.searchParams.get("start") || parsed.searchParams.get("t"));
    if (start > 0) {
      embedUrl.searchParams.set("start", String(start));
    }
  } catch (error) {
    return embedUrl.toString();
  }

  return embedUrl.toString();
}

function applyBookmarkPreview(nodeObj, el, preview) {
  if (preview.title) {
    nodeObj.title = preview.title;
  }

  if (preview.description !== undefined) {
    nodeObj.description = preview.description || "";
  }

  if (preview.image) {
    nodeObj.image = preview.image;
    if (!nodeObj.hasAdjustedRatio) {
      nodeObj.height += 160;
      nodeObj.hasAdjustedRatio = true;
    }
  }

  renderNode(nodeObj);
  markBoardDirty();
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

function normalizeIssueSummary(value, maxLength = 50) {
  const summary = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!summary) {
    return "";
  }

  return summary.slice(0, maxLength).trim();
}

function formatIssueDraftInput(value, maxLength = 50) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function buildRecommendationIssueTitle(summary) {
  const normalizedSummary = normalizeIssueSummary(summary);
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
    "## Board slug",
    boardConfig.slug || "",
    "",
    "## Board repo path",
    boardConfig.repoPath || "",
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
    normalizeIssueSummary(summary) || "Describe the recommendation in one sentence.",
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

  url.searchParams.set("template", "whiteboard-recommendation.md");
  url.searchParams.set("title", buildRecommendationIssueTitle(summary));
  if (recommendationConfig.labels.length > 0) {
    url.searchParams.set("labels", recommendationConfig.labels.join(","));
  }
  url.searchParams.set("body", buildRecommendationIssueBody(summary, details, exportFilename));

  return url.toString();
}

function buildFeatureRequestIssueTitle(summary) {
  const normalizedSummary = normalizeIssueSummary(summary);
  return normalizedSummary
    ? `Feature request: ${boardConfig.title} (${normalizedSummary})`
    : `Feature request: ${boardConfig.title}`;
}

function buildFeatureRequestIssueBody(summary, details) {
  const timestamp = formatTimestamp().replace("_", " ");
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
    "## Short summary",
    normalizeIssueSummary(summary) || "Describe the feature request in one sentence.",
    "",
    "## What do you want",
    details || "Describe the feature or improvement you want to see.",
    "",
    "## Why would it help",
    "Explain the problem this would solve or the workflow it would improve.",
    "",
    "## Example workflow",
    "Add a short example of how you would use it.",
    "",
    "## Notes",
    "- Keep the title short and concrete, for example: `Allow snapping notes to grid`.",
    "- If a similar feature request already exists, add your details there instead of opening a duplicate."
  ];

  return lines.join("\n");
}

function buildFeatureRequestIssueUrl(summary, details) {
  const url = new URL(
    `https://github.com/${featureRequestConfig.owner}/${featureRequestConfig.repo}/issues/new`
  );

  url.searchParams.set("title", buildFeatureRequestIssueTitle(summary));
  if (featureRequestConfig.labels.length > 0) {
    url.searchParams.set("labels", featureRequestConfig.labels.join(","));
  }
  url.searchParams.set("body", buildFeatureRequestIssueBody(summary, details));

  return url.toString();
}

function buildBugReportIssueTitle(summary) {
  const normalizedSummary = normalizeIssueSummary(summary);
  return normalizedSummary
    ? `Bug: ${boardConfig.title} (${normalizedSummary})`
    : `Bug: ${boardConfig.title}`;
}

function buildBugReportIssueBody(summary, details) {
  const timestamp = formatTimestamp().replace("_", " ");
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
    "## Short summary",
    normalizeIssueSummary(summary) || "Describe the bug in one sentence.",
    "",
    "## What happened",
    details || "What did you try, and what went wrong?",
    "",
    "## What did you expect",
    "What should have happened instead?",
    "",
    "## Steps to reproduce",
    "1. ",
    "2. ",
    "3. ",
    "",
    "## Extra context",
    "Add browser/device details, screenshots, or any other useful context.",
    "",
    "## Notes",
    "- Keep the title short and concrete, for example: `Paste on iPhone creates duplicate note`.",
    "- If this bug already has an issue, update that issue instead of opening a new one."
  ];

  return lines.join("\n");
}

function buildBugReportIssueUrl(summary, details) {
  const url = new URL(
    `https://github.com/${bugReportConfig.owner}/${bugReportConfig.repo}/issues/new`
  );

  url.searchParams.set("title", buildBugReportIssueTitle(summary));
  if (bugReportConfig.labels.length > 0) {
    url.searchParams.set("labels", bugReportConfig.labels.join(","));
  }
  url.searchParams.set("body", buildBugReportIssueBody(summary, details));

  return url.toString();
}

async function beginRecommendationFlow() {
  if (!boardConfig.allowRecommendations || recommendationConfig.type !== "issue" || !recommendationConfig.owner || !recommendationConfig.repo) {
    showToolbarToast("Recommendations are not set up for this board.", "error");
    return;
  }

  const summary = normalizeIssueSummary(recommendationSummaryInput?.value);
  if (!summary) {
    showToolbarToast("Add a short description for the recommendation.", "error");
    recommendationSummaryInput?.focus();
    return;
  }

  // Default: diff-only export against the on-disk base. Falls back to a full
  // canvas when the toggle is checked, when no on-disk base exists, or when
  // canvasIds don't match (e.g. base predates the canvasId backfill).
  const wantsFull = !!recommendationFullCanvasInput?.checked;
  const currentState = serializeState();
  let baseState = null;
  if (!wantsFull && boardConfig.sourcePath) {
    try { baseState = await fetchBoardState(boardConfig.sourcePath); }
    catch { baseState = null; }
  }

  let recommendationFilename;
  let blobContent;
  if (!wantsFull && baseState && baseState.canvasId && baseState.canvasId === currentState.canvasId) {
    const diff = createCanvasDiff(baseState, currentState);
    diff.baseVersion.hash = await canonicalCanvasHash(baseState);
    const slugSeg = sanitizeFileSegment(boardConfig.slug || boardConfig.title || document.title);
    recommendationFilename = `${slugSeg}_${formatTimestamp()}.canvas.diff`;
    blobContent = JSON.stringify(diff, null, 2);
  } else {
    recommendationFilename = buildRecommendationFilename();
    blobContent = JSON.stringify(currentState, null, 2);
  }

  const issueUrl = buildRecommendationIssueUrl(summary, "", recommendationFilename);

  const blob = new Blob([blobContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = recommendationFilename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => { document.body.removeChild(anchor); URL.revokeObjectURL(url); }, 200);

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

function beginFeatureRequestFlow() {
  if (featureRequestConfig.type !== "issue" || !featureRequestConfig.owner || !featureRequestConfig.repo) {
    showToolbarToast("Feature requests are not set up for this board.", "error");
    return;
  }

  const summary = normalizeIssueSummary(featureRequestSummaryInput?.value);
  if (!summary) {
    showToolbarToast("Add a short description for the feature request.", "error");
    featureRequestSummaryInput?.focus();
    return;
  }

  const issueUrl = buildFeatureRequestIssueUrl(summary, "");
  setFeatureRequestPanelOpen(false);
  if (featureRequestSummaryInput) {
    featureRequestSummaryInput.value = "";
  }
  window.open(issueUrl, "_blank", "noopener,noreferrer");
  showToolbarToast("Feature request form opened in GitHub.", "success");
}

function beginBugReportFlow() {
  if (bugReportConfig.type !== "issue" || !bugReportConfig.owner || !bugReportConfig.repo) {
    showToolbarToast("Bug reports are not set up for this board.", "error");
    return;
  }

  const summary = normalizeIssueSummary(bugReportSummaryInput?.value);
  if (!summary) {
    showToolbarToast("Add a short description for the bug report.", "error");
    bugReportSummaryInput?.focus();
    return;
  }

  const issueUrl = buildBugReportIssueUrl(summary, "");
  setBugReportPanelOpen(false);
  if (bugReportSummaryInput) {
    bugReportSummaryInput.value = "";
  }
  window.open(issueUrl, "_blank", "noopener,noreferrer");
  showToolbarToast("Bug report form opened in GitHub.", "success");
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

const TRANSIENT_NODE_FIELDS = ["isCropping", "_cropDraft", "_cropEnterCrop", "_cropEnterSize", "_cropEnterPos", "__blobObjectUrl", "__blobObjectUrlSource"];

function stripTransientNodeFields(node) {
  let copy = null;
  for (const k of TRANSIENT_NODE_FIELDS) {
    if (k in node) {
      if (!copy) copy = { ...node };
      delete copy[k];
    }
  }
  return copy || node;
}

function serializeState() {
  ensureCanvasId();
  return {
    canvasId: boardMeta.canvasId,
    createdAt: boardMeta.createdAt,
    updatedAt: boardMeta.updatedAt,
    nodes: nodes.map(stripTransientNodeFields),
    edges,
    viewport: { x: camera.x, y: camera.y, z: camera.z }
  };
}

function persistLocalState(state) {
  const serialized = JSON.stringify(state);
  localStorage.setItem(boardConfig.storageKey, serialized);
  if (boardConfig.legacyStorageKey && boardConfig.legacyStorageKey !== boardConfig.storageKey) {
    localStorage.setItem(boardConfig.legacyStorageKey, serialized);
  }
  localStorage.setItem(getBoardStateMetaKey(), JSON.stringify(buildBoardStateMeta()));
  return serialized;
}

function getSavedState() {
  const rawState =
    localStorage.getItem(boardConfig.storageKey) ||
    (boardConfig.legacyStorageKey ? localStorage.getItem(boardConfig.legacyStorageKey) : null);

  if (!rawState) {
    return null;
  }

  if (!boardConfig.sourceVersion) {
    return rawState;
  }

  let meta = null;
  try {
    const rawMeta = localStorage.getItem(getBoardStateMetaKey());
    meta = rawMeta ? JSON.parse(rawMeta) : null;
  } catch (error) {
    meta = null;
  }

  const hasMatchingIdentity =
    meta &&
    (!meta.slug || meta.slug === boardConfig.slug) &&
    (!meta.sourcePath || meta.sourcePath === boardConfig.sourcePath);
  const hasMatchingVersion = meta && meta.sourceVersion === boardConfig.sourceVersion;

  if (hasMatchingIdentity && hasMatchingVersion) {
    return rawState;
  }

  archiveSavedState(rawState, hasMatchingIdentity ? "source-version" : "identity");
  pendingStartupToast = "Loaded the latest board. Older local draft was archived.";
  return null;
}

// In preview mode the embedded board never writes to its own storage key, so
// canvas edits that have only autosaved to localStorage (not yet flushed to
// the .canvas file) don't show up via fetchBoardState. Read the full canvas's
// draft directly so the preview reflects unsaved edits.
function getCanvasDraftStateForPreview() {
  const previewKey = boardConfig.storageKey;
  if (!previewKey || !previewKey.endsWith(":preview")) return null;
  const canvasKey = previewKey.slice(0, -":preview".length);
  if (!canvasKey || canvasKey === previewKey) return null;

  const rawState = localStorage.getItem(canvasKey);
  if (!rawState) return null;

  if (!boardConfig.sourceVersion) {
    return rawState;
  }

  let meta = null;
  try {
    const rawMeta = localStorage.getItem(`${canvasKey}${BOARD_STATE_META_SUFFIX}`);
    meta = rawMeta ? JSON.parse(rawMeta) : null;
  } catch (error) {
    meta = null;
  }

  const slugMatches = !meta || !meta.slug || meta.slug === boardConfig.slug;
  const versionMatches = meta && meta.sourceVersion === boardConfig.sourceVersion;
  if (slugMatches && versionMatches) {
    return rawState;
  }
  return null;
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
let touchSelectionMoved = false;
let activeTouchNodeInteractionCancel = null;
const TOUCH_SELECT_HOLD_MS = 280;
const TOUCH_SELECT_MOVE_TOLERANCE = 10;
const touchSelectState = {
  timerId: null,
  pendingMode: null,
  activeMode: null,
  startX: 0,
  startY: 0,
  movedSinceStart: false,
  interrupted: false
};
const touchPlacementState = {
  pendingTool: "",
  startX: 0,
  startY: 0,
  movedSinceStart: false,
  canPlace: false
};

let nodes = [];
let edges = [];
let boardMeta = { canvasId: null, createdAt: null, updatedAt: null };

function ensureCanvasId() {
  if (!boardMeta.canvasId) {
    boardMeta.canvasId = (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  if (!boardMeta.createdAt) {
    boardMeta.createdAt = new Date().toISOString();
  }
  return boardMeta.canvasId;
}

// Undo/Redo history
let undoHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 200;
let isLoadingState = false; // Flag to prevent recording during load
const TEXT_NODE_PLACEHOLDER = "Type here...";
const LINK_NODE_PLACEHOLDER = "Paste a link";

// File System Access State
let currentFileHandle = null;
const supportsFileSystemAccessAPI = 'showOpenFilePicker' in window && 'showSaveFilePicker' in window;
function getVisibleViewportMetrics() {
  if (window.visualViewport) {
    return {
      centerX: window.visualViewport.offsetLeft + (window.visualViewport.width / 2),
      centerY: window.visualViewport.offsetTop + (window.visualViewport.height / 2)
    };
  }

  return {
    centerX: window.innerWidth / 2,
    centerY: window.innerHeight / 2
  };
}

function getCenteredNodeCanvasPosition(width, height) {
  const { centerX, centerY } = getVisibleViewportMetrics();
  const center = screenToCanvas(centerX, centerY);
  return {
    x: center.x - (width / 2),
    y: center.y - (height / 2)
  };
}

function moveNodeWithoutHistory(nodeObj, nextX, nextY) {
  if (!nodeObj) return;
  if (Math.abs(nodeObj.x - nextX) <= 0.5 && Math.abs(nodeObj.y - nextY) <= 0.5) return;

  nodeObj.x = nextX;
  nodeObj.y = nextY;
  const latestAction = undoHistory[historyIndex];
  if (latestAction?.type === "create" && latestAction.nodeId === nodeObj.id && latestAction.nodeData) {
    latestAction.nodeData.x = nextX;
    latestAction.nodeData.y = nextY;
  }
  const el = getBoardElementById(nodeObj.id);
  if (el) {
    el.style.left = `${nodeObj.x}px`;
    el.style.top = `${nodeObj.y}px`;
  }
  markBoardDirty();
}

function centerNodeInVisibleViewport(nodeObj, options = {}) {
  if (!nodeObj) return;
  const { deferForKeyboard = false } = options;
  const applyCenter = () => {
    const centeredPosition = getCenteredNodeCanvasPosition(nodeObj.width, nodeObj.height);
    moveNodeWithoutHistory(nodeObj, centeredPosition.x, centeredPosition.y);
  };

  applyCenter();

  if (deferForKeyboard && shouldUseTouchSelectBehavior()) {
    window.setTimeout(applyCenter, 180);
    window.setTimeout(applyCenter, 360);
  }
}

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

  if (options.centerInView) {
    centerNodeInVisibleViewport(nodeObj, { deferForKeyboard: true });
  }

  editor.dataset.undoText = nodeObj.text || "";
  editor.contentEditable = "true";
  const normalizedText = syncTextEditorValue(editor, nodeObj.text || "");

  if (!normalizedText) {
    editor.textContent = "\u200B";
    editor.classList.remove("is-empty");
  }

  editor.focus();
  editor.scrollTop = 0;

  if (options.placeCaretAtEnd || !normalizedText) {
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
  const el = getBoardElementById(nodeId);
  const editor = el?.querySelector(".bd-text-editor");

  if (!nodeObj || !el || !editor || nodeObj.type !== "text" || nodeObj.text?.includes("<svg")) {
    return;
  }

  canvas.querySelectorAll(".bd-item").forEach(item => item.classList.remove("selected"));
  el.classList.add("selected");
  beginTextEditing(nodeObj, editor, options);
}

function normalizeLinkUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const normalized = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch (error) {
    return "";
  }
}

function focusLinkEditor(nodeId, options = {}) {
  const nodeObj = nodes.find(n => n.id === nodeId);
  const el = getBoardElementById(nodeId);
  if (!nodeObj || !el || nodeObj.type !== "link") {
    return;
  }

  if (!nodeObj.isEditingUrl || !el.querySelector(".bd-link-editor-input")) {
    nodeObj.isEditingUrl = true;
    renderNode(nodeObj);
  }

  const refreshedEl = getBoardElementById(nodeId);
  const input = refreshedEl?.querySelector(".bd-link-editor-input");
  if (!input) return;

  canvas.querySelectorAll(".bd-item").forEach(item => item.classList.remove("selected"));
  refreshedEl.classList.add("selected");

  if (options.centerInView) {
    centerNodeInVisibleViewport(nodeObj, { deferForKeyboard: true });
  }

  input.focus();
  if (options.selectAll && input.value) {
    input.select();
  } else {
    const cursorPosition = input.value.length;
    input.setSelectionRange(cursorPosition, cursorPosition);
  }
}

function finalizeLinkEditing(nodeObj, input) {
  if (!nodeObj || nodeObj.type !== "link" || !input) return false;

  const draftValue = String(input.value || "");
  const normalizedUrl = normalizeLinkUrl(draftValue);
  if (draftValue.trim() && !normalizedUrl) {
    showToolbarToast("Use a valid http(s) link.", "error");
    window.setTimeout(() => focusLinkEditor(nodeObj.id, { selectAll: true }), 0);
    return false;
  }

  if (!normalizedUrl) {
    nodeObj.url = "";
    nodeObj.title = "";
    nodeObj.description = "";
    nodeObj.image = "";
    nodeObj.hasAdjustedRatio = false;
    nodeObj.isEditingUrl = true;
    markBoardDirty();
    renderNode(nodeObj);
    return false;
  }

  const urlChanged = nodeObj.url !== normalizedUrl;
  nodeObj.url = normalizedUrl;
  nodeObj.isEditingUrl = false;
  if (urlChanged) {
    nodeObj.title = "";
    nodeObj.description = "";
    nodeObj.image = "";
    nodeObj.hasAdjustedRatio = false;
  }
  renderNode(nodeObj);
  markBoardDirty();
  const el = getBoardElementById(nodeObj.id);
  if (el) {
    fetchBookmarkPreview(nodeObj, el);
  }
  return true;
}

function startSelectionRect(clientX, clientY, preserveSelection = false) {
  if (!preserveSelection) {
    canvas.querySelectorAll(".bd-item").forEach((item) => item.classList.remove("selected"));
  }

  const pos = screenToCanvas(clientX, clientY);
  dragRect = { x: pos.x, y: pos.y, w: 0, h: 0, startX: pos.x, startY: pos.y, active: true };
  touchSelectionMoved = false;

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
  selectionBox.style.width = "0px";
  selectionBox.style.height = "0px";
  selectionBox.style.display = "block";
}

function updateSelectionRect(clientX, clientY) {
  const pos = screenToCanvas(clientX, clientY);
  dragRect.x = Math.min(pos.x, dragRect.startX);
  dragRect.y = Math.min(pos.y, dragRect.startY);
  dragRect.w = Math.abs(pos.x - dragRect.startX);
  dragRect.h = Math.abs(pos.y - dragRect.startY);
  touchSelectionMoved = touchSelectionMoved || dragRect.w > 4 / camera.z || dragRect.h > 4 / camera.z;

  if (!selectionBox) return;
  selectionBox.style.left = `${dragRect.x}px`;
  selectionBox.style.top = `${dragRect.y}px`;
  selectionBox.style.width = `${dragRect.w}px`;
  selectionBox.style.height = `${dragRect.h}px`;
}

function setActiveTouchNodeInteraction(cancelFn) {
  activeTouchNodeInteractionCancel = typeof cancelFn === "function" ? cancelFn : null;
}

function clearActiveTouchNodeInteraction(cancelFn) {
  if (!cancelFn || activeTouchNodeInteractionCancel === cancelFn) {
    activeTouchNodeInteractionCancel = null;
  }
}

function cancelActiveTouchNodeInteraction() {
  if (typeof activeTouchNodeInteractionCancel !== "function") return;

  const cancelFn = activeTouchNodeInteractionCancel;
  activeTouchNodeInteractionCancel = null;
  cancelFn();
}

function shouldUseTouchSelectBehavior() {
  return navigator.maxTouchPoints > 0;
}

function isTouchPlacementTool(tool) {
  return tool === "text" || tool === "bookmark" || tool === "page";
}

function isTouchEditableTarget(target) {
  if (!target) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return true;

  const editableAncestor = target.closest?.(".bd-text-editor");
  return editableAncestor?.contentEditable === "true";
}

function isLinkInteractionTarget(target) {
  return Boolean(target?.closest?.(".bd-bookmark-link, .bd-board-preview-link"));
}

function clearTouchSelectTimer() {
  if (!touchSelectState.timerId) return;
  window.clearTimeout(touchSelectState.timerId);
  touchSelectState.timerId = null;
}

function cancelPendingTouchSelectMode() {
  clearTouchSelectTimer();
  touchSelectState.pendingMode = null;
}

function resetTouchSelectState(options = {}) {
  const { clearSelectionRect = false, preserveMovement = false, preserveInterrupted = false } = options;
  clearTouchSelectTimer();
  touchSelectState.pendingMode = null;
  touchSelectState.activeMode = null;
  touchSelectState.startX = 0;
  touchSelectState.startY = 0;
  if (!preserveMovement) {
    touchSelectState.movedSinceStart = false;
  }
  if (!preserveInterrupted) {
    touchSelectState.interrupted = false;
  }

  if (clearSelectionRect && dragRect.active) {
    dragRect.active = false;
    touchSelectionMoved = false;
    if (selectionBox) selectionBox.style.display = "none";
  }
}

function armTouchSelectMode(mode, clientX, clientY, onActivate) {
  clearTouchSelectTimer();
  touchSelectState.pendingMode = mode;
  touchSelectState.activeMode = null;
  touchSelectState.startX = clientX;
  touchSelectState.startY = clientY;
  touchSelectState.movedSinceStart = false;
  touchSelectState.interrupted = false;
  touchSelectState.timerId = window.setTimeout(() => {
    touchSelectState.timerId = null;
    if (touchSelectState.pendingMode !== mode) return;
    touchSelectState.pendingMode = null;
    touchSelectState.activeMode = mode;
    onActivate?.();
  }, TOUCH_SELECT_HOLD_MS);
}

function updateTouchSelectMovement(clientX, clientY) {
  if (!touchSelectState.pendingMode) return;

  const dx = clientX - touchSelectState.startX;
  const dy = clientY - touchSelectState.startY;
  if (Math.hypot(dx, dy) <= TOUCH_SELECT_MOVE_TOLERANCE) return;

  touchSelectState.movedSinceStart = true;
  cancelPendingTouchSelectMode();
}

function resetTouchPlacementState() {
  touchPlacementState.pendingTool = "";
  touchPlacementState.startX = 0;
  touchPlacementState.startY = 0;
  touchPlacementState.movedSinceStart = false;
  touchPlacementState.canPlace = false;
}

function beginTouchPlacement(tool, clientX, clientY, canPlace) {
  touchPlacementState.pendingTool = tool;
  touchPlacementState.startX = clientX;
  touchPlacementState.startY = clientY;
  touchPlacementState.movedSinceStart = false;
  touchPlacementState.canPlace = canPlace;
  startPan = { x: clientX - camera.x, y: clientY - camera.y };
  isPanning = false;
}

function updateTouchPlacementMovement(clientX, clientY) {
  if (!touchPlacementState.pendingTool) return;

  const dx = clientX - touchPlacementState.startX;
  const dy = clientY - touchPlacementState.startY;
  if (Math.hypot(dx, dy) <= TOUCH_SELECT_MOVE_TOLERANCE) return;

  touchPlacementState.movedSinceStart = true;
  isPanning = true;
}

function getSelectedItemElements() {
  return Array.from(canvas.querySelectorAll(".bd-item.selected"));
}

function captureSelectedNodePositions() {
  const positions = [];
  getSelectedItemElements().forEach((el) => {
    const node = nodes.find((n) => n.id === el.id);
    if (node) {
      positions.push({ id: node.id, x: node.x, y: node.y });
    }
  });
  return positions;
}

function moveSelectedNodesByDelta(deltaX, deltaY) {
  if (Math.abs(deltaX) <= 0 && Math.abs(deltaY) <= 0) return;

  getSelectedItemElements().forEach((selEl) => {
    const selNode = nodes.find((n) => n.id === selEl.id);
    if (!selNode) return;

    selNode.x += deltaX;
    selNode.y += deltaY;
    selEl.style.left = `${selNode.x}px`;
    selEl.style.top = `${selNode.y}px`;
  });
}

function pushSelectedMoveActionFromStartPositions(startPositions) {
  if (!Array.isArray(startPositions) || startPositions.length === 0) return;

  const movedIds = [];
  const fromPos = [];
  const toPos = [];
  startPositions.forEach((sp) => {
    const node = nodes.find((n) => n.id === sp.id);
    if (!node) return;
    if (Math.abs(node.x - sp.x) <= 0.5 && Math.abs(node.y - sp.y) <= 0.5) return;

    movedIds.push(sp.id);
    fromPos.push({ x: sp.x, y: sp.y });
    toPos.push({ x: node.x, y: node.y });
  });

  if (movedIds.length > 0) {
    pushAction({ type: "move", nodeIds: movedIds, fromPositions: fromPos, toPositions: toPos });
  }
}

function pushAction(action) {
  undoHistory = undoHistory.slice(0, historyIndex + 1);
  undoHistory.push(action);
  if (undoHistory.length > MAX_HISTORY) { undoHistory.shift(); historyIndex--; }
  historyIndex = undoHistory.length - 1;
  markBoardDirty();
}

function removeNodeById(nodeId) {
  const el = getBoardElementById(nodeId);
  if (el) el.remove();
  const removed = nodes.find(n => n.id === nodeId);
  if (removed?.__blobObjectUrl) {
    URL.revokeObjectURL(removed.__blobObjectUrl);
    removed.__blobObjectUrl = null;
    removed.__blobObjectUrlSource = null;
  }
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
      const el = getBoardElementById(id);
      if (node && el) {
        node.x = action.fromPositions[i].x;
        node.y = action.fromPositions[i].y;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
    });
  } else if (action.type === 'resize') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = getBoardElementById(action.nodeId);
    if (node && el) {
      node.width = action.fromSize.w;
      node.height = action.fromSize.h;
      el.style.width = `${node.width}px`;
      el.style.height = `${node.height}px`;
    }
  } else if (action.type === 'editText') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = getBoardElementById(action.nodeId);
    if (node && el) {
      node.text = action.oldText;
      const ta = el.querySelector(".bd-text-editor");
      if (ta) syncTextEditorValue(ta, action.oldText || "");
    }
  } else if (action.type === 'crop') {
    const node = nodes.find(n => n.id === action.nodeId);
    if (node) {
      if (action.fromCrop) node.crop = { ...action.fromCrop };
      else delete node.crop;
      if (action.fromSize) {
        node.width = action.fromSize.w;
        node.height = action.fromSize.h;
      }
      if (action.fromPos) {
        node.x = action.fromPos.x;
        node.y = action.fromPos.y;
      }
      const el = getBoardElementById(action.nodeId);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.width = `${node.width}px`;
        el.style.height = `${node.height}px`;
      }
      renderNode(node);
    }
  } else if (action.type === 'bake') {
    const node = nodes.find(n => n.id === action.nodeId);
    if (node) {
      node.file = action.fromFile;
      if (action.fromCrop) node.crop = { ...action.fromCrop };
      else delete node.crop;
      if (action.fromSize) {
        node.width = action.fromSize.w;
        node.height = action.fromSize.h;
      }
      if (action.fromPos) {
        node.x = action.fromPos.x;
        node.y = action.fromPos.y;
      }
      const el = getBoardElementById(action.nodeId);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.width = `${node.width}px`;
        el.style.height = `${node.height}px`;
      }
      renderNode(node);
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
      const el = getBoardElementById(id);
      if (node && el) {
        node.x = action.toPositions[i].x;
        node.y = action.toPositions[i].y;
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
      }
    });
  } else if (action.type === 'resize') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = getBoardElementById(action.nodeId);
    if (node && el) {
      node.width = action.toSize.w;
      node.height = action.toSize.h;
      el.style.width = `${node.width}px`;
      el.style.height = `${node.height}px`;
    }
  } else if (action.type === 'editText') {
    const node = nodes.find(n => n.id === action.nodeId);
    const el = getBoardElementById(action.nodeId);
    if (node && el) {
      node.text = action.newText;
      const ta = el.querySelector(".bd-text-editor");
      if (ta) syncTextEditorValue(ta, action.newText || "");
    }
  } else if (action.type === 'crop') {
    const node = nodes.find(n => n.id === action.nodeId);
    if (node) {
      if (action.toCrop) node.crop = { ...action.toCrop };
      else delete node.crop;
      if (action.toSize) {
        node.width = action.toSize.w;
        node.height = action.toSize.h;
      }
      if (action.toPos) {
        node.x = action.toPos.x;
        node.y = action.toPos.y;
      }
      const el = getBoardElementById(action.nodeId);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.width = `${node.width}px`;
        el.style.height = `${node.height}px`;
      }
      renderNode(node);
    }
  } else if (action.type === 'bake') {
    const node = nodes.find(n => n.id === action.nodeId);
    if (node) {
      node.file = action.toFile;
      delete node.crop;
      if (action.toSize) {
        node.width = action.toSize.w;
        node.height = action.toSize.h;
      }
      if (action.toPos) {
        node.x = action.toPos.x;
        node.y = action.toPos.y;
      }
      const el = getBoardElementById(action.nodeId);
      if (el) {
        el.style.left = `${node.x}px`;
        el.style.top = `${node.y}px`;
        el.style.width = `${node.width}px`;
        el.style.height = `${node.height}px`;
      }
      renderNode(node);
    }
  } else if (action.type === 'batch') {
    action.actions.forEach(a => applyForward(a));
  }
}

function undo() {
  if (historyIndex < 0) return;
  applyReverse(undoHistory[historyIndex]);
  historyIndex--;
  markBoardDirty();
}

function redo() {
  if (historyIndex >= undoHistory.length - 1) return;
  historyIndex++;
  applyForward(undoHistory[historyIndex]);
  markBoardDirty();
}

function deleteSelected() {
  const selected = canvas.querySelectorAll('.bd-item.selected');
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
  const selected = canvas.querySelectorAll('.bd-item.selected');
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
  const selected = canvas.querySelectorAll('.bd-item.selected');
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

function placeToolNodeAt(clientX, clientY, tool = activeTool, options = {}) {
  if (isPreviewMode) return;
  const useTouchPlacement = options.useTouchPlacement ?? shouldUseTouchSelectBehavior();
  if (tool === "text") {
    const dimensions = { width: 250, height: 150 };
    const position = useTouchPlacement
      ? getCenteredNodeCanvasPosition(dimensions.width, dimensions.height)
      : screenToCanvas(clientX, clientY);
    const newNode = createNode("text", position.x, position.y, { text: "", ...dimensions });
    focusTextEditor(newNode.id, {
      placeCaretAtEnd: true,
      centerInView: useTouchPlacement
    });

    // Mobile browsers are stricter about focus timing; retry once if the editor
    // did not enter editing mode during the original gesture.
    const editor = getBoardElementById(newNode.id)?.querySelector(".bd-text-editor");
    if (editor?.contentEditable !== "true") {
      window.setTimeout(() => focusTextEditor(newNode.id, {
        placeCaretAtEnd: true,
        centerInView: useTouchPlacement
      }), 0);
    }

    setActiveTool("select");
    return newNode;
  }

  if (tool === "bookmark" || tool === "page") {
    const dimensions = { width: 320, height: 132 };
    const position = screenToCanvas(clientX, clientY);
    const newNode = createNode("bookmark", position.x, position.y, {
      url: "",
      title: "",
      description: "",
      image: "",
      hasAdjustedRatio: false,
      isEditingUrl: true,
      ...dimensions
    });
    focusLinkEditor(newNode.id, {
      centerInView: false
    });

    const input = getBoardElementById(newNode.id)?.querySelector(".bd-link-editor-input");
    if (input !== document.activeElement) {
      window.setTimeout(() => focusLinkEditor(newNode.id, {
        centerInView: false
      }), 0);
    }

    setActiveTool("select");
    return newNode;
  }

  const pos = screenToCanvas(clientX, clientY);

  if (tool !== "pan" && tool !== "select" && tool !== "draw") {
    createNode(tool, pos.x, pos.y);
    setActiveTool("select");
    return true;
  }

  return null;
}

// Apply a wheel zoom anchored at a screen-space point. Reused by the viewport
// wheel handler and by overlay shields (e.g. YouTube embeds) that need to
// route wheel events to canvas zoom instead of the underlying iframe.
function applyWheelZoom(deltaY, clientX, clientY, ctrlKey) {
  // Trackpad pinch-to-zoom sends ctrlKey with small deltaY — use a larger multiplier
  const sensitivity = ctrlKey ? -0.016 : -0.002;
  const zoomAmount = deltaY * sensitivity;
  const newZ = Math.min(Math.max(camera.z + zoomAmount * camera.z, 0.1), 3);

  const rect = viewport.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const dx = (mouseX - camera.x) * (newZ / camera.z - 1);
  const dy = (mouseY - camera.y) * (newZ / camera.z - 1);

  camera.x -= dx;
  camera.y -= dy;
  camera.z = newZ;
  updateTransform();
  if (activeTool === "draw") viewport.style.cursor = getDrawCursor();
  markBoardDirty();
}

// Handle Mouse & Touch Pan/Zoom
viewport.addEventListener("wheel", (e) => {
  e.preventDefault(); // Default to zoom for all scroll actions
  applyWheelZoom(e.deltaY, e.clientX, e.clientY, e.ctrlKey);
}, { passive: false });

let initialPinchDistance = null;
let pinchStartCamera = null;
let pinchStartMidpoint = null;

function getTouchDistance(touchA, touchB) {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.hypot(dx, dy);
}

function getTouchMidpoint(touchA, touchB) {
  return {
    x: (touchA.clientX + touchB.clientX) / 2,
    y: (touchA.clientY + touchB.clientY) / 2
  };
}

function beginPinchZoom(touches) {
  if (!touches || touches.length < 2) return;

  cancelActiveTouchNodeInteraction();
  cancelBoardPanState();
  touchSelectState.interrupted = true;
  touchSelectState.movedSinceStart = true;
  resetTouchSelectState({ clearSelectionRect: true, preserveMovement: true, preserveInterrupted: true });
  resetTouchPlacementState();

  const [firstTouch, secondTouch] = touches;
  initialPinchDistance = getTouchDistance(firstTouch, secondTouch);
  pinchStartMidpoint = getTouchMidpoint(firstTouch, secondTouch);
  pinchStartCamera = {
    x: camera.x,
    y: camera.y,
    z: camera.z
  };
}

viewport.addEventListener("touchstart", (e) => {
  lastViewportTouchTime = Date.now();
  if (e.target.closest?.(".resize-handle")) return;

  if (e.touches.length === 2) {
    isPanning = false;
    isDrawing = false;
    beginPinchZoom(e.touches);
  } else if (e.touches.length === 1) {
    const touch = e.touches[0];
    const isToolbarTouch = isBoardToolbarTarget(e.target);
    const isEditableTouchTarget = isTouchEditableTarget(e.target);
    const isLinkTouchTarget = isLinkInteractionTarget(e.target);
    const isPlacementTouchTool = isTouchPlacementTool(activeTool);
    const touchedItem = e.target.closest?.(".bd-item");

    if (isToolbarTouch) return;
    if (isEditableTouchTarget) return;
    if (isLinkTouchTarget) return;
    if (!touchedItem) {
      cancelActiveTouchNodeInteraction();
    }

    if (activeTool === "draw") {
      e.preventDefault();
      startDrawing(touch.clientX, touch.clientY);
    } else if (isPlacementTouchTool && !isEditableTouchTarget) {
      e.preventDefault();
      beginTouchPlacement(
        activeTool,
        touch.clientX,
        touch.clientY,
        !e.target.closest?.(".bd-item") && !isBoardToolbarTarget(e.target)
      );
    } else if (activeTool === "select" && shouldUseTouchSelectBehavior()) {
      e.preventDefault();
      isPanning = true;
      startPan = { x: touch.clientX - camera.x, y: touch.clientY - camera.y };

      if (!e.target.closest?.(".bd-item")) {
        armTouchSelectMode("background-select", touch.clientX, touch.clientY, () => {
          isPanning = false;
          startSelectionRect(touchSelectState.startX, touchSelectState.startY, false);
        });
      }
    } else if (activeTool === "select" && e.target.closest && !e.target.closest(".bd-item") && !isBoardToolbarTarget(e.target)) {
      e.preventDefault();
      startSelectionRect(touch.clientX, touch.clientY, false);
    } else if (activeTool === "pan" || e.target === viewport) {
      if (e.target === viewport && !isEditableTouchTarget) {
        e.preventDefault();
        isPanning = true;
        startPan = { x: touch.clientX - camera.x, y: touch.clientY - camera.y };
      }
    }
  }
}, { passive: false });

viewport.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialPinchDistance) {
    e.preventDefault();
    const [firstTouch, secondTouch] = e.touches;
    const distance = getTouchDistance(firstTouch, secondTouch);
    const midpoint = getTouchMidpoint(firstTouch, secondTouch);

    if (!pinchStartCamera || !pinchStartMidpoint || initialPinchDistance <= 0) {
      beginPinchZoom(e.touches);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const startMidpointX = pinchStartMidpoint.x - rect.left;
    const startMidpointY = pinchStartMidpoint.y - rect.top;
    const currentMidpointX = midpoint.x - rect.left;
    const currentMidpointY = midpoint.y - rect.top;
    const anchorCanvasX = (startMidpointX - pinchStartCamera.x) / pinchStartCamera.z;
    const anchorCanvasY = (startMidpointY - pinchStartCamera.y) / pinchStartCamera.z;
    const nextZoom = Math.min(Math.max(pinchStartCamera.z * (distance / initialPinchDistance), 0.1), 5);

    camera.z = nextZoom;
    camera.x = currentMidpointX - anchorCanvasX * nextZoom;
    camera.y = currentMidpointY - anchorCanvasY * nextZoom;
    updateTransform();
  } else if (e.touches.length === 1) {
    const touch = e.touches[0];

    if (activeTool === "select" && shouldUseTouchSelectBehavior()) {
      updateTouchSelectMovement(touch.clientX, touch.clientY);
    }
    if (touchPlacementState.pendingTool) {
      e.preventDefault();
      updateTouchPlacementMovement(touch.clientX, touch.clientY);
    }

    if (isDrawing) {
      e.preventDefault();
      draw(touch.clientX, touch.clientY, e.shiftKey);
    } else if (dragRect.active) {
      e.preventDefault();
      updateSelectionRect(touch.clientX, touch.clientY);
    } else if (touchSelectState.activeMode === "item-drag") {
      e.preventDefault();
    } else if (isPanning) {
      e.preventDefault();
      camera.x = touch.clientX - startPan.x;
      camera.y = touch.clientY - startPan.y;
      updateTransform();
    }
  }
}, { passive: false });

viewport.addEventListener("touchend", (e) => {
  if (e.touches.length >= 2) {
    beginPinchZoom(e.touches);
    return;
  }

  const shouldDeselectFromBackgroundTap =
    activeTool === "select" &&
    shouldUseTouchSelectBehavior() &&
    touchSelectState.pendingMode === "background-select" &&
    !touchSelectState.movedSinceStart &&
    !touchSelectState.interrupted &&
    !dragRect.active;
  const shouldPlaceFromTouchTap =
    touchPlacementState.pendingTool &&
    touchPlacementState.canPlace &&
    !touchPlacementState.movedSinceStart;

  initialPinchDistance = null;
  pinchStartCamera = null;
  pinchStartMidpoint = null;
  isPanning = false;

  if (e.touches.length === 1 && (activeTool === "pan" || (activeTool === "select" && shouldUseTouchSelectBehavior()))) {
    isPanning = true;
    startPan = {
      x: e.touches[0].clientX - camera.x,
      y: e.touches[0].clientY - camera.y
    };
  }

  if (isDrawing) stopDrawing();
  if (dragRect.active) {
    dragRect.active = false;
    if (selectionBox) selectionBox.style.display = "none";
    if (touchSelectionMoved) {
      nodes.forEach((n) => {
        const el = getBoardElementById(n.id);
        if (!el) return;
        if (n.x < dragRect.x + dragRect.w && n.x + n.width > dragRect.x &&
            n.y < dragRect.y + dragRect.h && n.y + n.height > dragRect.y) {
          el.classList.add("selected");
        }
      });
    }
    touchSelectionMoved = false;
  }

  if (shouldDeselectFromBackgroundTap) {
    canvas.querySelectorAll(".bd-item.selected").forEach((item) => item.classList.remove("selected"));
  }
  if (shouldPlaceFromTouchTap) {
    placeToolNodeAt(
      touchPlacementState.startX,
      touchPlacementState.startY,
      touchPlacementState.pendingTool,
      { useTouchPlacement: true }
    );
  }

  resetTouchSelectState({ preserveInterrupted: e.touches.length > 0 && touchSelectState.interrupted });
  resetTouchPlacementState();
}, { passive: false });

viewport.addEventListener("touchcancel", () => {
  cancelActiveTouchNodeInteraction();
  initialPinchDistance = null;
  pinchStartCamera = null;
  pinchStartMidpoint = null;
  isPanning = false;
  resetTouchSelectState({ clearSelectionRect: true });
  resetTouchPlacementState();
});

// Global middle-click, right-click, and pan-tool panning
window.addEventListener("pointerdown", (e) => {
  if (!viewport.contains(e.target)) return;
  _activeBoardViewport = viewport;
  const isResizeHandle = e.target.closest ? e.target.closest(".resize-handle") : false;
  if (isResizeHandle) return;
  const isItem = e.target.closest ? e.target.closest(".bd-item") : false;
  const isToolbar = isBoardToolbarTarget(e.target);
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
  if (e.target.closest?.(".resize-handle")) return;
  // Draw tool wins over the Shift+drag pan shortcut so Shift can start a
  // straight-line stroke instead of hijacking the click as a pan.
  if (e.button === 0 && activeTool === "draw") {
    startDrawing(e.clientX, e.clientY);
  } else if (e.button === 0 && (e.shiftKey || activeTool === "pan")) {
    isPanning = true;
    startPan = { x: e.clientX - camera.x, y: e.clientY - camera.y };
    viewport.style.cursor = "grabbing";
    e.preventDefault();
  } else if (e.button === 0 && isPanning) {
    // handled by window mousedown
  } else if (e.button === 0) {
    if (activeTool === "select" && e.target.closest && !e.target.closest(".bd-item") && !isBoardToolbarTarget(e.target)) {
      startSelectionRect(e.clientX, e.clientY, e.shiftKey);
    }
  }
});

viewport.addEventListener("click", (e) => {
  if (Date.now() - lastViewportTouchTime < 700) return;
  if (e.button !== 0) return;
  if (isPanning || isDrawing || dragRect.active) return;
  if (!e.target.closest) return;
  if (e.target.closest(".bd-item") || isBoardToolbarTarget(e.target)) return;

  if (activeTool === "text") {
    placeToolNodeAt(e.clientX, e.clientY, "text", { useTouchPlacement: false });
  } else if (activeTool !== "pan" && activeTool !== "select" && activeTool !== "draw") {
    placeToolNodeAt(e.clientX, e.clientY, activeTool, { useTouchPlacement: false });
  }
});

// Mouse position tracking for exact paste locations
let lastMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

// Hover tracking: update lastMousePos whenever the pointer is over THIS viewport,
// even when no drag/pan is active. Bound to viewport so cross-board hover stays scoped.
viewport.addEventListener("pointermove", (e) => {
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
});

window.addEventListener("pointermove", (e) => {
  if (_activeBoardViewport !== viewport) return;
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
  if (isPanning) {
    camera.x = e.clientX - startPan.x;
    camera.y = e.clientY - startPan.y;
    updateTransform();
  } else if (isDrawing) {
    draw(e.clientX, e.clientY, e.shiftKey);
  } else if (dragRect.active) {
    updateSelectionRect(e.clientX, e.clientY);
  }
});

window.addEventListener("pointerup", (e) => {
  if (_activeBoardViewport !== viewport) return;
  if (isPanning) {
    isPanning = false;
    // Restore cursor to the tool's correct cursor
    if (activeTool === "draw") viewport.style.cursor = getDrawCursor();
    else if (activeTool === "pan") viewport.style.cursor = "grab";
    else viewport.style.cursor = "default";
    markBoardDirty();
  } else {
    isPanning = false;
  }

  if (isDrawing) stopDrawing();

  if (dragRect.active) {
    dragRect.active = false;
    if (selectionBox) selectionBox.style.display = "none";
    // Check collisions
    nodes.forEach(n => {
      let el = getBoardElementById(n.id);
      if (!el) return;
      if (n.x < dragRect.x + dragRect.w && n.x + n.width > dragRect.x &&
          n.y < dragRect.y + dragRect.h && n.y + n.height > dragRect.y) {
        el.classList.add("selected");
      }
    });
  }
  _activeBoardViewport = null;
});

// YouTube IFrame Player API integration: when a YouTube embed is the only
// selected node, forward Space / Left / Right to its iframe so users don't have
// to click into the video first to use keyboard controls.
function getSingleSelectedYouTubeIframe() {
  const selected = canvas.querySelectorAll(".bd-item.selected");
  if (selected.length !== 1) return null;
  const iframe = selected[0].querySelector(".bd-embed-iframe");
  if (!iframe) return null;
  if (!/^https:\/\/www\.youtube\.com\/embed\//.test(iframe.src || "")) return null;
  return iframe;
}

function postYouTubeCommand(iframe, func, args = []) {
  try {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*"
    );
  } catch (e) {}
}

window.addEventListener("message", (e) => {
  if (typeof e.data !== "string" || !e.data.startsWith("{")) return;
  let data;
  try { data = JSON.parse(e.data); } catch { return; }
  if (!data || (data.event !== "infoDelivery" && data.event !== "onStateChange")) return;
  const iframes = canvas.querySelectorAll(".bd-embed-iframe");
  for (const ifr of iframes) {
    if (ifr.contentWindow !== e.source) continue;
    const st = ifr.__ytState;
    if (!st) break;
    if (data.event === "infoDelivery" && data.info) {
      if (typeof data.info.currentTime === "number") st.currentTime = data.info.currentTime;
      if (typeof data.info.duration === "number") st.duration = data.info.duration;
      if (typeof data.info.playerState === "number") st.playing = data.info.playerState === 1;
    } else if (data.event === "onStateChange") {
      st.playing = data.info === 1;
    }
    break;
  }
});

// Shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.isContentEditable) return;
  if (_mountedBoardCount > 1) {
    if (_activeBoardViewport && _activeBoardViewport !== viewport) return;
    if (!_activeBoardViewport && !viewport.matches(":focus-within")) return;
  }
  // YouTube playback control on the selected embed (Space / Left / Right).
  // Plain modifiers only; ctrl/cmd combos still go to the regular shortcuts.
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    const ytIframe = getSingleSelectedYouTubeIframe();
    if (ytIframe) {
      const st = ytIframe.__ytState || (ytIframe.__ytState = { currentTime: 0, duration: 0, playing: false });
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        const func = st.playing ? "pauseVideo" : "playVideo";
        postYouTubeCommand(ytIframe, func);
        st.playing = !st.playing;
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        postYouTubeCommand(ytIframe, "seekTo", [Math.max(0, (st.currentTime || 0) - 5), true]);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        postYouTubeCommand(ytIframe, "seekTo", [(st.currentTime || 0) + 5, true]);
        return;
      }
    }
  }
  // Undo/Redo/Cut/Copy/Delete
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !e.shiftKey) { e.preventDefault(); saveLocalFile(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && e.shiftKey) { e.preventDefault(); saveLocalFileAs(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); openCanvasPicker(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i") { e.preventDefault(); importContentPicker(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelected(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { copySelected(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
  
  if (e.key === "p" || e.key === "P") setActiveTool("draw");
  if (e.key === "t" || e.key === "T") setActiveTool("text");
  if (e.key === "v" || e.key === "V") setActiveTool("select");
  if (e.key === "l" || e.key === "L") setActiveTool("bookmark");
  if (e.key === "x" || e.key === "X") {
    e.preventDefault();
    openMarkdownPanel(screenToCanvas(lastMousePos.x, lastMousePos.y));
  }
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
  if (_mountedBoardCount > 1) {
    if (_activeBoardViewport && _activeBoardViewport !== viewport) return;
    if (!_activeBoardViewport && !viewport.matches(":focus-within")) return;
  }
  if (e.code === "Space" && viewport.dataset.prevTool) {
    setActiveTool(viewport.dataset.prevTool);
    viewport.dataset.prevTool = "";
    if (!isPanning) {
      if (activeTool === "draw") viewport.style.cursor = getDrawCursor();
      else if (activeTool !== "pan") viewport.style.cursor = "default";
    }
  }
  // Bake the active straight segment so a second Shift press during the same
  // stroke starts a fresh anchor at the line's endpoint.
  if (e.key === "Shift" && isDrawing && wasShiftHeld) {
    bakeShiftSegment();
  }
});

// Tools logic
function setActiveTool(tool) {
  if (tool === "export" || tool === "import" || tool === "save" || tool === "recommend" || tool === "settings" || tool === "feature-request" || tool === "bug-report" || tool === "more") return;
  if (isPreviewMode && (tool === "text" || tool === "draw" || tool === "bookmark")) return;
  activeTool = tool;
  toolbarButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  viewport.dataset.mode = tool;
  if (tool === "draw") viewport.style.cursor = getDrawCursor();
  else if (tool === "pan") viewport.style.cursor = "grab";
  else viewport.style.cursor = "default";
}

function stopTransientBoardInteractions() {
  cancelActiveTouchNodeInteraction();
  if (isDrawing) stopDrawing();
  isPanning = false;
  initialPinchDistance = null;
  pinchStartCamera = null;
  pinchStartMidpoint = null;

  if (dragRect.active) {
    dragRect.active = false;
    touchSelectionMoved = false;
    if (selectionBox) selectionBox.style.display = "none";
  }

  resetTouchSelectState();
  resetTouchPlacementState();
}

function cancelBoardPanState() {
  cancelActiveTouchNodeInteraction();
  isPanning = false;
  initialPinchDistance = null;
  pinchStartCamera = null;
  pinchStartMidpoint = null;
}

function handleToolbarAction(btn) {
  stopTransientBoardInteractions();

  if (btn.dataset.tool === "more") {
    const shouldOpen = !toolbarActions?.classList.contains("is-open");
    closeFloatingPanels({ keep: shouldOpen ? "actions" : "" });
    setToolbarActionsOpen(shouldOpen);
    return;
  }

  setToolbarActionsOpen(false);
  if (btn.dataset.tool === "settings") {
    const shouldOpen = settingsPanel?.hidden ?? true;
    setSettingsPanelOpen(shouldOpen);
    return;
  }
  if (btn.dataset.tool === "save") return saveBoard();
  if (btn.dataset.tool === "recommend") {
    const shouldOpen = recommendationPanel?.hidden ?? true;
    setRecommendationPanelOpen(shouldOpen);
    return;
  }
  if (btn.dataset.tool === "feature-request") {
    const shouldOpen = featureRequestPanel?.hidden ?? true;
    setFeatureRequestPanelOpen(shouldOpen);
    return;
  }
  if (btn.dataset.tool === "bug-report") {
    const shouldOpen = bugReportPanel?.hidden ?? true;
    setBugReportPanelOpen(shouldOpen);
    return;
  }
  if (btn.dataset.tool === "open") return openCanvasPicker();
  if (btn.dataset.tool === "save") return saveLocalFile();
  if (btn.dataset.tool === "export") return openExportModal();
  if (btn.dataset.tool === "new-markdown") return openMarkdownPanel();
  if (btn.dataset.tool === "markdown-db") {
    const dimensions = { width: 460, height: 360 };
    const position = getCenteredNodeCanvasPosition(dimensions.width, dimensions.height);
    createNode("markdown-db", position.x, position.y, { title: "Markdown index", ...dimensions });
    return;
  }

  setActiveTool(btn.dataset.tool);
}

toolbarButtons.forEach(btn => {
  btn.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  btn.addEventListener("touchstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
    lastToolbarTouchTime = Date.now();
    handleToolbarAction(btn);
  }, { passive: false });

  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() - lastToolbarTouchTime < 500) return;
    handleToolbarAction(btn);
  });
});

if (isPreviewMode && boardConfig.fullBoardHref) {
  const cornerLink = document.createElement("a");
  cornerLink.className = "bd-preview-corner-link";
  cornerLink.href = boardConfig.fullBoardHref;
  cornerLink.setAttribute("aria-label", `Open ${boardConfig.title} board`);
  cornerLink.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>Open board`;
  viewport.appendChild(cornerLink);
}

if (recommendationSummaryInput) {
  recommendationSummaryInput.addEventListener("input", () => {
    recommendationSummaryInput.value = formatIssueDraftInput(recommendationSummaryInput.value);
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

if (featureRequestSummaryInput) {
  featureRequestSummaryInput.addEventListener("input", () => {
    featureRequestSummaryInput.value = formatIssueDraftInput(featureRequestSummaryInput.value);
  });

  featureRequestSummaryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      beginFeatureRequestFlow();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setFeatureRequestPanelOpen(false);
    }
  });
}

if (featureRequestSubmitButton) {
  featureRequestSubmitButton.addEventListener("click", beginFeatureRequestFlow);
}

if (bugReportSummaryInput) {
  bugReportSummaryInput.addEventListener("input", () => {
    bugReportSummaryInput.value = formatIssueDraftInput(bugReportSummaryInput.value);
  });

  bugReportSummaryInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      beginBugReportFlow();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setBugReportPanelOpen(false);
    }
  });
}

if (bugReportSubmitButton) {
  bugReportSubmitButton.addEventListener("click", beginBugReportFlow);
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

function closeExportModal() {
  if (exportModal) exportModal.hidden = true;
}

async function updateExportSizeEstimate() {
  if (!exportModalSizeEstimate) return;
  exportModalSizeEstimate.textContent = "Calculating...";
  let totalBytes = 0;
  
  const state = serializeState();
  const jsonStr = JSON.stringify(state);
  totalBytes += new Blob([jsonStr]).size;

  const includeSubpages = exportModalSubpagesCheckbox?.checked ?? true;

  for (const node of state.nodes) {
    if (node.type === "file" && node.file) {
      if (node.file.startsWith("data:")) {
        // Base64 size estimation
        const base64Len = node.file.indexOf(",") > -1 ? node.file.split(",")[1].length : node.file.length;
        totalBytes += Math.round((base64Len * 3) / 4);
      } else {
        try {
          // Attempt to get Content-Length without downloading the whole file
          const res = await fetch(node.file, { method: 'HEAD' });
          if (res.ok) {
            const length = res.headers.get("content-length");
            if (length) totalBytes += parseInt(length, 10);
          }
        } catch(e) {} // ignore local fetch failures
      }
    } else if (includeSubpages && node.type === "board-preview" && node.boardSource) {
      try {
        const res = await fetch(node.boardSource, { method: 'HEAD' });
        if (res.ok) {
          const length = res.headers.get("content-length");
          if (length) totalBytes += parseInt(length, 10);
        }
      } catch(e) {}
    } else if (includeSubpages && node.type === "markdown" && node.file) {
      try {
        const res = await fetch(node.file, { method: 'HEAD' });
        if (res.ok) {
          const length = res.headers.get("content-length");
          if (length) totalBytes += parseInt(length, 10);
        }
      } catch(e) {}
    }
  }

  const kb = totalBytes / 1024;
  if (kb > 1024) {
    exportModalSizeEstimate.textContent = `~${(kb / 1024).toFixed(2)} MB`;
  } else {
    exportModalSizeEstimate.textContent = `~${kb.toFixed(2)} KB`;
  }
}

function openExportModal() {
  if (!exportModal) return;
  exportModal.hidden = false;
  updateExportSizeEstimate();
}

if (exportModalCancelBtn) {
  exportModalCancelBtn.addEventListener("click", closeExportModal);
}

if (exportModalConfirmBtn) {
  exportModalConfirmBtn.addEventListener("click", () => {
    const includeSubpages = exportModalSubpagesCheckbox?.checked ?? true;
    exportProjectBundle(includeSubpages);
  });
}

if (exportModalSubpagesCheckbox) {
  exportModalSubpagesCheckbox.addEventListener("change", updateExportSizeEstimate);
}

if (exportModal) {
  exportModal.addEventListener("click", (event) => {
    if (event.target === exportModal) {
      closeExportModal();
    }
  });
}

function getBundleEntryMime(key) {
  const ext = key.split(".").pop().toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "md") return "text/markdown";
  if (ext === "canvas" || ext === "json") return "application/json";
  return "application/octet-stream";
}

async function readProjectBundleFile(file) {
  if (!window.fflate) {
    throw new Error("Bundler library not loaded.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const rawUnzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));
  // Normalize zip entry keys to forward-slash form. Different zip tools use
  // different separators (PowerShell Compress-Archive uses backslashes, the
  // JS exporter and most others use forward slashes). Normalizing here lets
  // `node.file` lookups work regardless of how the bundle was produced.
  const unzipped = {};
  for (const key in rawUnzipped) {
    unzipped[key.replaceAll("\\", "/")] = rawUnzipped[key];
  }

  let jsonStr = null;
  let boardFileKey = null;
  for (const key in unzipped) {
    if (key.endsWith(".canvas") || key.endsWith(".canvas.json")) {
      jsonStr = new TextDecoder().decode(unzipped[key]);
      boardFileKey = key;
      break;
    }
  }

  if (!jsonStr) {
    throw new Error("No board file found in bundle.");
  }

  const importedState = JSON.parse(jsonStr);
  const blobUrlMap = {};
  for (const key in unzipped) {
    if (key !== boardFileKey && !key.endsWith("/")) {
      const blob = new Blob([unzipped[key]], { type: getBundleEntryMime(key) });
      blobUrlMap[key] = URL.createObjectURL(blob);
    }
  }

  // Phase 2: persist markdown sidecars from the bundle to disk via the
  // /api/save-markdown endpoint, so they survive page reloads regardless of
  // whether the canvas has been saved yet. Map records bundle-key -> repo-
  // absolute path so node `file` references can point at on-disk locations
  // (instead of throwaway blob URLs) when persistence succeeded.
  const canvasDir = (boardConfig.sourcePath || `content/boards/${boardConfig.slug}/current.canvas`)
    .split("/").slice(0, -1).join("/");
  const persistedSidecars = new Map();
  for (const key in unzipped) {
    if (key === boardFileKey || key.endsWith("/")) continue;
    if (!key.toLowerCase().endsWith(".md")) continue;
    const content = new TextDecoder().decode(unzipped[key]).replace(/\r\n?/g, "\n");
    const targetRepoPath = `${canvasDir}/${key}`;
    const filename = key.split("/").pop() || "note.md";
    try {
      const response = await fetch(`/api/save-markdown?slug=${encodeURIComponent(boardConfig.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, path: targetRepoPath, content })
      });
      if (response.ok) {
        persistedSidecars.set(key, `/${targetRepoPath}`);
      }
    } catch {
      // Sidecar persist failed; _rawMarkdown inline below is the safety net.
    }
  }

  for (const node of importedState.nodes || []) {
    if (node.type === "file" && node.file && blobUrlMap[node.file]) {
      node.file = blobUrlMap[node.file];
    } else if (node.type === "board-preview" && node.boardSource && blobUrlMap[node.boardSource]) {
      node.boardSource = blobUrlMap[node.boardSource];
    } else if (node.type === "markdown" && node.file && blobUrlMap[node.file]) {
      // Inline markdown content into _rawMarkdown so it survives page reloads.
      // Blob URLs evaporate on reload; the inline copy is the durable one.
      const originalKey = node.file;
      const bundleEntry = unzipped[originalKey];
      if (bundleEntry) {
        node._rawMarkdown = new TextDecoder().decode(bundleEntry).replace(/\r\n?/g, "\n");
      }
      // Prefer the on-disk repo-absolute path when the sidecar was persisted —
      // matches the renderer's fetch model and survives reloads. Fall back to
      // the in-memory blob URL when persistence didn't succeed (renderer's
      // _rawMarkdown branch will still render either way).
      if (persistedSidecars.has(originalKey)) {
        node.file = persistedSidecars.get(originalKey);
      } else {
        node.file = blobUrlMap[originalKey];
      }
    }
  }

  return importedState;
}

window.addEventListener("pointerdown", (event) => {
  const clickedRecommendButton = event.target.closest?.('[data-tool="recommend"]');
  const clickedInsideRecommendationPanel = recommendationPanel?.contains(event.target);
  if (recommendationPanel && !recommendationPanel.hidden && !clickedRecommendButton && !clickedInsideRecommendationPanel) {
    setRecommendationPanelOpen(false);
  }

  const clickedFeatureRequestButton = event.target.closest?.('[data-tool="feature-request"]');
  const clickedInsideFeatureRequestPanel = featureRequestPanel?.contains(event.target);
  if (featureRequestPanel && !featureRequestPanel.hidden && !clickedFeatureRequestButton && !clickedInsideFeatureRequestPanel) {
    setFeatureRequestPanelOpen(false);
  }

  const clickedBugReportButton = event.target.closest?.('[data-tool="bug-report"]');
  const clickedInsideBugReportPanel = bugReportPanel?.contains(event.target);
  if (bugReportPanel && !bugReportPanel.hidden && !clickedBugReportButton && !clickedInsideBugReportPanel) {
    setBugReportPanelOpen(false);
  }

  const clickedSettingsButton = event.target.closest?.('[data-tool="settings"]');
  const clickedInsideSettingsPanel = settingsPanel?.contains(event.target);
  if (settingsPanel && !settingsPanel.hidden && !clickedSettingsButton && !clickedInsideSettingsPanel) {
    setSettingsPanelOpen(false);
  }

  if (!toolbarActions?.classList.contains("is-open")) return;
  const clickedMoreButton = event.target.closest?.('[data-tool="more"]');
  const clickedInsideActions = toolbarActions?.contains(event.target);
  if (!clickedMoreButton && !clickedInsideActions) {
    setToolbarActionsOpen(false);
  }
});

window.addEventListener("keydown", (event) => {
  // Crop mode owns ESC and Enter while active.
  const cropping = findCroppingNode();
  if (cropping) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCrop(cropping);
      return;
    }
    if (event.key === "Enter") {
      const active = document.activeElement;
      const isInEditor = active && (active.classList?.contains("bd-text-editor") ||
                                    active.classList?.contains("bd-markdown-editor") ||
                                    active.tagName === "INPUT" || active.tagName === "TEXTAREA" ||
                                    active.isContentEditable);
      if (!isInEditor) {
        event.preventDefault();
        commitCrop(cropping);
        return;
      }
    }
  }

  if (event.key === "Escape" && recommendationPanel && !recommendationPanel.hidden) {
    event.preventDefault();
    setRecommendationPanelOpen(false);
    return;
  }

  if (event.key === "Escape" && featureRequestPanel && !featureRequestPanel.hidden) {
    event.preventDefault();
    setFeatureRequestPanelOpen(false);
    return;
  }

  if (event.key === "Escape" && bugReportPanel && !bugReportPanel.hidden) {
    event.preventDefault();
    setBugReportPanelOpen(false);
    return;
  }

  if (event.key === "Escape" && settingsPanel && !settingsPanel.hidden) {
    event.preventDefault();
    setSettingsPanelOpen(false);
    return;
  }

  if (event.key === "Escape" && toolbarActions?.classList.contains("is-open")) {
    event.preventDefault();
    setToolbarActionsOpen(false);
    return;
  }

  if (event.key === "Escape" && recommendationModal && !recommendationModal.hidden) {
    event.preventDefault();
    closeRecommendationModal();
    return;
  }

  // ESC closes "Open markdown" fullscreen view. The element-level handler on
  // _markdownFullscreenEl only fires when focus is inside the fullscreen tree;
  // this window-level fallback covers cases where focus has drifted elsewhere.
  if (event.key === "Escape" && _markdownFullscreenEl && !_markdownFullscreenEl.hidden) {
    event.preventDefault();
    closeMarkdownFullscreen();
    return;
  }

  // Canvas-wide ESC: blur any focused in-canvas editor (text/markdown), then
  // deselect every `.bd-item.selected`. Mirrors click-away behavior.
  if (event.key === "Escape") {
    const active = document.activeElement;
    if (active && (active.classList?.contains("bd-text-editor") ||
                   active.classList?.contains("bd-markdown-editor")) &&
        active.closest(".bd-item")) {
      active.blur?.();
    }
    const selectedItems = canvas.querySelectorAll(".bd-item.selected");
    if (selectedItems.length > 0) {
      selectedItems.forEach((n) => n.classList.remove("selected"));
    }
  }
});

if (fileInput) {
  fileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setToolbarActionsOpen(false);
    await importContentFiles(files);
    fileInput.value = "";
  });
}

if (settingsAutosaveEnabledInput) {
  settingsAutosaveEnabledInput.addEventListener("change", () => {
    boardSettings.autosaveEnabled = settingsAutosaveEnabledInput.checked;
    applyBoardSettings({ announce: true });
  });
}

if (settingsAutosaveSecondsInput) {
  settingsAutosaveSecondsInput.addEventListener("change", () => {
    boardSettings.autosaveSeconds = settingsAutosaveSecondsInput.value;
    applyBoardSettings({ announce: true });
  });

  settingsAutosaveSecondsInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      boardSettings.autosaveSeconds = settingsAutosaveSecondsInput.value;
      applyBoardSettings({ announce: true });
    }
  });
}

if (settingsResetButton) {
  settingsResetButton.addEventListener("click", () => {
    boardSettings = { ...DEFAULT_BOARD_SETTINGS };
    applyBoardSettings({ announce: true });
  });
}

async function verifyFilePermission(handle, mode) {
  if (await handle.queryPermission({ mode }) === 'granted') return true;
  if (await handle.requestPermission({ mode }) === 'granted') return true;
  return false;
}

async function saveLocalFile() {
  if (!supportsFileSystemAccessAPI || !currentFileHandle) {
    return saveLocalFileAs();
  }

  try {
    if (await verifyFilePermission(currentFileHandle, 'readwrite')) {
      const writable = await currentFileHandle.createWritable();
      const state = serializeState();
      await writable.write(flushLocalStateSave(state));
      await writable.close();
      showToolbarToast(`Saved to ${currentFileHandle.name}`, "success");
    } else {
      showToolbarToast("Permission denied to save.", "error");
    }
  } catch (err) {
    console.error("Save failed:", err);
    showToolbarToast("Failed to save file.", "error");
  }
}

async function saveLocalFileAs() {
  if (supportsFileSystemAccessAPI) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: buildExportFilename(),
        types: [{
          description: 'Canvas File',
          accept: { 'application/json': ['.canvas'] }
        }]
      });
      const writable = await handle.createWritable();
      const state = serializeState();
      await writable.write(flushLocalStateSave(state));
      await writable.close();
      currentFileHandle = handle;
      showToolbarToast(`Saved to ${handle.name}`, "success");
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Save As failed:", err);
        showToolbarToast("Failed to save file.", "error");
      }
    }
  } else {
    // Fallback to traditional download
    exportCanvas();
  }
}

async function exportProjectBundle(includeSubpages) {
  if (!window.fflate) {
    showToolbarToast("Bundler library not loaded. Please try again.", "error");
    return;
  }

  showToolbarToast("Bundling project...", "info");
  closeExportModal();

  const state = cloneState(serializeState());
  const zipData = {};

  async function fetchAsUint8Array(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    } catch (e) {
      return null;
    }
  }

  function getExtension(mime) {
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("png")) return "png";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("svg")) return "svg";
    return "bin";
  }

  function getBundleFilename(source, fallback) {
    const cleanSource = String(source || "").split("#")[0].split("?")[0];
    return cleanSource.split("/").pop() || fallback;
  }

  for (let node of state.nodes) {
    if (node.type === "file" && node.file) {
      if (node.file.startsWith("data:")) {
        // Base64 Data URL to Uint8Array
        const parts = node.file.split(",");
        const mime = parts[0].match(/:(.*?);/)[1];
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--) u8arr[n] = bstr.charCodeAt(n);
        
        const ext = getExtension(mime);
        const filename = `assets/img_${node.id}.${ext}`;
        zipData[filename] = u8arr;
        node.file = filename; // Update path in canvas json
      } else {
        // Regular URL reference
        const u8arr = await fetchAsUint8Array(node.file);
        if (u8arr) {
          const parts = node.file.split("/");
          let filename = parts[parts.length - 1] || `file_${node.id}`;
          if (!filename.includes(".")) filename += ".bin"; // Fallback
          const zipPath = `assets/${filename}`;
          zipData[zipPath] = u8arr;
          node.file = zipPath;
        }
      }
    } else if (includeSubpages && node.type === "board-preview" && node.boardSource) {
      const u8arr = await fetchAsUint8Array(node.boardSource);
      if (u8arr) {
        const filename = getBundleFilename(node.boardSource, `board_${node.id}.canvas`);
        const zipPath = `boards/${node.id}_${filename}`;
        zipData[zipPath] = u8arr;
        node.boardSource = zipPath;
      }
    } else if (includeSubpages && node.type === "markdown" && node.file) {
      const u8arr = await fetchAsUint8Array(node.file);
      if (u8arr) {
        const filename = getBundleFilename(node.file, `doc_${node.id}.md`);
        const zipPath = `markdown/${node.id}_${filename}`;
        zipData[zipPath] = u8arr;
        node.file = zipPath;
      }
    }
  }

  // Add the board json itself
  const jsonStr = flushLocalStateSave(state);
  const encoder = new TextEncoder();
  zipData["board.canvas"] = encoder.encode(jsonStr);

  // Compress
  const zippedUint8 = fflate.zipSync(zipData);
  const blob = new Blob([zippedUint8], { type: "application/zip" });

  let exportFilename = buildExportFilename();
  if (exportFilename.endsWith(".canvas.json")) exportFilename = exportFilename.replace(".canvas.json", ".zip");
  else if (exportFilename.endsWith(".canvas")) exportFilename = exportFilename.replace(".canvas", ".zip");
  else exportFilename += ".zip";

  if (supportsFileSystemAccessAPI) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: exportFilename,
        types: [{
          description: 'Project Bundle',
          accept: { 'application/zip': ['.zip'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showToolbarToast(`Exported bundle ${handle.name}`, "success");
      return;
    } catch (err) {
      if (err.name !== 'AbortError') console.error("Export Bundle failed:", err);
    }
  }
  
  // Fallback to traditional download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFilename;
  a.click();
  URL.revokeObjectURL(url);
  showToolbarToast(`Exported bundle ${exportFilename}`, "success");
}

function exportCanvas() {
  const result = downloadStateFile(buildExportFilename(), "application/octet-stream");
  showToolbarToast(`Exported ${result.filename}`, "success");
  return result;
}

// Drawing logic
let lastDrawPoint = { x: 0, y: 0 };

// Shift-snap state for straight-line drawing.
// Active only while a stroke is in progress, the draw tool is selected, and Shift is held.
let preservedPathData = "";
let lineStartPoint = null;
let lineEndPoint = null;
let wasShiftHeld = false;

/* @export-for-test:snapStraightLine */
function snapStraightLine(start, cursor) {
  const dx = cursor.x - start.x;
  const dy = cursor.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 0.001) {
    return { x: start.x, y: start.y };
  }
  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  const targets = [0, 45, 90, 135, 180, -45, -90, -135, -180];
  const tolerance = 3;
  let snapped = null;
  for (const target of targets) {
    let diff = Math.abs(angleDeg - target);
    if (diff > 180) diff = 360 - diff;
    if (diff <= tolerance) {
      snapped = target;
      break;
    }
  }
  if (snapped === null) {
    return { x: cursor.x, y: cursor.y };
  }
  const radians = snapped * Math.PI / 180;
  return {
    x: start.x + distance * Math.cos(radians),
    y: start.y + distance * Math.sin(radians),
  };
}

function bakeShiftSegment() {
  if (lineEndPoint) {
    lastDrawPoint = { x: lineEndPoint.x, y: lineEndPoint.y };
  }
  preservedPathData = "";
  lineStartPoint = null;
  lineEndPoint = null;
  wasShiftHeld = false;
}

function startDrawing(x, y) {
  if (isPreviewMode) return;
  isDrawing = true;
  let pos = screenToCanvas(x, y);
  lastDrawPoint = pos;
  preservedPathData = "";
  lineStartPoint = null;
  lineEndPoint = null;
  wasShiftHeld = false;
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

function draw(x, y, shiftKey = false) {
  if (!isDrawing || !currentPath) return;
  let pos = screenToCanvas(x, y);

  // Shift-snap branch: replace the active tail with a single straight segment.
  // Only runs while Shift is held and the draw tool is active. The freehand
  // path below must stay untouched so non-Shift drawing performance is unchanged.
  if (shiftKey && activeTool === "draw") {
    if (!wasShiftHeld) {
      preservedPathData = currentPathData;
      lineStartPoint = { x: lastDrawPoint.x, y: lastDrawPoint.y };
      wasShiftHeld = true;
    }
    const end = snapStraightLine(lineStartPoint, pos);
    lineEndPoint = end;
    currentPathData = `${preservedPathData} L ${end.x} ${end.y}`;
    currentPath.setAttribute("d", currentPathData);
    minX = Math.min(minX, end.x); maxX = Math.max(maxX, end.x);
    minY = Math.min(minY, end.y); maxY = Math.max(maxY, end.y);
    return;
  }

  // Shift was released mid-stroke without firing keyup yet (pointer arrived first).
  // Bake the line so subsequent freehand points start from the segment end.
  if (wasShiftHeld) {
    bakeShiftSegment();
  }

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
  bakeShiftSegment();
  if (currentPath) {
    const isSinglePoint = !currentPathData.includes(" L ");
    let w = Math.max(maxX - minX, 10);
    let h = Math.max(maxY - minY, 10);
    const viewBox = `${minX - 5} ${minY - 5} ${w + 10} ${h + 10}`;
    const drawingMarkup = isSinglePoint
      ? `<svg class="bd-drawing" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block;"><circle cx="${minX}" cy="${minY}" r="3" fill="#3fdaca"></circle></svg>`
      : `<svg class="bd-drawing" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block;"><path d="${currentPathData}" fill="none" stroke="#3fdaca" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
    createNode("text", minX - 5, minY - 5, { 
      width: w + 10, 
      height: h + 10, 
      text: drawingMarkup
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
  } else if (type === "bookmark" || type === "page" || type === "link") {
    nodeObj.type = "link";
    nodeObj.url = data.url || "";
    nodeObj.embedMode = data.embedMode || "preview";
  } else if (type === "board-preview") {
    nodeObj.type = "board-preview";
    nodeObj.width = Number(data.width) > 0 ? Number(data.width) : BOARD_PREVIEW_MIN_NODE_WIDTH;
    nodeObj.height = Number(data.height) > 0 ? Number(data.height) : 300;
    nodeObj.boardSlug = String(data.boardSlug || "");
    nodeObj.boardSource = String(data.boardSource || data.file || data.source || "");
    nodeObj.boardHref = String(data.boardHref || data.href || "");
    nodeObj.title = String(data.title || nodeObj.boardSlug || "Board preview");
    nodeObj.description = String(data.description || "");
  } else if (type === "markdown") {
    nodeObj.type = "markdown";
    nodeObj.file = String(data.file || data.source || "");
    nodeObj.title = String(data.title || "");
    nodeObj.href = String(data.href || nodeObj.file || "");
    nodeObj.width = Number(data.width) > 0 ? Number(data.width) : 340;
    nodeObj.height = Number(data.height) > 0 ? Number(data.height) : 400;
  } else if (type === "base") {
    nodeObj.type = "base";
    nodeObj.source = String(data.source || "");       // path to JSON file
    nodeObj.collection = String(data.collection || ""); // optional key into the JSON
    nodeObj.filter = String(data.filter || "");         // e.g. "section=projects"
    nodeObj.columns = Array.isArray(data.columns) ? data.columns : ["title", "publishingStatus", "year", "effort"];
    nodeObj.title = String(data.title || "Base");
    nodeObj.width = Number(data.width) > 0 ? Number(data.width) : 680;
    nodeObj.height = Number(data.height) > 0 ? Number(data.height) : 480;
  } else if (type === "app" || type === "session") {
    nodeObj.type = "app";
    nodeObj.source = String(data.source || ""); // path to the app session json manifest
    nodeObj.embedMode = data.embedMode || "preview"; // "preview" or "live"
    nodeObj.width = Number(data.width) > 0 ? Number(data.width) : 340;
    nodeObj.height = Number(data.height) > 0 ? Number(data.height) : 220;
    // We will load the actual app config (url, title, icon) asynchronously if not provided
    nodeObj.appConfig = data.appConfig || null; 
  } else if (type === "image") {
    nodeObj.type = "file";
    // Check auto sizing flag to avoid infinite loops if loaded from file
    if (data.file && !data.id && data.width === undefined) {
        let img = new Image();
        img.onload = () => {
            // Race guard: skip if the user has already cropped, or if the
            // cropbox-img onload already sized the node. Both this preload and
            // the cropbox-img onload write to nodeObj.width/height; without a
            // shared guard, a fast crop+commit on a freshly dropped image can
            // race and reset dimensions back to the source's natural size.
            if (nodeObj.crop) return;
            if (nodeObj.hasAdjustedRatio) return;
            // Match the cropbox-img onload's clamping behavior so both writers
            // produce the same displayed size regardless of which fires first.
            // Without this clamp, a 4000-pixel-wide source would render at
            // full width and any crop of it would inherit that oversized
            // displayed width — perceived as a horizontal stretch / squish.
            const naturalRatio = img.width / img.height;
            nodeObj.width = Math.min(img.width, 400);
            nodeObj.height = nodeObj.width / naturalRatio;
            nodeObj.hasAdjustedRatio = true;
            let el = getBoardElementById(nodeObj.id);
            if (el) {
                el.style.width = `${nodeObj.width}px`;
                el.style.height = `${nodeObj.height}px`;
            }
            markBoardDirty();
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

function renderLinkNode(nodeObj, el) {
  let shell = el.querySelector(".bd-link-shell");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "bd-link-shell";
    el.insertBefore(shell, el.firstChild);
  }

  const isEditing = nodeObj.isEditingUrl || !nodeObj.url;

  if (isEditing) {
    shell.innerHTML = `
      <div class="bd-link-editor">
        <label class="bd-link-editor-label" for="link-input-${nodeObj.id}">
          <span>Link</span>
          <input
            id="link-input-${nodeObj.id}"
            class="bd-link-editor-input"
            type="url"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="${LINK_NODE_PLACEHOLDER}"
          >
        </label>
        <p class="bd-link-editor-hint">Tap and hold to paste, then press Enter.</p>
      </div>
    `;

    const editor = shell.querySelector(".bd-link-editor");
    const input = shell.querySelector(".bd-link-editor-input");
    if (!input) return;

    input.value = nodeObj.url || "";

    editor?.addEventListener("mousedown", (event) => event.stopPropagation());
    editor?.addEventListener("click", (event) => event.stopPropagation());
    editor?.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
    input.addEventListener("input", () => {
      nodeObj.url = input.value;
      markBoardDirty();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finalizeLinkEditing(nodeObj, input);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      finalizeLinkEditing(nodeObj, input);
    });
    return;
  }

  if (nodeObj.embedMode === "live") {
    // Force remove auto-size if they switched to live so they can resize the iframe
    el.classList.remove("bd-auto-size-content");
    shell.classList.add("bd-link-live");
    
    // Default size for live embed if it was previously auto-sized to a small card
    if (nodeObj.width < 400) {
      nodeObj.width = 600;
      nodeObj.height = 400;
      el.style.width = `${nodeObj.width}px`;
      el.style.height = `${nodeObj.height}px`;
    }

    // Chrome blocks data:application/pdf in iframes, so swap in a blob: URL when
    // the stored asset is inlined (static-host fallback). Firefox accepts both.
    const blobUrlForData = ensureBlobUrlForDataUrl(nodeObj);
    const runtimeUrl = blobUrlForData || nodeObj.url;
    const embedUrl = getYouTubeEmbedUrl(nodeObj.url) || runtimeUrl;
    const isYouTube = !!getYouTubeVideoId(nodeObj.url);
    const headerDomain = blobUrlForData
      ? "Local file"
      : new URL(nodeObj.url || "http://localhost", typeof location !== "undefined" ? location.origin : "http://localhost").hostname;

    shell.innerHTML = `
      <div class="bd-embed-header">
        <button type="button" class="bd-embed-toggle-btn" aria-label="Back to preview" title="Back to preview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Preview
        </button>
        <div class="bd-embed-domain">${escapeHtml(headerDomain)}</div>
        <a class="bd-embed-open-btn" href="${escapeHtml(runtimeUrl)}" target="_blank" rel="noreferrer" draggable="false" aria-label="Open in new tab" title="Open in new tab">
          Open
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>
      <iframe class="bd-embed-iframe" src="${escapeHtml(embedUrl)}" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" allowfullscreen loading="lazy"></iframe>
      ${isYouTube ? `<div class="bd-yt-wheel-shield" aria-hidden="true"></div>` : ""}
    `;

    const toggleBtn = shell.querySelector(".bd-embed-toggle-btn");
    toggleBtn?.addEventListener("mousedown", (e) => e.stopPropagation());
    toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      nodeObj.embedMode = "preview";
      markBoardDirty();
      renderNode(nodeObj);
    });

    if (isYouTube) {
      // Subscribe to YouTube IFrame Player API events so keyboard shortcuts
      // (Space / Left / Right when this node is the only selected one) know
      // the current playback state and timestamp without round-tripping.
      const ytIframe = shell.querySelector(".bd-embed-iframe");
      if (ytIframe) {
        ytIframe.__ytState = ytIframe.__ytState || { currentTime: 0, duration: 0, playing: false };
        const subscribe = () => {
          try {
            ytIframe.contentWindow?.postMessage(
              JSON.stringify({ event: "listening", id: nodeObj.id }),
              "*"
            );
          } catch (e) {}
        };
        ytIframe.addEventListener("load", subscribe);
        // Iframe may already be loaded (e.g. cached) by the time we get here.
        setTimeout(subscribe, 200);
      }
    }

    if (isYouTube) {
      // Wheel-shield over YouTube iframe: YouTube has no scrollable content, so
      // hovering over it should keep canvas zoom working instead of being
      // swallowed by the iframe. The shield catches wheel and forwards it to
      // applyWheelZoom. On pointerdown the shield disables itself so the click
      // reaches the iframe (play/pause/seek); it re-enables once the user
      // clicks anywhere outside this embed, restoring zoom-on-hover.
      const shield = shell.querySelector(".bd-yt-wheel-shield");
      if (shield) {
        shield.addEventListener("wheel", (e) => {
          e.preventDefault();
          applyWheelZoom(e.deltaY, e.clientX, e.clientY, e.ctrlKey);
        }, { passive: false });

        shield.addEventListener("pointerdown", (e) => {
          // Middle-click, right-click, and left-click-with-pan-tool should pan
          // the canvas (matching the global pointerdown pan handler). Let those
          // bubble through unchanged.
          const shouldPan = e.button === 1 || e.button === 2 ||
            (e.button === 0 && activeTool === "pan");
          if (shouldPan) return;
          // Plain left-click: don't let this start an item drag, and don't hand
          // the gesture off to the iframe — once the iframe owned pointer
          // events, middle/right-click pan stopped working over a playing
          // video. Instead the click handler below forwards play/pause to
          // YouTube via the JS API, so the shield stays in front forever and
          // pan / wheel-zoom keep working.
          e.stopPropagation();
        });

        // The .bd-item drag handler listens for `mousedown`, not `pointerdown`,
        // so stopping pointerdown above isn't enough. Without these, Chrome
        // would start an item drag on click and never receive the matching
        // mouseup, leaving the node stuck to the cursor. Stop for every button
        // so middle/right-click panning doesn't also kick off a node drag.
        shield.addEventListener("mousedown", (e) => e.stopPropagation());
        shield.addEventListener("mouseup", (e) => e.stopPropagation());

        // Forward plain left-clicks to the iframe as a play/pause toggle via
        // the YouTube IFrame Player API. We stay on top, so pan/zoom always
        // route through us.
        shield.addEventListener("click", (e) => {
          if (e.button !== 0) return;
          if (activeTool === "pan") return;
          const iframe = shell.querySelector(".bd-embed-iframe");
          if (!iframe) return;
          const st = iframe.__ytState || (iframe.__ytState = { currentTime: 0, duration: 0, playing: false });
          postYouTubeCommand(iframe, st.playing ? "pauseVideo" : "playVideo");
          st.playing = !st.playing;
        });
      }
    }

  } else {
    // Preview mode
    el.classList.add("bd-auto-size-content");
    shell.classList.remove("bd-link-live");

    shell.innerHTML = `
      ${nodeObj.image ? `<img class="bd-bookmark-image" src="${nodeObj.image}" draggable="false" alt="${nodeObj.title || "Link preview"}">` : ""}
      <button type="button" class="bd-bookmark-live-btn" aria-label="View live embed" title="View live website">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
      </button>
      <div class="bd-bookmark-content">
        <h3 class="bd-bookmark-title">${nodeObj.title || "Link Preview"}</h3>
        <p class="bd-bookmark-desc">${nodeObj.description || ""}</p>
        <a class="bd-bookmark-link" href="${nodeObj.url}" target="_blank" rel="noreferrer" draggable="false">${nodeObj.url || "#"}</a>
      </div>
    `;

    const liveBtn = shell.querySelector(".bd-bookmark-live-btn");
    liveBtn?.addEventListener("mousedown", (e) => e.stopPropagation());
    liveBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      nodeObj.embedMode = "live";
      markBoardDirty();
      renderNode(nodeObj);
    });
  }
}

async function renderAppNode(nodeObj, el) {
  let shell = el.querySelector(".bd-app-shell");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "bd-app-shell";
    el.insertBefore(shell, el.firstChild);
  }

  // Load app config if missing
  if (!nodeObj.appConfig && nodeObj.source) {
    try {
      const res = await fetch(nodeObj.source);
      if (res.ok) {
        nodeObj.appConfig = await res.json();
      } else {
        nodeObj.appConfig = { appName: "Unknown App", description: "Failed to load manifest", icon: "⚠️" };
      }
      // Re-render once loaded
      renderAppNode(nodeObj, el);
      return;
    } catch (e) {
      console.error("Failed to load app session config", e);
      nodeObj.appConfig = { appName: "Error", description: "Network error", icon: "⚠️" };
      renderAppNode(nodeObj, el);
      return;
    }
  }

  const config = nodeObj.appConfig || { appName: "Loading...", icon: "⏳", description: "", url: "" };

  if (nodeObj.embedMode === "live" && config.url) {
    el.classList.remove("bd-auto-size-content");
    shell.classList.add("bd-app-live");
    
    // Default size for live embed
    if (nodeObj.width < 500) {
      nodeObj.width = 800;
      nodeObj.height = 600;
      el.style.width = `${nodeObj.width}px`;
      el.style.height = `${nodeObj.height}px`;
    }

    shell.innerHTML = `
      <div class="bd-app-header">
        <div class="bd-app-header-title">
          <span class="bd-app-icon">${escapeHtml(config.icon || "💻")}</span>
          <span class="bd-app-name">${escapeHtml(config.appName || "App")}</span>
        </div>
        <div class="bd-app-actions">
          <button type="button" class="bd-app-toggle-btn" aria-label="Minimize app" title="Minimize app">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
            Minimize
          </button>
        </div>
      </div>
      <iframe class="bd-app-iframe" src="${escapeHtml(config.url)}" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" loading="lazy"></iframe>
    `;

    const toggleBtn = shell.querySelector(".bd-app-toggle-btn");
    toggleBtn?.addEventListener("mousedown", (e) => e.stopPropagation());
    toggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      nodeObj.embedMode = "preview";
      markBoardDirty();
      renderNode(nodeObj);
    });

  } else {
    // Preview mode
    el.classList.add("bd-auto-size-content");
    shell.classList.remove("bd-app-live");

    shell.innerHTML = `
      <div class="bd-app-card">
        <div class="bd-app-card-icon">${escapeHtml(config.icon || "💻")}</div>
        <div class="bd-app-card-content">
          <h3 class="bd-app-card-title">${escapeHtml(config.appName || "App Session")}</h3>
          <p class="bd-app-card-desc">${escapeHtml(config.description || "")}</p>
        </div>
        <button type="button" class="bd-app-launch-btn" aria-label="Launch app" title="Launch app session">
          Launch App
        </button>
      </div>
    `;

    const launchBtn = shell.querySelector(".bd-app-launch-btn");
    launchBtn?.addEventListener("mousedown", (e) => e.stopPropagation());
    launchBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (config.url) {
        nodeObj.embedMode = "live";
        markBoardDirty();
        renderNode(nodeObj);
      }
    });
  }
}

function renderBoardPreviewNode(nodeObj, el) {
  let shell = el.querySelector(".bd-board-preview-shell");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "bd-board-preview-shell";
    el.insertBefore(shell, el.firstChild);
  }

  const previewTitle = String(nodeObj.title || nodeObj.boardSlug || "Board preview");
  const previewDescription = String(nodeObj.description || "");
  const previewSource = String(nodeObj.boardSource || "");
  const previewHref = String(nodeObj.boardHref || "");
  const cachedEntry = previewSource ? _boardPreviewStateCache.get(previewSource) : null;

  if (!cachedEntry && previewSource) {
    fetchBoardPreviewState(previewSource).then(() => {
      const currentNode = nodes.find((candidate) => candidate.id === nodeObj.id);
      const currentElement = getBoardElementById(nodeObj.id);
      if (currentNode && currentElement) {
        renderNode(currentNode);
      }
    });
  }

  const previewEntry =
    cachedEntry ||
    (!previewSource
      ? { status: "missing", totalNodes: 0, shapes: [] }
      : { status: "loading", totalNodes: 0, shapes: [] });

  const itemCount =
    previewEntry.status === "ready" || previewEntry.status === "empty"
      ? `${previewEntry.totalNodes} item${previewEntry.totalNodes === 1 ? "" : "s"}`
      : "";

  let stageContent = "";
  let statusLabel = itemCount;

  if (previewEntry.status === "ready") {
    stageContent = renderBoardPreviewSnapshotSvg(previewEntry);
  } else if (previewEntry.status === "empty") {
    stageContent = `<div class="bd-board-preview-status">Board is empty</div>`;
  } else if (previewEntry.status === "missing") {
    stageContent = `<div class="bd-board-preview-status">Board not available</div>`;
    statusLabel = "Missing source";
  } else if (previewEntry.status === "invalid") {
    stageContent = `<div class="bd-board-preview-status">Preview failed to load</div>`;
    statusLabel = "Load error";
  } else {
    stageContent = `<div class="bd-board-preview-status">Loading preview...</div>`;
    statusLabel = "Loading";
  }

  const metaParts = [nodeObj.boardSlug ? escapeHtml(nodeObj.boardSlug) : "", escapeHtml(statusLabel)]
    .filter(Boolean)
    .join(" / ");

  shell.innerHTML = `
    <div class="bd-board-preview-meta">${metaParts || "Linked board"}</div>
    <div class="bd-board-preview-copy">
      <h3 class="bd-board-preview-title">${escapeHtml(previewTitle)}</h3>
      ${
        previewDescription
          ? `<p class="bd-board-preview-desc">${escapeHtml(previewDescription)}</p>`
          : ""
      }
    </div>
    <div class="bd-board-preview-stage">
      ${stageContent}
    </div>
    <div class="bd-board-preview-actions">
      ${
        previewHref
          ? `<a class="board-preview-open-link bd-board-preview-link" href="${escapeHtml(
              previewHref
            )}" aria-label="Open ${escapeHtml(previewTitle)}" draggable="false">Open board</a>`
          : `<span class="bd-board-preview-action-disabled">No board page</span>`
      }
    </div>
  `;

  shell.querySelectorAll(".bd-board-preview-link").forEach((link) => {
    link.addEventListener("mousedown", (event) => event.stopPropagation());
    link.addEventListener("touchstart", (event) => event.stopPropagation(), { passive: true });
    link.addEventListener("click", (event) => event.stopPropagation());
  });

  syncBoardPreviewNodeSize(nodeObj, el);
}


// ---------------------------------------------------------------------------
// Markdown node renderer
// ---------------------------------------------------------------------------

function parseMarkdownToHtml(md) {
  // Trim and normalize line endings
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let inCode = false;
  let inList = false;
  let inBlockquote = false;

  const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };
  const closeBlockquote = () => { if (inBlockquote) { html.push("</blockquote>"); inBlockquote = false; } };

  const inlineEscape = (text) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const inlineMarkup = (text) =>
    inlineEscape(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  for (const rawLine of lines) {
    // Fenced code block
    if (rawLine.startsWith("```")) {
      closeList(); closeBlockquote();
      if (inCode) { html.push("</code></pre>"); inCode = false; }
      else { html.push("<pre><code>"); inCode = true; }
      continue;
    }
    if (inCode) { html.push(inlineEscape(rawLine)); continue; }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(rawLine.trim())) {
      closeList(); closeBlockquote(); html.push("<hr>"); continue;
    }

    // Headings
    const hMatch = rawLine.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      closeList(); closeBlockquote();
      const level = hMatch[1].length;
      html.push(`<h${level}>${inlineMarkup(hMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (rawLine.startsWith("> ")) {
      closeList();
      if (!inBlockquote) { html.push("<blockquote>"); inBlockquote = true; }
      html.push(`<p>${inlineMarkup(rawLine.slice(2))}</p>`);
      continue;
    }
    closeBlockquote();

    // Unordered list
    const liMatch = rawLine.match(/^[-*+]\s+(.+)/);
    if (liMatch) {
      if (!inList) { html.push("<ul>"); inList = true; }
      html.push(`<li>${inlineMarkup(liMatch[1])}</li>`);
      continue;
    }
    closeList();

    // Blank line
    if (!rawLine.trim()) { continue; }

    // Paragraph
    html.push(`<p>${inlineMarkup(rawLine)}</p>`);
  }

  closeList(); closeBlockquote();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

function renderMarkdownLineToHtml(rawLine) {
  // Inline markup only. Block-level prefixes (headings, list bullet, blockquote)
  // are handled by class hooks on the line wrapper so the line stays a single DOM
  // element that the caret can sit inside.
  const escapeAndInline = (text) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  if (!rawLine.trim()) return "&nbsp;";

  const heading = rawLine.match(/^(#{1,6})\s+(.+)$/);
  if (heading) return escapeAndInline(heading[2]);

  const bullet = rawLine.match(/^(\s*)([-*+])\s+(.+)$/);
  if (bullet) return `<span class="bd-md-line-bullet">•</span>${escapeAndInline(bullet[3])}`;

  const ordered = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
  if (ordered) return `<span class="bd-md-line-bullet">${ordered[2]}.</span>${escapeAndInline(ordered[3])}`;

  const quote = rawLine.match(/^>\s?(.*)$/);
  if (quote) return escapeAndInline(quote[1]);

  if (/^[-*_]{3,}$/.test(rawLine.trim())) return '<span class="bd-md-line-rule"></span>';

  return escapeAndInline(rawLine);
}

function getMarkdownLineClass(rawLine) {
  if (!rawLine.trim()) return "bd-md-line bd-md-line--blank";
  const heading = rawLine.match(/^(#{1,6})\s+/);
  if (heading) return `bd-md-line bd-md-line--h${heading[1].length}`;
  if (/^(\s*)([-*+])\s+/.test(rawLine)) return "bd-md-line bd-md-line--li";
  if (/^(\s*)(\d+)\.\s+/.test(rawLine)) return "bd-md-line bd-md-line--li bd-md-line--ol";
  if (/^>\s?/.test(rawLine)) return "bd-md-line bd-md-line--quote";
  if (/^[-*_]{3,}$/.test(rawLine.trim())) return "bd-md-line bd-md-line--hr";
  return "bd-md-line";
}

function getMarkdownLineIndent(rawLine) {
  // Check for bullet or ordered list with leading whitespace
  const listMatch = rawLine.match(/^(\s*)([-*+]|\d+\.)\s/);
  if (listMatch && listMatch[1].length > 0) {
    return Math.floor(listMatch[1].length / 2);
  }
  return 0;
}

function applyMarkdownLineIndent(lineEl, rawLine) {
  const indent = getMarkdownLineIndent(rawLine);
  const bullet = lineEl.querySelector(".bd-md-line-bullet");
  if (indent > 0) {
    lineEl.style.paddingLeft = `${18 + indent * 18}px`;
    // Also move the bullet to match the indent
    if (bullet) {
      bullet.style.left = `${4 + indent * 18}px`;
    }
  } else {
    lineEl.style.paddingLeft = "";
    if (bullet) {
      bullet.style.left = "";
    }
  }
}

// Visible-text offset from the start of the rendered line up to (container, offset).
// Skips text inside bullet/marker spans (those characters are synthetic and have
// no counterpart in the raw markdown source).
function computeVisibleOffsetInLine(lineEl, container, offset) {
  // Click landed inside a synthetic bullet/marker span → caret at start of content.
  let ancestor = container;
  while (ancestor && ancestor !== lineEl) {
    if (ancestor.classList?.contains("bd-md-line-bullet")) return 0;
    ancestor = ancestor.parentNode;
  }
  let visible = 0;
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentNode?.classList?.contains("bd-md-line-bullet")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  let node;
  while ((node = walker.nextNode())) {
    if (node === container) return visible + offset;
    visible += node.textContent.length;
  }
  return visible;
}

// Build a per-visible-char map back to raw-string offsets for a markdown line.
// Mirrors what `renderMarkdownLineToHtml` strips: leading bullet/heading/quote
// prefix and inline `**bold**`, `*em*`, `_em_`, `` `code` ``, `[text](url)`.
function buildVisibleToRawMap(raw) {
  let prefixRawLen = 0;
  const bullet = raw.match(/^(\s*)([-*+])\s+/);
  const ordered = raw.match(/^(\s*)(\d+)\.\s+/);
  const heading = raw.match(/^(#{1,6})\s+/);
  const quote = raw.match(/^>\s?/);
  if (bullet) prefixRawLen = bullet[0].length;
  else if (ordered) prefixRawLen = ordered[0].length;
  else if (heading) prefixRawLen = heading[0].length;
  else if (quote) prefixRawLen = quote[0].length;

  const body = raw.slice(prefixRawLen);
  const rawOffsets = [];
  let visible = "";
  let i = 0;
  const pushSlice = (from, to) => {
    for (let j = from; j < to; j++) {
      visible += body[j];
      rawOffsets.push(prefixRawLen + j);
    }
  };
  while (i < body.length) {
    const c = body[i];
    if (c === "*" && body[i + 1] === "*") {
      const close = body.indexOf("**", i + 2);
      if (close !== -1) { pushSlice(i + 2, close); i = close + 2; continue; }
    }
    if (c === "*" || c === "_") {
      const close = body.indexOf(c, i + 1);
      if (close !== -1 && close !== i + 1) { pushSlice(i + 1, close); i = close + 1; continue; }
    }
    if (c === "`") {
      const close = body.indexOf("`", i + 1);
      if (close !== -1) { pushSlice(i + 1, close); i = close + 1; continue; }
    }
    if (c === "[") {
      const closeBracket = body.indexOf("]", i + 1);
      if (closeBracket !== -1 && body[closeBracket + 1] === "(") {
        const closeParen = body.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) { pushSlice(i + 1, closeBracket); i = closeParen + 1; continue; }
      }
    }
    visible += c;
    rawOffsets.push(prefixRawLen + i);
    i++;
  }
  return { prefixRawLen, visible, rawOffsets };
}

function visibleToRawOffset(raw, visibleOffset) {
  const { prefixRawLen, rawOffsets } = buildVisibleToRawMap(raw);
  if (visibleOffset <= 0) return prefixRawLen;
  if (visibleOffset >= rawOffsets.length) return raw.length;
  return rawOffsets[visibleOffset];
}

function buildMarkdownLineEl(rawLine) {
  const lineEl = document.createElement("div");
  lineEl.className = getMarkdownLineClass(rawLine);
  lineEl.dataset.raw = rawLine;
  lineEl.innerHTML = renderMarkdownLineToHtml(rawLine);
  applyMarkdownLineIndent(lineEl, rawLine);
  return lineEl;
}

function setMarkdownLineRendered(lineEl) {
  const raw = lineEl.dataset.raw ?? lineEl.textContent ?? "";
  lineEl.dataset.raw = raw;
  lineEl.className = getMarkdownLineClass(raw);
  lineEl.innerHTML = renderMarkdownLineToHtml(raw);
  lineEl.classList.remove("bd-md-line--active");
  applyMarkdownLineIndent(lineEl, raw);
}

function setMarkdownLineRaw(lineEl) {
  const raw = lineEl.dataset.raw ?? lineEl.textContent ?? "";
  lineEl.dataset.raw = raw;
  lineEl.className = "bd-md-line bd-md-line--active";
  lineEl.textContent = raw;
  // Clear indent style in raw mode - the spaces are visible in the text
  lineEl.style.paddingLeft = "";
}

function readMarkdownEditorContent(body) {
  const lines = [];
  body.querySelectorAll(".bd-md-line").forEach((line) => {
    const raw = line.classList.contains("bd-md-line--active")
      ? (line.textContent || "")
      : (line.dataset.raw ?? "");
    lines.push(raw);
  });
  return lines.join("\n");
}

const _markdownSaveTimers = new WeakMap();

function scheduleMarkdownSave(nodeObj, body) {
  if (!nodeObj || !body) return;
  const existing = _markdownSaveTimers.get(nodeObj);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    _markdownSaveTimers.delete(nodeObj);
    void saveMarkdownNodeFile(nodeObj, body);
  }, 600);
  _markdownSaveTimers.set(nodeObj, timer);
}

async function saveMarkdownNodeFile(nodeObj, body) {
  // _rawMarkdown is the canonical inline store. Update it first so the
  // canvas-level save captures the latest content even when the sidecar
  // disk write is skipped or unavailable.
  const content = readMarkdownEditorContent(body);
  nodeObj._rawMarkdown = content;
  // Lazy-stamp identity for legacy notes that predate frontmatter so future
  // re-imports of a downloaded copy can still match.
  if (!nodeObj.markdownId) {
    Object.assign(nodeObj, newMarkdownIdentity());
  } else {
    nodeObj.markdownUpdatedAt = new Date().toISOString();
  }
  if (typeof markBoardDirty === "function") markBoardDirty();

  // Once the host has shown it can't accept the sidecar POST (typical static
  // deploy: 405 Method Not Allowed), don't keep firing the request on every
  // debounce. Local content is already persisted via the canvas-level save.
  if (!markdownSidecarSupported) return;

  const filePath = String(nodeObj?.file || "");
  if (!filePath) return;
  if (/^(?:blob:|data:|https?:|file:|idb:)/i.test(filePath)) return;

  const filename = filePath.split("/").pop() || "note.md";
  const sourcePath = filePath.replace(/^\//, "");
  const result = await trySaveMarkdownSidecar({ filename, path: sourcePath, content });
  if (!result) {
    markdownSidecarSupported = false;
    showToolbarToast("Saved in this browser only. Static host can't write the .md file back to disk.", "info");
  }
}

function attachMarkdownEditor(nodeObj, body) {
  body.contentEditable = "true";
  body.spellcheck = true;
  body.classList.add("bd-markdown-editor");

  const findLineFromNode = (node) => {
    let current = node;
    while (current && current !== body) {
      if (current.nodeType === 1 && current.classList?.contains("bd-md-line")) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  };

  const clearActiveLine = () => {
    const previous = body.querySelector(".bd-md-line--active");
    if (previous) {
      previous.dataset.raw = previous.textContent || "";
      setMarkdownLineRendered(previous);
      scheduleMarkdownSave(nodeObj, body);
    }
  };

  const setActiveLine = (newActive) => {
    const previous = body.querySelector(".bd-md-line--active");
    if (previous && previous !== newActive) {
      // commit text edited while active
      previous.dataset.raw = previous.textContent || "";
      setMarkdownLineRendered(previous);
      scheduleMarkdownSave(nodeObj, body);
    }
    if (newActive && !newActive.classList.contains("bd-md-line--active")) {
      setMarkdownLineRaw(newActive);
      // Ensure body has focus for keyboard events
      if (!body.contains(document.activeElement)) {
        body.focus();
      }
    }
  };

  // Suppress selectionchange's auto-activation/clearing during click-driven
  // activation, where we manage selection ourselves across the raw-mode swap.
  let _suppressSelectionChange = false;

  const handleSelectionChange = () => {
    if (!body.isConnected) {
      document.removeEventListener("selectionchange", handleSelectionChange);
      return;
    }
    if (_suppressSelectionChange) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const anchor = sel.anchorNode;
    if (!anchor || !body.contains(anchor)) {
      // Selection moved outside - clear active line
      clearActiveLine();
      return;
    }
    const lineEl = findLineFromNode(anchor);
    if (!lineEl) return;
    if (!lineEl.classList.contains("bd-md-line--active")) {
      setActiveLine(lineEl);
    }
  };

  document.addEventListener("selectionchange", handleSelectionChange);

  // Clear active line when focus leaves the editor
  body.addEventListener("focusout", (e) => {
    // Check if focus is moving outside the body
    if (!body.contains(e.relatedTarget)) {
      clearActiveLine();
    }
  });

  body.addEventListener("input", () => {
    const active = body.querySelector(".bd-md-line--active");
    if (active) {
      active.dataset.raw = active.textContent || "";
    }
    scheduleMarkdownSave(nodeObj, body);
  });

  // Handle paste to properly parse multi-line markdown
  body.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    if (!text) return;

    const sel = window.getSelection();
    const active = body.querySelector(".bd-md-line--active");

    const lines = text.split(/\r\n|\r|\n/);

    if (lines.length === 1) {
      // Single line paste - insert at cursor
      document.execCommand("insertText", false, lines[0]);
      return;
    }

    // Multi-line paste
    if (active) {
      const offset = sel?.anchorOffset ?? (active.textContent || "").length;
      const currentText = active.textContent || "";
      const before = currentText.slice(0, offset);
      const after = currentText.slice(offset);

      // Update current line with first pasted line appended
      active.textContent = before + lines[0];
      active.dataset.raw = active.textContent;

      // Insert middle + last pasted lines (all rendered)
      let lastInserted = active;
      for (let i = 1; i < lines.length; i++) {
        const newLine = buildMarkdownLineEl(lines[i]);
        lastInserted.after(newLine);
        lastInserted = newLine;
      }

      // If the original line had trailing text after the caret, append a new
      // line carrying that trailing text. Otherwise append a fresh empty line.
      const trailingLine = buildMarkdownLineEl(after);
      lastInserted.after(trailingLine);

      // Render all pasted lines (formatting visible immediately) and place
      // caret on the trailing line in raw mode so the user can keep typing.
      setMarkdownLineRendered(active);
      setMarkdownLineRaw(trailingLine);
      const range = document.createRange();
      if (trailingLine.firstChild) {
        range.setStart(trailingLine.firstChild, 0);
      } else {
        range.setStart(trailingLine, 0);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // No active line - append all lines
      lines.forEach((line) => body.appendChild(buildMarkdownLineEl(line)));
    }
    scheduleMarkdownSave(nodeObj, body);
  });

  body.addEventListener("keydown", (event) => {
    event.stopPropagation();
    const active = body.querySelector(".bd-md-line--active");
    if (!active) return;

    // Tab key - indent/outdent (works on any line, focuses on bullets)
    if (event.key === "Tab") {
      event.preventDefault();
      const sel = window.getSelection();
      const cursorOffset = sel?.anchorOffset ?? 0;
      const text = active.textContent || "";

      if (event.shiftKey) {
        // Outdent - remove up to 2 leading spaces
        const leadingSpaces = text.match(/^(\s*)/)?.[1] || "";
        const removeCount = Math.min(2, leadingSpaces.length);
        if (removeCount > 0) {
          active.textContent = text.slice(removeCount);
          active.dataset.raw = active.textContent;
          // Adjust cursor position
          const newOffset = Math.max(0, cursorOffset - removeCount);
          if (active.firstChild) {
            const range = document.createRange();
            range.setStart(active.firstChild, Math.min(newOffset, active.textContent.length));
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          scheduleMarkdownSave(nodeObj, body);
        }
      } else {
        // Indent - add 2 spaces at start
        active.textContent = "  " + text;
        active.dataset.raw = active.textContent;
        // Adjust cursor position
        const newOffset = cursorOffset + 2;
        if (active.firstChild) {
          const range = document.createRange();
          range.setStart(active.firstChild, Math.min(newOffset, active.textContent.length));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        scheduleMarkdownSave(nodeObj, body);
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const sel = window.getSelection();
      const offset = sel?.anchorOffset ?? (active.textContent || "").length;
      const text = active.textContent || "";
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      active.textContent = before;
      active.dataset.raw = before;
      setMarkdownLineRendered(active);

      // Detect bullet/list pattern to continue on new line
      let newLineContent = after;
      const bulletMatch = text.match(/^(\s*)([-*+])\s/);
      const orderedMatch = text.match(/^(\s*)(\d+)\.\s/);
      if (bulletMatch && after === "") {
        // If just pressing enter on empty bullet, don't add another bullet
        // This lets users exit bullet mode by pressing Enter on empty bullet
        const bulletContent = text.replace(/^(\s*)([-*+])\s*/, "");
        if (bulletContent.trim()) {
          newLineContent = bulletMatch[1] + bulletMatch[2] + " " + after;
        }
      } else if (bulletMatch) {
        newLineContent = bulletMatch[1] + bulletMatch[2] + " " + after;
      } else if (orderedMatch && after === "") {
        const orderedContent = text.replace(/^(\s*)(\d+)\.\s*/, "");
        if (orderedContent.trim()) {
          const nextNum = parseInt(orderedMatch[2], 10) + 1;
          newLineContent = orderedMatch[1] + nextNum + ". " + after;
        }
      } else if (orderedMatch) {
        const nextNum = parseInt(orderedMatch[2], 10) + 1;
        newLineContent = orderedMatch[1] + nextNum + ". " + after;
      }

      const newLine = buildMarkdownLineEl(newLineContent);
      active.after(newLine);
      setMarkdownLineRaw(newLine);
      const range = document.createRange();
      // Position cursor after the bullet prefix if present
      const cursorPos = newLineContent.length - after.length;
      if (newLine.firstChild) {
        range.setStart(newLine.firstChild, cursorPos);
      } else {
        range.setStart(newLine, 0);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      scheduleMarkdownSave(nodeObj, body);
      return;
    }

    // Whole-line removal helper: delete the active line entirely (not merge it
    // into the previous), placing caret at end of previous line or start of next.
    const removeActiveLineEntirely = (sel) => {
      const prev = active.previousElementSibling;
      const next = active.nextElementSibling;
      active.remove();
      scheduleMarkdownSave(nodeObj, body);
      if (prev?.classList?.contains("bd-md-line")) {
        const prevText = prev.dataset.raw ?? prev.textContent ?? "";
        setMarkdownLineRaw(prev);
        const newRange = document.createRange();
        if (prev.firstChild) newRange.setStart(prev.firstChild, prevText.length);
        else newRange.setStart(prev, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } else if (next?.classList?.contains("bd-md-line")) {
        setMarkdownLineRaw(next);
        const newRange = document.createRange();
        newRange.setStart(next, 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    };

    const fullLineSelected = (sel) => {
      if (!sel || sel.rangeCount === 0) return false;
      const text = active.textContent || "";
      if (text.length === 0) return false;
      const selectedText = sel.getRangeAt(0).toString();
      return selectedText === text;
    };

    if (event.key === "Backspace") {
      const sel = window.getSelection();
      // Whole line selected: drop the line entirely (don't merge upward).
      if (fullLineSelected(sel)) {
        event.preventDefault();
        removeActiveLineEntirely(sel);
        return;
      }
      const offset = sel?.anchorOffset ?? 0;
      if (offset === 0 && active.previousElementSibling?.classList?.contains("bd-md-line")) {
        event.preventDefault();
        const prev = active.previousElementSibling;
        const prevText = prev.dataset.raw ?? prev.textContent ?? "";
        const currentText = active.textContent || "";
        active.remove();
        prev.textContent = prevText + currentText;
        prev.dataset.raw = prev.textContent;
        setMarkdownLineRaw(prev);
        const range = document.createRange();
        if (prev.firstChild) {
          range.setStart(prev.firstChild, prevText.length);
        } else {
          range.setStart(prev, 0);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        scheduleMarkdownSave(nodeObj, body);
        return;
      }
    }

    // Delete key - whole-line removal (same semantics as full-line Backspace).
    if (event.key === "Delete") {
      const sel = window.getSelection();
      if (fullLineSelected(sel)) {
        event.preventDefault();
        removeActiveLineEntirely(sel);
        return;
      }
    }

    // Arrow Up - move to previous line, cursor at end
    if (event.key === "ArrowUp") {
      const prev = active.previousElementSibling;
      if (prev?.classList?.contains("bd-md-line")) {
        event.preventDefault();
        const sel = window.getSelection();
        setActiveLine(prev);
        const prevText = prev.textContent || "";
        const range = document.createRange();
        if (prev.firstChild) {
          range.setStart(prev.firstChild, prevText.length);
        } else {
          range.setStart(prev, 0);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }

    // Arrow Down - move to next line, cursor at end
    if (event.key === "ArrowDown") {
      const next = active.nextElementSibling;
      if (next?.classList?.contains("bd-md-line")) {
        event.preventDefault();
        const sel = window.getSelection();
        setActiveLine(next);
        const nextText = next.textContent || "";
        const range = document.createRange();
        if (next.firstChild) {
          range.setStart(next.firstChild, nextText.length);
        } else {
          range.setStart(next, 0);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
  });

  // Place caret at (x, y) within the now-active raw line, falling back to end.
  const placeCaretAtPoint = (lineEl, x, y) => {
    const sel = window.getSelection();
    if (!sel) return;
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
      }
    }
    if (!range || !lineEl.contains(range.startContainer)) {
      // Fallback: caret at end of the line text
      range = document.createRange();
      const text = lineEl.textContent || "";
      if (lineEl.firstChild) {
        range.setStart(lineEl.firstChild, text.length);
      } else {
        range.setStart(lineEl, 0);
      }
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // Click activation: when clicking on a rendered (inactive) line we must
  // (a) switch it to raw mode, which destroys the rendered DOM children, and
  // (b) re-place the caret at the original click coordinates, since the
  // browser's default mousedown caret-placement targets nodes that no longer
  // exist after the textContent reset.
  body.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // only primary button

    const itemEl = body.closest?.(".bd-item");
    const wasSelected = itemEl?.classList.contains("selected");

    // First-click on an unselected markdown window: don't activate any line
    // and don't intercept the event. Let the bd-item drag handler claim this
    // mousedown so click-and-drag moves the window. A subsequent click on
    // the now-selected item activates the line for editing.
    if (itemEl && !wasSelected) {
      e.preventDefault(); // suppress contenteditable's default caret placement
      return;
    }

    e.stopPropagation();

    const lineEl = findLineFromNode(e.target);

    // Click outside any line (or on already-active line): native behavior.
    if (!lineEl || lineEl.classList.contains("bd-md-line--active")) {
      if (!body.contains(document.activeElement)) {
        // Defer focus so it doesn't disrupt the browser's caret placement
        requestAnimationFrame(() => body.focus({ preventScroll: true }));
      }
      return;
    }

    // Inactive line: take over caret placement.
    const x = e.clientX;
    const y = e.clientY;
    const detail = e.detail;

    // Compute the raw-text offset corresponding to the click BEFORE swapping
    // the line into raw mode. The raw text contains markdown markers (e.g.
    // `**` around bold) so the same pixel X maps to a different character once
    // the layout reflows. caretRangeFromPoint after the swap lands on the
    // wrong character for any line containing inline formatting.
    let targetRawOffset = -1;
    if (document.caretRangeFromPoint) {
      const preRange = document.caretRangeFromPoint(x, y);
      if (preRange && lineEl.contains(preRange.startContainer)) {
        const visibleOffset = computeVisibleOffsetInLine(
          lineEl, preRange.startContainer, preRange.startOffset
        );
        targetRawOffset = visibleToRawOffset(lineEl.dataset.raw || "", visibleOffset);
      }
    }

    e.preventDefault();
    _suppressSelectionChange = true;
    setActiveLine(lineEl);
    if (!body.contains(document.activeElement)) {
      body.focus({ preventScroll: true });
    }

    requestAnimationFrame(() => {
      // Re-assert focus inside rAF — without it, manually-set selections
      // sometimes don't render a visible caret in contenteditable hosts even
      // though the position is correct.
      if (document.activeElement !== body) body.focus({ preventScroll: true });
      const sel = window.getSelection();
      if (sel) {
        if (detail >= 3) {
          // Triple-click: select whole line content
          const range = document.createRange();
          range.selectNodeContents(lineEl);
          sel.removeAllRanges();
          sel.addRange(range);
        } else if (targetRawOffset >= 0 && lineEl.firstChild) {
          // Place caret at the raw offset we mapped from the rendered click.
          const text = lineEl.textContent || "";
          const offset = Math.max(0, Math.min(targetRawOffset, text.length));
          // Use Selection.collapse() — more explicit caret-placement API than
          // addRange of a collapsed range, and reliably renders the caret.
          sel.removeAllRanges();
          sel.collapse(lineEl.firstChild, offset);
        } else {
          // Fallback if the mapping failed (e.g. lineEl had no caret-from-point hit).
          placeCaretAtPoint(lineEl, x, y);
        }
      }
      _suppressSelectionChange = false;
    });
  });

  body.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });

  // Handle clicks on links in rendered (non-active) lines
  body.addEventListener("click", (e) => {
    const target = e.target;

    if (target.tagName === "A" && target.href) {
      const lineEl = findLineFromNode(target);
      // Only follow link if the line is NOT active (in rendered mode)
      if (lineEl && !lineEl.classList.contains("bd-md-line--active")) {
        e.preventDefault();
        e.stopPropagation();
        window.open(target.href, "_blank", "noopener,noreferrer");
      }
    }
  });

  // Click-away: clicking outside this editor's body should fully exit edit
  // mode. focusout alone misses the case where the click target (e.g. the
  // canvas viewport) doesn't accept focus, leaving the body "active" forever.
  // Fully exit editing: clear active line, blur body, AND drop any selection
  // still pointing inside the editor — otherwise contenteditable keeps showing
  // a caret at the start of body even after blur (cursor "stuck at start").
  const exitEditing = () => {
    clearActiveLine();
    if (document.activeElement && body.contains(document.activeElement)) {
      document.activeElement.blur?.();
    }
    const sel = window.getSelection();
    if (sel && sel.anchorNode && body.contains(sel.anchorNode)) {
      sel.removeAllRanges();
    }
  };

  const handleOutsidePointerDown = (e) => {
    if (!body.isConnected) {
      window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      return;
    }
    if (!(e.target instanceof Node)) return;
    if (body.contains(e.target)) return;
    if (!body.querySelector(".bd-md-line--active") && document.activeElement !== body) return;
    exitEditing();
  };
  window.addEventListener("pointerdown", handleOutsidePointerDown, true);

  // ESC mirrors click-away: exit edit mode. Don't stopPropagation — the
  // window-level ESC handler (below in the file) also runs and clears
  // canvas-wide selection (`.bd-item.selected`), which is what the user wants.
  const handleEscape = (e) => {
    if (!body.isConnected) {
      window.removeEventListener("keydown", handleEscape, true);
      return;
    }
    if (e.key !== "Escape") return;
    if (!body.contains(document.activeElement) && !body.querySelector(".bd-md-line--active")) return;
    e.preventDefault();
    exitEditing();
  };
  window.addEventListener("keydown", handleEscape, true);

  // Wheel routing:
  //  - Detached editor (no .bd-item parent — e.g. fullscreen view): always
  //    scroll the body. No canvas behind it to zoom, and we still want pinch
  //    suppressed so the browser doesn't page-zoom.
  //  - Pinch-zoom (ctrlKey on wheel — how trackpads signal pinch): route to
  //    canvas zoom. Without preventDefault the browser page-zooms the tab.
  //  - Plain wheel + editing (active line + focused) OR host bd-item is
  //    .selected: native scroll inside the body, don't bubble to canvas zoom.
  //  - Plain wheel + otherwise: suppress native body scroll AND let wheel
  //    bubble so the canvas zoom handler picks it up.
  body.addEventListener("wheel", (e) => {
    const itemEl = body.closest(".bd-item");
    if (!itemEl) {
      if (e.ctrlKey) e.preventDefault(); // suppress page-zoom; native body scroll handles deltaY
      e.stopPropagation();
      return;
    }
    if (e.ctrlKey) {
      e.preventDefault();
      return; // let bubble — viewport wheel handler does the canvas zoom
    }
    const hasActiveLine = body.querySelector(".bd-md-line--active");
    const isFocused = body.contains(document.activeElement) || document.activeElement === body;
    const itemSelected = itemEl.classList.contains("selected");
    if ((hasActiveLine && isFocused) || itemSelected) {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
  }, { passive: false });

  // Update overflow indicator when scrolling or content changes
  const updateOverflowIndicator = () => {
    const hasOverflow = body.scrollHeight > body.clientHeight + 2;
    const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
    body.classList.toggle("bd-markdown-body--has-overflow", hasOverflow && !atBottom);
  };
  body.addEventListener("scroll", updateOverflowIndicator);

  // Watch for content changes to update overflow indicator. Observe the parent
  // bd-item too — resizing the canvas node sometimes adjusts container layout
  // without resizing the body's content box directly, leaving the gradient
  // stale (visible when no overflow / hidden when overflow exists).
  const resizeObserver = new ResizeObserver(() => {
    requestAnimationFrame(updateOverflowIndicator);
  });
  resizeObserver.observe(body);
  const itemEl = body.closest?.(".bd-item");
  if (itemEl) resizeObserver.observe(itemEl);

  // Also update on input to catch content changes
  body.addEventListener("input", () => {
    requestAnimationFrame(updateOverflowIndicator);
  });

  // Initial check after content loads
  requestAnimationFrame(updateOverflowIndicator);
  // Additional delayed check for async content
  setTimeout(updateOverflowIndicator, 100);
}

function bindMarkdownTitleRename(titleEl, nodeObj) {
  titleEl.title = "Double-click to rename";
  const stopMd = (e) => e.stopPropagation();
  // The span itself does NOT stopPropagation on mousedown — single-click on
  // the title should be claimed by the bd-item drag handler so click-and-drag
  // moves the window. Editing is gated to dblclick only.
  titleEl.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const current = nodeObj.title || titleEl.textContent || "";
    const input = document.createElement("input");
    input.type = "text";
    input.value = current;
    input.className = "bd-markdown-title bd-markdown-title-input";
    input.style.cssText = "background:transparent;color:inherit;font:inherit;border:1px solid rgba(63,218,202,0.4);border-radius:3px;padding:1px 4px;min-width:0;";
    input.addEventListener("mousedown", stopMd);
    input.addEventListener("click", stopMd);
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const next = (input.value || "").trim() || current;
      const span = document.createElement("span");
      span.className = "bd-markdown-title";
      span.textContent = next;
      input.replaceWith(span);
      if (next !== nodeObj.title) {
        nodeObj.title = next;
        if (typeof markBoardDirty === "function") markBoardDirty();
      }
      bindMarkdownTitleRename(span, nodeObj);
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); input.blur(); }
      if (ev.key === "Escape") { ev.preventDefault(); input.value = current; input.blur(); }
    });
  });
}

function renderMarkdownNode(nodeObj, el) {
  let shell = el.querySelector(".bd-markdown-shell");
  if (shell) return;

  shell = document.createElement("div");
  shell.className = "bd-markdown-shell";
  el.insertBefore(shell, el.firstChild);

  const filePath = String(nodeObj.file || "");
  const title = String(nodeObj.title || (filePath.split("/").pop()?.replace(/\.md$/i, "") || "Note"));
  const href = String(nodeObj.href || "");

  const header = document.createElement("div");
  header.className = "bd-markdown-header";
  header.innerHTML = `
    <svg class="bd-markdown-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    <span class="bd-markdown-title">${escapeHtml(title)}</span>
    <button type="button" class="bd-markdown-download-btn" aria-label="Download markdown" title="Download markdown">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    </button>
    <button type="button" class="bd-markdown-fullscreen-btn" aria-label="Open markdown" title="Open markdown">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
    </button>
  `;
  shell.appendChild(header);

  // Download button handler
  const downloadBtn = header.querySelector(".bd-markdown-download-btn");
  downloadBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    downloadMarkdownNode(nodeObj);
  });
  downloadBtn?.addEventListener("mousedown", (e) => e.stopPropagation());

  // Fullscreen button handler
  const fullscreenBtn = header.querySelector(".bd-markdown-fullscreen-btn");
  fullscreenBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    openMarkdownFullscreen(nodeObj, nodeObj.title || title, filePath);
  });
  fullscreenBtn?.addEventListener("mousedown", (e) => e.stopPropagation());

  // Double-click the title to rename in place.
  const titleEl = header.querySelector(".bd-markdown-title");
  if (titleEl && !isPreviewMode) {
    bindMarkdownTitleRename(titleEl, nodeObj);
  }

  const body = document.createElement("div");
  body.className = "bd-markdown-body";
  shell.appendChild(body);

  const renderEditorBody = (text) => {
    nodeObj._rawMarkdown = text;
    body.textContent = "";
    const lines = text.split("\n");
    if (lines.length === 0) lines.push("");
    lines.forEach((line) => body.appendChild(buildMarkdownLineEl(line)));
    // Editor attaches regardless of filePath — _rawMarkdown is the canonical
    // store; the file sidecar is an optional convenience for git/external edits.
    if (!isPreviewMode) attachMarkdownEditor(nodeObj, body);
  };

  // Prefer inline content when present — string of any length, including "".
  // Handles canvases where `file` is a stale path, transient blob: URL, or
  // missing on disk. Inline _rawMarkdown is the canonical, portable store.
  if (typeof nodeObj._rawMarkdown === "string") {
    renderEditorBody(nodeObj._rawMarkdown);
    return;
  }

  // No inline content; try fetching from file path if any.
  if (filePath) {
    body.innerHTML = `<p class="bd-markdown-loading">Loading…</p>`;
    fetch(filePath)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.text();
      })
      .then((text) => {
        renderEditorBody(text.replace(/\r\n?/g, "\n"));
      })
      .catch(() => {
        // Sidecar missing or unreachable — start a fresh editor so the user
        // can fill it in. Save will persist the new content inline.
        renderEditorBody("");
      });
    return;
  }

  // No file path and no inline content — start a fresh editor.
  renderEditorBody("");
}

// ---------------------------------------------------------------------------
// Fullscreen markdown viewer
// ---------------------------------------------------------------------------

let _markdownFullscreenEl = null;

function deriveMarkdownDownloadFilename(nodeObj) {
  // Prefer the current node title so renames take effect for download.
  // Fall back to the on-disk filename, then to "note".
  const liveTitle = String(nodeObj?.title || "").trim();
  if (liveTitle) return sanitizeMarkdownFilename(`${liveTitle}.md`);
  const filePathBase = String(nodeObj?.file || "").split("/").pop() || "";
  if (filePathBase) return sanitizeMarkdownFilename(filePathBase);
  return sanitizeMarkdownFilename("note.md");
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadMarkdownNode(nodeObj) {
  if (!nodeObj) return;
  let content = typeof nodeObj._rawMarkdown === "string" ? nodeObj._rawMarkdown : null;
  if (content == null) {
    const filePath = String(nodeObj.file || "");
    if (filePath && !/^(?:blob:|data:|idb:)/i.test(filePath)) {
      try {
        const res = await fetch(filePath, { cache: "no-store" });
        if (res.ok) content = await res.text();
      } catch {}
    }
  }
  if (content == null) {
    showToolbarToast("No markdown content to download.", "error");
    return;
  }
  // Stamp identity if the note never had one, so the download carries it and
  // a later re-import can match the file back to this node.
  if (!nodeObj.markdownId) Object.assign(nodeObj, newMarkdownIdentity());
  const serialized = serializeMarkdownWithFrontmatter(nodeObj, content);
  const filename = deriveMarkdownDownloadFilename(nodeObj);
  triggerBlobDownload(new Blob([serialized], { type: "text/markdown;charset=utf-8" }), filename);
}

function openMarkdownFullscreen(nodeObj, title, filePath) {
  // Create fullscreen overlay if it doesn't exist
  if (!_markdownFullscreenEl) {
    _markdownFullscreenEl = document.createElement("div");
    _markdownFullscreenEl.className = "bd-markdown-fullscreen";
    _markdownFullscreenEl.innerHTML = `
      <div class="bd-markdown-fullscreen-backdrop"></div>
      <div class="bd-markdown-fullscreen-container">
        <div class="bd-markdown-fullscreen-header">
          <h2 class="bd-markdown-fullscreen-title"></h2>
          <button type="button" class="bd-markdown-fullscreen-download" aria-label="Download markdown" title="Download markdown">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button type="button" class="bd-markdown-fullscreen-close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="bd-markdown-fullscreen-body bd-markdown-body"></div>
      </div>
    `;
    document.body.appendChild(_markdownFullscreenEl);

    // Close handlers
    const closeBtn = _markdownFullscreenEl.querySelector(".bd-markdown-fullscreen-close");
    const backdrop = _markdownFullscreenEl.querySelector(".bd-markdown-fullscreen-backdrop");
    const downloadBtnFs = _markdownFullscreenEl.querySelector(".bd-markdown-fullscreen-download");
    closeBtn?.addEventListener("click", closeMarkdownFullscreen);
    backdrop?.addEventListener("click", closeMarkdownFullscreen);
    downloadBtnFs?.addEventListener("click", () => {
      if (_fullscreenNodeObj) downloadMarkdownNode(_fullscreenNodeObj);
    });
    _markdownFullscreenEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMarkdownFullscreen();
    });
  }

  // Update content
  const titleEl = _markdownFullscreenEl.querySelector(".bd-markdown-fullscreen-title");
  const bodyEl = _markdownFullscreenEl.querySelector(".bd-markdown-fullscreen-body");

  // Bind the node early so the download button works even before the body
  // finishes loading. renderFullscreenMarkdown will overwrite this with the
  // same node once it's done.
  _fullscreenNodeObj = nodeObj;

  titleEl.textContent = title;
  bodyEl.innerHTML = `<p class="bd-markdown-loading">Loading…</p>`;

  // Show fullscreen
  _markdownFullscreenEl.classList.add("is-open");
  _markdownFullscreenEl.hidden = false;
  document.body.style.overflow = "hidden";

  // Load and render markdown content
  if (nodeObj._rawMarkdown) {
    renderFullscreenMarkdown(bodyEl, nodeObj._rawMarkdown, nodeObj);
  } else if (filePath) {
    fetch(filePath)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.text();
      })
      .then((text) => {
        renderFullscreenMarkdown(bodyEl, text.replace(/\r\n?/g, "\n"), nodeObj);
      })
      .catch((err) => {
        bodyEl.innerHTML = `<p class="bd-markdown-error">Could not load file: ${escapeHtml(err.message)}</p>`;
      });
  } else {
    bodyEl.innerHTML = `<p class="bd-markdown-empty">No content available.</p>`;
  }
}

// Track the nodeObj currently shown in fullscreen so we can sync content back
// to the canvas body when the fullscreen closes.
let _fullscreenNodeObj = null;

function renderFullscreenMarkdown(container, text, nodeObj) {
  container.textContent = "";
  const lines = text.split("\n");
  if (lines.length === 0) lines.push("");
  lines.forEach((line) => container.appendChild(buildMarkdownLineEl(line)));
  // Make fullscreen view a full editor (editable + scrollable + save-wired).
  if (nodeObj && !isPreviewMode && nodeObj.file) {
    attachMarkdownEditor(nodeObj, container);
    _fullscreenNodeObj = nodeObj;
    // Focus the body so scroll + keyboard work without an extra click.
    requestAnimationFrame(() => container.focus({ preventScroll: true }));
  }
}

function closeMarkdownFullscreen() {
  if (!_markdownFullscreenEl) return;
  // Sync fullscreen edits back to the inline canvas body so the user sees the
  // updated content without waiting for a refresh.
  if (_fullscreenNodeObj) {
    const fsBody = _markdownFullscreenEl.querySelector(".bd-markdown-fullscreen-body");
    if (fsBody) {
      const content = readMarkdownEditorContent(fsBody);
      _fullscreenNodeObj._rawMarkdown = content;
      const itemEl = typeof getBoardElementById === "function"
        ? getBoardElementById(_fullscreenNodeObj.id)
        : document.querySelector(`[data-id="${_fullscreenNodeObj.id}"]`);
      const canvasBody = itemEl?.querySelector(".bd-markdown-body:not(.bd-markdown-fullscreen-body)");
      if (canvasBody) {
        canvasBody.textContent = "";
        const lines = content.split("\n");
        if (lines.length === 0) lines.push("");
        lines.forEach((line) => canvasBody.appendChild(buildMarkdownLineEl(line)));
      }
    }
    _fullscreenNodeObj = null;
  }
  _markdownFullscreenEl.classList.remove("is-open");
  _markdownFullscreenEl.hidden = true;
  document.body.style.overflow = "";
}

// ---------------------------------------------------------------------------
// Markdown index (markdown-db) node renderer
// ---------------------------------------------------------------------------

function renderMarkdownDbNode(nodeObj, el) {
  let shell = el.querySelector(".bd-markdown-db-shell");
  if (shell) return;

  shell = document.createElement("div");
  shell.className = "bd-markdown-db-shell";
  el.insertBefore(shell, el.firstChild);

  const title = String(nodeObj.title || "Markdown index");
  const header = document.createElement("div");
  header.className = "bd-markdown-db-header";
  header.innerHTML = `
    <svg class="bd-markdown-db-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    <span class="bd-markdown-db-title">${escapeHtml(title)}</span>
    <span class="bd-markdown-db-count"></span>
    <input type="search" class="bd-markdown-db-search" placeholder="Search…" aria-label="Search markdown files">
  `;
  shell.appendChild(header);

  const body = document.createElement("div");
  body.className = "bd-markdown-db-body";
  shell.appendChild(body);
  body.innerHTML = `<p class="bd-markdown-db-loading">Loading files…</p>`;

  let allFiles = [];

  const renderTable = (files) => {
    const countEl = header.querySelector(".bd-markdown-db-count");
    if (countEl) countEl.textContent = `${files.length}`;

    if (files.length === 0) {
      body.innerHTML = `<p class="bd-markdown-db-empty-msg">No markdown files in this board folder.</p>`;
      return;
    }

    const rows = files
      .map((file) => {
        const formatted = file.mtime
          ? new Date(file.mtime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : "—";
        return `
          <tr class="bd-markdown-db-row" data-url="${escapeHtml(file.url || "")}" data-title="${escapeHtml(file.title || "")}">
            <td class="bd-markdown-db-col-title">${escapeHtml(file.title || file.filename || "")}</td>
            <td class="bd-markdown-db-col-date">${escapeHtml(formatted)}</td>
          </tr>
        `;
      })
      .join("");

    body.innerHTML = `
      <table class="bd-markdown-db-table">
        <thead><tr><th>Name</th><th>Modified</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    body.querySelectorAll(".bd-markdown-db-row").forEach((tr) => {
      tr.addEventListener("click", (event) => {
        event.stopPropagation();
        const url = tr.dataset.url || "";
        const fileTitle = tr.dataset.title || "";
        if (!url) return;
        const dimensions = { width: 380, height: 420 };
        const position = getCenteredNodeCanvasPosition(dimensions.width, dimensions.height);
        createNode("markdown", position.x + 30, position.y + 30, {
          file: url,
          href: url,
          title: fileTitle,
          ...dimensions
        });
        showToolbarToast(`Opened ${fileTitle}`, "success");
      });
    });
  };

  fetch(`/api/list-markdown?slug=${encodeURIComponent(boardConfig.slug)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    })
    .then((data) => {
      allFiles = Array.isArray(data?.files) ? data.files : [];
      renderTable(allFiles);
    })
    .catch(() => {
      body.innerHTML = `<p class="bd-markdown-db-error">Failed to load markdown files.</p>`;
    });

  const searchInput = header.querySelector(".bd-markdown-db-search");
  searchInput?.addEventListener("input", (e) => {
    const query = String(e.target.value || "").toLowerCase().trim();
    if (!query) return renderTable(allFiles);
    const filtered = allFiles.filter((f) =>
      String(f.title || "").toLowerCase().includes(query) ||
      String(f.filename || "").toLowerCase().includes(query)
    );
    renderTable(filtered);
  });
  searchInput?.addEventListener("mousedown", (e) => e.stopPropagation());
  searchInput?.addEventListener("keydown", (e) => e.stopPropagation());
}

// ---------------------------------------------------------------------------
// New-markdown create flow + drag-drop upload
// ---------------------------------------------------------------------------

function sanitizeMarkdownFilename(value) {
  let name = String(value || "").trim().toLowerCase();
  name = name.replace(/\.md$/i, "").replace(/[^a-z0-9._\-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!name) name = `note-${Date.now()}`;
  return `${name}.md`;
}

// YAML-frontmatter round-trip for markdown notes. We stamp metadata on
// download so a re-import can match the file back to the originating node.
// The body stored in `_rawMarkdown` never contains frontmatter; the parser
// strips it on import, the serializer re-adds it on download.
//
// Kept deliberately minimal: id (stable identity) + updatedAt (freshness) +
// title (display). Container/board relationships are intentionally NOT in the
// file — that belongs to a future app-level registry/database, not embedded
// metadata on a portable file.
const MARKDOWN_FRONTMATTER_KEYS = ["id", "updatedAt", "title"];

function parseMarkdownFrontmatter(text) {
  const source = String(text || "");
  if (!source.startsWith("---")) return { meta: null, body: source };
  // Accept either \n or \r\n line endings between the opening fence and the rest.
  const fenceMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!fenceMatch) return { meta: null, body: source };
  const block = fenceMatch[1];
  const meta = {};
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  const body = source.slice(fenceMatch[0].length);
  return { meta, body };
}

function buildMarkdownFrontmatterBlock(nodeObj) {
  if (!nodeObj?.markdownId) return "";
  const fields = {
    id: nodeObj.markdownId,
    updatedAt: nodeObj.markdownUpdatedAt || new Date().toISOString(),
    title: String(nodeObj.title || "").trim()
  };
  const lines = [];
  for (const key of MARKDOWN_FRONTMATTER_KEYS) {
    const value = fields[key];
    if (value == null || value === "") continue;
    // Quote any value containing a colon, leading/trailing whitespace, or YAML
    // special chars to keep the parser simple.
    const needsQuotes = /[:#\n]|^\s|\s$/.test(value);
    const safe = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    lines.push(`${key}: ${safe}`);
  }
  if (lines.length === 0) return "";
  return `---\n${lines.join("\n")}\n---\n`;
}

function serializeMarkdownWithFrontmatter(nodeObj, body) {
  const block = buildMarkdownFrontmatterBlock(nodeObj);
  const cleanBody = String(body || "");
  if (!block) return cleanBody;
  // Ensure exactly one blank line between the closing --- and the body when
  // the body has content, so it reads naturally in any markdown viewer.
  if (cleanBody.length === 0) return block;
  return `${block}\n${cleanBody}`;
}

function newMarkdownIdentity() {
  return {
    markdownId: `cosmo-note-${uuid()}`,
    markdownUpdatedAt: new Date().toISOString()
  };
}

let _markdownPanelEl = null;
let _markdownPanelTitle = null;
let _markdownPanelFilename = null;
let _markdownPanelBody = null;
let _markdownPanelSave = null;
let _markdownPanelCancel = null;

function ensureMarkdownPanel() {
  if (_markdownPanelEl) return _markdownPanelEl;
  const panel = document.createElement("div");
  panel.className = "braindump-markdown-panel";
  panel.id = "braindump-markdown-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="braindump-markdown-panel-inner">
      <h3 class="braindump-markdown-panel-title">New markdown note</h3>
      <label class="braindump-markdown-panel-label" for="braindump-markdown-title">Title</label>
      <input id="braindump-markdown-title" type="text" placeholder="Note title" maxlength="120">
      <label class="braindump-markdown-panel-label" for="braindump-markdown-filename">Filename</label>
      <input id="braindump-markdown-filename" type="text" placeholder="note-name.md" maxlength="80">
      <label class="braindump-markdown-panel-label" for="braindump-markdown-body">Initial content</label>
      <textarea id="braindump-markdown-body" rows="6" placeholder="# My note\n\nWrite here..."></textarea>
      <div class="braindump-markdown-panel-actions">
        <button type="button" id="braindump-markdown-cancel" class="braindump-modal-button braindump-modal-button-secondary">Cancel</button>
        <button type="button" id="braindump-markdown-save" class="braindump-modal-button braindump-modal-button-primary">Save</button>
      </div>
    </div>
  `;
  toolbarShell?.appendChild(panel);
  _markdownPanelEl = panel;
  _markdownPanelTitle = panel.querySelector("#braindump-markdown-title");
  _markdownPanelFilename = panel.querySelector("#braindump-markdown-filename");
  _markdownPanelBody = panel.querySelector("#braindump-markdown-body");
  _markdownPanelSave = panel.querySelector("#braindump-markdown-save");
  _markdownPanelCancel = panel.querySelector("#braindump-markdown-cancel");

  _markdownPanelTitle?.addEventListener("input", () => {
    if (!_markdownPanelFilename.value || _markdownPanelFilename.dataset.autofilled === "true") {
      _markdownPanelFilename.value = sanitizeMarkdownFilename(_markdownPanelTitle.value);
      _markdownPanelFilename.dataset.autofilled = "true";
    }
  });
  _markdownPanelFilename?.addEventListener("input", () => {
    _markdownPanelFilename.dataset.autofilled = "false";
  });
  _markdownPanelCancel?.addEventListener("click", closeMarkdownPanel);
  _markdownPanelSave?.addEventListener("click", () => void saveMarkdownFromPanel());
  panel.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") closeMarkdownPanel();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveMarkdownFromPanel();
    }
  });
  return panel;
}

function defaultMarkdownTimestampName() {
  return `note-${formatTimestamp()}`;
}

async function createNewMarkdownNote(spawnAt = null) {
  if (isPreviewMode) return;
  const title = defaultMarkdownTimestampName();
  const filename = sanitizeMarkdownFilename(`${title}.md`);
  const result = await trySaveMarkdownSidecar({ filename, path: "", content: "" });

  const dimensions = { width: 380, height: 420 };
  let spawnX, spawnY;
  if (spawnAt) {
    spawnX = spawnAt.x - dimensions.width / 2;
    spawnY = spawnAt.y - dimensions.height / 2;
  } else {
    const center = getCenteredNodeCanvasPosition(dimensions.width, dimensions.height);
    spawnX = center.x;
    spawnY = center.y - 80;
  }
  const props = {
    title,
    ...dimensions,
    _rawMarkdown: "",
    ...newMarkdownIdentity()
  };
  if (result?.url) {
    props.file = result.url;
    props.href = result.url;
  }
  const node = createNode("markdown", spawnX, spawnY, props);
  flushLocalStateSave();
  showToolbarToast(`Created ${title}`, "success");
  return node;
}

function openMarkdownPanel(spawnAt = null) {
  // Quick path: skip the panel and spawn a fresh timestamped note in one click.
  // Falls back to the panel if anything looks wrong.
  void createNewMarkdownNote(spawnAt);
}

function closeMarkdownPanel() {
  if (!_markdownPanelEl) return;
  _markdownPanelEl.hidden = true;
  _markdownPanelEl.classList.remove("is-open");
}

async function saveMarkdownFromPanel() {
  if (!_markdownPanelTitle || !_markdownPanelFilename || !_markdownPanelBody) return;
  const title = String(_markdownPanelTitle.value || "").trim();
  const filename = sanitizeMarkdownFilename(_markdownPanelFilename.value || title);
  const initialBody = _markdownPanelBody.value;
  const content = initialBody.trim().length === 0 && title
    ? `# ${title}\n\n`
    : initialBody;

  _markdownPanelSave.disabled = true;
  try {
    const result = await trySaveMarkdownSidecar({ filename, path: "", content });
    const dimensions = { width: 380, height: 420 };
    const position = getCenteredNodeCanvasPosition(dimensions.width, dimensions.height);
    const nodeProps = {
      title: title || filename.replace(/\.md$/i, ""),
      ...dimensions,
      _rawMarkdown: content,
      ...newMarkdownIdentity()
    };
    if (result?.url) {
      nodeProps.file = result.url;
      nodeProps.href = result.url;
    }
    createNode("markdown", position.x, position.y, nodeProps);
    flushLocalStateSave();
    closeMarkdownPanel();
    if (result?.path) showToolbarToast(`Saved ${result.path}`, "success");
    else showToolbarToast(`Created ${nodeProps.title}`, "success");
  } finally {
    _markdownPanelSave.disabled = false;
  }
}

function ensureDropOverlay() {
  let overlay = document.getElementById("bd-drop-overlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "bd-drop-overlay";
  overlay.className = "bd-drop-overlay";
  overlay.innerHTML = `
    <div class="bd-drop-overlay-card">
      <div class="bd-drop-overlay-title">Drop to add to board</div>
      <div class="bd-drop-overlay-hint">Markdown · Images · PDF · Text</div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setDropTargetActive(active) {
  if (!viewport) return;
  const overlay = ensureDropOverlay();
  if (active) {
    viewport.classList.add("bd-md-drop-target");
    overlay.classList.add("is-active");
  } else {
    viewport.classList.remove("bd-md-drop-target");
    overlay.classList.remove("is-active");
  }
}

function attachMarkdownDropHandler() {
  if (!viewport || isPreviewMode) return;
  let dragDepth = 0;

  // Swallow file drops on the window so the browser doesn't navigate to the
  // file when a drop lands outside the viewport.
  window.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (e.dataTransfer?.types?.includes("Files") && e.target !== viewport && !viewport.contains(e.target)) {
      e.preventDefault();
      dragDepth = 0;
      setDropTargetActive(false);
    }
  });

  viewport.addEventListener("dragenter", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepth += 1;
    setDropTargetActive(true);
  });

  viewport.addEventListener("dragover", (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  });

  viewport.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDropTargetActive(false);
  });

  viewport.addEventListener("drop", async (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepth = 0;
    setDropTargetActive(false);

    const dropPos = screenToCanvas(e.clientX, e.clientY);
    const all = Array.from(files);
    const boardFiles = all.filter((f) => isCanvasKind(classifyDroppedFile(f)));
    const contentFiles = all.filter((f) => !isCanvasKind(classifyDroppedFile(f)));

    // Board files route through openCanvasFlow individually (each handles its
    // own reconcile / nested-page branching). Stagger drop positions slightly
    // so multiple board-preview embeds don't stack at the same spot.
    for (let i = 0; i < boardFiles.length; i++) {
      const file = boardFiles[i];
      const pos = { x: dropPos.x + i * 32, y: dropPos.y + i * 32 };
      try {
        await openCanvasFlow(file, pos);
      } catch (error) {
        showToolbarToast(`Failed to open ${file.name}: ${error.message}`, "error");
      }
    }

    if (contentFiles.length > 0) {
      await importContentFiles(contentFiles, dropPos);
    }
  });
}

function classifyDroppedFile(file) {
  const name = (file?.name || "").toLowerCase();
  if (name.endsWith(".canvas.diff") || name.endsWith(".diff")) return "canvas-diff";
  if (name.endsWith(".canvas.json") || name.endsWith(".canvas")) return "canvas-file";
  if (name.endsWith(".zip")) return "canvas-bundle";
  if (name.endsWith(".md")) return "markdown";
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) return "image";
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".txt")) return "text";
  return "unknown";
}

function isCanvasKind(kind) {
  return kind === "canvas-file" || kind === "canvas-bundle" || kind === "canvas-diff";
}

async function uploadAsset(file) {
  const params = new URLSearchParams({
    slug: boardConfig.slug || "",
    filename: file.name
  });
  const response = await fetch(`/api/save-asset?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) throw new Error(result?.error || `HTTP ${response.status}`);
  return result;
}

// Chrome's PDF viewer refuses data:application/pdf in iframes (Firefox allows it).
// We keep the data URL on disk for portability and lazily mint a blob: URL for
// the live embed src at render time. Cached on the node so repeat renders reuse
// it; revoked when the node is destroyed.
function ensureBlobUrlForDataUrl(nodeObj) {
  const url = nodeObj?.url;
  if (typeof url !== "string" || !url.startsWith("data:")) return null;
  if (nodeObj.__blobObjectUrl && nodeObj.__blobObjectUrlSource === url) {
    return nodeObj.__blobObjectUrl;
  }
  if (nodeObj.__blobObjectUrl) {
    URL.revokeObjectURL(nodeObj.__blobObjectUrl);
    nodeObj.__blobObjectUrl = null;
  }
  try {
    const commaIdx = url.indexOf(",");
    if (commaIdx < 0) return null;
    const meta = url.slice(5, commaIdx);
    const payload = url.slice(commaIdx + 1);
    const isBase64 = /;base64/i.test(meta);
    const mime = (meta.split(";")[0] || "").trim() || "application/octet-stream";
    let bytes;
    if (isBase64) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    }
    const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
    nodeObj.__blobObjectUrl = objectUrl;
    nodeObj.__blobObjectUrlSource = url;
    return objectUrl;
  } catch {
    return null;
  }
}

// Strip same-origin / localhost prefixes so embedded asset URLs stay portable
// across hosts (preview at 127.0.0.1, deployed at evrenucar.com, etc.).
function normalizeAssetUrl(url) {
  if (typeof url !== "string" || !url) return url;
  if (/^(data:|blob:|#)/i.test(url)) return url;
  try {
    const u = new URL(url, location.origin);
    const host = u.hostname;
    const isSameOrigin = u.origin === location.origin;
    const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
    if (isSameOrigin || isLocalHost) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
    return url;
  } catch {
    return url;
  }
}

// Static-host fallbacks: when /api/save-* is absent (e.g. GitHub Pages returns
// 405 for POST), drag-drop still embeds the file inline so the board grows
// instead of erroring out.
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function tryUploadAsset(file) {
  try {
    return await uploadAsset(file);
  } catch {
    return null;
  }
}

async function trySaveMarkdownSidecar({ filename, path = "", content }) {
  try {
    const response = await fetch(`/api/save-markdown?slug=${encodeURIComponent(boardConfig.slug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, path, content })
    });
    if (!response.ok) return null;
    const result = await response.json().catch(() => null);
    if (!result?.url) return null;
    return result;
  } catch {
    return null;
  }
}

async function importDroppedFile(file, x, y) {
  const kind = classifyDroppedFile(file);
  if (kind === "markdown") {
    const rawText = await file.text();
    const parsed = parseMarkdownFrontmatter(rawText);
    const body = parsed.body;
    const incomingId = parsed.meta?.id || "";
    const incomingUpdatedAt = parsed.meta?.updatedAt || "";
    const filename = sanitizeMarkdownFilename(file.name);
    const filenameTitle = filename.replace(/\.md$/i, "");
    const incomingTitle = String(parsed.meta?.title || "").trim() || filenameTitle;

    if (incomingId) {
      const match = nodes.find((n) => n?.type === "markdown" && n.markdownId === incomingId);
      if (match) {
        const choice = await markdownConflictPrompt({
          existing: match,
          incoming: { title: incomingTitle, updatedAt: incomingUpdatedAt }
        });
        if (choice === "cancel") return false;
        if (choice === "replace") {
          match._rawMarkdown = body;
          match.markdownUpdatedAt = incomingUpdatedAt || new Date().toISOString();
          if (incomingTitle) match.title = incomingTitle;
          // renderMarkdownNode is build-once (early-returns if .bd-markdown-shell
          // already exists). Drop the shell so the next render rebuilds with the
          // new content and title.
          const matchEl = getBoardElementById(match.id);
          matchEl?.querySelector(".bd-markdown-shell")?.remove();
          renderNode(match);
          markBoardDirty();
          showToolbarToast(`Replaced "${match.title || filenameTitle}"`, "success");
          return true;
        }
        // choice === "keepBoth" — fall through to spawn a new node with a fresh id.
      }
    }

    const result = await trySaveMarkdownSidecar({ filename, path: "", content: body });
    let identity;
    if (incomingId && !nodes.some((n) => n?.type === "markdown" && n.markdownId === incomingId)) {
      // Preserve the imported note's stable identity so a later round-trip
      // back to a board where it lives still matches.
      identity = {
        markdownId: incomingId,
        markdownUpdatedAt: incomingUpdatedAt || new Date().toISOString()
      };
    } else {
      // Either no incoming id, or the user chose Keep both → fresh identity.
      identity = newMarkdownIdentity();
    }
    const props = {
      title: incomingTitle,
      width: 380,
      height: 420,
      _rawMarkdown: body,
      ...identity
    };
    if (result?.url) {
      props.file = result.url;
      props.href = result.url;
    }
    createNode("markdown", x, y, props);
    return true;
  }

  if (kind === "image") {
    const incomingBasename = String(file.name || "").trim();
    const match = incomingBasename
      ? nodes.find((n) =>
          n?.type === "file" &&
          (n.originalFilename === incomingBasename ||
           basenameOfUrl(n.file) === incomingBasename)
        )
      : null;
    if (match) {
      const choice = await assetConflictPrompt({ kind: "image", filename: incomingBasename });
      if (choice === "cancel") return false;
      if (choice === "replace") {
        const result = await tryUploadAsset(file);
        const fileSrc = result?.url || offloadDataUrlToIdb(await readFileAsDataURL(file));
        match.file = fileSrc;
        match.originalFilename = incomingBasename;
        match.hasAdjustedRatio = false;
        renderNode(match);
        markBoardDirty();
        showToolbarToast(`Replaced "${incomingBasename}"`, "success");
        return true;
      }
      // keepBoth — fall through.
    }
    const result = await tryUploadAsset(file);
    const fileSrc = result?.url || offloadDataUrlToIdb(await readFileAsDataURL(file));
    createNode("image", x, y, { file: fileSrc, originalFilename: incomingBasename });
    return true;
  }

  if (kind === "pdf") {
    const incomingBasename = String(file.name || "").trim();
    const incomingTitle = incomingBasename.replace(/\.pdf$/i, "");
    const match = incomingBasename
      ? nodes.find((n) =>
          n?.type === "link" && n.embedMode === "live" &&
          (n.originalFilename === incomingBasename ||
           basenameOfUrl(n.url) === incomingBasename ||
           (typeof n.title === "string" && n.title === incomingTitle))
        )
      : null;
    if (match) {
      const choice = await assetConflictPrompt({ kind: "pdf", filename: incomingBasename });
      if (choice === "cancel") return false;
      if (choice === "replace") {
        const result = await tryUploadAsset(file);
        const url = result?.url || offloadDataUrlToIdb(await readFileAsDataURL(file));
        if (match.__blobObjectUrl) {
          URL.revokeObjectURL(match.__blobObjectUrl);
          match.__blobObjectUrl = null;
          match.__blobObjectUrlSource = null;
        }
        match.url = url;
        match.title = incomingTitle || match.title;
        match.originalFilename = incomingBasename;
        renderNode(match);
        markBoardDirty();
        showToolbarToast(`Replaced "${incomingBasename}"`, "success");
        return true;
      }
      // keepBoth — fall through.
    }
    const result = await tryUploadAsset(file);
    const url = result?.url || offloadDataUrlToIdb(await readFileAsDataURL(file));
    createNode("bookmark", x, y, {
      url,
      title: incomingTitle,
      embedMode: "live",
      width: 600,
      height: 760,
      originalFilename: incomingBasename
    });
    return true;
  }

  if (kind === "text") {
    const text = await file.text();
    createNode("text", x, y, {
      text,
      width: 360,
      height: 240
    });
    return true;
  }

  if (kind === "unknown") {
    const result = await tryUploadAsset(file);
    if (!result?.url) {
      showToolbarToast(`Can't host ${file.name} on a static site. Drop unsupported.`, "error");
      return false;
    }
    const ext = (file.name.match(/\.[^.]+$/) || [""])[0];
    createNode("bookmark", x, y, {
      url: result.url,
      title: file.name,
      embedMode: "preview",
      width: 320,
      height: 140,
      _genericFileExtension: ext
    });
    return true;
  }

  return false;
}

// =====================================================================
// Canvas import / open / diff flows
// =====================================================================

async function sha1Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalCanvasJson(state) {
  const { canvasId, createdAt, updatedAt, viewport, ...rest } = state || {};
  return stableStringify(rest);
}

async function canonicalCanvasHash(state) {
  return sha1Hex(canonicalCanvasJson(state));
}

async function uploadFileAsAsset(file) {
  const params = new URLSearchParams({
    slug: boardConfig.slug || "",
    filename: file.name
  });
  const response = await fetch(`/api/save-asset?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.url) throw new Error(result?.error || `HTTP ${response.status}`);
  return result;
}

async function parseCanvasFile(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".zip")) {
    if (!window.fflate) throw new Error("Bundler library not loaded.");
    const importedState = await readProjectBundleFile(file);
    return { kind: "bundle", canvasData: importedState, file };
  }
  const text = await file.text();
  const data = JSON.parse(text);
  if (data && data.type === "canvas-diff") {
    return { kind: "diff", diff: data, file };
  }
  if (!data || !Array.isArray(data.nodes)) {
    throw new Error("Not a valid canvas file (missing nodes array).");
  }
  return { kind: "canvas", canvasData: data, file };
}

function extractCanvasMetadata(canvasData) {
  const nodesArr = Array.isArray(canvasData?.nodes) ? canvasData.nodes : [];
  const edgesArr = Array.isArray(canvasData?.edges) ? canvasData.edges : [];
  let sidecarCount = 0;
  let assetCount = 0;
  let boardPreviewCount = 0;
  for (const n of nodesArr) {
    if (!n) continue;
    if (n.type === "markdown") sidecarCount += 1;
    else if (n.type === "image" || (n.type === "link" && /\.(pdf|png|jpe?g|gif|webp)(\?|$)/i.test(n.url || ""))) assetCount += 1;
    else if (n.type === "board-preview") boardPreviewCount += 1;
  }
  return {
    canvasId: typeof canvasData?.canvasId === "string" ? canvasData.canvasId : null,
    createdAt: canvasData?.createdAt || null,
    updatedAt: canvasData?.updatedAt || null,
    nodeCount: nodesArr.length,
    edgeCount: edgesArr.length,
    sidecarCount,
    assetCount,
    boardPreviewCount,
    sizeBytes: JSON.stringify(canvasData).length
  };
}

function getCurrentBoardMetadata() {
  return {
    canvasId: boardMeta.canvasId,
    createdAt: boardMeta.createdAt,
    updatedAt: boardMeta.updatedAt,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    sidecarCount: nodes.filter((n) => n.type === "markdown").length,
    assetCount: nodes.filter((n) => n.type === "image" || (n.type === "link" && /\.(pdf|png|jpe?g|gif|webp)(\?|$)/i.test(n.url || ""))).length,
    boardPreviewCount: nodes.filter((n) => n.type === "board-preview").length,
    sizeBytes: JSON.stringify(serializeState()).length
  };
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatTimestampDisplay(ts) {
  if (!ts) return "—";
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

async function openCanvasFlow(file, dropPos) {
  let parsed;
  try {
    parsed = await parseCanvasFile(file);
  } catch (err) {
    showToolbarToast(`Cannot open ${file.name}: ${err.message}`, "error");
    return;
  }

  if (parsed.kind === "diff") {
    return applyDiffFlow(parsed.diff);
  }

  const incomingMeta = extractCanvasMetadata(parsed.canvasData);
  const localMeta = getCurrentBoardMetadata();

  if (incomingMeta.canvasId && incomingMeta.canvasId === localMeta.canvasId) {
    const choice = await reconcilePrompt({ local: localMeta, incoming: incomingMeta });
    if (choice !== "apply") return;
    loadState(parsed.canvasData);
    persistLocalState(serializeState());
    setComparisonBaseline(serializeState());
    markBoardDirty({ scheduleLocalSave: false });
    saveBoard({ showFeedback: false }).catch(() => {});
    const isNewer = new Date(incomingMeta.updatedAt || 0).getTime() >= new Date(localMeta.updatedAt || 0).getTime();
    showToolbarToast(isNewer ? `Updated to ${file.name}` : `Restored from ${file.name}`, "success");
    return;
  }

  await embedCanvasAsBoardPreview(file, parsed.canvasData, incomingMeta, dropPos);
}

async function embedCanvasAsBoardPreview(file, canvasData, incomingMeta, dropPos) {
  let url;
  try {
    const result = await uploadFileAsAsset(file);
    url = result.url;
  } catch (err) {
    showToolbarToast(`Could not stage ${file.name} as a sub-page: ${err.message}`, "error");
    return;
  }
  const pos = dropPos || screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
  const titleBase = file.name
    .replace(/\.(zip|canvas\.json|canvas|json)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Imported board";
  createNode("board-preview", pos.x, pos.y, {
    boardSource: url,
    boardSlug: incomingMeta.canvasId ? incomingMeta.canvasId.slice(0, 8) : "",
    boardHref: url,
    title: titleBase,
    description: `${incomingMeta.nodeCount} node${incomingMeta.nodeCount === 1 ? "" : "s"}, ${incomingMeta.edgeCount} edge${incomingMeta.edgeCount === 1 ? "" : "s"}`,
    width: 320,
    height: 220
  });
  markBoardDirty();
  showToolbarToast(`Embedded ${file.name} as a sub-page`, "success");
}

// --- Diff format: export + apply ---

function createCanvasDiff(baseState, currentState) {
  if (!baseState || !currentState) throw new Error("createCanvasDiff requires both states.");
  if (!baseState.canvasId) throw new Error("Base canvas has no canvasId; cannot diff.");
  const baseNodes = new Map((baseState.nodes || []).map((n) => [n.id, n]));
  const currentNodes = new Map((currentState.nodes || []).map((n) => [n.id, n]));
  const added = [];
  const modified = [];
  const removed = [];
  for (const [id, n] of currentNodes) {
    if (!baseNodes.has(id)) added.push(n);
    else if (stableStringify(baseNodes.get(id)) !== stableStringify(n)) {
      modified.push({ id, fields: n });
    }
  }
  for (const id of baseNodes.keys()) {
    if (!currentNodes.has(id)) removed.push(id);
  }
  const baseEdges = new Map((baseState.edges || []).map((e, i) => [e.id || `__i${i}`, e]));
  const currentEdges = new Map((currentState.edges || []).map((e, i) => [e.id || `__i${i}`, e]));
  const edgesAdded = [];
  const edgesRemoved = [];
  for (const [id, e] of currentEdges) {
    if (!baseEdges.has(id) || stableStringify(baseEdges.get(id)) !== stableStringify(e)) edgesAdded.push(e);
  }
  for (const id of baseEdges.keys()) {
    if (!currentEdges.has(id)) edgesRemoved.push(id);
  }
  return {
    type: "canvas-diff",
    baseCanvasId: baseState.canvasId,
    baseVersion: {
      timestamp: baseState.updatedAt || null,
      hash: null
    },
    createdAt: new Date().toISOString(),
    changes: { added, modified, removed, edges: { added: edgesAdded, removed: edgesRemoved } }
  };
}

async function applyDiffFlow(diff) {
  if (!diff || diff.type !== "canvas-diff" || !diff.baseCanvasId) {
    showToolbarToast("Not a valid canvas diff file.", "error");
    return;
  }
  if (diff.baseCanvasId !== boardMeta.canvasId) {
    showToolbarToast(`This diff is for a different board (${String(diff.baseCanvasId).slice(0, 8)}…).`, "error");
    return;
  }
  const localHash = await canonicalCanvasHash(serializeState());
  const expectedHash = diff.baseVersion?.hash || null;
  const diverged = expectedHash && expectedHash !== localHash;
  const summary = {
    added: diff.changes?.added?.length || 0,
    modified: diff.changes?.modified?.length || 0,
    removed: diff.changes?.removed?.length || 0,
    edgesAdded: diff.changes?.edges?.added?.length || 0,
    edgesRemoved: diff.changes?.edges?.removed?.length || 0
  };
  const choice = await applyDiffPrompt({ diff, diverged, summary });
  if (choice !== "apply") return;
  applyDiffToState(diff);
  persistLocalState(serializeState());
  setComparisonBaseline(serializeState());
  markBoardDirty({ scheduleLocalSave: false });
  saveBoard({ showFeedback: false }).catch(() => {});
  showToolbarToast(`Applied diff (+${summary.added} ~${summary.modified} -${summary.removed})`, "success");
}

function applyDiffToState(diff) {
  const removeIds = new Set(diff.changes?.removed || []);
  const modifiedMap = new Map((diff.changes?.modified || []).map((m) => [m.id, m.fields]));
  // Drop removed nodes; replace modified nodes.
  const remainingNodes = nodes.filter((n) => !removeIds.has(n.id)).map((n) => {
    if (modifiedMap.has(n.id)) return { ...n, ...modifiedMap.get(n.id) };
    return n;
  });
  const addedNodes = (diff.changes?.added || []).filter((n) => n && n.id);
  const nextNodes = [...remainingNodes, ...addedNodes];
  const removedEdgeIds = new Set(diff.changes?.edges?.removed || []);
  const remainingEdges = edges.filter((e) => !removedEdgeIds.has(e.id || ""));
  const addedEdges = diff.changes?.edges?.added || [];
  const nextEdges = [...remainingEdges, ...addedEdges];
  loadState({
    canvasId: boardMeta.canvasId,
    createdAt: boardMeta.createdAt,
    updatedAt: new Date().toISOString(),
    nodes: nextNodes,
    edges: nextEdges,
    viewport: { x: camera.x, y: camera.y, z: camera.z }
  });
}

// --- Prompt overlays (reconcile + diff apply) ---

function buildPromptOverlay(html) {
  const overlay = document.createElement("div");
  overlay.className = "braindump-modal is-open";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "10000";
  overlay.style.background = "rgba(0,0,0,0.5)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.innerHTML = `<div class="braindump-modal-panel" style="max-width: 680px; max-height: 80vh; overflow:auto;">${html}</div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function reconcilePrompt({ local, incoming }) {
  return new Promise((resolve) => {
    const incomingNewer = new Date(incoming.updatedAt || 0).getTime() >= new Date(local.updatedAt || 0).getTime();
    const verb = incomingNewer ? "Update" : "Restore";
    const projected = {
      nodeCount: incoming.nodeCount,
      edgeCount: incoming.edgeCount,
      sidecarCount: incoming.sidecarCount,
      assetCount: incoming.assetCount,
      boardPreviewCount: incoming.boardPreviewCount,
      sizeBytes: incoming.sizeBytes,
      updatedAt: incoming.updatedAt
    };
    const row = (label, l, i, p) => `
      <tr>
        <th style="text-align:left;padding:4px 12px 4px 0;font-weight:500;color:#666;">${label}</th>
        <td style="padding:4px 12px;">${l}</td>
        <td style="padding:4px 12px;">${i}</td>
        <td style="padding:4px 12px;color:#0a0;">${p}</td>
      </tr>`;
    const html = `
      <h2 class="braindump-modal-title">${verb} this board?</h2>
      <p class="braindump-modal-description">Same canvas ID. Choose ${verb.toLowerCase()} to replace local with incoming, or cancel to keep local as-is.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0.5rem 0 1rem;">
        <thead>
          <tr>
            <th></th>
            <th style="text-align:left;padding:4px 12px;">Local now</th>
            <th style="text-align:left;padding:4px 12px;">Incoming</th>
            <th style="text-align:left;padding:4px 12px;color:#0a0;">After</th>
          </tr>
        </thead>
        <tbody>
          ${row("File size", formatBytes(local.sizeBytes), formatBytes(incoming.sizeBytes), formatBytes(projected.sizeBytes))}
          ${row("Last updated", formatTimestampDisplay(local.updatedAt), formatTimestampDisplay(incoming.updatedAt), formatTimestampDisplay(projected.updatedAt))}
          ${row("Nodes", local.nodeCount, incoming.nodeCount, projected.nodeCount)}
          ${row("Edges", local.edgeCount, incoming.edgeCount, projected.edgeCount)}
          ${row("Markdown sidecars", local.sidecarCount, incoming.sidecarCount, projected.sidecarCount)}
          ${row("Image / PDF assets", local.assetCount, incoming.assetCount, projected.assetCount)}
          ${row("Board-preview links", local.boardPreviewCount, incoming.boardPreviewCount, projected.boardPreviewCount)}
        </tbody>
      </table>
      <div class="braindump-modal-actions">
        <button type="button" data-action="cancel" class="braindump-modal-button braindump-modal-button-secondary">Cancel</button>
        <button type="button" data-action="apply" class="braindump-modal-button braindump-modal-button-primary">${verb}</button>
      </div>
    `;
    const overlay = buildPromptOverlay(html);
    const finish = (choice) => {
      overlay.remove();
      resolve(choice);
    };
    overlay.addEventListener("click", (ev) => {
      const target = ev.target.closest("[data-action]");
      if (!target && ev.target === overlay) return finish("cancel");
      if (!target) return;
      finish(target.dataset.action);
    });
    overlay.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") finish("cancel");
    });
    overlay.tabIndex = -1;
    overlay.focus();
  });
}

function basenameOfUrl(input) {
  if (typeof input !== "string" || !input) return "";
  // Normalize idb:/blob:/data:/relative/absolute URLs down to the trailing
  // filename component when one is present. Returns "" when the URL is
  // opaque (no path, e.g. data: or idb:).
  if (/^(?:idb:|data:|blob:)/i.test(input)) return "";
  try {
    const u = new URL(input, location.origin);
    const seg = u.pathname.split("/").filter(Boolean).pop() || "";
    return seg;
  } catch {
    const seg = input.split(/[?#]/)[0].split("/").filter(Boolean).pop() || "";
    return seg;
  }
}

function markdownConflictPrompt({ existing, incoming }) {
  return new Promise((resolve) => {
    const existingTitle = String(existing?.title || "").trim() || "Untitled note";
    const incomingTitle = String(incoming?.title || "").trim() || existingTitle;
    const existingTs = existing?.markdownUpdatedAt || "";
    const incomingTs = incoming?.updatedAt || "";
    let guidance = "";
    if (existingTs && incomingTs) {
      const incomingNewer = new Date(incomingTs).getTime() >= new Date(existingTs).getTime();
      guidance = incomingNewer
        ? `<p class="braindump-modal-description">The incoming file is newer.</p>`
        : `<p class="braindump-modal-description">The existing note is newer.</p>`;
    }
    const html = `
      <h2 class="braindump-modal-title">Note already on this board</h2>
      <p class="braindump-modal-description">A note with the same id is already here. Choose how to import.</p>
      ${guidance}
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:0.5rem 0 1rem;">
        <thead>
          <tr>
            <th></th>
            <th style="text-align:left;padding:4px 12px;">Existing</th>
            <th style="text-align:left;padding:4px 12px;">Incoming</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th style="text-align:left;padding:4px 12px 4px 0;font-weight:500;color:#666;">Title</th>
            <td style="padding:4px 12px;">${escapeHtml(existingTitle)}</td>
            <td style="padding:4px 12px;">${escapeHtml(incomingTitle)}</td>
          </tr>
          <tr>
            <th style="text-align:left;padding:4px 12px 4px 0;font-weight:500;color:#666;">Last updated</th>
            <td style="padding:4px 12px;">${formatTimestampDisplay(existingTs)}</td>
            <td style="padding:4px 12px;">${formatTimestampDisplay(incomingTs)}</td>
          </tr>
        </tbody>
      </table>
      <div class="braindump-modal-actions">
        <button type="button" data-action="cancel" class="braindump-modal-button braindump-modal-button-secondary">Cancel</button>
        <button type="button" data-action="keepBoth" class="braindump-modal-button braindump-modal-button-secondary">Keep both</button>
        <button type="button" data-action="replace" class="braindump-modal-button braindump-modal-button-primary">Replace existing</button>
      </div>
    `;
    const overlay = buildPromptOverlay(html);
    const finish = (choice) => { overlay.remove(); resolve(choice); };
    overlay.addEventListener("click", (ev) => {
      const target = ev.target.closest("[data-action]");
      if (!target && ev.target === overlay) return finish("cancel");
      if (!target) return;
      finish(target.dataset.action);
    });
    overlay.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") finish("cancel");
    });
    overlay.tabIndex = -1;
    overlay.focus();
  });
}

function assetConflictPrompt({ kind, filename }) {
  return new Promise((resolve) => {
    const label = kind === "pdf" ? "PDF" : "image";
    const html = `
      <h2 class="braindump-modal-title">${label.charAt(0).toUpperCase() + label.slice(1)} already on this board</h2>
      <p class="braindump-modal-description">A file named <code>${escapeHtml(filename)}</code> is already here. Choose how to import.</p>
      <div class="braindump-modal-actions">
        <button type="button" data-action="cancel" class="braindump-modal-button braindump-modal-button-secondary">Cancel</button>
        <button type="button" data-action="keepBoth" class="braindump-modal-button braindump-modal-button-secondary">Keep both</button>
        <button type="button" data-action="replace" class="braindump-modal-button braindump-modal-button-primary">Replace existing</button>
      </div>
    `;
    const overlay = buildPromptOverlay(html);
    const finish = (choice) => { overlay.remove(); resolve(choice); };
    overlay.addEventListener("click", (ev) => {
      const target = ev.target.closest("[data-action]");
      if (!target && ev.target === overlay) return finish("cancel");
      if (!target) return;
      finish(target.dataset.action);
    });
    overlay.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") finish("cancel");
    });
    overlay.tabIndex = -1;
    overlay.focus();
  });
}

function applyDiffPrompt({ diff, diverged, summary }) {
  return new Promise((resolve) => {
    const html = `
      <h2 class="braindump-modal-title">Apply diff?</h2>
      <p class="braindump-modal-description">
        Diff base: <code>${String(diff.baseCanvasId || "").slice(0, 8)}…</code>
        ${diff.baseVersion?.timestamp ? `(from ${formatTimestampDisplay(diff.baseVersion.timestamp)})` : ""}
      </p>
      <ul style="margin:0.5rem 0 1rem;padding-left:1.5rem;font-size:13px;">
        <li>+${summary.added} added · ~${summary.modified} modified · -${summary.removed} removed</li>
        <li>Edges: +${summary.edgesAdded} / -${summary.edgesRemoved}</li>
      </ul>
      ${diverged ? `<p style="color:#a40;background:#fff8e8;padding:8px;border-radius:6px;font-size:13px;">⚠ Local board has diverged from the diff's base. Applying anyway: incoming wins on conflicts.</p>` : ""}
      <div class="braindump-modal-actions">
        <button type="button" data-action="cancel" class="braindump-modal-button braindump-modal-button-secondary">Cancel</button>
        <button type="button" data-action="apply" class="braindump-modal-button braindump-modal-button-primary">Apply diff</button>
      </div>
    `;
    const overlay = buildPromptOverlay(html);
    const finish = (choice) => { overlay.remove(); resolve(choice); };
    overlay.addEventListener("click", (ev) => {
      const target = ev.target.closest("[data-action]");
      if (!target && ev.target === overlay) return finish("cancel");
      if (!target) return;
      finish(target.dataset.action);
    });
    overlay.tabIndex = -1;
    overlay.focus();
  });
}

// --- Multi-file content import (grid layout) ---

async function importContentFiles(files, basePos) {
  if (!files || !files.length) return 0;
  const start = basePos || screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
  const cols = files.length === 1 ? 1 : Math.min(3, files.length);
  const cellW = 360;
  const cellH = 280;
  let imported = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = start.x + col * cellW;
    const y = start.y + row * cellH;
    try {
      const ok = await importDroppedFile(file, x, y);
      if (ok) imported += 1;
    } catch (err) {
      showToolbarToast(`Failed to import ${file.name}: ${err.message}`, "error");
    }
  }
  if (imported > 0) {
    showToolbarToast(`Imported ${imported} file${imported === 1 ? "" : "s"}`, "success");
  }
  return imported;
}

// --- File pickers ---

async function openCanvasPicker() {
  if (supportsFileSystemAccessAPI && window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          { description: "Canvas files", accept: { "application/json": [".canvas", ".canvas.json", ".json"] } },
          { description: "Canvas bundle", accept: { "application/zip": [".zip"] } },
          { description: "Canvas diff", accept: { "application/json": [".canvas.diff", ".diff"] } }
        ],
        multiple: false
      });
      const file = await handle.getFile();
      currentFileHandle = handle;
      await openCanvasFlow(file);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Open canvas failed:", err);
        showToolbarToast("Failed to open canvas.", "error");
      }
    }
  } else if (openCanvasInput) {
    openCanvasInput.click();
  }
}

async function importContentPicker() {
  if (supportsFileSystemAccessAPI && window.showOpenFilePicker) {
    try {
      const handles = await window.showOpenFilePicker({
        types: [
          { description: "Content files", accept: {
            "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
            "application/pdf": [".pdf"],
            "text/markdown": [".md"],
            "text/plain": [".txt"]
          } }
        ],
        multiple: true
      });
      const files = await Promise.all(handles.map((h) => h.getFile()));
      await importContentFiles(files);
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Import failed:", err);
        showToolbarToast("Failed to import.", "error");
      }
    }
  } else if (fileInput) {
    fileInput.click();
  }
}

// --- File-input change handlers ---

if (openCanvasInput) {
  openCanvasInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await openCanvasFlow(file);
    openCanvasInput.value = "";
  });
}

attachMarkdownDropHandler();


// ---------------------------------------------------------------------------
// Base / database node renderer
// ---------------------------------------------------------------------------

const BASE_COLUMN_LABELS = {
  title: "Title",
  publishingStatus: "Status",
  year: "Year",
  effort: "Effort",
  category: "Category",
  section: "Section",
  dateAdded: "Added",
  dateModified: "Modified",
  summary: "Summary",
  slug: "Slug"
};

function formatBaseCell(value, column) {
  if (value == null || value === "") return `<span class="bd-base-empty">—</span>`;
  if (column === "dateAdded" || column === "dateModified") {
    try {
      const d = new Date(value);
      return `<span>${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>`;
    } catch { return String(value); }
  }
  if (column === "publishingStatus") {
    const cls = String(value).toLowerCase().replace(/\s+/g, "-");
    return `<span class="bd-base-pill bd-base-pill--${cls}">${String(value).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c])}</span>`;
  }
  const safe = String(value).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c]);
  return `<span>${safe}</span>`;
}

function renderBaseNode(nodeObj, el) {
  let shell = el.querySelector(".bd-base-shell");
  if (shell) return;

  shell = document.createElement("div");
  shell.className = "bd-base-shell";
  el.insertBefore(shell, el.firstChild);

  const title = String(nodeObj.title || "Base");
  const columns = nodeObj.columns || ["title", "publishingStatus"];

  // Header
  const header = document.createElement("div");
  header.className = "bd-base-header";
  header.innerHTML = `
    <svg class="bd-base-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
    <span class="bd-base-title">${title.replace(/[<>&"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"})[c])}</span>
    <span class="bd-base-count"></span>
  `;
  shell.appendChild(header);

  const body = document.createElement("div");
  body.className = "bd-base-body";
  shell.appendChild(body);

  const source = String(nodeObj.source || "");
  if (!source) {
    body.innerHTML = `<p class="bd-base-empty-msg">No data source set.</p>`;
    return;
  }

  body.innerHTML = `<p class="bd-base-loading">Loading…</p>`;

  fetch(source)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    })
    .then((data) => {
      let rows = Array.isArray(data) ? data : [];

      // Apply filter
      const filterExpr = String(nodeObj.filter || "");
      if (filterExpr && filterExpr.includes("=")) {
        const [fk, ...fvParts] = filterExpr.split("=");
        const fv = fvParts.join("=");
        rows = rows.filter((r) => String(r[fk] || "") === fv);
      }

      // Sort by dateModified descending
      rows.sort((a, b) => {
        const da = a.dateModified || a.dateAdded || "";
        const db = b.dateModified || b.dateAdded || "";
        return da < db ? 1 : da > db ? -1 : 0;
      });

      // Update count
      const countEl = header.querySelector(".bd-base-count");
      if (countEl) countEl.textContent = `${rows.length}`;

      if (rows.length === 0) {
        body.innerHTML = `<p class="bd-base-empty-msg">No items match.</p>`;
        return;
      }

      // Render table
      const thCells = columns
        .map((col) => `<th>${(BASE_COLUMN_LABELS[col] || col).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"})[c])}</th>`)
        .join("");

      const tbodyRows = rows
        .map((row) => {
          const cells = columns
            .map((col) => `<td>${formatBaseCell(row[col], col)}</td>`)
            .join("");
          const slug = row.slug || "";
          const section = row.section || "";
          const href = slug && section
            ? `content/${section === "things_i_do" ? "things-i-do" : section}/${slug}.html`
            : "";
          const rowClass = href ? "bd-base-row bd-base-row--linked" : "bd-base-row";
          return `<tr class="${rowClass}" ${href ? `data-href="${href}"` : ""}>${cells}</tr>`;
        })
        .join("");

      body.innerHTML = `
        <table class="bd-base-table">
          <thead><tr>${thCells}</tr></thead>
          <tbody>${tbodyRows}</tbody>
        </table>
      `;

      // Row click navigation
      body.querySelectorAll(".bd-base-row--linked").forEach((tr) => {
        tr.addEventListener("click", (e) => {
          e.stopPropagation();
          const href = tr.dataset.href;
          if (href) window.open(href, "_blank");
        });
      });
    })
    .catch((err) => {
      body.innerHTML = `<p class="bd-base-error">Could not load data (${err.message}).</p>`;
    });
}

// ----- Image cropping -----

function applyCropTransform(img, crop) {
  if (!crop) {
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.left = "0";
    img.style.top = "0";
    return;
  }
  const w = crop.right - crop.left;
  const h = crop.bottom - crop.top;
  if (w <= 0 || h <= 0) return;
  img.style.width = `${(100 / w).toFixed(4)}%`;
  img.style.height = `${(100 / h).toFixed(4)}%`;
  img.style.left = `${(-(crop.left / w) * 100).toFixed(4)}%`;
  img.style.top = `${(-(crop.top / h) * 100).toFixed(4)}%`;
}

function renderImageCropbox(nodeObj, el) {
  const existingOv = el.querySelector(".bd-crop-overlay");
  if (existingOv && typeof existingOv._cropCleanup === "function") existingOv._cropCleanup();
  el.querySelectorAll(".bd-file-cropbox, .bd-crop-overlay").forEach(n => n.remove());

  const wrap = document.createElement("div");
  wrap.className = "bd-file-cropbox";
  wrap.dataset.fileSrc = nodeObj.file;
  el.insertBefore(wrap, el.firstChild);

  const img = document.createElement("img");
  img.draggable = false;
  img.alt = "file preview";
  img.src = nodeObj.file;
  wrap.appendChild(img);

  applyCropTransform(img, nodeObj.crop);

  img.onload = () => {
    // Skip auto-aspect adjustment when the node already has a crop (the crop
    // dictates the displayed size) or when the ratio was already measured.
    // Without these guards a fresh <img> mounted after a commit re-fires the
    // adjuster and clobbers the cropped width/height.
    if (nodeObj.crop) {
      nodeObj.hasAdjustedRatio = true;
      return;
    }
    if (nodeObj.hasAdjustedRatio) return;
    const naturalRatio = img.naturalWidth / img.naturalHeight;
    nodeObj.width = Math.min(img.naturalWidth, 400);
    nodeObj.height = nodeObj.width / naturalRatio;
    nodeObj.hasAdjustedRatio = true;
    el.style.width = `${nodeObj.width}px`;
    el.style.height = `${nodeObj.height}px`;
    markBoardDirty();
  };
}

function renderImageCropOverlay(nodeObj, el) {
  el.querySelectorAll(".bd-file-cropbox, .bd-crop-overlay").forEach(n => n.remove());

  const ov = document.createElement("div");
  ov.className = "bd-crop-overlay";
  el.insertBefore(ov, el.firstChild);

  const img = document.createElement("img");
  img.draggable = false;
  img.alt = "crop preview";
  img.src = nodeObj.file;
  ov.appendChild(img);

  const dimTop = document.createElement("div");
  dimTop.className = "bd-crop-dim top";
  ov.appendChild(dimTop);
  const dimBottom = document.createElement("div");
  dimBottom.className = "bd-crop-dim bottom";
  ov.appendChild(dimBottom);
  const dimLeft = document.createElement("div");
  dimLeft.className = "bd-crop-dim left";
  ov.appendChild(dimLeft);
  const dimRight = document.createElement("div");
  dimRight.className = "bd-crop-dim right";
  ov.appendChild(dimRight);

  const win = document.createElement("div");
  win.className = "bd-crop-window";
  ov.appendChild(win);

  const handles = {};
  ["tl", "tr", "bl", "br", "t", "r", "b", "l"].forEach(corner => {
    const h = document.createElement("div");
    h.className = `bd-crop-handle ${corner}`;
    h.dataset.corner = corner;
    ov.appendChild(h);
    handles[corner] = h;
  });

  const bar = document.createElement("div");
  bar.className = "bd-crop-actionbar";
  const px = document.createElement("span");
  px.className = "bd-crop-px";
  bar.appendChild(px);
  const bake = document.createElement("button");
  bake.type = "button";
  bake.className = "bd-crop-bake";
  bake.textContent = "Bake";
  bake.title = "Re-encode the cropped pixels and replace the source file";
  const done = document.createElement("button");
  done.type = "button";
  done.className = "bd-crop-done";
  done.textContent = "Done";
  bar.appendChild(bake);
  bar.appendChild(done);
  ov.appendChild(bar);

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function updateGeometry() {
    const c = nodeObj._cropDraft;
    const left = clamp01(c.left) * 100;
    const top = clamp01(c.top) * 100;
    const right = clamp01(c.right) * 100;
    const bottom = clamp01(c.bottom) * 100;
    const w = right - left;
    const h = bottom - top;

    win.style.left = `${left}%`;
    win.style.top = `${top}%`;
    win.style.width = `${w}%`;
    win.style.height = `${h}%`;

    dimTop.style.left = "0";
    dimTop.style.top = "0";
    dimTop.style.width = "100%";
    dimTop.style.height = `${top}%`;

    dimBottom.style.left = "0";
    dimBottom.style.top = `${bottom}%`;
    dimBottom.style.width = "100%";
    dimBottom.style.height = `${100 - bottom}%`;

    dimLeft.style.left = "0";
    dimLeft.style.top = `${top}%`;
    dimLeft.style.width = `${left}%`;
    dimLeft.style.height = `${h}%`;

    dimRight.style.left = `${right}%`;
    dimRight.style.top = `${top}%`;
    dimRight.style.width = `${100 - right}%`;
    dimRight.style.height = `${h}%`;

    handles.tl.style.left = `${left}%`;
    handles.tl.style.top = `${top}%`;
    handles.tr.style.left = `${right}%`;
    handles.tr.style.top = `${top}%`;
    handles.bl.style.left = `${left}%`;
    handles.bl.style.top = `${bottom}%`;
    handles.br.style.left = `${right}%`;
    handles.br.style.top = `${bottom}%`;

    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    handles.t.style.left = `${cx}%`;
    handles.t.style.top = `${top}%`;
    handles.r.style.left = `${right}%`;
    handles.r.style.top = `${cy}%`;
    handles.b.style.left = `${cx}%`;
    handles.b.style.top = `${bottom}%`;
    handles.l.style.left = `${left}%`;
    handles.l.style.top = `${cy}%`;

    const naturalW = ovImg.naturalWidth || 0;
    const naturalH = ovImg.naturalHeight || 0;
    if (naturalW && naturalH) {
      const pxW = Math.round((c.right - c.left) * naturalW);
      const pxH = Math.round((c.bottom - c.top) * naturalH);
      px.textContent = `${pxW} × ${pxH}`;
    } else {
      px.textContent = "";
    }
  }
  const ovImg = img;
  if (img.complete && img.naturalWidth) {
    updateGeometry();
  } else {
    img.addEventListener("load", () => updateGeometry(), { once: true });
    updateGeometry();
  }

  let dragMode = null;        // 'corner' | 'translate'
  let dragCorner = null;
  let dragStartRect = null;
  let dragStartPoint = null;

  function pointerToNorm(clientX, clientY) {
    const rect = ov.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  }

  function beginCornerDrag(corner, clientX, clientY) {
    dragMode = "corner";
    dragCorner = corner;
    dragStartRect = { ...nodeObj._cropDraft };
    dragStartPoint = pointerToNorm(clientX, clientY);
  }

  function beginTranslateDrag(clientX, clientY) {
    dragMode = "translate";
    dragCorner = null;
    dragStartRect = { ...nodeObj._cropDraft };
    dragStartPoint = pointerToNorm(clientX, clientY);
  }

  function updateCornerDrag(clientX, clientY, shiftKey) {
    const p = pointerToNorm(clientX, clientY);
    const dx = p.x - dragStartPoint.x;
    const dy = p.y - dragStartPoint.y;
    const min = 0.02;
    const c = { ...dragStartRect };
    if (dragCorner.includes("l")) c.left = Math.min(Math.max(0, dragStartRect.left + dx), dragStartRect.right - min);
    if (dragCorner.includes("r")) c.right = Math.max(Math.min(1, dragStartRect.right + dx), dragStartRect.left + min);
    if (dragCorner[0] === "t") c.top = Math.min(Math.max(0, dragStartRect.top + dy), dragStartRect.bottom - min);
    if (dragCorner[0] === "b") c.bottom = Math.max(Math.min(1, dragStartRect.bottom + dy), dragStartRect.top + min);

    // Shift aspect-lock only applies to corner drags (length 2). Edge drags
    // (length 1) move a single side and ignore Shift.
    if (shiftKey && dragCorner.length === 2) {
      const startW = dragStartRect.right - dragStartRect.left;
      const startH = dragStartRect.bottom - dragStartRect.top;
      if (startW > 0 && startH > 0) {
        const startRatio = startW / startH;
        const newW = c.right - c.left;
        const newH = c.bottom - c.top;
        const widthRel = Math.abs(newW - startW) / startW;
        const heightRel = Math.abs(newH - startH) / startH;
        if (widthRel >= heightRel) {
          const targetH = newW / startRatio;
          if (dragCorner[0] === "t") c.top = clamp01(c.bottom - targetH);
          else c.bottom = clamp01(c.top + targetH);
        } else {
          const targetW = newH * startRatio;
          if (dragCorner.includes("l")) c.left = clamp01(c.right - targetW);
          else c.right = clamp01(c.left + targetW);
        }
      }
    }
    nodeObj._cropDraft = c;
    updateGeometry();
  }

  function updateTranslateDrag(clientX, clientY) {
    const p = pointerToNorm(clientX, clientY);
    const dx = p.x - dragStartPoint.x;
    const dy = p.y - dragStartPoint.y;
    const w = dragStartRect.right - dragStartRect.left;
    const h = dragStartRect.bottom - dragStartRect.top;
    let newLeft = clamp01(dragStartRect.left + dx);
    let newTop = clamp01(dragStartRect.top + dy);
    if (newLeft + w > 1) newLeft = 1 - w;
    if (newTop + h > 1) newTop = 1 - h;
    nodeObj._cropDraft = { left: newLeft, top: newTop, right: newLeft + w, bottom: newTop + h };
    updateGeometry();
  }

  function endCropDrag() {
    dragMode = null;
    dragCorner = null;
    dragStartRect = null;
    dragStartPoint = null;
  }

  Object.entries(handles).forEach(([corner, h]) => {
    h.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginCornerDrag(corner, e.clientX, e.clientY);
    });
    h.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      beginCornerDrag(corner, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
  });

  // Translate gesture: mousedown on the clear crop window translates the rect.
  win.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    beginTranslateDrag(e.clientX, e.clientY);
  });
  win.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    beginTranslateDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  function onMove(e) {
    if (!dragMode) return;
    let cx, cy, shift;
    if (e.touches) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      cx = e.touches[0].clientX; cy = e.touches[0].clientY; shift = e.shiftKey;
    } else {
      cx = e.clientX; cy = e.clientY; shift = e.shiftKey;
    }
    if (dragMode === "corner") updateCornerDrag(cx, cy, shift);
    else if (dragMode === "translate") updateTranslateDrag(cx, cy);
  }
  function onUp() { endCropDrag(); }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("mouseup", onUp);
  window.addEventListener("touchend", onUp);
  window.addEventListener("touchcancel", onUp);

  ov.addEventListener("mousedown", (e) => { e.stopPropagation(); });
  ov.addEventListener("touchstart", (e) => { e.stopPropagation(); }, { passive: false });
  ov.addEventListener("dblclick", (e) => { e.stopPropagation(); });

  done.addEventListener("mousedown", (e) => { e.stopPropagation(); });
  done.addEventListener("click", (e) => {
    e.stopPropagation();
    commitCrop(nodeObj);
  });
  bake.addEventListener("mousedown", (e) => { e.stopPropagation(); });
  bake.addEventListener("click", (e) => {
    e.stopPropagation();
    bakeCrop(nodeObj);
  });

  ov._cropCleanup = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("touchend", onUp);
    window.removeEventListener("touchcancel", onUp);
  };
}

function findCroppingNode() {
  return nodes.find(n => n.isCropping);
}

let _cropOutsideClickHandler = null;
function installCropOutsideClick(nodeObj) {
  uninstallCropOutsideClick();
  _cropOutsideClickHandler = (e) => {
    const el = getBoardElementById(nodeObj.id);
    if (!el) return;
    if (e.target instanceof Node && el.contains(e.target)) return;
    commitCrop(nodeObj);
  };
  document.addEventListener("mousedown", _cropOutsideClickHandler, true);
}
function uninstallCropOutsideClick() {
  if (_cropOutsideClickHandler) {
    document.removeEventListener("mousedown", _cropOutsideClickHandler, true);
    _cropOutsideClickHandler = null;
  }
}

function enterCropMode(nodeObj) {
  if (nodeObj.type !== "file") return;
  const other = findCroppingNode();
  if (other && other !== nodeObj) commitCrop(other);

  const el = getBoardElementById(nodeObj.id);
  if (!el) return;
  const oldCrop = nodeObj.crop || { left: 0, top: 0, right: 1, bottom: 1 };
  const cropW = oldCrop.right - oldCrop.left;
  const cropH = oldCrop.bottom - oldCrop.top;
  if (cropW <= 0 || cropH <= 0) return;

  nodeObj._cropEnterCrop = nodeObj.crop ? { ...nodeObj.crop } : null;
  nodeObj._cropEnterSize = { w: nodeObj.width, h: nodeObj.height };
  nodeObj._cropEnterPos = { x: nodeObj.x, y: nodeObj.y };
  nodeObj._cropDraft = { ...oldCrop };
  nodeObj.isCropping = true;

  // Expand the node to display the full source at the same visual scale as
  // the cropped slice. Then shift the node's top-left BACK by the slice's
  // offset inside the source so the slice stays visually where it was; the
  // hidden area of the image extends outward around it.
  const fullW = nodeObj.width / cropW;
  const fullH = nodeObj.height / cropH;
  nodeObj.x = nodeObj.x - oldCrop.left * fullW;
  nodeObj.y = nodeObj.y - oldCrop.top * fullH;
  nodeObj.width = fullW;
  nodeObj.height = fullH;

  el.classList.add("is-cropping");
  el.classList.remove("selected");
  renderNode(nodeObj);
  installCropOutsideClick(nodeObj);
}

function commitCrop(nodeObj) {
  if (!nodeObj.isCropping) return;
  uninstallCropOutsideClick();
  const draft = nodeObj._cropDraft;
  const fullW = nodeObj.width;
  const fullH = nodeObj.height;
  const draftW = draft.right - draft.left;
  const draftH = draft.bottom - draft.top;
  const newW = fullW * draftW;
  const newH = fullH * draftH;
  // The slice's screen position equals the expanded node's position plus the
  // slice offset. After commit, the node's top-left moves to the slice's
  // top-left so the visible content stays visually anchored.
  const newX = nodeObj.x + draft.left * fullW;
  const newY = nodeObj.y + draft.top * fullH;

  const fromCrop = nodeObj._cropEnterCrop;
  const fromSize = nodeObj._cropEnterSize;
  const fromPos = nodeObj._cropEnterPos;
  const isFullRect = (draft.left <= 0.0001 && draft.top <= 0.0001 && draft.right >= 0.9999 && draft.bottom >= 0.9999);
  const toCrop = isFullRect ? null : { ...draft };
  const toSize = { w: newW, h: newH };
  const toPos = { x: newX, y: newY };

  if (toCrop) nodeObj.crop = toCrop;
  else delete nodeObj.crop;
  nodeObj.x = newX;
  nodeObj.y = newY;
  nodeObj.width = newW;
  nodeObj.height = newH;
  delete nodeObj.isCropping;
  delete nodeObj._cropDraft;
  delete nodeObj._cropEnterCrop;
  delete nodeObj._cropEnterSize;
  delete nodeObj._cropEnterPos;

  const el = getBoardElementById(nodeObj.id);
  if (el) el.classList.remove("is-cropping");

  const cropChanged = JSON.stringify(fromCrop || null) !== JSON.stringify(toCrop || null);
  const sizeChanged = Math.abs(fromSize.w - toSize.w) > 0.5 || Math.abs(fromSize.h - toSize.h) > 0.5;
  const posChanged = fromPos && (Math.abs(fromPos.x - toPos.x) > 0.5 || Math.abs(fromPos.y - toPos.y) > 0.5);
  if (cropChanged || sizeChanged || posChanged) {
    pushAction({
      type: "crop",
      nodeId: nodeObj.id,
      fromCrop: fromCrop ? { ...fromCrop } : null,
      toCrop: toCrop ? { ...toCrop } : null,
      fromSize,
      toSize,
      fromPos: fromPos ? { ...fromPos } : null,
      toPos: { ...toPos }
    });
  }
  renderNode(nodeObj);
}

function cancelCrop(nodeObj) {
  if (!nodeObj.isCropping) return;
  uninstallCropOutsideClick();
  if (nodeObj._cropEnterCrop) nodeObj.crop = { ...nodeObj._cropEnterCrop };
  else delete nodeObj.crop;
  if (nodeObj._cropEnterSize) {
    nodeObj.width = nodeObj._cropEnterSize.w;
    nodeObj.height = nodeObj._cropEnterSize.h;
  }
  if (nodeObj._cropEnterPos) {
    nodeObj.x = nodeObj._cropEnterPos.x;
    nodeObj.y = nodeObj._cropEnterPos.y;
  }
  delete nodeObj.isCropping;
  delete nodeObj._cropDraft;
  delete nodeObj._cropEnterCrop;
  delete nodeObj._cropEnterSize;
  delete nodeObj._cropEnterPos;

  const el = getBoardElementById(nodeObj.id);
  if (el) el.classList.remove("is-cropping");
  renderNode(nodeObj);
}

function deriveBakeFilename(srcUrl, ext) {
  try {
    const u = new URL(srcUrl, location.origin);
    const segs = u.pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] || `image.${ext}`;
    const dot = last.lastIndexOf(".");
    const stem = dot > 0 ? last.slice(0, dot) : last;
    return `${stem}-cropped.${ext}`;
  } catch {
    return `image-cropped.${ext}`;
  }
}

async function bakeCrop(nodeObj) {
  if (!nodeObj.isCropping) return;
  const el = getBoardElementById(nodeObj.id);
  const img = el && el.querySelector(".bd-crop-overlay img");
  if (!img || !img.complete || !img.naturalWidth) {
    showToolbarToast("Image not ready for bake", "error");
    return;
  }
  const draft = nodeObj._cropDraft;
  const sx = Math.round(draft.left * img.naturalWidth);
  const sy = Math.round(draft.top * img.naturalHeight);
  const sw = Math.round((draft.right - draft.left) * img.naturalWidth);
  const sh = Math.round((draft.bottom - draft.top) * img.naturalHeight);
  if (sw < 1 || sh < 1) return;
  const cv = document.createElement("canvas");
  cv.width = sw;
  cv.height = sh;
  const ctx = cv.getContext("2d");
  try {
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  } catch (err) {
    showToolbarToast(`Bake failed: ${err.message}`, "error");
    return;
  }
  const ext = /\.jpe?g(\?|#|$)/i.test(nodeObj.file) ? "jpeg" : "png";
  const mime = ext === "jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise(res => cv.toBlob(res, mime, 0.92));
  if (!blob) {
    showToolbarToast("Bake failed: encoding error", "error");
    return;
  }
  const filename = deriveBakeFilename(nodeObj.file, ext === "jpeg" ? "jpg" : "png");
  const file = new File([blob], filename, { type: mime });
  let result;
  try {
    result = await uploadAsset(file);
  } catch (err) {
    showToolbarToast(`Bake upload failed: ${err.message}`, "error");
    return;
  }
  uninstallCropOutsideClick();
  const fromFile = nodeObj.file;
  const fromCrop = nodeObj._cropEnterCrop ? { ...nodeObj._cropEnterCrop } : null;
  const fromSize = nodeObj._cropEnterSize ? { ...nodeObj._cropEnterSize } : { w: nodeObj.width, h: nodeObj.height };
  const fromPos = nodeObj._cropEnterPos ? { ...nodeObj._cropEnterPos } : { x: nodeObj.x, y: nodeObj.y };
  const fullW = nodeObj.width;
  const fullH = nodeObj.height;
  const newW = fullW * (draft.right - draft.left);
  const newH = fullH * (draft.bottom - draft.top);
  const newX = nodeObj.x + draft.left * fullW;
  const newY = nodeObj.y + draft.top * fullH;
  const toFile = result.url;
  const toSize = { w: newW, h: newH };
  const toPos = { x: newX, y: newY };

  nodeObj.file = result.url;
  delete nodeObj.crop;
  nodeObj.x = newX;
  nodeObj.y = newY;
  nodeObj.width = newW;
  nodeObj.height = newH;
  delete nodeObj.isCropping;
  delete nodeObj._cropDraft;
  delete nodeObj._cropEnterCrop;
  delete nodeObj._cropEnterSize;
  delete nodeObj._cropEnterPos;

  const el2 = getBoardElementById(nodeObj.id);
  if (el2) el2.classList.remove("is-cropping");

  pushAction({
    type: "bake",
    nodeId: nodeObj.id,
    fromFile, fromCrop, fromSize, fromPos,
    toFile, toSize, toPos
  });
  renderNode(nodeObj);
}

function renderNode(nodeObj) {
  let el = getBoardElementById(nodeObj.id);
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
    let pendingTouchTapSelection = false;
    let pendingTouchSelectedDrag = false;
    let pendingTouchSelectedDragStart = { x: 0, y: 0 };
    let textNodeWasSelectedOnTouchStart = false;
    let isResizing = false;
    const cancelNodeDrag = () => {
      isDragging = false;
      dragStartPositions = [];
      pendingTouchTapSelection = false;
      pendingTouchSelectedDrag = false;
      pendingTouchSelectedDragStart = { x: 0, y: 0 };
      textNodeWasSelectedOnTouchStart = false;
    };
    const cancelNodeResize = () => {
      isResizing = false;
    };

    function beginNodeDrag(clientX, clientY, shiftKey = false) {
      if (activeTool === "pan") return false;
      if (activeTool !== "select") return false;

      isDragging = true;
      dragStart = { x: clientX, y: clientY };

      if (!shiftKey && !el.classList.contains("selected")) {
        canvas.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      }
      el.classList.add("selected");

      dragStartPositions = [];
      dragStartPositions = captureSelectedNodePositions();

      setActiveTouchNodeInteraction(cancelNodeDrag);

      return true;
    }

    function moveSelectedNodes(clientX, clientY) {
      if (!isDragging) return;

      const dx = (clientX - dragStart.x) / camera.z;
      const dy = (clientY - dragStart.y) / camera.z;
      dragStart = { x: clientX, y: clientY };
      moveSelectedNodesByDelta(dx, dy);
    }

    function finishNodeDrag() {
      if (isDragging && dragStartPositions.length > 0) {
        pushSelectedMoveActionFromStartPositions(dragStartPositions);
      }
      dragStartPositions = [];
      isDragging = false;
      clearActiveTouchNodeInteraction(cancelNodeDrag);
    }
    
    el.addEventListener("mousedown", (e) => {
      // Pan tool should never drag items — panning is handled globally
      if (activeTool === "pan") return;
      if (activeTool !== "select") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (isLinkInteractionTarget(e.target)) return;
      if (e.target.classList.contains("resize-handle")) return; // handled separately
      // Don't start drag if clicking inside an active contenteditable
      if (e.target.isContentEditable && document.activeElement === e.target) return;
      
      if (!beginNodeDrag(e.clientX, e.clientY, e.shiftKey)) return;
      e.stopPropagation();
    });

    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      if (activeTool !== "select") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (isLinkInteractionTarget(e.target)) return;
      if (e.target.classList.contains("resize-handle")) return; // handled separately
      if (e.target.isContentEditable && document.activeElement === e.target) return;

      cancelBoardPanState();
      resetTouchPlacementState();

      if (shouldUseTouchSelectBehavior()) {
        const touch = e.touches[0];
        textNodeWasSelectedOnTouchStart = el.classList.contains("selected");
        pendingTouchTapSelection = true;
        pendingTouchSelectedDrag = false;
        pendingTouchSelectedDragStart = { x: touch.clientX, y: touch.clientY };

        if (el.classList.contains("selected")) {
          resetTouchSelectState({ clearSelectionRect: true });
          pendingTouchSelectedDrag = true;
          e.preventDefault();
          e.stopPropagation();
          setActiveTouchNodeInteraction(cancelNodeDrag);
          return;
        }

        e.preventDefault();
        armTouchSelectMode("item-drag", touch.clientX, touch.clientY, () => {
          pendingTouchTapSelection = false;
          isPanning = false;

          if (!el.classList.contains("selected")) {
            canvas.querySelectorAll(".bd-item").forEach((n) => n.classList.remove("selected"));
            el.classList.add("selected");
          }

          beginNodeDrag(touchSelectState.startX, touchSelectState.startY, false);
        });
        return;
      }

      if (!el.classList.contains("selected")) {
        canvas.querySelectorAll(".bd-item").forEach((n) => n.classList.remove("selected"));
        el.classList.add("selected");
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const touch = e.touches[0];
      if (!beginNodeDrag(touch.clientX, touch.clientY, false)) return;
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    el.addEventListener("touchend", (e) => {
      if (activeTool !== "select" || !shouldUseTouchSelectBehavior()) {
        pendingTouchTapSelection = false;
        pendingTouchSelectedDrag = false;
        textNodeWasSelectedOnTouchStart = false;
        return;
      }

      if (isLinkInteractionTarget(e.target)) {
        pendingTouchTapSelection = false;
        pendingTouchSelectedDrag = false;
        textNodeWasSelectedOnTouchStart = false;
        return;
      }

      if (!pendingTouchTapSelection) {
        pendingTouchSelectedDrag = false;
        textNodeWasSelectedOnTouchStart = false;
        return;
      }
      pendingTouchTapSelection = false;
      pendingTouchSelectedDrag = false;

      if (touchSelectState.movedSinceStart || touchSelectState.interrupted || touchSelectState.activeMode === "item-drag") {
        textNodeWasSelectedOnTouchStart = false;
        return;
      }

      if (nodeObj.type === "text" && !nodeObj.text?.includes("<svg") && textNodeWasSelectedOnTouchStart) {
        const editor = el.querySelector(".bd-text-editor");
        if (editor) {
          beginTextEditing(nodeObj, editor, { placeCaretAtEnd: true });
          e.preventDefault();
          e.stopPropagation();
          textNodeWasSelectedOnTouchStart = false;
          return;
        }
      }

      canvas.querySelectorAll(".bd-item").forEach((n) => n.classList.remove("selected"));
      el.classList.add("selected");
      e.preventDefault();
      e.stopPropagation();
      textNodeWasSelectedOnTouchStart = false;
    }, { passive: false });

    el.addEventListener("touchcancel", () => {
      pendingTouchTapSelection = false;
      pendingTouchSelectedDrag = false;
      textNodeWasSelectedOnTouchStart = false;
    });
    
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      moveSelectedNodes(e.clientX, e.clientY);
    });

    window.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 1) return;
      if (pendingTouchSelectedDrag && !isDragging) {
        const touch = e.touches[0];
        const dx = touch.clientX - pendingTouchSelectedDragStart.x;
        const dy = touch.clientY - pendingTouchSelectedDragStart.y;
        if (Math.hypot(dx, dy) > TOUCH_SELECT_MOVE_TOLERANCE) {
          pendingTouchTapSelection = false;
          pendingTouchSelectedDrag = false;
          if (beginNodeDrag(pendingTouchSelectedDragStart.x, pendingTouchSelectedDragStart.y, false)) {
            e.preventDefault();
            moveSelectedNodes(touch.clientX, touch.clientY);
          }
          return;
        }
      }
      if (!isDragging) return;
      e.preventDefault();
      moveSelectedNodes(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    window.addEventListener("mouseup", finishNodeDrag);
    window.addEventListener("touchend", finishNodeDrag);
    window.addEventListener("touchcancel", finishNodeDrag);

    // Resize logic
    let resizeStartSize = { w: 0, h: 0 };
    let resizeStartPoint = { x: 0, y: 0 };

    function beginNodeResize(clientX, clientY) {
      if (activeTool !== "select") return false;

      cancelBoardPanState();
      resetTouchSelectState({ clearSelectionRect: true });
      resetTouchPlacementState();
      isResizing = true;
      resizeStartSize = { w: nodeObj.width, h: nodeObj.height };
      resizeStartPoint = { x: clientX, y: clientY };
      canvas.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      el.classList.add("selected");
      setActiveTouchNodeInteraction(cancelNodeResize);
      return true;
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
      } else if (nodeObj.type === "board-preview") {
        nodeObj.width = Math.max(nodeObj.width + deltaX, BOARD_PREVIEW_MIN_NODE_WIDTH);
        el.style.width = `${nodeObj.width}px`;
        syncBoardPreviewNodeSize(nodeObj, el);
        return;
      } else {
        nodeObj.width = Math.max(nodeObj.width + deltaX, 50);
        nodeObj.height = Math.max(nodeObj.height + deltaY, 50);
      }
      el.style.width = `${nodeObj.width}px`;
      el.style.height = `${nodeObj.height}px`;
    }

    function finishNodeResize() {
      if (isResizing) {
        syncBoardPreviewNodeSize(nodeObj, el);
        // Push resize action if size actually changed
        if (Math.abs(nodeObj.width - resizeStartSize.w) > 0.5 || Math.abs(nodeObj.height - resizeStartSize.h) > 0.5) {
          pushAction({ type: 'resize', nodeId: nodeObj.id, fromSize: resizeStartSize, toSize: { w: nodeObj.width, h: nodeObj.height } });
        }
      }
      isResizing = false;
      clearActiveTouchNodeInteraction(cancelNodeResize);
    }

    handle.addEventListener("mousedown", (e) => {
      if (activeTool !== "select") return;
      e.preventDefault();
      e.stopPropagation();
      beginNodeResize(e.clientX, e.clientY);
    });

    handle.addEventListener("touchstart", (e) => {
      if (activeTool !== "select") return;
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

    el.addEventListener("dblclick", (e) => {
      if (nodeObj.type !== "file") return;
      if (e.target && e.target.closest && e.target.closest(".bd-crop-overlay")) return;
      if (nodeObj.isCropping) return;
      e.preventDefault();
      e.stopPropagation();
      enterCropMode(nodeObj);
    });
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
        ta.addEventListener("input", () => {
          nodeObj.text = normalizeTextEditorValue(ta.innerText);
          ta.classList.toggle("is-empty", nodeObj.text.length === 0);
          markBoardDirty();
        });
        // Only stop propagation when actively editing (contenteditable=true)
        ta.addEventListener("mousedown", (e) => {
          if (ta.contentEditable === "true") e.stopPropagation();
        });
        ta.addEventListener("touchstart", (e) => {
          if (ta.contentEditable === "true") e.stopPropagation();
        }, { passive: true });
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
    if (nodeObj.isCropping) {
      el.classList.add("is-cropping");
      renderImageCropOverlay(nodeObj, el);
    } else {
      el.classList.remove("is-cropping");
      const wrap = el.querySelector(".bd-file-cropbox");
      const img = wrap && wrap.querySelector("img");
      if (wrap && img && wrap.dataset.fileSrc === nodeObj.file) {
        applyCropTransform(img, nodeObj.crop);
      } else {
        renderImageCropbox(nodeObj, el);
      }
    }
  } else if (nodeObj.type === "link") {
    renderLinkNode(nodeObj, el);

    if (nodeObj.url && (!nodeObj.title || (getYouTubeVideoId(nodeObj.url) && !nodeObj.image))) {
      fetchBookmarkPreview(nodeObj, el);
    }
  } else if (nodeObj.type === "board-preview") {
    renderBoardPreviewNode(nodeObj, el);
  } else if (nodeObj.type === "markdown") {
    renderMarkdownNode(nodeObj, el);
  } else if (nodeObj.type === "markdown-db") {
    renderMarkdownDbNode(nodeObj, el);
  } else if (nodeObj.type === "base") {
    renderBaseNode(nodeObj, el);
  } else if (nodeObj.type === "app") {
    renderAppNode(nodeObj, el);
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

  boardMeta = {
    canvasId: typeof data?.canvasId === "string" && data.canvasId ? data.canvasId : null,
    createdAt: typeof data?.createdAt === "string" && data.createdAt ? data.createdAt : null,
    updatedAt: typeof data?.updatedAt === "string" && data.updatedAt ? data.updatedAt : null
  };
  ensureCanvasId();

  if (data.viewport) {
    if (typeof data.viewport.x === 'number') camera.x = data.viewport.x;
    if (typeof data.viewport.y === 'number') camera.y = data.viewport.y;
    if (typeof data.viewport.z === 'number') camera.z = data.viewport.z;
  }

  if (data.nodes) {
    data.nodes.forEach(n => {
      const node = normalizeNodeAssetUrls(n);
      let type = node.type === "text" && node.text?.includes("<svg") ? "draw" : node.type;
      if (type === "text") createNode("text", node.x, node.y, node);
      else if (type === "link") createNode("link", node.x, node.y, node);
      else if (type === "file") createNode("image", node.x, node.y, node);
      else if (type === "draw") createNode("draw", node.x, node.y, node);
      else createNode(node.type, node.x, node.y, node);
    });
  }
  isLoadingState = false;
}

function normalizeNodeAssetUrls(n) {
  if (!n || typeof n !== "object") return n;
  const next = { ...n };
  for (const key of ["file", "url", "href", "boardSource", "boardHref", "source"]) {
    if (typeof next[key] === "string" && next[key]) {
      next[key] = normalizeAssetUrl(next[key]);
    }
  }
  return next;
}

async function loadBoard() {
  const sources = [...new Set([boardConfig.sourcePath, boardConfig.legacySourcePath].filter(Boolean))];

  try {
    for (const sourcePath of sources) {
      const data = await fetchBoardState(sourcePath);
      if (!data) continue;

      loadState(data);
      const state = serializeState();
      if (!isPreviewMode) {
        flushLocalStateSave(state);
        setComparisonBaseline(state);
        hasPendingRepositorySave = false;
        autosaveRepositorySupported = true;
      }
      updateTransform();
      return true;
    }
  } catch (err) {
    console.warn("No initial board state found.", err);
  }

  return false;
}

async function saveBoard(options = {}) {
  const { showFeedback = true, source = "manual" } = options;
  if (source === "autosave" && (!hasPendingRepositorySave || !autosaveRepositorySupported || isPersistingRepositoryState)) {
    return { ok: false, skipped: true };
  }
  if (source !== "autosave" && isPersistingRepositoryState) {
    return { ok: false, skipped: true };
  }

  boardMeta.updatedAt = new Date().toISOString();
  const state = serializeState();
  const serialized = flushLocalStateSave(state);
  isPersistingRepositoryState = true;
  try {
    let res = await fetch(buildSaveUrl(), {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: serialized
    });
    if (res.ok) {
      const result = await res.json().catch(() => null);
      hasPendingRepositorySave = false;
      autosaveRepositorySupported = true;
      setComparisonBaseline(state);
      if (showFeedback) {
        if (result?.path) showToolbarToast(`Saved to ${result.path}`, "success");
        else showToolbarToast("Board saved to local repository copy.", "success");
      }
      return { ok: true, path: result?.path || null };
    } else {
      autosaveRepositorySupported = false;
      if (showFeedback) {
        showToolbarToast("Saved locally. Start dev-server to persist to the repository.", "info");
      }
      return { ok: false, skipped: false };
    }
  } catch(e) {
    autosaveRepositorySupported = false;
    if (showFeedback) {
      showToolbarToast("Saved locally. Start dev-server to persist to the repository.", "info");
    }
    return { ok: false, skipped: false };
  } finally {
    isPersistingRepositoryState = false;
  }
}

// Init
setActiveTool(isPreviewMode ? "pan" : "select");
applyBoardSettings({ persist: false });
let saved = isPreviewMode ? getCanvasDraftStateForPreview() : getSavedState();
// Treat empty/stub localStorage drafts as "no saved state" — otherwise loading
// them sets dirty=true and the next autosave wipes the on-disk canvas.
if (saved) {
  try {
    const parsedSaved = JSON.parse(saved);
    const hasContent = parsedSaved && Array.isArray(parsedSaved.nodes) && parsedSaved.nodes.length > 0;
    if (!hasContent) {
      saved = null;
    } else {
      loadState(parsedSaved);
      if (!isPreviewMode) {
        const state = serializeState();
        flushLocalStateSave(state);
        setComparisonBaseline(state);
        hasPendingRepositorySave = true;
        autosaveRepositorySupported = true;
      }
    }
  } catch(e) {
    saved = null;
  }
}
if (!saved) { loadBoard(); }
updateTransform();

if (pendingStartupToast && !isPreviewMode) {
  window.setTimeout(() => {
    showToolbarToast(pendingStartupToast, "info");
    pendingStartupToast = "";
  }, 180);
}

if (!isPreviewMode) {
  window.addEventListener("beforeunload", () => {
    flushLocalStateSave();
  });
}

if (isPreviewMode) {
  // The project page has no beforeunload listener, so back-button navigation
  // can restore it from bfcache without re-running scripts. Refresh from the
  // canvas's current draft (or file) when that happens.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    const fresh = getCanvasDraftStateForPreview();
    if (fresh) {
      try {
        loadState(JSON.parse(fresh));
        updateTransform();
        return;
      } catch (error) {
        // fall through to a fresh file fetch
      }
    }
    loadBoard();
  });
}

return viewport;
} // end mountCosmoboard

document.querySelectorAll('[data-board-app="true"]').forEach(mountCosmoboard);
