async (page) => {
  const boardUrl = "http://127.0.0.1:3000/braindump.html";
  const screenshotPath = "C:/Users/evren/Documents/GitHub/proto_website/.agents/skills/whiteboard-performance-testing-skill/previous-tests/latest-grid-stress.png";

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const buildStressState = () => {
    const nodes = [];
    const cols = 18;
    const rows = 18;
    const spacingX = 420;
    const spacingY = 280;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const x = col * spacingX;
        const y = row * spacingY;

        if (index % 3 === 0) {
          nodes.push({
            id: `stress-text-${index}`,
            type: "text",
            x,
            y,
            width: 260,
            height: 150,
            text: `Stress note ${index + 1}`
          });
        } else if (index % 3 === 1) {
          nodes.push({
            id: `stress-link-${index}`,
            type: "link",
            x,
            y,
            width: 320,
            height: 120,
            url: `https://example.com/item-${index + 1}`,
            title: `Reference ${index + 1}`,
            description: "Synthetic stress-test bookmark card."
          });
        } else {
          const localPath = `M ${x + 20} ${y + 40} L ${x + 140} ${y + 80} L ${x + 240} ${y + 20}`;
          const viewBox = `${x} ${y} 260 120`;
          nodes.push({
            id: `stress-draw-${index}`,
            type: "text",
            x,
            y,
            width: 260,
            height: 120,
            text: `<svg class="bd-drawing" viewBox="${viewBox}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible; display:block;"><path d="${localPath}" fill="none" stroke="#3fdaca" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path></svg>`
          });
        }
      }
    }

    return { nodes, edges: [] };
  };

  const summarizeFrames = (samples) => {
    const validSamples = samples.filter((delta) => Number.isFinite(delta) && delta >= 8);

    if (!validSamples.length) {
      return {
        frames: 0,
        avgFps: 0,
        minFps: 0,
        maxFps: 0,
        p95FrameMs: 0,
        droppedFramesOver20ms: 0
      };
    }

    const fpsSamples = validSamples.map((delta) => 1000 / delta);
    const sorted = [...validSamples].sort((a, b) => a - b);
    const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

    return {
      frames: validSamples.length,
      avgFps: Number((fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length).toFixed(1)),
      minFps: Number(Math.min(...fpsSamples).toFixed(1)),
      maxFps: Number(Math.max(...fpsSamples).toFixed(1)),
      p95FrameMs: Number(sorted[p95Index].toFixed(1)),
      droppedFramesOver20ms: validSamples.filter((delta) => delta > 20).length
    };
  };

  const measureSweep = async (pageRef, sweepName) => {
    return pageRef.evaluate(async ({ sweepName }) => {
      const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const samples = [];

      await new Promise((resolve) => {
        let previous = null;
        let start = null;

        const step = (now) => {
          if (previous === null) {
            previous = now;
            start = now;
            requestAnimationFrame(step);
            return;
          }

          samples.push(now - previous);
          previous = now;
          const elapsed = now - start;

          if (sweepName === "zoom") {
            const cycle = (Math.sin(elapsed / 450) + 1) / 2;
            camera.z = 0.45 + cycle * 4.35;
            camera.x = -1800 + cycle * 520;
            camera.y = -1200 + cycle * 360;
          } else {
            camera.z = 1.15;
            camera.x = -Math.sin(elapsed / 550) * 2600 - 1000;
            camera.y = -Math.cos(elapsed / 620) * 1900 - 900;
          }

          updateTransform();

          if (elapsed >= 4000) {
            resolve();
            return;
          }

          requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      });

      await waitMs(100);
      return samples;
    }, { sweepName });
  };

  await page.goto(boardUrl, { waitUntil: "networkidle" });

  const previousBoardState = await page.evaluate(() => localStorage.getItem("board:braindump"));
  const previousLegacyState = await page.evaluate(() => localStorage.getItem("braindump-canvas"));

  const stressState = buildStressState();

  await page.evaluate((state) => {
    localStorage.removeItem("board:braindump");
    localStorage.removeItem("braindump-canvas");
    loadState(state);
    camera.x = 0;
    camera.y = 0;
    camera.z = 1;
    updateTransform();
  }, stressState);

  await wait(300);
  const zoomSamples = await measureSweep(page, "zoom");
  await wait(120);
  const panSamples = await measureSweep(page, "pan");

  await page.evaluate(() => {
    camera.x = -1800;
    camera.y = -1200;
    camera.z = 4.8;
    updateTransform();
  });

  await wait(180);
  await page.screenshot({ path: screenshotPath });

  const gridImplementation = await page.evaluate(() => {
    const grid = document.querySelector(".braindump-grid");
    return {
      elementTag: grid?.tagName?.toLowerCase() || null,
      usesSvgPattern: grid?.tagName?.toLowerCase() === "svg",
      note: grid?.tagName?.toLowerCase() === "svg"
        ? "The grid is rendered as an SVG pattern, not a bitmap image."
        : "The grid is not using the expected SVG pattern layer."
    };
  });

  const maxZoomViewport = await page.evaluate(() => ({
    transform: document.getElementById("braindump-canvas")?.style.transform || "",
    gridTag: document.querySelector(".braindump-grid")?.tagName?.toLowerCase() || null,
    nodeCount: document.querySelectorAll(".bd-item").length
  }));

  await page.evaluate(({ previousBoardState, previousLegacyState }) => {
    if (previousBoardState === null) localStorage.removeItem("board:braindump");
    else localStorage.setItem("board:braindump", previousBoardState);

    if (previousLegacyState === null) localStorage.removeItem("braindump-canvas");
    else localStorage.setItem("braindump-canvas", previousLegacyState);
  }, { previousBoardState, previousLegacyState });

  return {
    boardUrl,
    screenshotPath,
    gridImplementation,
    boardSize: {
      nodes: stressState.nodes.length,
      textNodes: stressState.nodes.filter((node) => node.id.startsWith("stress-text-")).length,
      linkNodes: stressState.nodes.filter((node) => node.id.startsWith("stress-link-")).length,
      drawingNodes: stressState.nodes.filter((node) => node.id.startsWith("stress-draw-")).length
    },
    zoomSweep: summarizeFrames(zoomSamples),
    panSweep: summarizeFrames(panSamples),
    maxZoomViewport
  };
}
