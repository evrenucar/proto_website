import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("JavaScript/braindump.js", "utf8");

test("draw() forwards Shift state from window pointermove", () => {
  assert.match(
    source,
    /isDrawing\)\s*\{\s*draw\(e\.clientX,\s*e\.clientY,\s*e\.shiftKey\)/,
    "window pointermove must pass e.shiftKey through to draw() so the snap branch can activate"
  );
});

test("touchmove forwards Shift state to draw()", () => {
  assert.match(
    source,
    /isDrawing\)\s*\{\s*e\.preventDefault\(\);\s*draw\(touch\.clientX,\s*touch\.clientY,\s*e\.shiftKey\)/,
    "touchmove must pass e.shiftKey through to draw() so hybrid devices can also snap"
  );
});

test("draw() has a Shift-snap branch gated on draw tool only", () => {
  assert.match(
    source,
    /if \(shiftKey && activeTool === "draw"\)/,
    "the snap branch must only fire while the draw tool is active so other tools stay unaffected"
  );
});

test("Shift-snap branch returns early to avoid touching the freehand path", () => {
  // The branch must end with `return;` before the freehand throttling logic so
  // performance and behavior of normal drawing stays unchanged when Shift is up.
  const snapBranch = source.match(
    /if \(shiftKey && activeTool === "draw"\)\s*\{[\s\S]*?\n  \}/
  );
  assert.ok(snapBranch, "expected a Shift-snap branch in draw()");
  assert.match(snapBranch[0], /\n {4}return;\n {2}\}/, "snap branch must early-return before the freehand path");
});

test("snapshot of preservedPathData and lineStartPoint happens once per Shift press", () => {
  assert.match(
    source,
    /if \(!wasShiftHeld\)\s*\{\s*preservedPathData = currentPathData;\s*lineStartPoint = \{ x: lastDrawPoint\.x, y: lastDrawPoint\.y \};\s*wasShiftHeld = true;/,
    "preservedPathData / lineStartPoint must be captured only on the first Shift-down frame"
  );
});

test("active tail is rebuilt as preservedPathData + one L command per move", () => {
  assert.match(
    source,
    /currentPathData = `\$\{preservedPathData\} L \$\{end\.x\} \$\{end\.y\}`;/,
    "every Shift-held move must rebuild currentPathData by appending exactly one L command to preservedPathData"
  );
});

test("startDrawing resets shift-snap state on every new stroke", () => {
  assert.match(
    source,
    /function startDrawing\([\s\S]*?preservedPathData = "";\s*lineStartPoint = null;\s*lineEndPoint = null;\s*wasShiftHeld = false;/,
    "startDrawing must clear shift-snap state so a fresh stroke does not inherit a stale anchor"
  );
});

test("Shift keyup bakes the active straight segment", () => {
  assert.match(
    source,
    /e\.key === "Shift" && isDrawing && wasShiftHeld[\s\S]*?bakeShiftSegment\(\)/,
    "releasing Shift mid-stroke must bake the segment so a second Shift press starts a fresh anchor"
  );
});

test("stopDrawing bakes any pending shift segment before committing", () => {
  assert.match(
    source,
    /function stopDrawing\(\)\s*\{[\s\S]*?bakeShiftSegment\(\);/,
    "stopDrawing must call bakeShiftSegment() so pointerup-while-Shift commits a clean stroke"
  );
});

test("snap preview does not call pushAction during pointer movement", () => {
  // Extract the snap branch and assert it never writes an undo entry.
  const snapBranch = source.match(
    /if \(shiftKey && activeTool === "draw"\)\s*\{[\s\S]*?\n  \}/
  );
  assert.ok(snapBranch, "expected a Shift-snap branch in draw()");
  assert.doesNotMatch(
    snapBranch[0],
    /pushAction|undoStack|history|markBoardDirty|saveBoard/,
    "shift-snap preview must never write to undo / history / save during movement"
  );
});

test("draw tool short-circuits the Shift+drag pan shortcut on mousedown", () => {
  // Without this, holding Shift while clicking with the draw tool selected
  // would trigger the Shift+drag pan shortcut instead of starting a stroke,
  // and the snap branch would never engage.
  const mousedownBlock = source.match(
    /viewport\.addEventListener\("mousedown",[\s\S]*?\}\);/
  );
  assert.ok(mousedownBlock, "expected the viewport mousedown handler in the source");
  // The draw branch must appear before the Shift+pan branch.
  const drawIdx = mousedownBlock[0].indexOf('activeTool === "draw"');
  const panIdx = mousedownBlock[0].indexOf("e.shiftKey");
  assert.ok(drawIdx >= 0 && panIdx >= 0, "both branches must exist");
  assert.ok(
    drawIdx < panIdx,
    "the draw-tool branch must short-circuit the Shift+pan branch so Shift can start a snapped stroke"
  );
});

test("freehand throttle and append remain in draw() after the snap branch", () => {
  // Sanity guard: the original freehand logic must still be present and unchanged
  // in shape so non-Shift drawing performance is identical.
  assert.match(
    source,
    /let dist = Math\.hypot\(pos\.x - lastDrawPoint\.x, pos\.y - lastDrawPoint\.y\);\s*if \(dist < 4 \/ camera\.z\) return;\s*lastDrawPoint = pos;/,
    "freehand throttle must remain intact"
  );
  assert.match(
    source,
    /currentPathData \+= ` L \$\{pos\.x\} \$\{pos\.y\}`;/,
    "freehand append must remain intact"
  );
});
