// Deterministic image bytes for the performance benchmark board.
//
// The benchmark wants N *distinct* images, because a board that reuses one
// file measures one decode and N cache hits, which is not what a real board
// full of photos costs. Distinct images also cannot be committed without
// bloating the repo, and they must not be written into content/. So they are
// synthesised here from the same seed as the board and served straight into
// the page from memory by the driver's route handler.
//
// Same seed and index in, same bytes out, on any machine. zlib's deflate is
// deterministic for a fixed input and level, and the pixel data is pure
// arithmetic, so two runs produce identical images.

import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * A truecolour PNG whose content is a function of (seed, index).
 * Default 640x400, roughly a screenshot's aspect, ~30-60KB after deflate:
 * big enough that decode and upload cost something, small enough that 24 of
 * them do not dominate the run.
 */
export function benchmarkPng(seed, index, width = 640, height = 400) {
  const a = ((seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  const hueShift = a % 256;
  const stripe = 8 + (a >>> 8) % 24;
  const raw = Buffer.alloc(height * (width * 3 + 1));

  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter type 0, none
    for (let x = 0; x < width; x++) {
      // A gradient plus a deterministic hash-noise term. The noise defeats
      // deflate's easy wins, so the file has realistic weight and the decoder
      // does realistic work instead of expanding a flat colour.
      const n = (Math.imul(x + 1, 0x85ebca6b) ^ Math.imul(y + 1, 0xc2b2ae35) ^ a) >>> 0;
      raw[p++] = (hueShift + ((x * 255) / width) + (n & 31)) & 255;
      raw[p++] = (((y * 255) / height) + ((n >>> 5) & 31) + (y % stripe === 0 ? 96 : 0)) & 255;
      raw[p++] = (255 - hueShift + ((n >>> 10) & 31)) & 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * A stand-in for a YouTube embed: a real cross-document iframe with real
 * layout and compositing cost, served locally so the benchmark is offline,
 * deterministic and does not measure YouTube's player or the network.
 * Pass --embeds live to point the same nodes at the real thing instead.
 */
export function benchmarkEmbedHtml(videoId) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>bench embed ${videoId}</title>
<style>
  html,body{margin:0;height:100%;background:#0d0d0f;color:#e8e8ea;
    font:14px/1.4 system-ui,sans-serif;display:grid;place-items:center}
  .frame{width:100%;height:100%;display:grid;place-items:center;
    background:repeating-linear-gradient(45deg,#141418 0 12px,#191920 12px 24px)}
  .badge{padding:.4rem .7rem;border:1px solid #35353f;border-radius:6px;letter-spacing:.04em}
</style></head>
<body><div class="frame"><span class="badge">bench embed ${videoId}</span></div></body></html>`;
}
