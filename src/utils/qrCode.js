/* ==========================================================================
   QR CODE (2026-11-03) — no library.
   Draws the QR code for the 2FA set-up (the otpauth:// link that Google /
   Microsoft Authenticator scan). It follows the QR Code standard
   (ISO/IEC 18004): byte mode, error correction level M, the smallest
   version that fits, and the mask with the lowest penalty. Based on the
   well-known public "QR Code generator" method by Project Nayuki (MIT).

   qrSvg(text) → an <svg> string, black squares on white, ready to show.
   ========================================================================== */

const ECC_M = { ordinal: 1, formatBits: 0 };

// Per version (index 1–40): error-correction codewords per block, and number of blocks, for level M.
const ECC_CODEWORDS_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_ERROR_CORRECTION_BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];

const getBit = (x, i) => ((x >>> i) & 1) !== 0;

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}
const numDataCodewords = (ver) => Math.floor(numRawDataModules(ver) / 8)
  - ECC_CODEWORDS_PER_BLOCK_M[ver] * NUM_ERROR_CORRECTION_BLOCKS_M[ver];

/* ----- Reed–Solomon error correction over GF(256), polynomial 0x11D ----- */
function rsMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = rsMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = rsMultiply(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  data.forEach((b) => {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= rsMultiply(coef, factor); });
  });
  return result;
}

/* ----- The QR symbol ----- */
function encodeQr(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));

  // Smallest version that fits (byte mode, level M).
  let version = 1;
  let dataBits;
  for (;; version += 1) {
    if (version > 40) throw new Error('Text too long for a QR code.');
    const countBits = version < 10 ? 8 : 16;
    dataBits = 4 + countBits + bytes.length * 8;
    if (dataBits <= numDataCodewords(version) * 8) break;
  }

  // Bit stream: mode 0100 (byte), length, data, terminator, padding.
  const bits = [];
  const push = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  push(0x4, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const capacity = numDataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j += 1) b = (b << 1) | bits[i + j];
    dataCodewords.push(b);
  }

  // Split into blocks, add error correction, interleave.
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const dat = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, divisor);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const allCodewords = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) allCodewords.push(block[i]);
    });
  }

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

  // Timing patterns.
  for (let i = 0; i < size; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  // Finder patterns (the 3 big squares).
  const finder = (x, y) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx; const yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunction(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  // Alignment patterns.
  const alignPositions = (() => {
    if (version === 1) return [];
    const numAlign = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    const result = [6];
    for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  })();
  alignPositions.forEach((ax, i) => {
    alignPositions.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === alignPositions.length - 1) || (i === alignPositions.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) setFunction(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    });
  });

  const drawFormatBits = (mask) => {
    const data = (ECC_M.formatBits << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const fbits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) setFunction(8, i, getBit(fbits, i));
    setFunction(8, 7, getBit(fbits, 6));
    setFunction(8, 8, getBit(fbits, 7));
    setFunction(7, 8, getBit(fbits, 8));
    for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, getBit(fbits, i));
    for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, getBit(fbits, i));
    for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, getBit(fbits, i));
    setFunction(8, size - 8, true);   // the always-dark module
  };
  drawFormatBits(0);   // reserve the area; real bits are drawn after the mask is chosen

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vbits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const bit = getBit(vbits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  }

  // Place the codewords in the zig-zag order.
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < allCodewords.length * 8) {
          modules[y][x] = getBit(allCodewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex += 1;
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
      }
    }
  };

  const penalty = () => {
    let result = 0;
    const finderLike = (run) => {
      // run = history of the last 7 run lengths
      const n = run[1];
      const core = n > 0 && run[2] === n && run[3] === n * 3 && run[4] === n && run[5] === n;
      return (core && run[0] >= n * 4 && run[6] >= n ? 1 : 0) + (core && run[6] >= n * 4 && run[0] >= n ? 1 : 0);
    };
    const lineScore = (get) => {
      for (let a = 0; a < size; a += 1) {
        let runColor = false; let runLen = 0; const history = [0, 0, 0, 0, 0, 0, 0];
        const addHistory = (len) => { if (history[0] === 0) len += size; history.pop(); history.unshift(len); };
        for (let b = 0; b < size; b += 1) {
          if (get(a, b) === runColor) {
            runLen += 1;
            if (runLen === 5) result += 3; else if (runLen > 5) result += 1;
          } else {
            addHistory(runLen);
            if (!runColor) result += finderLike(history) * 40;
            runColor = get(a, b);
            runLen = 1;
          }
        }
        // terminate the line
        if (runColor) { addHistory(runLen); runLen = 0; }
        runLen += size;
        addHistory(runLen);
        result += finderLike(history) * 40;
      }
    };
    lineScore((a, b) => modules[a][b]);
    lineScore((a, b) => modules[b][a]);
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) result += 3;
      }
    }
    let dark = 0;
    modules.forEach((row) => row.forEach((m) => { if (m) dark += 1; }));
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  };

  let bestMask = 0; let minPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(mask);
    drawFormatBits(mask);
    const score = penalty();
    if (score < minPenalty) { bestMask = mask; minPenalty = score; }
    applyMask(mask);   // undo (the mask is its own inverse)
  }
  applyMask(bestMask);
  drawFormatBits(bestMask);
  return modules;
}

/** The QR code as an SVG string (with the standard 4-module quiet zone). */
export function qrSvg(text, { dark = '#0a1530', light = '#ffffff' } = {}) {
  const modules = encodeQr(text);
  const size = modules.length;
  const border = 4;
  const total = size + border * 2;
  let path = '';
  modules.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x + border},${y + border}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">`
    + `<rect width="100%" height="100%" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
}

/** Same QR code as a data: URL for an <img>. */
export const qrDataUrl = (text, colors) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text, colors))}`;

export default qrSvg;
