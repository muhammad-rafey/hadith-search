// One-shot generator for placeholder app assets (icon/splash/adaptive/favicon).
// Produces valid solid-color PNGs so Expo config file references resolve.
// Replace with real brand art anytime — sizes are what matter here.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

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
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(width, height, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const GREEN = [31, 122, 91]; // ~ primary 158 64% 32%
const WHITE = [255, 255, 255];
const out = path.join(__dirname, "..", "assets");
fs.mkdirSync(out, { recursive: true });

const targets = [
  ["icon.png", 1024, 1024, GREEN],
  ["adaptive-icon.png", 1024, 1024, GREEN],
  ["splash.png", 1242, 1242, WHITE],
  ["favicon.png", 48, 48, GREEN],
];
for (const [name, w, h, color] of targets) {
  fs.writeFileSync(path.join(out, name), png(w, h, color));
  console.log(`wrote assets/${name} (${w}x${h})`);
}
