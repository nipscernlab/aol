import init, { composite_rgba } from './pkg/aol_web.js';

await init(); // initialize wasm module

const drop = document.getElementById('drop');
const previewImg = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');
const resultCanvas = document.getElementById('resultCanvas');

function prevent(e){ e.preventDefault(); e.stopPropagation(); }
['dragenter','dragover','dragleave','drop'].forEach(evt => drop.addEventListener(evt, prevent));

drop.addEventListener('drop', async (ev) => {
  const file = ev.dataTransfer.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please drop an image (PNG/JPEG).');
    return;
  }

  const imgBitmap = await createImageBitmap(file);
  // prepare base canvas
  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = imgBitmap.width;
  baseCanvas.height = imgBitmap.height;
  const baseCtx = baseCanvas.getContext('2d');
  baseCtx.drawImage(imgBitmap, 0, 0);

  const baseImageData = baseCtx.getImageData(0,0,baseCanvas.width, baseCanvas.height);

  // load SVG heart and rasterize it to an offscreen canvas scaled to 15% of width
  const heartSvgUrl = './assets/little_heart.svg';
  const heartImg = new Image();
  // ensure same-origin or CORS allowed; svg is local asset
  heartImg.src = heartSvgUrl;
  await heartImg.decode();

  const scale = 0.15;
  const ovW = Math.max(32, Math.round(baseCanvas.width * scale));
  const ovH = Math.round(heartImg.height * (ovW / heartImg.width)); // preserve aspect ratio

  const ovCanvas = document.createElement('canvas');
  ovCanvas.width = ovW;
  ovCanvas.height = ovH;
  const ovCtx = ovCanvas.getContext('2d');
  // optional: draw with smoothing
  ovCtx.drawImage(heartImg, 0, 0, ovW, ovH);
  const overlayImageData = ovCtx.getImageData(0,0,ovW,ovH);

  // compute position: bottom-right with 4% margin
  const margin = Math.round(baseCanvas.width * 0.04);
  const posX = baseCanvas.width - ovW - margin;
  const posY = baseCanvas.height - ovH - margin;

  // call WASM composite
  const resultArray = composite_rgba(
    baseImageData.data, baseCanvas.width, baseCanvas.height,
    overlayImageData.data, ovW, ovH,
    posX, posY
  );

  // resultArray is a Uint8ClampedArray (ImageData)
  const resultImgData = new ImageData(new Uint8ClampedArray(resultArray), baseCanvas.width, baseCanvas.height);

  // draw to visible canvas
  resultCanvas.width = baseCanvas.width;
  resultCanvas.height = baseCanvas.height;
  resultCanvas.style.display = 'block';
  const rCtx = resultCanvas.getContext('2d');
  rCtx.putImageData(resultImgData, 0, 0);

  // show preview (img element) by converting to blob url
  resultCanvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    previewImg.src = url;
    downloadBtn.href = url;
    downloadBtn.style.display = 'inline-block';
  }, 'image/png');
});
