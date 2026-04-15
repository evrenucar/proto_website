const viewport = document.getElementById("braindump-viewport");
const canvas = document.getElementById("braindump-canvas");
const svgLayer = document.getElementById("braindump-svg-layer");
const toolbarButtons = document.querySelectorAll(".braindump-toolbar button");

let camera = { x: 0, y: 0, z: 1 };
let isPanning = false;
let isDrawing = false;
let activeTool = "pan"; // default mode is just selecting/panning
let startPan = { x: 0, y: 0 };
let currentPath = null;
let currentPathData = "";
let elements = [];

// Apply Camera Transform
function updateTransform() {
  canvas.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.z})`;
  // Scale the background pattern
  viewport.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
  viewport.style.backgroundSize = `${30 * camera.z}px ${30 * camera.z}px`;
}

// Convert screen coordinates to canvas space
function screenToCanvas(x, y) {
  return {
    x: (x - camera.x) / camera.z,
    y: (y - camera.y) / camera.z
  };
}

// Handle Mouse & Touch Pan/Zoom
viewport.addEventListener("wheel", (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const zoomAmount = e.deltaY * -0.01;
    const newZ = Math.min(Math.max(camera.z + zoomAmount * camera.z, 0.1), 5);
    
    // Zoom towards cursor
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Calculate difference
    const dx = (mouseX - camera.x) * (newZ / camera.z - 1);
    const dy = (mouseY - camera.y) * (newZ / camera.z - 1);
    
    camera.x -= dx;
    camera.y -= dy;
    camera.z = newZ;
    updateTransform();
  } else {
    // Pan via wheel (trackpads)
    camera.x -= e.deltaX;
    camera.y -= e.deltaY;
    updateTransform();
  }
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
      startDrawing(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      isPanning = true;
      startPan = { x: e.touches[0].clientX - camera.x, y: e.touches[0].clientY - camera.y };
    }
  }
}, { passive: false });

viewport.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialPinchDistance) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const distance = Math.hypot(dx, dy);
    const scale = distance / initialPinchDistance;
    camera.z = Math.min(Math.max(initialCameraZ * scale, 0.1), 5);
    updateTransform();
  } else if (e.touches.length === 1) {
    if (isDrawing) {
      e.preventDefault();
      draw(e.touches[0].clientX, e.touches[0].clientY);
    } else if (isPanning) {
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

viewport.addEventListener("mousedown", (e) => {
  // Middle click OR left click if spacebar is held
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
    isPanning = true;
    startPan = { x: e.clientX - camera.x, y: e.clientY - camera.y };
    viewport.style.cursor = "grabbing";
    e.preventDefault();
  } else if (e.button === 0) {
    if (activeTool === "draw") {
      startDrawing(e.clientX, e.clientY);
    } else if (activeTool !== "pan" && e.target === viewport) {
      // Add element
      let pos = screenToCanvas(e.clientX, e.clientY);
      createElement(activeTool, pos.x, pos.y);
      setActiveTool("pan");
    }
  }
});

window.addEventListener("mousemove", (e) => {
  if (isPanning) {
    camera.x = e.clientX - startPan.x;
    camera.y = e.clientY - startPan.y;
    updateTransform();
  } else if (isDrawing) {
    draw(e.clientX, e.clientY);
  }
});

window.addEventListener("mouseup", (e) => {
  isPanning = false;
  if (activeTool !== "draw") viewport.style.cursor = "grab";
  if (isDrawing) stopDrawing();
});

// Tools logic
function setActiveTool(tool) {
  activeTool = tool;
  toolbarButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  viewport.dataset.mode = tool;
  if (tool === "draw") viewport.style.cursor = "crosshair";
  else viewport.style.cursor = "grab";
}

toolbarButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.tool === "save") {
      saveBoard();
      return;
    }
    setActiveTool(btn.dataset.tool);
  });
});

// Drawing logic
function startDrawing(x, y) {
  isDrawing = true;
  let pos = screenToCanvas(x, y);
  currentPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  currentPathData = `M ${pos.x} ${pos.y}`;
  currentPath.setAttribute("d", currentPathData);
  svgLayer.appendChild(currentPath);
}

function draw(x, y) {
  if (!isDrawing || !currentPath) return;
  let pos = screenToCanvas(x, y);
  currentPathData += ` L ${pos.x} ${pos.y}`;
  currentPath.setAttribute("d", currentPathData);
}

function stopDrawing() {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentPath) {
    elements.push({
      type: "draw",
      id: "draw-" + Date.now(),
      pathData: currentPathData
    });
  }
  currentPath = null;
}

// Elements Management
function createElement(type, x, y, data = {}) {
  let el = {
    id: data.id || type + "-" + Date.now(),
    type: type,
    x: x,
    y: y,
    ...data
  };
  elements.push(el);
  renderElement(el);
  return el;
}

function renderElement(el) {
  if (el.type === "draw") {
    // Already in SVG if drawn by user, but needed when loading from JSON
    let path = document.getElementById(el.id);
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.id = el.id;
      svgLayer.appendChild(path);
    }
    path.setAttribute("d", el.pathData);
    return;
  }

  let node = document.getElementById(el.id);
  if (!node) {
    node = document.createElement("div");
    node.className = `bd-item bd-layer-${el.type}`;
    node.id = el.id;
    canvas.appendChild(node);
    
    // Make draggable
    let isDragging = false;
    let dragStart = {x:0, y:0};
    
    node.addEventListener("mousedown", (e) => {
      if (activeTool !== "pan") return;
      e.stopPropagation();
      isDragging = true;
      dragStart = { x: e.clientX, y: e.clientY };
      // Bring to front
      document.querySelectorAll(".bd-item").forEach(n => n.classList.remove("selected"));
      node.classList.add("selected");
    });
    
    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      e.preventDefault();
      node.style.transform = `translate(${el.x}px, ${el.y}px)`;
      const dx = (e.clientX - dragStart.x) / camera.z;
      const dy = (e.clientY - dragStart.y) / camera.z;
      dragStart = { x: e.clientX, y: e.clientY };
      el.x += dx;
      el.y += dy;
      node.style.left = \`\${el.x}px\`;
      node.style.top = \`\${el.y}px\`;
    });
    
    window.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  node.style.left = \`\${el.x}px\`;
  node.style.top = \`\${el.y}px\`;

  if (el.type === "text") {
    node.innerHTML = "";
    let ta = document.createElement("textarea");
    ta.value = el.content || "";
    ta.placeholder = "Type here...";
    ta.addEventListener("input", (e) => el.content = e.target.value);
    ta.addEventListener("mousedown", e => e.stopPropagation()); // let user select text
    node.appendChild(ta);
  } else if (el.type === "image") {
    node.innerHTML = \`<img src="\${el.src}" alt="pasted image">\`;
  } else if (el.type === "bookmark") {
    node.innerHTML = \`
      <img class="bd-bookmark-image" src="\${el.image || 'image/placeholder.png'}">
      <h3 class="bd-bookmark-title">\${el.title || 'Untitled Bookmark'}</h3>
      <a class="bd-bookmark-link" href="\${el.url}" target="_blank">\${el.url || '#'}</a>
    \`;
    // Add prompt if empty
    if (!el.url) {
      let url = prompt("Enter bookmark URL:");
      if (url) {
        el.url = url;
        node.querySelector("a").textContent = url;
        node.querySelector("a").href = url;
      }
    }
  }
}

// Paste Images
window.addEventListener("paste", (e) => {
  let items = e.clipboardData.items;
  for (let item of items) {
    if (item.type.indexOf("image") !== -1) {
      let blob = item.getAsFile();
      let reader = new FileReader();
      reader.onload = (event) => {
        let pos = screenToCanvas(window.innerWidth/2, window.innerHeight/2);
        createElement("image", pos.x, pos.y, { src: event.target.result });
      };
      reader.readAsDataURL(blob);
    }
  }
});

// Load & Save State
async function loadBoard() {
  try {
    let res = await fetch("content/braindump-state.json");
    if (res.ok) {
      let data = await res.json();
      if (data.camera) camera = data.camera;
      if (data.elements) {
        data.elements.forEach(el => createElement(el.type, el.x, el.y, el));
      }
      updateTransform();
    }
  } catch (err) {
    console.warn("No initial board state found or failed to parse.", err);
  }
}

async function saveBoard() {
  let state = {
    camera: camera,
    elements: elements
  };
  // Fallback to local storage
  localStorage.setItem("braindump-state", JSON.stringify(state));
  
  // Attempt to save via Dev Server
  try {
    let res = await fetch("/api/save-braindump", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(state)
    });
    if (res.ok) {
      alert("Board saved to content/braindump-state.json!");
    } else {
      alert("Saved locally! Start dev-server.mjs to save to repo.");
    }
  } catch(e) {
    alert("Saved locally! Start dev-server.mjs to save to repo.");
  }
}

// Init
setActiveTool("pan");
if (localStorage.getItem("braindump-state")) {
  try {
    let data = JSON.parse(localStorage.getItem("braindump-state"));
    camera = data.camera || camera;
    if (data.elements) data.elements.forEach(el => createElement(el.type, el.x, el.y, el));
    updateTransform();
  } catch(e) {}
} else {
  loadBoard();
}
updateTransform();
