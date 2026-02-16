// app.js — offscreen canvas pipeline, no duplication, CERN emblem overlay, side-by-side previews
import init, { composite_rgba } from './pkg/image_compositor.js';
await init();

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const origPreview = document.getElementById('origPreview');
const previewImg = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');

let dragCounter = 0;
function preventDefaults(e){ e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(evt => window.addEventListener(evt, preventDefaults, false));
window.addEventListener('dragover', e => { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });

drop.addEventListener('dragenter', () => { dragCounter++; drop.classList.add('drag-over'); });
drop.addEventListener('dragleave', () => { dragCounter = Math.max(0, dragCounter - 1); if (dragCounter === 0) drop.classList.remove('drag-over'); });
drop.addEventListener('drop', async (e) => {
  dragCounter = 0;
  drop.classList.remove('drag-over');
  const dt = e.dataTransfer;
  if (!dt) return;
  const file = dt.files && dt.files.length ? dt.files[0] : getFileFromItems(dt.items);
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please drop an image (PNG or JPEG).'); return; }
  await processImageFile(file);
});

drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  await processImageFile(f);
  fileInput.value = '';
});

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
    // create offscreen base canvas
    const imgBitmap = await createImageBitmap(file);
    const baseW = imgBitmap.width;
    const baseH = imgBitmap.height;

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = baseW;
    baseCanvas.height = baseH;
    const bctx = baseCanvas.getContext('2d');
    bctx.clearRect(0,0,baseW,baseH);
    bctx.drawImage(imgBitmap,0,0);

    // show original preview (limit applied via CSS)
    baseCanvas.toBlob((b) => {
      if (!b) return;
      origPreview.src = URL.createObjectURL(b);
    }, 'image/png');

    // emblem params
    const scale = 0.44;        // emblem width relative to image width
    const centerPercent = 0.62; // center-lower placement

    // load emblem SVG
    const emblemPath = './assets/cern_emblem.svg';
    const svgText = await fetch(emblemPath, {cache: 'no-cache'}).then(r => {
      if (!r.ok) throw new Error('emblem fetch failed ' + r.status);
      return r.text();
    });
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });

    let svgBitmap = null;
    try { svgBitmap = await createImageBitmap(svgBlob); } catch(e){ svgBitmap = null; }

    const ovW = Math.max(64, Math.round(baseW * scale));
    const ovH = svgBitmap ? Math.max(64, Math.round(ovW * (svgBitmap.height / svgBitmap.width))) : ovW;

    const ovCanvas = document.createElement('canvas');
    ovCanvas.width = ovW;
    ovCanvas.height = ovH;
    const ovCtx = ovCanvas.getContext('2d');
    ovCtx.clearRect(0,0,ovW,ovH);

    if (svgBitmap) {
      ovCtx.drawImage(svgBitmap, 0, 0, ovW, ovH);
    } else {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => { ovCtx.drawImage(img, 0, 0, ovW, ovH); resolve(); };
        img.onerror = reject;
        img.src = URL.createObjectURL(svgBlob);
      });
    }

    const overlayImageData = ovCtx.getImageData(0,0,ovW,ovH);

    // compute position centered horizontally, a bit below center
    const posX = Math.round((baseW - ovW) / 2);
    const posY = Math.round(baseH * centerPercent - ovH / 2);
    const clampedX = Math.max(0, Math.min(posX, baseW - ovW));
    const clampedY = Math.max(0, Math.min(posY, baseH - ovH));

    const baseImageData = bctx.getImageData(0,0,baseW,baseH);

    // call wasm
    const resultArr = composite_rgba(
      baseImageData.data, baseW, baseH,
      overlayImageData.data, ovW, ovH,
      clampedX, clampedY
    );

    if (!resultArr || resultArr.length !== baseW * baseH * 4) {
      console.error('Invalid result from wasm composite', resultArr && resultArr.length);
      alert('Processing failed. See console.');
      return;
    }

    const resultImgData = new ImageData(new Uint8ClampedArray(resultArr), baseW, baseH);

    // draw final to offscreen canvas and export
    const destCanvas = document.createElement('canvas');
    destCanvas.width = baseW;
    destCanvas.height = baseH;
    const dctx = destCanvas.getContext('2d');
    dctx.putImageData(resultImgData, 0, 0);

    destCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      downloadBtn.href = url;
      downloadBtn.style.display = 'inline-flex';
      downloadBtn.setAttribute('aria-hidden', 'false');
    }, 'image/png');

  } catch (err) {
    console.error('processImageFile error', err);
    alert('Failed to process image. See console.');
  }
}
