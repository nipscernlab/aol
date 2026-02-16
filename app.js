// app.js — robust DnD + correct SVG rasterization + centered-bottom heart + wasm composite
import init, { composite_rgba } from './pkg/image_compositor.js'; // ajustar se necessário
await init();

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const previewImg = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');
const resultCanvas = document.getElementById('resultCanvas');

let dragCounter = 0;
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(evt => window.addEventListener(evt, preventDefaults, false));
window.addEventListener('dragover', e => { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });

drop.addEventListener('dragenter', () => { dragCounter++; drop.classList.add('drag-over'); });
drop.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (dragCounter === 0) drop.classList.remove('drag-over'); });
drop.addEventListener('drop', async (e) => { dragCounter = 0; drop.classList.remove('drag-over'); const dt = e.dataTransfer; if (!dt) return;
  const file = dt.files && dt.files.length ? dt.files[0] : getFileFromItems(dt.items);
  if (!file) { alert('No file detected. Drop a PNG or JPEG.'); return; }
  if (!file.type.startsWith('image/')) { alert('Please drop an image (PNG/JPEG).'); return; }
  await processImageFile(file);
});

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => { const f = e.target.files && e.target.files[0]; if(!f) return; await processImageFile(f); fileInput.value = ''; });

function getFileFromItems(items){
  if (!items || !items.length) return null;
  for (const it of items) {
    if (it.kind === 'file') {
      const file = it.getAsFile();
      if (file && file.type && file.type.startsWith('image/')) return file;
    }
  }
  return null;
}

async function processImageFile(file){
  try {
    // draw base image
    const imgBitmap = await createImageBitmap(file);
    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = imgBitmap.width;
    baseCanvas.height = imgBitmap.height;
    const baseCtx = baseCanvas.getContext('2d');
    baseCtx.drawImage(imgBitmap, 0, 0);

    // PARAMETERS: change these to tweak size/vertical position
    const scale = 0.35;           // heart width = 35% of image width (increase/decrease here)
    const centerPercent = 0.58;   // vertical center position (0.5 = center, >0.5 = lower). Adjust as needed.

    // fetch and rasterize SVG robustly
    const heartSvgPath = './assets/little_cern.svg';
    const svgText = await fetch(heartSvgPath, {cache: 'no-cache'}).then(r => {
      if (!r.ok) throw new Error(`SVG fetch failed: ${r.status}`);
      return r.text();
    });

    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
    // get intrinsic SVG bitmap
    let svgBitmap;
    try {
      svgBitmap = await createImageBitmap(svgBlob);
    } catch (err) {
      console.warn('createImageBitmap(svgBlob) failed, will try fallback rendering to canvas', err);
      // fallback: draw raw svg into an <img> then into canvas
      svgBitmap = null;
    }

    // compute overlay size preserving aspect ratio
    const ovW = Math.max(32, Math.round(baseCanvas.width * scale));
    let ovH;
    if (svgBitmap) {
      const ratio = svgBitmap.height / svgBitmap.width;
      ovH = Math.max(32, Math.round(ovW * ratio));
    } else {
      // assume square if we couldn't rasterize intrinsic size
      ovH = ovW;
    }

    // create overlay canvas and draw svg scaled
    const ovCanvas = document.createElement('canvas');
    ovCanvas.width = ovW;
    ovCanvas.height = ovH;
    const ovCtx = ovCanvas.getContext('2d');
    ovCtx.clearRect(0, 0, ovW, ovH);

    if (svgBitmap) {
      // draw scaled bitmap preserving aspect ratio
      ovCtx.drawImage(svgBitmap, 0, 0, ovW, ovH);
    } else {
      // fallback: draw svg via img element (synchronous-ish)
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // compute ratio if possible
          const ratio = (img.naturalHeight && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : 1;
          const ovH_fallback = Math.max(32, Math.round(ovW * ratio));
          if (ovCanvas.height !== ovH_fallback) {
            ovCanvas.height = ovH_fallback;
          }
          ovCtx.clearRect(0,0,ovCanvas.width,ovCanvas.height);
          ovCtx.drawImage(img, 0, 0, ovCanvas.width, ovCanvas.height);
          resolve();
        };
        img.onerror = (err) => reject(err);
        // ensure same-origin by using the blob URL
        img.src = URL.createObjectURL(svgBlob);
      });
    }

    // optional: add a slight drop shadow to the overlay to help visibility
    // (draw overlay onto temporary canvas with shadow, then read pixels)
    // omitted here to keep pipeline simple

    const overlayImageData = ovCtx.getImageData(0, 0, ovW, ovH);

    // compute centered-bottom position
    const posX = Math.round((baseCanvas.width - ovW) / 2); // center horizontally
    // centerPercent is the vertical center where the heart center will align
    const posY = Math.round(baseCanvas.height * centerPercent - ovH / 2);

    // clamp coordinates so overlay stays inside image
    const clampedX = Math.max(0, Math.min(posX, baseCanvas.width - ovW));
    const clampedY = Math.max(0, Math.min(posY, baseCanvas.height - ovH));

    // prepare base image data for wasm
    const baseImageData = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);

    // call wasm compositor
    const resultArr = composite_rgba(
      baseImageData.data, baseCanvas.width, baseCanvas.height,
      overlayImageData.data, ovW, ovH,
      clampedX, clampedY
    );

    if (!resultArr || resultArr.length !== baseCanvas.width * baseCanvas.height * 4) {
      console.error('Unexpected result from wasm composite', resultArr && resultArr.length);
      alert('Processing failed: compositor returned invalid result.');
      return;
    }

    const resultImgData = new ImageData(new Uint8ClampedArray(resultArr), baseCanvas.width, baseCanvas.height);

    // draw to visible canvas and show preview/download
    const dest = resultCanvas;
    dest.width = baseCanvas.width;
    dest.height = baseCanvas.height;
    dest.style.display = 'block';
    const rCtx = dest.getContext('2d');
    rCtx.putImageData(resultImgData, 0, 0);

    dest.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      downloadBtn.href = url;
      downloadBtn.style.display = 'inline-block';
    }, 'image/png');

  } catch (err) {
    console.error('processImageFile error', err);
    alert('Failed to process image. See console for details.');
  }
}
