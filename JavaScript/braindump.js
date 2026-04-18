const viewport = document.getElementById("braindump-viewport");
const canvas = document.getElementById("braindump-canvas");
const svgLayer = document.getElementById("braindump-svg-layer");
const toolbarButtons = document.querySelectorAll(".braindump-toolbar button");
const fileInput = document.getElementById("braindump-import");

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
      const ta = el.querySelector('div[contenteditable]');
      if (ta) ta.innerText = action.oldText || 'Type here...';
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
      const ta = el.querySelector('div[contenteditable]');
      if (ta) ta.innerText = action.newText || 'Type here...';
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
      createNode("text", pos.x, pos.y, { text: "", width: 250, height: 150 });
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
  if (tool === "export" || tool === "import" || tool === "save") return;
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
    if (btn.dataset.tool === "export") return exportCanvas();
    setActiveTool(btn.dataset.tool);
  });
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
      } catch(err) {
        alert("Failed to parse .canvas file");
      }
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

function exportCanvas() {
  const state = { nodes, edges };
  const jsonStr = JSON.stringify(state, null, 2);
  // Use octet-stream to force download in all browsers including Chrome
  const blob = new Blob([jsonStr], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "braindump.canvas";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Delay cleanup so browser has time to initiate the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
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
    
    el.addEventListener("mousedown", (e) => {
      // Pan tool should never drag items — panning is handled globally
      if (activeTool === "pan") return;
      if (activeTool !== "select") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.target.classList.contains("resize-handle")) return; // handled separately
      // Don't start drag if clicking inside an active contenteditable
      if (e.target.isContentEditable && document.activeElement === e.target) return;
      
      e.stopPropagation();
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      
      if (!e.shiftKey && !el.classList.contains("selected")) {
        document.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      }
      el.classList.add("selected");
      
      // Capture start positions for undo
      dragStartPositions = [];
      document.querySelectorAll('.bd-item.selected').forEach(selEl => {
        const selNode = nodes.find(n => n.id === selEl.id);
        if (selNode) dragStartPositions.push({ id: selNode.id, x: selNode.x, y: selNode.y });
      });
    });
    
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = (e.clientX - dragStart.x) / camera.z;
      const dy = (e.clientY - dragStart.y) / camera.z;
      dragStart = { x: e.clientX, y: e.clientY };
      
      // Move all selected nodes
      document.querySelectorAll(".bd-item.selected").forEach(selEl => {
        let selNode = nodes.find(n => n.id === selEl.id);
        if (selNode) {
          selNode.x += dx;
          selNode.y += dy;
          selEl.style.left = `${selNode.x}px`;
          selEl.style.top = `${selNode.y}px`;
        }
      });
    });
    
    window.addEventListener("mouseup", () => {
      if (isDragging && dragStartPositions.length > 0) {
        // Check if anything actually moved
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
        dragStartPositions = [];
      }
      isDragging = false;
    });

    // Resize logic
    let isResizing = false;
    let resizeStartSize = { w: 0, h: 0 };
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isResizing = true;
      resizeStartSize = { w: nodeObj.width, h: nodeObj.height };
      document.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      el.classList.add("selected");
    });
    
    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      let deltaX = e.movementX / camera.z;
      let deltaY = e.movementY / camera.z;
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
    });
    
    window.addEventListener("mouseup", () => {
      if (isResizing) {
        // Push resize action if size actually changed
        if (Math.abs(nodeObj.width - resizeStartSize.w) > 0.5 || Math.abs(nodeObj.height - resizeStartSize.h) > 0.5) {
          pushAction({ type: 'resize', nodeId: nodeObj.id, fromSize: resizeStartSize, toSize: { w: nodeObj.width, h: nodeObj.height } });
        }
      }
      isResizing = false;
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
      let ta = el.querySelector("div[contenteditable]");
      if (!ta) {
        ta = document.createElement("div");
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
        ta.addEventListener("input", (e) => nodeObj.text = e.target.innerText);
        // Only stop propagation when actively editing (contenteditable=true)
        ta.addEventListener("mousedown", (e) => {
          if (ta.contentEditable === "true") e.stopPropagation();
        });
        ta.contentEditable = "false";
        el.addEventListener("dblclick", () => {
          ta.dataset.undoText = nodeObj.text;
          ta.contentEditable = "true";
          ta.focus();
        });
        // Clicking outside or single-clicking deactivates text editing
        document.addEventListener("pointerdown", (e) => {
          if (!el.contains(e.target)) {
            if (ta.contentEditable === "true") {
              ta.contentEditable = "false";
              if (ta.dataset.undoText !== undefined && ta.dataset.undoText !== nodeObj.text) {
                pushAction({ type: 'editText', nodeId: nodeObj.id, oldText: ta.dataset.undoText, newText: nodeObj.text });
              }
            }
          }
        });
        
        el.insertBefore(ta, el.firstChild);
      }
      if (document.activeElement !== ta) {
        ta.innerText = nodeObj.text || "Type here...";
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
          <h3 class="bd-bookmark-title">Link Preview</h3>
          <p class="bd-bookmark-desc" style="font-size:12px;opacity:0.7;margin:0"></p>
          <a class="bd-bookmark-link" href="${nodeObj.url}" target="_blank" draggable="false">${nodeObj.url || '#'}</a>
        </div>
        `);
        
        fetch(`https://api.microlink.io/?url=${encodeURIComponent(nodeObj.url)}`)
          .then(res => res.json())
          .then(data => {
            if (data.status === "success" && data.data) {
                el.querySelector(".bd-bookmark-title").textContent = data.data.title || "Link Preview";
                if (data.data.description && el.querySelector(".bd-bookmark-desc")) {
                  el.querySelector(".bd-bookmark-desc").textContent = data.data.description;
                }
                if (data.data.image && data.data.image.url && !el.querySelector(".bd-bookmark-image")) {
                  el.insertAdjacentHTML("afterbegin", `<img class="bd-bookmark-image" src="${data.data.image.url}" draggable="false">`);
                  if(!nodeObj.hasAdjustedRatio) {
                    nodeObj.height += 160; 
                    nodeObj.hasAdjustedRatio = true;
                    el.style.height = `${nodeObj.height}px`;
                  }
                }
            }
          }).catch(err => console.log(err));
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
  try {
    let res = await fetch("content/braindump-state.json");
    if (res.ok) {
      loadState(await res.json());
      updateTransform();
    }
  } catch (err) {
    console.warn("No initial board state found.", err);
  }
}

async function saveBoard() {
  let state = { nodes, edges };
  localStorage.setItem("braindump-canvas", JSON.stringify(state));
  try {
    let res = await fetch("/api/save-braindump", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(state)
    });
    if (res.ok) alert("Board saved to repository!");
    else alert("Saved to memory. Start dev-server to save to repo.");
  } catch(e) {
    alert("Saved to memory. Start dev-server to save to repo.");
  }
}

// Init
setActiveTool("select");
let saved = localStorage.getItem("braindump-canvas");
if (saved) {
  try { loadState(JSON.parse(saved)); } catch(e) {}
} else { loadBoard(); }
updateTransform();
