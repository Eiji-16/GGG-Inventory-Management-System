/* ===== REMOVE A PLAIN BACKGROUND (System logo, 2026-11-06) =====
   For logos on one plain colour (white, black, any solid colour). No library,
   runs in the browser, nothing is sent anywhere until the person saves.

   How it works, in plain words:
   1. Look at the pixels along the picture's edges and take the most common
      colour there — that is the background.
   2. Starting from the edges, clear every touching pixel that is close to
      that colour ("flood fill"). Parts of the same colour INSIDE the logo
      (for example white letters) are not touched, because they do not touch
      the edge through background pixels.
   3. Pixels right at the border of the logo become half see-through, so the
      edge is smooth instead of jagged.
   4. Save the result as a PNG (the format that keeps see-through parts).

   removePlainBackground(file, { tolerance }) →
     { blob, url, removed, alreadyClear }
     tolerance 10–120: how different a colour may be and still count as the
                       background (higher = removes more).
     removed       share of the picture that became see-through (0–1).
     alreadyClear  true when the edges were already see-through. */

const MAX_SIDE = 512;   // the sidebar logo is small; this keeps the file light

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('This picture could not be opened.'));
  image.src = url;
});

const toBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be prepared.'))), 'image/png');
});

export async function removePlainBackground(file, { tolerance = 40 } = {}) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(sourceUrl);
    const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    const data = pixels.data;

    // 1. The most common edge colour (colours grouped in steps of 16).
    const edge = [];
    for (let x = 0; x < width; x += 1) edge.push(x, (height - 1) * width + x);
    for (let y = 0; y < height; y += 1) edge.push(y * width, y * width + width - 1);
    let clearEdges = 0;
    const counts = new Map();
    for (const index of edge) {
      const i = index * 4;
      if (data[i + 3] < 20) { clearEdges += 1; continue; }
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      const entry = counts.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      entry.n += 1; entry.r += data[i]; entry.g += data[i + 1]; entry.b += data[i + 2];
      counts.set(key, entry);
    }
    if (clearEdges > edge.length * 0.6 || counts.size === 0) {
      const blob = await toBlob(canvas);
      return { blob, url: URL.createObjectURL(blob), removed: 0, alreadyClear: true };
    }
    const top = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    const bg = [top.r / top.n, top.g / top.n, top.b / top.n];

    const distance = (i) => {
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    // 2. Flood fill from every edge pixel through background-like pixels.
    const hard = tolerance;          // at or below: fully see-through
    const soft = tolerance * 1.6;    // between hard and soft: half see-through
    const visited = new Uint8Array(width * height);
    const stack = [];
    for (const index of edge) {
      if (!visited[index]) { visited[index] = 1; stack.push(index); }
    }
    let removed = 0;
    while (stack.length) {
      const index = stack.pop();
      const i = index * 4;
      if (data[i + 3] < 20) {
        // already see-through: keep spreading
      } else {
        const d = distance(i);
        if (d > soft) continue;                 // part of the logo: stop here
        if (d <= hard) {
          data[i + 3] = 0;
          removed += 1;
        } else {
          // 3. Smooth edge: fade in between "background" and "logo".
          data[i + 3] = Math.round(data[i + 3] * ((d - hard) / (soft - hard)));
          continue;                             // do not spread past an edge pixel
        }
      }
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0 && !visited[index - 1]) { visited[index - 1] = 1; stack.push(index - 1); }
      if (x < width - 1 && !visited[index + 1]) { visited[index + 1] = 1; stack.push(index + 1); }
      if (y > 0 && !visited[index - width]) { visited[index - width] = 1; stack.push(index - width); }
      if (y < height - 1 && !visited[index + width]) { visited[index + width] = 1; stack.push(index + width); }
    }

    context.putImageData(pixels, 0, 0);
    // 4. Save as PNG.
    const blob = await toBlob(canvas);
    return { blob, url: URL.createObjectURL(blob), removed: removed / (width * height), alreadyClear: false };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
