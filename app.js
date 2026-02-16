// Minimal, robust drag & drop capture for images (desktop or other apps).
// Prevents default navigation (opening dropped file in browser) and shows a smooth animation.

const drop = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const previewImg = document.getElementById('preview');
const downloadBtn = document.getElementById('downloadBtn');
const resultCanvas = document.getElementById('resultCanvas');

let dragCounter = 0; // help with nested dragenter/dragleave

// Prevent the browser from opening files when dragged to the window
function preventDefaults(e){
  e.preventDefault();
  e.stopPropagation();
}
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
  window.addEventListener(evt, preventDefaults, false);
});

// Indicate copy cursor
window.addEventListener('dragover', e => {
  e.dataTransfer.dropEffect = 'copy';
});

// Drop target visual behavior — use counter to avoid flicker
drop.addEventListener('dragenter', (e) => {
  dragCounter++;
  drop.classList.add('drag-over');
});

drop.addEventListener('dragleave', (e) => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) drop.classList.remove('drag-over');
});

drop.addEventListener('drop', async (e) => {
  dragCounter = 0;
  drop.classList.remove('drag-over');

  const dt = e.dataTransfer;
  if (!dt) return;

  // Prefer actual files (desktop drag), otherwise try DataTransferItem (e.g., dragged from other apps)
  const file = dt.files && dt.files.length ? dt.files[0] : getFileFromItems(dt.items);
  if (!file) {
    alert('No file detected. Drop a PNG or JPEG image.');
    return;
  }

  if (!file.type.startsWith('image/')) {
    alert('Please drop an image (PNG or JPEG).');
    return;
  }

  await handleImageFile(file);
});

// also support click-to-select
drop.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  await handleImageFile(f);
  fileInput.value = '';
});

// Helper: if items exist, try to extract a file item
function getFileFromItems(items){
  if (!items || !items.length) return null;
  for (const it of items) {
    if (it.kind === 'file') {
      const file = it.getAsFile();
      if (file && file.type && file.type.startsWith('image/')) return file;
    }
    // Some apps put a URI or HTML - try to handle fallback by reading string
  }
  return null;
}

// Actual processing: preview and enable download
async function handleImageFile(file){
  try {
    // Use createImageBitmap for better performance / orientation-neutral
    const imgBitmap = await createImageBitmap(file);

    // Draw into canvas
    const canvas = resultCanvas;
    canvas.width = imgBitmap.width;
    canvas.height = imgBitmap.height;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(imgBitmap, 0, 0);

    // For now we are not yet calling WASM; we simply show preview.
    // If you later call the wasm compositor, you can replace the following steps
    // with a putImageData from WASM result.

    // Convert to blob and show preview + download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      downloadBtn.href = url;
      downloadBtn.style.display = 'inline-block';
    }, 'image/png');

  } catch (err) {
    console.error(err);
    alert('Failed to read image. Try a different file.');
  }
}
