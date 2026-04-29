import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("JavaScript/braindump.js", "utf8");

const match = source.match(
  /\/\* @export-for-test:snapStraightLine \*\/\s*(function snapStraightLine\([\s\S]*?\n\})/
);
assert.ok(match, "snapStraightLine must carry the @export-for-test marker so this test can extract it");

const snapStraightLine = new Function(`return ${match[1]}`)();

const start = { x: 100, y: 100 };

function approx(value, expected, eps = 1e-9) {
  return Math.abs(value - expected) <= eps;
}

test("snaps cursor on the 0° axis to exactly horizontal-right at the same distance", () => {
  const result = snapStraightLine(start, { x: 200, y: 100 });
  assert.ok(approx(result.x, 200) && approx(result.y, 100));
});

test("snaps a near-horizontal cursor inside ±3° to exactly horizontal", () => {
  // 100 over, 2 down → angle ≈ 1.146°, well inside tolerance.
  const result = snapStraightLine(start, { x: 200, y: 102 });
  assert.ok(approx(result.y, 100, 1e-9), `expected y == 100, got ${result.y}`);
});

test("does not snap a cursor outside the ±3° tolerance window", () => {
  // angle ≈ 5.7°, outside ±3°.
  const result = snapStraightLine(start, { x: 200, y: 110 });
  assert.equal(result.x, 200);
  assert.equal(result.y, 110);
});

test("snaps to the eight cardinal/diagonal axes", () => {
  const cases = [
    { cursor: { x: 200, y: 100 }, expected: { x: 200, y: 100 } }, // 0°
    { cursor: { x: 100, y: 200 }, expected: { x: 100, y: 200 } }, // 90°
    { cursor: { x: 0, y: 100 }, expected: { x: 0, y: 100 } }, // 180°
    { cursor: { x: 100, y: 0 }, expected: { x: 100, y: 0 } }, // -90°
  ];
  for (const { cursor, expected } of cases) {
    const result = snapStraightLine(start, cursor);
    assert.ok(approx(result.x, expected.x, 1e-6) && approx(result.y, expected.y, 1e-6));
  }
});

test("snaps to the 45° diagonals when the angle is exact", () => {
  // 45° diagonal: cursor at (200, 200) → angle 45°, distance ≈ 141.42
  const result = snapStraightLine(start, { x: 200, y: 200 });
  assert.ok(approx(result.x, 200, 1e-9));
  assert.ok(approx(result.y, 200, 1e-9));
});

test("treats 180° and -180° as the same horizontal-left direction", () => {
  // dy slightly above zero → angleDeg just under 180, snaps to 180.
  const a = snapStraightLine(start, { x: 0, y: 100.5 });
  // dy slightly below zero → angleDeg just above -180, snaps to -180 via wraparound.
  const b = snapStraightLine(start, { x: 0, y: 99.5 });
  // Both should land on the horizontal-left ray with effectively zero y offset.
  assert.ok(Math.abs(a.y - 100) < 1e-6, `a.y too far from 100: ${a.y}`);
  assert.ok(Math.abs(b.y - 100) < 1e-6, `b.y too far from 100: ${b.y}`);
  // x should be ≈ 0 with small floating tolerance for the slightly different distances.
  assert.ok(a.x < 50 && b.x < 50);
});

test("returns the start point when cursor distance is below the zero-length threshold", () => {
  const result = snapStraightLine(start, { x: 100, y: 100 });
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
});

test("returns the start point for a sub-0.001 displacement", () => {
  const result = snapStraightLine(start, { x: 100.0005, y: 100.0005 });
  assert.equal(result.x, 100);
  assert.equal(result.y, 100);
});

test("preserves the cursor distance when snapping", () => {
  // angle ≈ 1.146° (snaps to 0). cursor distance = sqrt(100^2 + 2^2) ≈ 100.02.
  const cursor = { x: 200, y: 102 };
  const result = snapStraightLine(start, cursor);
  const inputDistance = Math.hypot(cursor.x - start.x, cursor.y - start.y);
  const outputDistance = Math.hypot(result.x - start.x, result.y - start.y);
  assert.ok(approx(inputDistance, outputDistance, 1e-9));
});
