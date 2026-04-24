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

function beginRecommendationFlow() {
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

function serializeState() {
  return { nodes, edges, viewport: { x: camera.x, y: camera.y, z: camera.z } };
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

function placeToolNodeAt(clientX, clientY, tool = activeTool) {
  if (isPreviewMode) return;
  if (tool === "text") {
    const dimensions = { width: 250, height: 150 };
    const position = shouldUseTouchSelectBehavior()
      ? getCenteredNodeCanvasPosition(dimensions.width, dimensions.height)
      : screenToCanvas(clientX, clientY);
    const newNode = createNode("text", position.x, position.y, { text: "", ...dimensions });
    focusTextEditor(newNode.id, {
      placeCaretAtEnd: true,
      centerInView: shouldUseTouchSelectBehavior()
    });

    // Mobile browsers are stricter about focus timing; retry once if the editor
    // did not enter editing mode during the original gesture.
    const editor = getBoardElementById(newNode.id)?.querySelector(".bd-text-editor");
    if (editor?.contentEditable !== "true") {
      window.setTimeout(() => focusTextEditor(newNode.id, {
        placeCaretAtEnd: true,
        centerInView: shouldUseTouchSelectBehavior()
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
  markBoardDirty();
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
      draw(touch.clientX, touch.clientY);
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
      touchPlacementState.pendingTool
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
    } else if (activeTool === "select" && e.target.closest && !e.target.closest(".bd-item") && !isBoardToolbarTarget(e.target)) {
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
    placeToolNodeAt(e.clientX, e.clientY, "text");
  } else if (activeTool !== "pan" && activeTool !== "select" && activeTool !== "draw") {
    placeToolNodeAt(e.clientX, e.clientY, activeTool);
  }
});

// Mouse position tracking for exact paste locations
let lastMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

window.addEventListener("pointermove", (e) => {
  if (_activeBoardViewport !== viewport) return;
  lastMousePos.x = e.clientX;
  lastMousePos.y = e.clientY;
  if (isPanning) {
    camera.x = e.clientX - startPan.x;
    camera.y = e.clientY - startPan.y;
    updateTransform();
  } else if (isDrawing) {
    draw(e.clientX, e.clientY);
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

// Shortcuts
window.addEventListener("keydown", (e) => {
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT" || e.target.isContentEditable) return;
  if (_mountedBoardCount > 1) {
    if (_activeBoardViewport && _activeBoardViewport !== viewport) return;
    if (!_activeBoardViewport && !viewport.matches(":focus-within")) return;
  }
  // Undo/Redo/Cut/Copy/Delete
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !e.shiftKey) { e.preventDefault(); saveLocalFile(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && e.shiftKey) { e.preventDefault(); saveLocalFileAs(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") { e.preventDefault(); openLocalFile(); return; }
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
  if (btn.dataset.tool === "open") return openLocalFile();
  if (btn.dataset.tool === "save") return saveLocalFile();
  if (btn.dataset.tool === "export") return openExportModal();
  
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
  const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));

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

  for (const node of importedState.nodes || []) {
    if (node.type === "file" && node.file && blobUrlMap[node.file]) {
      node.file = blobUrlMap[node.file];
    } else if (node.type === "board-preview" && node.boardSource && blobUrlMap[node.boardSource]) {
      node.boardSource = blobUrlMap[node.boardSource];
    } else if (node.type === "markdown" && node.file && blobUrlMap[node.file]) {
      node.file = blobUrlMap[node.file];
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
  }
});

if (fileInput) {
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith(".zip")) {
      if (!window.fflate) {
        showToolbarToast("Bundler library not loaded.", "error");
        return;
      }
      try {
        const importedState = await readProjectBundleFile(file);
        loadState(importedState);
        persistLocalState(serializeState());
        setComparisonBaseline(serializeState());
        autosaveRepositorySupported = true;
        markBoardDirty({ scheduleLocalSave: false });
        setToolbarActionsOpen(false);
        setRecommendationPanelOpen(false);
        setFeatureRequestPanelOpen(false);
        setBugReportPanelOpen(false);
        setSettingsPanelOpen(false);
        showToolbarToast(`Imported bundle ${file.name}`, "success");
      } catch(err) {
        showToolbarToast(err.message === "No board file found in bundle." ? err.message : "Failed to import bundle.", "error");
      }
      fileInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        loadState(data);
        persistLocalState(serializeState());
        setComparisonBaseline(serializeState());
        autosaveRepositorySupported = true;
        markBoardDirty({ scheduleLocalSave: false });
        setToolbarActionsOpen(false);
        setRecommendationPanelOpen(false);
        setFeatureRequestPanelOpen(false);
        setBugReportPanelOpen(false);
        setSettingsPanelOpen(false);
        showToolbarToast(`Imported ${file.name}`, "success");
      } catch(err) {
        showToolbarToast("Import failed. Use .canvas, .canvas.json, .json or .zip.", "error");
      }
    };
    reader.readAsText(file);
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

async function openLocalFile() {
  if (supportsFileSystemAccessAPI) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Canvas or Bundle Files',
          accept: { 
            'application/json': ['.canvas', '.json', '.canvas.json'],
            'application/zip': ['.zip']
          }
        }],
        multiple: false
      });
      const file = await handle.getFile();
      
      if (file.name.endsWith(".zip")) {
        if (!window.fflate) {
          showToolbarToast("Bundler library not loaded.", "error");
          return;
        }
        const importedState = await readProjectBundleFile(file);
        loadState(importedState);
        currentFileHandle = handle;
        showToolbarToast(`Opened bundle ${file.name}`, "success");
        return;
      }

      const text = await file.text();
      const importedState = JSON.parse(text);
      if (typeof importedState === "object" && Array.isArray(importedState.nodes)) {
        loadState(importedState);
        currentFileHandle = handle;
        showToolbarToast(`Opened ${file.name}`, "success");
      } else {
        showToolbarToast("Invalid canvas format.", "error");
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error("Open file failed:", err);
        showToolbarToast("Failed to open file.", "error");
      }
    }
  } else {
    // Fallback for unsupported browsers (Safari/Firefox)
    const input = document.getElementById("braindump-import");
    if (input) input.click();
  }
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

  const state = serializeState();
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

function submitRecommendation() {
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
  const recommendationFilename = buildRecommendationFilename();
  downloadStateFile(recommendationFilename, "application/json");
  const issueUrl = buildRecommendationIssueUrl(summary, "", recommendationFilename);
  window.open(issueUrl, "_blank", "noopener,noreferrer");
  setRecommendationPanelOpen(false);
  if (recommendationSummaryInput) recommendationSummaryInput.value = "";
  showToolbarToast(`Recommendation opened. Attach ${recommendationFilename} to the GitHub form.`, "success");
}

// Drawing logic
let lastDrawPoint = { x: 0, y: 0 };
function startDrawing(x, y) {
  if (isPreviewMode) return;
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
            nodeObj.width = img.width;
            nodeObj.height = img.height;
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

    const embedUrl = getYouTubeEmbedUrl(nodeObj.url) || nodeObj.url;

    shell.innerHTML = `
      <div class="bd-embed-header">
        <button type="button" class="bd-embed-toggle-btn" aria-label="Back to preview" title="Back to preview">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          Preview
        </button>
        <div class="bd-embed-domain">${escapeHtml(new URL(nodeObj.url || "http://localhost").hostname)}</div>
        <a class="bd-embed-open-btn" href="${escapeHtml(nodeObj.url)}" target="_blank" rel="noreferrer" draggable="false" aria-label="Open in new tab" title="Open in new tab">
          Open
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>
      <iframe class="bd-embed-iframe" src="${escapeHtml(embedUrl)}" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe>
    `;

    const toggleBtn = shell.querySelector(".bd-embed-toggle-btn");
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

function renderMarkdownNode(nodeObj, el) {
  let shell = el.querySelector(".bd-markdown-shell");
  if (shell) return; // Already rendered — file content is static per load

  shell = document.createElement("div");
  shell.className = "bd-markdown-shell";
  el.insertBefore(shell, el.firstChild);

  const filePath = String(nodeObj.file || "");
  const title = String(nodeObj.title || (filePath.split("/").pop()?.replace(/\.md$/i, "") || "Note"));
  const href = String(nodeObj.href || "");

  // Header bar
  const header = document.createElement("div");
  header.className = "bd-markdown-header";
  header.innerHTML = `
    <svg class="bd-markdown-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    <span class="bd-markdown-title">${String(title).replace(/[<>&"]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"})[c])}</span>
    ${href ? `<a class="bd-markdown-view-link" href="${href}" target="_blank" rel="noreferrer" aria-label="View source file" title="View source">↗</a>` : ""}
  `;
  shell.appendChild(header);

  const body = document.createElement("div");
  body.className = "bd-markdown-body";
  shell.appendChild(body);

  if (!filePath) {
    body.innerHTML = `<p class="bd-markdown-empty">No file path set.</p>`;
    return;
  }

  body.innerHTML = `<p class="bd-markdown-loading">Loading…</p>`;

  fetch(filePath)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    })
    .then((text) => {
      body.innerHTML = parseMarkdownToHtml(text);
    })
    .catch((err) => {
      body.innerHTML = `<p class="bd-markdown-error">Could not load <code>${filePath}</code> (${err.message}).</p>`;
    });
}


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
           markBoardDirty();
        }
      };
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
      const state = serializeState();
      flushLocalStateSave(state);
      setComparisonBaseline(state);
      hasPendingRepositorySave = false;
      autosaveRepositorySupported = true;
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
let saved = getSavedState();
if (saved) {
  try {
    loadState(JSON.parse(saved));
    const state = serializeState();
    flushLocalStateSave(state);
    setComparisonBaseline(state);
    hasPendingRepositorySave = true;
    autosaveRepositorySupported = true;
  } catch(e) {
    loadBoard();
  }
} else { loadBoard(); }
updateTransform();

if (pendingStartupToast && !isPreviewMode) {
  window.setTimeout(() => {
    showToolbarToast(pendingStartupToast, "info");
    pendingStartupToast = "";
  }, 180);
}

window.addEventListener("beforeunload", () => {
  flushLocalStateSave();
});

return viewport;
} // end mountCosmoboard

document.querySelectorAll('[data-board-app="true"]').forEach(mountCosmoboard);
