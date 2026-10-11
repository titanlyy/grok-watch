import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = (size - 1) / 2;
  const cy = cx;
  const outer = size * 0.38;
  const ring = Math.max(1.4, size * 0.055);
  const hand = Math.max(0.8, size * 0.04);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const nx = x / (size - 1);
      const ny = y / (size - 1);
      let r = Math.round(3 + nx * 6);
      let g = Math.round(8 + ny * 10);
      let b = Math.round(20 + nx * 12);
      const onRing = d <= outer && d >= outer - ring;
      const onHub = d <= Math.max(1.2, size * 0.045);
      const onUp = distToSegment(x, y, cx, cy, cx, cy - outer * 0.62) <= hand;
      const onAng = distToSegment(x, y, cx, cy, cx + outer * 0.48, cy + outer * 0.32) <= hand;
      if (onRing) {
        const t = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
        r = Math.round(56 + (129 - 56) * t);
        g = Math.round(189 + (140 - 189) * t);
        b = 248;
      } else if (onUp || onAng) {
        r = 125;
        g = 211;
        b = 252;
      } else if (onHub) {
        r = 74;
        g = 222;
        b = 128;
      }
      const o = row + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const dir = path.resolve("icons");
fs.mkdirSync(dir, { recursive: true });
for (const size of [16, 48, 128]) {
  fs.writeFileSync(path.join(dir, `icon${size}.png`), png(size));
}
