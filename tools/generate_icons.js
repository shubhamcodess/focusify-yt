const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Ensure icons directory exists
const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Function to create a simple PNG buffer with RGBA pixels
function createPng(width, height, drawPixelFn) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // Bit depth
  ihdr.writeUInt8(6, 9); // Color type (6 = RGBA)
  ihdr.writeUInt8(0, 10); // Compression
  ihdr.writeUInt8(0, 11); // Filter
  ihdr.writeUInt8(0, 12); // Interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // Raw image data with scanline filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    rawData[pos++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      rawData[pos++] = r;
      rawData[pos++] = g;
      rawData[pos++] = b;
      rawData[pos++] = a;
    }
  }

  // IDAT chunk (compressed pixel data)
  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);

  const crcVal = crc32(buf.subarray(4, 8 + len));
  buf.writeUIntBE(crcVal >>> 0, 8 + len, 4);
  return buf;
}

// CRC32 implementation for PNG chunks
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      if ((crc ^ byte) & 1) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
      byte >>= 1;
    }
  }
  return crc ^ -1;
}

// Draw modern Focusify YouTube Icon: Dark red background, focus crosshairs, red play button
function drawFocusIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxR = w * 0.45;

  // Background circle (Dark slate / deep dark red)
  if (dist > maxR) {
    return [0, 0, 0, 0]; // Transparent padding
  }

  // Outer ring / border
  if (dist > maxR - Math.max(1, w * 0.08)) {
    return [255, 69, 58, 255]; // Vibrant red ring
  }

  // Inner focus grid ring
  const focusRingR = w * 0.28;
  if (Math.abs(dist - focusRingR) < Math.max(0.8, w * 0.05)) {
    return [255, 159, 10, 230]; // Warm Amber focus ring
  }

  // Play triangle in center
  const pSize = w * 0.18;
  const px = dx + pSize * 0.2; // slight right offset
  const py = dy;
  if (px >= -pSize * 0.5 && px <= pSize * 0.7 && Math.abs(py) <= (pSize * 0.7 - px * 0.5)) {
    return [255, 255, 255, 255]; // White play symbol
  }

  // Gradient background (Deep purple-black to red-dark)
  const bgGrad = Math.min(1, dist / maxR);
  const r = Math.round(25 + bgGrad * 35);
  const g = Math.round(15 + bgGrad * 10);
  const b = Math.round(35 + bgGrad * 20);
  return [r, g, b, 255];
}

[16, 48, 128].forEach((size) => {
  const pngBuffer = createPng(size, size, drawFocusIcon);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), pngBuffer);
  console.log(`Generated icon-${size}.png`);
});
