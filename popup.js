// Pro Image Collector v8.0 - popup.js
// Rewritten with: dedup fix, XSS prevention, rotation export, ZIP download,
// drag select, undo/redo, persistent settings, keyboard shortcuts, progress bar

let allImages = [];
let selectedImages = new Set();
let filteredImagesCount = 0;

// Editor state
let originalImageSrc = null;
let currentImageSrc = null; // track which image is being edited
let currentCanvas = null;
let currentCtx = null;
let pendingOperation = null;
let undoStack = [];
const MAX_UNDO = 20;
const MAX_UNDO_BYTES = 200 * 1024 * 1024; // 200MB max undo memory

// Drag select state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

// Settings keys
const SETTINGS_KEYS = ['minWidth', 'minHeight', 'gridSlider', 'zipMode', 'convertWebp', 'exportFormat'];

document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const imageList = document.getElementById('imageList');
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const rescanBtn = document.getElementById('rescanBtn');
  const emptyState = document.getElementById('emptyState');

  // Inputs & Filters
  const minWidthInput = document.getElementById('minWidth');
  const minHeightInput = document.getElementById('minHeight');
  const filterTextInput = document.getElementById('filterText');
  const subfolderInput = document.getElementById('subfolderName');
  const renameInput = document.getElementById('renamePattern');
  const convertWebpCheckbox = document.getElementById('convertWebp');
  const zipModeCheckbox = document.getElementById('zipMode');
  const exportFormatSelect = document.getElementById('exportFormat');
  const gridSlider = document.getElementById('gridSlider');
  const typeCheckboxes = document.querySelectorAll('.type-check input[type="checkbox"]');

  // Progress
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  // Modal Elements
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  const closeModal = document.getElementById('closeModal');
  const processStatus = document.getElementById('processStatus');

  // Toolbar Panels
  const defaultToolsPanel = document.getElementById('defaultTools');
  const activeToolPanel = document.getElementById('activeToolPanel');
  const toolLabel = document.getElementById('toolLabel');
  const toolInput = document.getElementById('toolInput');
  const toolUnit = document.getElementById('toolUnit');
  const btnApplyTool = document.getElementById('btnApplyTool');
  const btnCancelTool = document.getElementById('btnCancelTool');

  // Tool Buttons
  const btnCrop = document.getElementById('btnCrop');
  const btnResize = document.getElementById('btnResize');
  const btnFlip = document.getElementById('btnFlip');
  const btnNoise = document.getElementById('btnNoise');
  const btnColor = document.getElementById('btnColor');
  const btnObfuscate = document.getElementById('btnObfuscate');
  const btnRecompress = document.getElementById('btnRecompress');
  const btnRotate = document.getElementById('btnRotate');
  const btnMagic = document.getElementById('btnMagic');
  const btnReset = document.getElementById('btnReset');
  const btnUndo = document.getElementById('btnUndo');
  const btnDownloadSingle = document.getElementById('btnDownloadSingle');
  const btnCopyUrl = document.getElementById('btnCopyUrl');
  const undoCountEl = document.getElementById('undoCount');

  // Drag select
  const dragSelectBox = document.getElementById('dragSelectBox');

  // --- INITIALIZATION ---
  loadSettings();
  applyGridColumns();
  scanPage();

  // Listen for new images detected by MutationObserver in content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'newImagesDetected') {
      notify('New images detected on page. Click Rescan to update.', 'info');
    }
  });

  // --- SETTINGS PERSISTENCE ---
  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEYS, (data) => {
      if (data.minWidth !== undefined) minWidthInput.value = data.minWidth;
      if (data.minHeight !== undefined) minHeightInput.value = data.minHeight;
      if (data.gridSlider !== undefined) gridSlider.value = data.gridSlider;
      if (data.zipMode !== undefined) zipModeCheckbox.checked = data.zipMode;
      if (data.convertWebp !== undefined) convertWebpCheckbox.checked = data.convertWebp;
      if (data.exportFormat !== undefined) exportFormatSelect.value = data.exportFormat;
      applyGridColumns();
    });
  }

  function saveSettings() {
    const data = {};
    data.minWidth = parseInt(minWidthInput.value) || 0;
    data.minHeight = parseInt(minHeightInput.value) || 0;
    data.gridSlider = parseInt(gridSlider.value);
    data.zipMode = zipModeCheckbox.checked;
    data.convertWebp = convertWebpCheckbox.checked;
    data.exportFormat = exportFormatSelect.value;
    chrome.storage.local.set(data);
  }

  function applyGridColumns() {
    document.documentElement.style.setProperty('--grid-cols', gridSlider.value);
  }

  // --- EVENT LISTENERS ---
  rescanBtn.addEventListener('click', scanPage);
  minWidthInput.addEventListener('input', () => { renderImages(); saveSettings(); });
  minHeightInput.addEventListener('input', () => { renderImages(); saveSettings(); });
  filterTextInput.addEventListener('input', renderImages);
  typeCheckboxes.forEach(cb => {
    if (cb.id !== 'convertWebp' && cb.id !== 'zipMode') {
      cb.addEventListener('change', renderImages);
    }
  });

  gridSlider.addEventListener('input', () => { applyGridColumns(); saveSettings(); });
  zipModeCheckbox.addEventListener('change', saveSettings);
  convertWebpCheckbox.addEventListener('change', saveSettings);
  exportFormatSelect.addEventListener('change', saveSettings);

  selectAllBtn.addEventListener('click', toggleSelectAll);
  downloadBtn.addEventListener('click', () => startDownloadProcess(Array.from(selectedImages)));

  closeModal.addEventListener('click', closeEditor);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEditor(); });

  // --- KEYBOARD SHORTCUTS ---
  document.addEventListener('keydown', (e) => {
    // Global shortcuts (when modal is closed)
    if (modal.style.display !== 'flex') {
      if (e.ctrlKey && e.key === 'a') { e.preventDefault(); toggleSelectAll(); }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); if (selectedImages.size > 0) startDownloadProcess(Array.from(selectedImages)); }
      return;
    }
    // Modal shortcuts
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); performUndo(); }
    if (e.key === 'Escape') closeEditor();
  });

  // --- DRAG SELECT ---
  imageList.addEventListener('mousedown', (e) => {
    if (e.target.closest('.mini-btn') || e.target.closest('.action-bar')) return;
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragSelectBox.style.display = 'block';
    dragSelectBox.style.left = dragStartX + 'px';
    dragSelectBox.style.top = dragStartY + 'px';
    dragSelectBox.style.width = '0px';
    dragSelectBox.style.height = '0px';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.min(e.clientX, dragStartX);
    const y = Math.min(e.clientY, dragStartY);
    const w = Math.abs(e.clientX - dragStartX);
    const h = Math.abs(e.clientY - dragStartY);
    dragSelectBox.style.left = x + 'px';
    dragSelectBox.style.top = y + 'px';
    dragSelectBox.style.width = w + 'px';
    dragSelectBox.style.height = h + 'px';
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    dragSelectBox.style.display = 'none';

    const boxRect = {
      left: Math.min(e.clientX, dragStartX),
      top: Math.min(e.clientY, dragStartY),
      right: Math.max(e.clientX, dragStartX),
      bottom: Math.max(e.clientY, dragStartY)
    };

    // Only process if drag area is meaningful (> 10px)
    if (boxRect.right - boxRect.left < 10 || boxRect.bottom - boxRect.top < 10) return;

    const items = imageList.querySelectorAll('li');
    items.forEach((li) => {
      const rect = li.getBoundingClientRect();
      const overlap = !(rect.right < boxRect.left || rect.left > boxRect.right ||
                        rect.bottom < boxRect.top || rect.top > boxRect.bottom);
      if (overlap) {
        const src = li.dataset.src;
        if (src) {
          if (e.ctrlKey) {
            // Ctrl+drag toggles
            if (selectedImages.has(src)) selectedImages.delete(src);
            else selectedImages.add(src);
          } else {
            selectedImages.add(src);
          }
          li.classList.toggle('selected', selectedImages.has(src));
        }
      }
    });
    updateStatus();
  });

  // --- EDITOR: ROTATE (applies to canvas for real export) ---
  btnRotate.addEventListener('click', () => {
    if (!currentCanvas) return;
    pushUndo();
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = currentCanvas.height;
    tempCanvas.height = currentCanvas.width;
    tempCtx.translate(tempCanvas.width, 0);
    tempCtx.rotate(Math.PI / 2);
    tempCtx.drawImage(currentCanvas, 0, 0);
    currentCanvas = tempCanvas;
    currentCtx = tempCtx;
    updatePreview();
    setStatus("Rotated 90°", "#81c995");
  });

  // --- EDITOR: RESET ---
  btnReset.addEventListener('click', () => {
    undoStack = [];
    updateUndoCount();
    loadToCanvas(originalImageSrc);
    setStatus("Image reset to original.", "white");
  });

  // --- EDITOR: UNDO ---
  btnUndo.addEventListener('click', performUndo);

  // --- EDITOR: MANUAL TOOLS ---
  btnCrop.addEventListener('click', () => showToolUI('crop', 'Crop Percentage:', 2, '%'));
  btnResize.addEventListener('click', () => showToolUI('resize', 'Resize Scale:', 97, '%'));
  btnObfuscate.addEventListener('click', () => showToolUI('obfuscate', 'Blur Radius:', 0.5, 'px'));
  btnRecompress.addEventListener('click', () => showToolUI('recompress', 'JPEG Quality:', 75, '0-100'));
  btnFlip.addEventListener('click', () => { pushUndo(); applyOperation('flip'); });
  btnNoise.addEventListener('click', () => showToolUI('noise', 'Noise Amount:', 15, '0-100'));
  btnColor.addEventListener('click', () => showToolUI('color', 'Hue Shift:', 10, 'deg'));

  // --- EDITOR: APPLY & CANCEL ---
  btnCancelTool.addEventListener('click', hideToolUI);

  btnApplyTool.addEventListener('click', () => {
    const val = parseFloat(toolInput.value);
    if (isNaN(val)) { notify("Invalid number", "error"); return; }
    pushUndo();
    const params = {};
    if (pendingOperation === 'crop') params.percent = val;
    if (pendingOperation === 'resize') params.scale = val;
    if (pendingOperation === 'obfuscate') params.blur = val;
    if (pendingOperation === 'recompress') params.quality = val;
    if (pendingOperation === 'noise') params.amount = val;
    if (pendingOperation === 'color') params.shift = val;

    applyOperation(pendingOperation, params);
    hideToolUI();
  });

  toolInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnApplyTool.click();
    if (e.key === 'Escape') btnCancelTool.click();
  });

  // --- EDITOR: MAGIC CASCADE ---
  btnMagic.addEventListener('click', async () => {
    pushUndo();
    setStatus("Running Magic Cascade...", "#6f42c1");
    try {
      await applyOperation('crop', { percent: 2 }, false);
      await applyOperation('resize', { scale: 97 }, false);
      await applyOperation('noise', { amount: 10 }, false);
      await applyOperation('color', { shift: 5 }, false);
      await applyOperation('obfuscate', { blur: 0.5 }, false);
      await applyOperation('recompress', { quality: 75 }, false);
      setStatus("Cascade Complete! Image is clean.", "#198754");
    } catch (e) {
      console.error(e);
      setStatus("Error in cascade.", "red");
    }
  });

  // --- EDITOR: COPY URL ---
  btnCopyUrl.addEventListener('click', () => {
    if (currentImageSrc) {
      navigator.clipboard.writeText(currentImageSrc).then(() => {
        notify("URL copied to clipboard!", "info");
      }).catch(() => {
        notify("Failed to copy URL", "error");
      });
    }
  });

  // --- EDITOR: DOWNLOAD SINGLE ---
  btnDownloadSingle.addEventListener('click', () => {
    if (!currentCanvas) return;
    const format = exportFormatSelect.value;
    const mimeType = 'image/' + format;
    const quality = format === 'png' ? undefined : 0.92;
    const finalUrl = currentCanvas.toDataURL(mimeType, quality);
    const ext = format === 'jpeg' ? 'jpg' : format;
    chrome.downloads.download({
      url: finalUrl,
      filename: `edited_image.${ext}`,
      conflictAction: 'uniquify'
    });
    notify("Downloading edited image...", "info");
  });


  // ========== HELPER FUNCTIONS ==========

  // --- Notifications ---
  function notify(text, type) {
    const el = document.getElementById('notification');
    el.textContent = text;
    el.className = type || '';
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  // --- XSS-safe text escaping ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- Tool UI ---
  function showToolUI(opName, labelText, defaultVal, unitText) {
    pendingOperation = opName;
    toolLabel.textContent = labelText;
    toolInput.value = defaultVal;
    toolUnit.textContent = unitText;
    defaultToolsPanel.style.display = 'none';
    activeToolPanel.style.display = 'flex';
    setTimeout(() => toolInput.focus(), 50);
  }

  function hideToolUI() {
    pendingOperation = null;
    activeToolPanel.style.display = 'none';
    defaultToolsPanel.style.display = 'block';
  }

  function closeEditor() {
    modal.style.display = 'none';
    hideToolUI();
  }

  // --- Undo ---
  function pushUndo() {
    if (!currentCanvas) return;
    const data = currentCtx.getImageData(0, 0, currentCanvas.width, currentCanvas.height);
    const entryBytes = data.data.byteLength;
    // Trim by count
    if (undoStack.length >= MAX_UNDO) undoStack.shift();
    // Trim by total memory
    let totalBytes = undoStack.reduce((sum, s) => sum + s.data.data.byteLength, 0);
    while (totalBytes + entryBytes > MAX_UNDO_BYTES && undoStack.length > 0) {
      const removed = undoStack.shift();
      totalBytes -= removed.data.data.byteLength;
    }
    undoStack.push({ data, width: currentCanvas.width, height: currentCanvas.height });
    updateUndoCount();
  }

  function performUndo() {
    if (undoStack.length === 0) { notify("Nothing to undo", "info"); return; }
    const state = undoStack.pop();
    currentCanvas.width = state.width;
    currentCanvas.height = state.height;
    currentCtx = currentCanvas.getContext('2d');
    currentCtx.putImageData(state.data, 0, 0);
    updatePreview();
    updateUndoCount();
    setStatus("Undo applied", "#81c995");
  }

  function updateUndoCount() {
    undoCountEl.textContent = undoStack.length;
  }

  // --- Image Engine ---
  function openModal(src) {
    originalImageSrc = src;
    currentImageSrc = src;
    undoStack = [];
    updateUndoCount();
    modal.style.display = 'flex';
    setStatus("Loading...", "#aaa");
    loadToCanvas(src);
  }

  function loadToCanvas(src) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      currentCanvas = document.createElement('canvas');
      currentCanvas.width = img.width;
      currentCanvas.height = img.height;
      currentCtx = currentCanvas.getContext('2d');
      currentCtx.drawImage(img, 0, 0);
      updatePreview();
      setStatus(`Ready to edit. (${img.width}x${img.height})`, "#aaa");
    };
    img.onerror = () => {
      setStatus("Failed to load image (CORS blocked?). Try downloading directly.", "#dc3545");
    };
    img.src = src;
  }

  function updatePreview() {
    modalImg.src = currentCanvas.toDataURL('image/png');
  }

  function setStatus(text, color) {
    processStatus.textContent = text;
    processStatus.style.color = color || "#aaa";
  }

  async function applyOperation(type, params = {}, updateUI = true) {
    if (!currentCanvas) return;
    if (updateUI) setStatus(`Applying ${type}...`, "#fff");

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const w = currentCanvas.width;
    const h = currentCanvas.height;

    switch (type) {
      case 'crop': {
        const pct = (params.percent !== undefined ? params.percent : 2) / 100;
        if (pct <= 0 || pct >= 0.5) return;
        const cutX = w * pct, cutY = h * pct;
        const cutW = w * (1 - pct * 2), cutH = h * (1 - pct * 2);
        tempCanvas.width = cutW; tempCanvas.height = cutH;
        tempCtx.drawImage(currentCanvas, cutX, cutY, cutW, cutH, 0, 0, cutW, cutH);
        break;
      }
      case 'resize': {
        const scale = (params.scale !== undefined ? params.scale : 97) / 100;
        tempCanvas.width = Math.round(w * scale);
        tempCanvas.height = Math.round(h * scale);
        tempCtx.drawImage(currentCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        break;
      }
      case 'flip': {
        tempCanvas.width = w; tempCanvas.height = h;
        tempCtx.translate(w, 0);
        tempCtx.scale(-1, 1);
        tempCtx.drawImage(currentCanvas, 0, 0);
        tempCtx.setTransform(1, 0, 0, 1, 0, 0);
        break;
      }
      case 'noise': {
        const amount = params.amount !== undefined ? params.amount : 15;
        tempCanvas.width = w; tempCanvas.height = h;
        tempCtx.drawImage(currentCanvas, 0, 0);
        const imgDataN = tempCtx.getImageData(0, 0, w, h);
        const dataN = imgDataN.data;
        for (let i = 0; i < dataN.length; i += 4) {
          const noise = (Math.random() - 0.5) * amount;
          dataN[i] = Math.min(255, Math.max(0, dataN[i] + noise));
          dataN[i + 1] = Math.min(255, Math.max(0, dataN[i + 1] + noise));
          dataN[i + 2] = Math.min(255, Math.max(0, dataN[i + 2] + noise));
        }
        tempCtx.putImageData(imgDataN, 0, 0);
        break;
      }
      case 'color': {
        const shift = params.shift !== undefined ? params.shift : 10;
        tempCanvas.width = w; tempCanvas.height = h;
        tempCtx.filter = `hue-rotate(${shift}deg) saturate(1.1)`;
        tempCtx.drawImage(currentCanvas, 0, 0);
        tempCtx.filter = 'none';
        break;
      }
      case 'obfuscate': {
        const blurRadius = params.blur !== undefined ? params.blur : 0.5;
        tempCanvas.width = w; tempCanvas.height = h;
        tempCtx.filter = `blur(${blurRadius}px) contrast(1.05)`;
        tempCtx.drawImage(currentCanvas, 0, 0);
        tempCtx.filter = 'none';
        const imgData = tempCtx.getImageData(0, 0, w, h);
        const sharpened = applySharpenFilter(tempCtx, imgData);
        tempCtx.putImageData(sharpened, 0, 0);
        break;
      }
      case 'recompress': {
        const quality = (params.quality !== undefined ? params.quality : 75) / 100;
        const jpegUrl = currentCanvas.toDataURL('image/jpeg', quality);
        await new Promise((resolve) => {
          const jImg = new Image();
          jImg.onload = () => {
            tempCanvas.width = w; tempCanvas.height = h;
            tempCtx.drawImage(jImg, 0, 0);
            resolve();
          };
          jImg.src = jpegUrl;
        });
        break;
      }
    }

    currentCanvas = tempCanvas;
    currentCtx = tempCtx;
    updatePreview();
    if (updateUI) setStatus(`Done: ${type} (${currentCanvas.width}x${currentCanvas.height})`, "#81c995");
  }

  function applySharpenFilter(ctx, imgData) {
    const w = imgData.width, h = imgData.height;
    const src = imgData.data;
    const output = ctx.createImageData(w, h);
    const dst = output.data;
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let r = 0, g = 0, b = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pos = ((y + ky) * w + (x + kx)) * 4;
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            r += src[pos] * weight;
            g += src[pos + 1] * weight;
            b += src[pos + 2] * weight;
          }
        }
        const destPos = (y * w + x) * 4;
        dst[destPos] = Math.max(0, Math.min(255, r));
        dst[destPos + 1] = Math.max(0, Math.min(255, g));
        dst[destPos + 2] = Math.max(0, Math.min(255, b));
        dst[destPos + 3] = 255;
      }
    }
    return output;
  }

  // ========== SCAN & RENDER ==========

  function scanPage() {
    statusDiv.textContent = 'Scanning...';
    imageList.innerHTML = '';
    emptyState.style.display = 'none';
    allImages = [];
    selectedImages.clear();
    updateStatus();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        statusDiv.textContent = 'Error: No active tab.';
        return;
      }
      const tabId = tabs[0].id;
      const tabUrl = tabs[0].url || '';

      // Can't inject into chrome://, edge://, about:, etc.
      if (tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://') ||
          tabUrl.startsWith('about:') || tabUrl.startsWith('chrome-extension://')) {
        statusDiv.textContent = 'Cannot scan this page (restricted URL).';
        emptyState.style.display = 'flex';
        return;
      }

      chrome.scripting.executeScript(
        { target: { tabId: tabId }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
            emptyState.style.display = 'flex';
            return;
          }
          chrome.tabs.sendMessage(tabId, { action: 'getImages' }, (response) => {
            if (chrome.runtime.lastError) {
              statusDiv.textContent = 'Error communicating with page.';
              emptyState.style.display = 'flex';
              return;
            }
            if (response && response.length > 0) {
              allImages = response;
              renderImages();
            } else {
              statusDiv.textContent = 'No images found.';
              emptyState.style.display = 'flex';
            }
          });
        }
      );
    });
  }

  function getActiveFilters() {
    const allowedTypes = Array.from(typeCheckboxes)
      .filter(cb => cb.checked && cb.id !== 'convertWebp' && cb.id !== 'zipMode')
      .map(cb => cb.value);
    return {
      minW: parseInt(minWidthInput.value) || 0,
      minH: parseInt(minHeightInput.value) || 0,
      text: filterTextInput.value.toLowerCase().trim(),
      types: allowedTypes
    };
  }

  function getFileExtension(url) {
    if (url.startsWith('data:image')) return 'png';
    const cleanUrl = url.split('?')[0].split('#')[0];
    const ext = cleanUrl.split('.').pop().toLowerCase();
    if (ext === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp', 'svg', 'gif', 'avif', 'bmp', 'ico'].includes(ext)) return ext;
    return 'unknown';
  }

  function renderImages() {
    imageList.innerHTML = '';
    const filters = getActiveFilters();

    const filtered = allImages.filter(img => {
      if (img.width < filters.minW || img.height < filters.minH) return false;
      const ext = getFileExtension(img.src);
      if (ext !== 'unknown' && !filters.types.includes(ext)) return false;
      if (filters.text) {
        const srcMatch = img.src.toLowerCase().includes(filters.text);
        const altMatch = img.alt && img.alt.toLowerCase().includes(filters.text);
        if (!srcMatch && !altMatch) return false;
      }
      return true;
    });

    filteredImagesCount = filtered.length;
    updateStatus();

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    filtered.forEach(img => {
      const li = document.createElement('li');
      li.dataset.src = img.src;
      if (selectedImages.has(img.src)) li.classList.add('selected');

      const extDisplay = getFileExtension(img.src);

      // Build action bar
      const actionBar = document.createElement('div');
      actionBar.className = 'action-bar';

      // View button
      const viewBtn = createMiniBtn('\uD83D\uDC41', 'Open full image in new tab', (e) => {
        e.stopPropagation(); chrome.tabs.create({ url: img.src });
      });

      // Link button
      const linkBtn = createMiniBtn('\uD83D\uDD17', img.link ? 'Open linked page' : 'No link available', (e) => {
        e.stopPropagation();
        if (img.link) chrome.tabs.create({ url: img.link });
      });
      if (!img.link) linkBtn.classList.add('disabled');

      // Lens button
      const lensBtn = createMiniBtn('\uD83D\uDCF7', 'Search with Google Lens', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(img.src) });
      });

      // TinEye button
      const tineyeBtn = createMiniBtn('\uD83D\uDC40', 'Search with TinEye', (e) => {
        e.stopPropagation();
        chrome.tabs.create({ url: 'https://tineye.com/search?url=' + encodeURIComponent(img.src) });
      });

      // Copy URL button
      const copyBtn = createMiniBtn('\uD83D\uDCCB', 'Copy image URL', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(img.src).then(() => notify("URL copied!", "info"));
      });

      // Editor button
      const editorBtn = createMiniBtn('\uD83D\uDDBC', 'Open in image editor', (e) => {
        e.stopPropagation(); openModal(img.src);
      });

      actionBar.append(viewBtn, linkBtn, lensBtn, tineyeBtn, copyBtn, editorBtn);

      // Image wrapper
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'img-wrapper';
      const imgEl = document.createElement('img');
      imgEl.src = img.src;
      imgEl.loading = 'lazy';
      imgEl.alt = img.alt || '';
      imgWrapper.appendChild(imgEl);

      // Selection overlay
      const overlay = document.createElement('div');
      overlay.className = 'selection-overlay';
      const checkIcon = document.createElement('div');
      checkIcon.className = 'check-icon';
      overlay.appendChild(checkIcon);

      // Metadata
      const metaExt = document.createElement('div');
      metaExt.className = 'meta-ext';
      metaExt.textContent = extDisplay;

      const metaSize = document.createElement('div');
      metaSize.className = 'meta-size';
      metaSize.textContent = `${img.width}x${img.height}`;

      li.append(imgWrapper, actionBar, overlay, metaExt, metaSize);

      // Click to select/deselect
      li.addEventListener('click', () => {
        if (selectedImages.has(img.src)) selectedImages.delete(img.src);
        else selectedImages.add(img.src);
        li.classList.toggle('selected');
        updateStatus();
      });

      imageList.appendChild(li);
    });
  }

  function createMiniBtn(iconChar, titleText, handler) {
    const btn = document.createElement('div');
    btn.className = 'mini-btn';
    btn.textContent = iconChar;
    btn.title = titleText;
    btn.addEventListener('click', handler);
    return btn;
  }

  function updateStatus() {
    statusDiv.textContent = `Found: ${allImages.length} | Shown: ${filteredImagesCount} | Selected: ${selectedImages.size}`;
    downloadBtn.textContent = selectedImages.size > 0 ? `Download (${selectedImages.size})` : 'Download';
    downloadBtn.disabled = selectedImages.size === 0;
  }

  function toggleSelectAll() {
    const filters = getActiveFilters();
    const visibleImages = allImages.filter(img => {
      if (img.width < filters.minW || img.height < filters.minH) return false;
      const ext = getFileExtension(img.src);
      if (ext !== 'unknown' && !filters.types.includes(ext)) return false;
      if (filters.text) {
        const srcMatch = img.src.toLowerCase().includes(filters.text);
        const altMatch = img.alt && img.alt.toLowerCase().includes(filters.text);
        if (!srcMatch && !altMatch) return false;
      }
      return true;
    });

    const allSelected = visibleImages.every(img => selectedImages.has(img.src));
    if (allSelected) {
      visibleImages.forEach(img => selectedImages.delete(img.src));
    } else {
      visibleImages.forEach(img => selectedImages.add(img.src));
    }
    renderImages();
    updateStatus();
  }

  // ========== DOWNLOAD ENGINE ==========

  async function startDownloadProcess(urlsArray) {
    const renameBase = renameInput.value.trim();
    const folderName = subfolderInput.value.trim().replace(/[<>:"/\\|?*]+/g, '');
    const shouldConvert = convertWebpCheckbox.checked;
    const useZip = zipModeCheckbox.checked;

    downloadBtn.textContent = 'Downloading...';
    downloadBtn.disabled = true;
    showProgress(0, urlsArray.length);

    if (useZip) {
      await downloadAsZip(urlsArray, renameBase, folderName, shouldConvert);
    } else {
      await downloadIndividual(urlsArray, renameBase, folderName, shouldConvert);
    }

    hideProgress();
    updateStatus();
  }

  async function downloadIndividual(urlsArray, renameBase, folderName, shouldConvert) {
    let idx = 1;
    for (const url of urlsArray) {
      let finalUrl = url;
      let finalFilename = '';
      let ext = url.startsWith('data:image') ? 'png' : getFileExtension(url);
      if (ext === 'unknown') ext = 'jpg';

      if (shouldConvert && ext === 'webp' && !url.startsWith('data:image')) {
        try { finalUrl = await convertWebPtoPNG(url); ext = 'png'; } catch (e) { /* use original */ }
      }

      if (renameBase) {
        finalFilename = `${renameBase}_${idx.toString().padStart(3, '0')}.${ext}`;
      } else if (!url.startsWith('data:image')) {
        let n = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
        finalFilename = (n && n.length < 50 && n.length > 0) ? n : `image_${idx}.${ext}`;
      } else {
        finalFilename = `processed_${idx}.${ext}`;
      }

      if (folderName) {
        finalFilename = `${folderName}/${finalFilename}`;
      }

      chrome.downloads.download({
        url: finalUrl,
        filename: finalFilename || undefined,
        conflictAction: 'uniquify'
      });

      updateProgress(idx, urlsArray.length);
      idx++;
    }
  }

  async function downloadAsZip(urlsArray, renameBase, folderName, shouldConvert) {
    const zip = new JSZip();
    const folder = folderName ? zip.folder(folderName) : zip;
    let idx = 1;

    for (const url of urlsArray) {
      try {
        let ext = url.startsWith('data:image') ? 'png' : getFileExtension(url);
        if (ext === 'unknown') ext = 'jpg';

        let imageData;

        if (url.startsWith('data:')) {
          // Data URL - extract base64
          const base64 = url.split(',')[1];
          imageData = base64;
        } else {
          // Fetch image
          let fetchUrl = url;
          if (shouldConvert && ext === 'webp') {
            try {
              const pngDataUrl = await convertWebPtoPNG(url);
              imageData = pngDataUrl.split(',')[1];
              ext = 'png';
            } catch (e) {
              // Fallback to original
              const resp = await fetch(url);
              const blob = await resp.blob();
              imageData = blob;
            }
          } else {
            try {
              const resp = await fetch(url);
              const blob = await resp.blob();
              imageData = blob;
            } catch (fetchErr) {
              // CORS blocked — fallback: load via canvas
              try {
                const dataUrl = await loadImageAsDataUrl(url);
                imageData = dataUrl.split(',')[1];
              } catch (canvasErr) {
                console.warn(`Skipping image ${idx} (CORS blocked):`, url);
                continue;
              }
            }
          }
        }

        let filename;
        if (renameBase) {
          filename = `${renameBase}_${idx.toString().padStart(3, '0')}.${ext}`;
        } else if (!url.startsWith('data:image')) {
          let n = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
          filename = (n && n.length < 50 && n.length > 0) ? n : `image_${idx}.${ext}`;
        } else {
          filename = `processed_${idx}.${ext}`;
        }

        if (typeof imageData === 'string') {
          folder.file(filename, imageData, { base64: true });
        } else {
          folder.file(filename, imageData);
        }

        updateProgress(idx, urlsArray.length, 'Fetching');
      } catch (e) {
        console.warn(`Failed to fetch image ${idx}:`, e);
      }
      idx++;
    }

    updateProgress(urlsArray.length, urlsArray.length, 'Creating ZIP');

    try {
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        progressFill.style.width = metadata.percent.toFixed(0) + '%';
        progressText.textContent = `Compressing ZIP... ${metadata.percent.toFixed(0)}%`;
      });

      const zipUrl = URL.createObjectURL(blob);
      const zipName = folderName ? `${folderName}.zip` : 'images.zip';

      chrome.downloads.download({
        url: zipUrl,
        filename: zipName,
        conflictAction: 'uniquify'
      }, () => {
        // Revoke blob URL after download starts to free memory
        setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
      });

      notify(`ZIP created with ${urlsArray.length} images!`, '');
    } catch (e) {
      console.error('ZIP creation failed:', e);
      notify('Failed to create ZIP file.', 'error');
    }
  }

  function loadImageAsDataUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const c = document.getElementById('conversionCanvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function convertWebPtoPNG(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const c = document.getElementById('conversionCanvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // --- Progress Bar ---
  function showProgress(current, total) {
    progressContainer.style.display = 'block';
    updateProgress(current, total);
  }

  function updateProgress(current, total, label) {
    const pct = Math.round((current / total) * 100);
    progressFill.style.width = pct + '%';
    progressText.textContent = `${label || 'Downloading'}: ${current} / ${total} (${pct}%)`;
  }

  function hideProgress() {
    setTimeout(() => {
      progressContainer.style.display = 'none';
      progressFill.style.width = '0%';
    }, 1500);
  }
});
