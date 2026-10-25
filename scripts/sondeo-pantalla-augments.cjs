const { app, nativeImage } = require('electron');
const fs = require('fs');

app.whenReady().then(async () => {
  try {
    const shotPath = 'C:/Users/Administrator/.gemini/antigravity-cli/brain/08160fbb-b32a-4500-a443-34217ba45c2b/user_shot_3.png';
    const img = nativeImage.createFromPath(shotPath);
    const size = img.getSize();
    const bmp = img.toBitmap(); // BGRA format

    function getPixel(x, y) {
      const px = Math.min(size.width - 1, Math.max(0, Math.round(x)));
      const py = Math.min(size.height - 1, Math.max(0, Math.round(y)));
      const idx = (py * size.width + px) * 4;
      return { r: bmp[idx+2], g: bmp[idx+1], b: bmp[idx], a: bmp[idx+3] };
    }

    function getAverageRoi(rect) {
      let r = 0, g = 0, b = 0, count = 0;
      const step = 4;
      for (let y = rect.y; y < rect.y + rect.height; y += step) {
        for (let x = rect.x; x < rect.x + rect.width; x += step) {
          const p = getPixel(x, y);
          r += p.r; g += p.g; b += p.b; count++;
        }
      }
      return { r: Math.round(r/count), g: Math.round(g/count), b: Math.round(b/count) };
    }

    console.log('--- PIXEL SAMPLES ON user_shot_3.png ---');
    console.log('Card 1 Center (30%, 40%):', getPixel(size.width * 0.30, size.height * 0.40));
    console.log('Card 2 Center (53%, 40%):', getPixel(size.width * 0.53, size.height * 0.40));
    console.log('Card 3 Center (75%, 40%):', getPixel(size.width * 0.75, size.height * 0.40));

    console.log('Reroll 1 (35%, 66%):', getPixel(size.width * 0.35, size.height * 0.66));
    console.log('Reroll 2 (55%, 66%):', getPixel(size.width * 0.55, size.height * 0.66));
    console.log('Reroll 3 (79%, 66%):', getPixel(size.width * 0.79, size.height * 0.66));

    const card1Roi = { x: Math.round(size.width * 0.26), y: Math.round(size.height * 0.25), width: Math.round(size.width * 0.14), height: Math.round(size.height * 0.30) };
    const card2Roi = { x: Math.round(size.width * 0.48), y: Math.round(size.height * 0.25), width: Math.round(size.width * 0.14), height: Math.round(size.height * 0.30) };
    const card3Roi = { x: Math.round(size.width * 0.71), y: Math.round(size.height * 0.25), width: Math.round(size.width * 0.14), height: Math.round(size.height * 0.30) };

    console.log('Card 1 ROI Promedio RGB:', getAverageRoi(card1Roi));
    console.log('Card 2 ROI Promedio RGB:', getAverageRoi(card2Roi));
    console.log('Card 3 ROI Promedio RGB:', getAverageRoi(card3Roi));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    app.quit();
  }
});
