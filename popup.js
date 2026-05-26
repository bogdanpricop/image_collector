// Pro Image Collector v8.0 - popup.js
// Rewritten with: dedup fix, XSS prevention, rotation export, ZIP download,
// drag select, undo/redo, persistent settings, keyboard shortcuts, progress bar

let allImages = [];
let selectedImages = new Set();
let filteredImagesCount = 0;
let activeMediaTab = 'image';
const STREAM_EXTENSIONS = new Set(['m3u8', 'mpd']);
const MEDIA_TABS = new Set(['image', 'video']);

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
const SETTINGS_KEYS = ['minWidth', 'minHeight', 'gridSlider', 'zipMode', 'convertWebp', 'convertWebpFormat', 'exportFormat', 'activeMediaTab'];

document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const imageList = document.getElementById('imageList');
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const rescanBtn = document.getElementById('rescanBtn');
  const emptyState = document.getElementById('emptyState');
  const emptyIcon = emptyState.querySelector('.empty-icon');
  const emptyText = emptyState.querySelector('.empty-text');
  const emptyHint = emptyState.querySelector('.empty-hint');
  const floatingTooltip = document.getElementById('floatingTooltip');
  const mediaTabButtons = document.querySelectorAll('.media-tab');
  const imageCountBadge = document.getElementById('imageCountBadge');
  const videoCountBadge = document.getElementById('videoCountBadge');
  const typeFilterGroups = document.querySelectorAll('.type-filter-group');
  const imageOnlyOptions = document.querySelectorAll('.image-only-options');

  // Inputs & Filters
  const minWidthInput = document.getElementById('minWidth');
  const minHeightInput = document.getElementById('minHeight');
  const filterTextInput = document.getElementById('filterText');
  const subfolderInput = document.getElementById('subfolderName');
  const renameInput = document.getElementById('renamePattern');
  const convertWebpCheckbox = document.getElementById('convertWebp');
  const convertWebpFormatSelect = document.getElementById('convertWebpFormat');
  const zipModeCheckbox = document.getElementById('zipMode');
  const exportFormatSelect = document.getElementById('exportFormat');
  const gridSlider = document.getElementById('gridSlider');
  const typeCheckboxes = document.querySelectorAll('.media-type-filter');

  // Progress
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const trackedDownloadIds = new Map();

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
  updateMediaTabUI();
  applyGridColumns();
  scanPage();

  // Listen for new images detected by MutationObserver in content script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'newImagesDetected') {
      notify('New media detected on page. Click Rescan to update.', 'info');
    }
  });

  if (chrome.downloads?.onChanged) {
    chrome.downloads.onChanged.addListener((delta) => {
      if (!trackedDownloadIds.has(delta.id)) return;

      const filename = trackedDownloadIds.get(delta.id);
      if (delta.error?.current) {
        notify(`Download interrupted: ${filename} (${delta.error.current})`, 'error');
        trackedDownloadIds.delete(delta.id);
      } else if (delta.state?.current === 'complete') {
        trackedDownloadIds.delete(delta.id);
      }
    });
  }

  // --- SETTINGS PERSISTENCE ---
  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEYS, (data) => {
      if (data.minWidth !== undefined) minWidthInput.value = data.minWidth;
      if (data.minHeight !== undefined) minHeightInput.value = data.minHeight;
      if (data.gridSlider !== undefined) gridSlider.value = data.gridSlider;
      if (data.zipMode !== undefined) zipModeCheckbox.checked = data.zipMode;
      if (data.convertWebp !== undefined) convertWebpCheckbox.checked = data.convertWebp;
      if (data.convertWebpFormat !== undefined) convertWebpFormatSelect.value = data.convertWebpFormat;
      if (data.exportFormat !== undefined) exportFormatSelect.value = data.exportFormat;
      if (MEDIA_TABS.has(data.activeMediaTab)) activeMediaTab = data.activeMediaTab;
      updateMediaTabUI();
      applyGridColumns();
      renderImages();
    });
  }

  function saveSettings() {
    const data = {};
    data.minWidth = parseInt(minWidthInput.value) || 0;
    data.minHeight = parseInt(minHeightInput.value) || 0;
    data.gridSlider = parseInt(gridSlider.value);
    data.zipMode = zipModeCheckbox.checked;
    data.convertWebp = convertWebpCheckbox.checked;
    data.convertWebpFormat = convertWebpFormatSelect.value;
    data.exportFormat = exportFormatSelect.value;
    data.activeMediaTab = activeMediaTab;
    chrome.storage.local.set(data);
  }

  function applyGridColumns() {
    document.documentElement.style.setProperty('--grid-cols', gridSlider.value);
  }

  function getMediaCounts() {
    const videoCount = allImages.filter(item => item.mediaType === 'video').length;
    return {
      image: allImages.length - videoCount,
      video: videoCount
    };
  }

  function getTabMedia(tab = activeMediaTab) {
    return allImages.filter(item => (tab === 'video') === (item.mediaType === 'video'));
  }

  function getVisibleMedia() {
    return filterImages(getTabMedia(), getActiveFilters());
  }

  function getActiveSelectedUrls() {
    const activeUrls = new Set(getTabMedia().map(item => item.src));
    return Array.from(selectedImages).filter(url => activeUrls.has(url));
  }

  function updateMediaTabUI() {
    mediaTabButtons.forEach((button) => {
      const isActive = button.dataset.mediaTab === activeMediaTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    typeFilterGroups.forEach((group) => {
      group.classList.toggle('hidden', group.dataset.filterGroup !== activeMediaTab);
    });

    imageOnlyOptions.forEach((option) => {
      option.classList.toggle('hidden', activeMediaTab !== 'image');
    });
  }

  function updateMediaCounts() {
    const counts = getMediaCounts();
    imageCountBadge.textContent = counts.image;
    videoCountBadge.textContent = counts.video;
  }

  function updateEmptyState() {
    const isVideoTab = activeMediaTab === 'video';
    emptyIcon.textContent = isVideoTab ? '\u25B6' : '\uD83D\uDCF7';
    emptyText.textContent = isVideoTab ? 'No videos found' : 'No images found';
    emptyHint.textContent = isVideoTab
      ? 'Try playing or scrolling the page, then click Rescan.'
      : 'Try scrolling the page and clicking Rescan, or adjust your filters.';
  }

  // --- EVENT LISTENERS ---
  mediaTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.mediaTab;
      if (!MEDIA_TABS.has(nextTab) || activeMediaTab === nextTab) return;
      activeMediaTab = nextTab;
      updateMediaTabUI();
      saveSettings();
      renderImages();
    });
  });

  rescanBtn.addEventListener('click', scanPage);
  minWidthInput.addEventListener('input', () => { renderImages(); saveSettings(); });
  minHeightInput.addEventListener('input', () => { renderImages(); saveSettings(); });
  filterTextInput.addEventListener('input', renderImages);
  typeCheckboxes.forEach(cb => {
    cb.addEventListener('change', renderImages);
  });

  gridSlider.addEventListener('input', () => { applyGridColumns(); saveSettings(); });
  zipModeCheckbox.addEventListener('change', saveSettings);
  convertWebpCheckbox.addEventListener('change', saveSettings);
  convertWebpFormatSelect.addEventListener('change', saveSettings);
  exportFormatSelect.addEventListener('change', saveSettings);

  selectAllBtn.addEventListener('click', toggleSelectAll);
  downloadBtn.addEventListener('click', () => startDownloadProcess(getActiveSelectedUrls()));

  closeModal.addEventListener('click', closeEditor);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeEditor(); });

  // --- KEYBOARD SHORTCUTS ---
  document.addEventListener('keydown', (e) => {
    // Global shortcuts (when modal is closed)
    if (modal.style.display !== 'flex') {
      if (e.ctrlKey && e.key === 'a') { e.preventDefault(); toggleSelectAll(); }
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        const activeSelectedUrls = getActiveSelectedUrls();
        if (activeSelectedUrls.length > 0) startDownloadProcess(activeSelectedUrls);
      }
      return;
    }
    // Modal shortcuts
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); performUndo(); }
    if (e.key === 'Escape') closeEditor();
  });

  // --- DRAG SELECT ---
  imageList.addEventListener('mousedown', (e) => {
    if (e.target.closest('.mini-btn') || e.target.closest('.action-bar') || e.target.closest('.video-preview')) return;
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
      setStatus("Error in cascade: " + (e.message || "Unknown error"), "red");
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

  function openSafeUrl(url, allowedProtocols) {
    try {
      const parsedUrl = new URL(url);
      if (!allowedProtocols.includes(parsedUrl.protocol)) {
        throw new Error('Unsupported URL protocol');
      }
      chrome.tabs.create({ url: parsedUrl.href });
    } catch (e) {
      notify('Cannot open invalid or unsafe URL', 'error');
    }
  }

  function positionFloatingTooltip(target) {
    if (!floatingTooltip || !target) return;

    const tooltipRect = floatingTooltip.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const viewportPadding = 8;
    let left = targetRect.left + (targetRect.width / 2);
    let top = targetRect.bottom + 8;

    left = Math.max(
      viewportPadding + (tooltipRect.width / 2),
      Math.min(window.innerWidth - viewportPadding - (tooltipRect.width / 2), left)
    );

    if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
      top = targetRect.top - 8;
      floatingTooltip.style.transform = 'translate(-50%, -100%)';
    } else {
      floatingTooltip.style.transform = 'translate(-50%, 0)';
    }

    floatingTooltip.style.left = `${left}px`;
    floatingTooltip.style.top = `${top}px`;
  }

  function showFloatingTooltip(target) {
    if (!floatingTooltip || !target?.dataset.tooltip) return;

    floatingTooltip.textContent = target.dataset.tooltip;
    floatingTooltip.classList.add('show');
    positionFloatingTooltip(target);
  }

  function hideFloatingTooltip() {
    if (!floatingTooltip) return;
    floatingTooltip.classList.remove('show');
  }

  function bindFloatingTooltip(target, text) {
    target.dataset.tooltip = text;
    target.addEventListener('mouseenter', () => showFloatingTooltip(target));
    target.addEventListener('focus', () => showFloatingTooltip(target));
    target.addEventListener('mousemove', () => positionFloatingTooltip(target));
    target.addEventListener('mouseleave', hideFloatingTooltip);
    target.addEventListener('blur', hideFloatingTooltip);
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
    updateEmptyState();
    imageList.replaceChildren();
    emptyState.style.display = 'none';
    allImages = [];
    selectedImages.clear();
    filteredImagesCount = 0;
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
          chrome.tabs.sendMessage(tabId, { action: 'getMedia' }, (response) => {
            if (chrome.runtime.lastError) {
              statusDiv.textContent = 'Error communicating with page.';
              emptyState.style.display = 'flex';
              return;
            }

            getCapturedMedia(tabId)
              .then((capturedMedia) => {
                allImages = mergeMediaItems(response || [], capturedMedia);
                if (allImages.length > 0) {
                  renderImages();
                } else {
                  statusDiv.textContent = 'No media found.';
                  emptyState.style.display = 'flex';
                }
              })
              .catch(() => {
                allImages = response || [];
                if (allImages.length > 0) {
                  renderImages();
                } else {
                  statusDiv.textContent = 'No media found.';
                  emptyState.style.display = 'flex';
                }
              });
          });
        }
      );
    });
  }

  function getCapturedMedia(tabId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getCapturedMedia', tabId }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          resolve([]);
          return;
        }

        resolve(Array.isArray(response.media) ? response.media : []);
      });
    });
  }

  function mergeMediaItems(contentMedia, capturedMedia) {
    const merged = new Map();
    const contentItems = Array.isArray(contentMedia) ? contentMedia : [];
    const capturedItems = Array.isArray(capturedMedia) ? capturedMedia : [];

    contentItems.forEach((item) => {
      if (item?.src) merged.set(item.src, item);
    });

    const videoFallbacks = contentItems.filter(item => item?.mediaType === 'video');

    capturedItems.forEach((item) => {
      if (!item?.src) return;

      const platformFallback = videoFallbacks.find(video => video.platform && video.platform === item.platform);
      const genericFallback = videoFallbacks.find(video => video.thumbnail || video.poster);
      const fallback = platformFallback || genericFallback || {};
      const existing = merged.get(item.src);

      merged.set(item.src, {
        ...fallback,
        ...existing,
        ...item,
        alt: item.alt || existing?.alt || fallback.alt || 'video request',
        poster: item.poster || existing?.poster || fallback.poster || null,
        thumbnail: item.thumbnail || existing?.thumbnail || fallback.thumbnail || fallback.poster || null,
        width: item.width || existing?.width || fallback.width || 0,
        height: item.height || existing?.height || fallback.height || 0,
        mediaType: 'video',
        type: 'video'
      });
    });

    return Array.from(merged.values());
  }

  function getActiveFilters() {
    const allowedTypes = Array.from(typeCheckboxes)
      .filter(cb => cb.checked && cb.dataset.mediaType === activeMediaTab)
      .map(cb => cb.value);
    return {
      minW: parseInt(minWidthInput.value) || 0,
      minH: parseInt(minHeightInput.value) || 0,
      text: filterTextInput.value.toLowerCase().trim(),
      types: allowedTypes
    };
  }

  function renderImages() {
    imageList.replaceChildren();
    updateMediaTabUI();
    updateMediaCounts();
    updateEmptyState();
    const filtered = getVisibleMedia();

    filteredImagesCount = filtered.length;
    updateStatus();

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }
    emptyState.style.display = 'none';

    filtered.forEach(media => {
      const li = document.createElement('li');
      const isVideo = media.mediaType === 'video';
      li.dataset.src = media.src;
      if (isVideo) li.classList.add('video-card');
      if (media.isStream) li.classList.add('stream-card');
      if (selectedImages.has(media.src)) li.classList.add('selected');

      const extDisplay = getFileExtension(media.src);
      const displayExt = extDisplay === 'unknown' ? (isVideo ? 'video' : 'file') : extDisplay;

      const actionBar = document.createElement('div');
      actionBar.className = 'action-bar';

      const viewTitle = isVideo
        ? (isBlobUrl(media.src) ? 'Preview blob video on source page' : 'Open video in new tab')
        : 'Open full image in new tab';
      const viewBtn = createMiniBtn('\uD83D\uDC41', viewTitle, (e) => {
        e.stopPropagation();
        if (isVideo && isBlobUrl(media.src)) {
          previewVideoOnPage(media)
            .then(() => notify('Video preview opened on the source page.', 'info'))
            .catch((error) => notify(`Video preview failed: ${error.message || 'Unknown error'}`, 'error'));
          return;
        }
        if (isVideo && shouldPreviewOnSourcePage(media)) {
          previewVideoOnPage(media)
            .then(() => notify('Video preview opened on the source page.', 'info'))
            .catch((error) => notify(`Video preview failed: ${error.message || 'Unknown error'}`, 'error'));
          return;
        }
        openSafeUrl(media.src, ['http:', 'https:', 'data:', 'blob:']);
      });

      const linkBtn = createMiniBtn('\uD83D\uDD17', media.link ? 'Open linked page' : 'No link available', (e) => {
        e.stopPropagation();
        if (media.link) openSafeUrl(media.link, ['http:', 'https:']);
      });
      if (!media.link) linkBtn.classList.add('disabled');

      const copyBtn = createMiniBtn('\uD83D\uDCCB', isVideo ? 'Copy video URL' : 'Copy image URL', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(media.src).then(() => notify("URL copied!", "info"));
      });

      actionBar.append(viewBtn, linkBtn, copyBtn);

      if (isVideo) {
        const previewTitle = media.isStream
          ? 'Preview is not available for stream manifests'
          : (isBlobUrl(media.src) ? 'Play blob preview on source page' : 'Play preview in card');
        const previewBtn = createMiniBtn('\u25B6', previewTitle, (e) => {
          e.stopPropagation();
          toggleVideoPreview(li, media);
        });
        previewBtn.classList.add('video-preview-toggle');
        actionBar.append(previewBtn);

        const canDownloadVideo = isVideoDownloadable(media);
        const videoDownloadTitle = getVideoDownloadTitle(media);
        const videoDownloadBtn = createMiniBtn('\u2B07', videoDownloadTitle, (e) => {
          e.stopPropagation();
          if (!canDownloadVideo && !isBlobUrl(media.src)) {
            notify('This video cannot be downloaded directly. Copy or open the URL instead.', 'error');
            return;
          }
          startDownloadProcess([media.src]);
        });
        videoDownloadBtn.classList.add('video-download-btn');
        if (!canDownloadVideo && !isBlobUrl(media.src)) videoDownloadBtn.classList.add('disabled');
        actionBar.append(videoDownloadBtn);
      } else {
        const lensBtn = createMiniBtn('\uD83D\uDCF7', 'Search with Google Lens', (e) => {
          e.stopPropagation();
          chrome.tabs.create({ url: 'https://lens.google.com/uploadbyurl?url=' + encodeURIComponent(media.src) });
        });

        const tineyeBtn = createMiniBtn('\uD83D\uDC40', 'Search with TinEye', (e) => {
          e.stopPropagation();
          chrome.tabs.create({ url: 'https://tineye.com/search?url=' + encodeURIComponent(media.src) });
        });

        const editorBtn = createMiniBtn('\uD83D\uDDBC', 'Open in image editor', (e) => {
          e.stopPropagation();
          openModal(media.src);
        });

        actionBar.append(lensBtn, tineyeBtn, editorBtn);
      }

      const imgWrapper = isVideo ? createVideoThumbnail(media) : createImageThumbnail(media);

      const overlay = document.createElement('div');
      overlay.className = 'selection-overlay';
      const checkIcon = document.createElement('div');
      checkIcon.className = 'check-icon';
      overlay.appendChild(checkIcon);

      const metaExt = document.createElement('div');
      metaExt.className = 'meta-ext';
      metaExt.textContent = displayExt;

      const metaSize = document.createElement('div');
      metaSize.className = 'meta-size';
      if (isVideo) {
        metaSize.textContent = media.width && media.height
          ? `${media.width}x${media.height}`
          : (media.isStream ? 'Stream' : 'Video');
      } else {
        metaSize.textContent = `${media.width}x${media.height}`;
      }

      li.append(imgWrapper, actionBar, overlay, metaExt, metaSize);

      li.addEventListener('click', (e) => {
        if (e.target.closest('.video-preview') || e.target.closest('.video-preview-toggle')) return;
        if (selectedImages.has(media.src)) selectedImages.delete(media.src);
        else selectedImages.add(media.src);
        li.classList.toggle('selected');
        updateStatus();
      });

      imageList.appendChild(li);
    });
  }

  function createImageThumbnail(media) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'img-wrapper';
    const imgEl = document.createElement('img');
    imgEl.src = media.src;
    imgEl.loading = 'lazy';
    imgEl.alt = media.alt || '';
    imgWrapper.appendChild(imgEl);
    return imgWrapper;
  }

  function createVideoThumbnail(media) {
    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'img-wrapper';

    const videoPlaceholder = document.createElement('div');
    videoPlaceholder.className = 'video-placeholder';
    const playIcon = document.createElement('span');
    playIcon.className = 'video-play';
    playIcon.textContent = '\u25B6';
    videoPlaceholder.appendChild(playIcon);
    imgWrapper.appendChild(videoPlaceholder);

    const thumbnailSrc = media.thumbnail || media.poster;

    if (thumbnailSrc) {
      const posterImg = document.createElement('img');
      posterImg.className = 'video-poster';
      posterImg.src = thumbnailSrc;
      posterImg.loading = 'eager';
      posterImg.decoding = 'async';
      posterImg.alt = media.alt || 'video poster';
      posterImg.addEventListener('error', () => posterImg.remove());
      imgWrapper.appendChild(posterImg);
    }

    return imgWrapper;
  }

  function canPreviewVideo(media) {
    if (!media || media.mediaType !== 'video') return false;
    if (media.isStream || isStreamMedia(media.src)) return false;
    return true;
  }

  function isBlobUrl(url) {
    return String(url || '').toLowerCase().startsWith('blob:');
  }

  function isVideoDownloadable(media) {
    if (!media || media.mediaType !== 'video') return false;
    if (isBlobUrl(media.src)) return true;
    if (media.downloadable === false) return false;
    return true;
  }

  function getVideoDownloadTitle(media) {
    if (isBlobUrl(media?.src)) {
      return 'Download blob video from source page';
    }
    if (media?.platform === 'youtube' && media.downloadable === false) {
      return 'YouTube adaptive streams are preview-only';
    }
    if (!isVideoDownloadable(media)) return 'This video cannot be downloaded directly';
    return media.isStream ? 'Download stream manifest' : 'Download video';
  }

  function shouldPreviewOnSourcePage(media) {
    if (!media || media.mediaType !== 'video') return false;
    if (isBlobUrl(media.src)) return true;
    if (media.platform === 'youtube' || media.platform === 'twitter' || media.platform === 'tiktok') return true;
    return media.sourceType === 'resource' || media.sourceType === 'metadata';
  }

  function getActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Cannot access active tab'));
          return;
        }
        if (!tabs[0]?.id) {
          reject(new Error('No active tab found'));
          return;
        }
        resolve(tabs[0]);
      });
    });
  }

  function ensureContentScript(tabId) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        { target: { tabId }, files: ['content.js'] },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || 'Cannot inject content script'));
            return;
          }
          resolve();
        }
      );
    });
  }

  async function sendContentAction(message) {
    const tab = await getActiveTab();
    await ensureContentScript(tab.id);

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Cannot communicate with page'));
          return;
        }
        resolve(response || { ok: false, error: 'No response from page' });
      });
    });
  }

  async function previewBlobVideoOnPage(media) {
    const response = await sendContentAction({
      action: 'previewBlobVideo',
      src: media.src,
      title: media.alt || 'Video preview'
    });

    if (!response.ok) throw new Error(response.error || 'Blob preview failed');
  }

  async function previewVideoOnPage(media) {
    const response = await sendContentAction({
      action: 'previewVideo',
      src: media.src,
      title: media.alt || 'Video preview'
    });

    if (!response.ok) throw new Error(response.error || 'Video preview failed');
  }

  async function downloadBlobVideoOnPage(media, filename) {
    const response = await sendContentAction({
      action: 'downloadBlobVideo',
      src: media.src,
      filename
    });

    if (!response.ok) {
      const error = new Error(response.error || 'Blob download failed');
      error.fallbackUrl = response.fallbackUrl;
      throw error;
    }
    return response;
  }

  async function downloadVideoUrlOnPage(media, filename) {
    const response = await sendContentAction({
      action: 'downloadVideoUrl',
      src: media.src,
      filename
    });

    if (!response.ok) {
      const error = new Error(response.error || 'Video download failed');
      error.fallbackUrl = response.fallbackUrl;
      throw error;
    }
    return response;
  }

  function stopVideoPreview(card) {
    const video = card.querySelector('.video-preview');
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    card.classList.remove('previewing');
  }

  function stopOtherVideoPreviews(activeCard) {
    imageList.querySelectorAll('li.video-card.previewing').forEach((card) => {
      if (card !== activeCard) stopVideoPreview(card);
    });
  }

  async function toggleVideoPreview(card, media) {
    if (!canPreviewVideo(media)) {
      notify('Preview works only for direct video files. Open or copy this stream URL instead.', 'info');
      return;
    }

    if (shouldPreviewOnSourcePage(media)) {
      hideFloatingTooltip();
      try {
        await previewVideoOnPage(media);
        notify('Video preview opened on the source page.', 'info');
      } catch (e) {
        notify(`Video preview failed: ${e.message || 'Unknown error'}`, 'error');
      }
      return;
    }

    const existingPreview = card.querySelector('.video-preview');
    if (existingPreview) {
      stopVideoPreview(card);
      return;
    }

    stopOtherVideoPreviews(card);
    hideFloatingTooltip();

    const wrapper = card.querySelector('.img-wrapper');
    if (!wrapper) return;

    const preview = document.createElement('video');
    preview.className = 'video-preview';
    preview.src = media.src;
    preview.poster = media.thumbnail || media.poster || '';
    preview.controls = true;
    preview.muted = true;
    preview.loop = true;
    preview.playsInline = true;
    preview.preload = 'metadata';
    preview.setAttribute('playsinline', '');
    preview.setAttribute('aria-label', media.alt || 'Video preview');
    preview.addEventListener('click', (e) => e.stopPropagation());
    preview.addEventListener('mousedown', (e) => e.stopPropagation());
    preview.addEventListener('error', () => {
      stopVideoPreview(card);
      notify('Preview failed in the popup. Try opening the video in a new tab.', 'error');
    }, { once: true });

    wrapper.appendChild(preview);
    card.classList.add('previewing');

    const playPromise = preview.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Browser may require a second explicit tap; controls remain visible.
      });
    }
  }

  function createMiniBtn(iconChar, titleText, handler) {
    const btn = document.createElement('div');
    btn.className = 'mini-btn';
    btn.textContent = iconChar;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', titleText);
    bindFloatingTooltip(btn, titleText);
    btn.addEventListener('click', handler);
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); } });
    return btn;
  }

  function updateStatus() {
    updateMediaCounts();
    const counts = getMediaCounts();
    const selectedInTab = getActiveSelectedUrls().length;
    const tabLabel = activeMediaTab === 'video' ? 'Videos' : 'Images';
    const foundInTab = counts[activeMediaTab];
    statusDiv.textContent = `${tabLabel}: ${foundInTab} | Shown: ${filteredImagesCount} | Selected: ${selectedInTab}`;
    downloadBtn.textContent = selectedInTab > 0 ? `Download (${selectedInTab})` : 'Download';
    downloadBtn.disabled = selectedInTab === 0;
  }

  function toggleSelectAll() {
    const visibleImages = getVisibleMedia();

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
    const folderName = sanitizeFolderName(subfolderInput.value);
    const shouldConvert = convertWebpCheckbox.checked;
    const webpConversionTarget = getWebpConversionTarget();
    const useZip = zipModeCheckbox.checked;

    if (urlsArray.length === 0) {
      updateStatus();
      return;
    }

    downloadBtn.textContent = 'Downloading...';
    downloadBtn.disabled = true;
    showProgress(0, urlsArray.length);

    if (useZip) {
      await downloadAsZip(urlsArray, renameBase, folderName, shouldConvert, webpConversionTarget);
    } else {
      await downloadIndividual(urlsArray, renameBase, folderName, shouldConvert, webpConversionTarget);
    }

    hideProgress();
    updateStatus();
  }

  function getWebpConversionTarget() {
    return convertWebpFormatSelect.value === 'jpeg' ? 'jpeg' : 'png';
  }

  function getFormatExtension(format) {
    return format === 'jpeg' ? 'jpg' : format;
  }

  function getFormatMimeType(format) {
    return format === 'jpeg' ? 'image/jpeg' : 'image/png';
  }

  function getMediaItem(url) {
    return allImages.find(item => item.src === url) || { src: url, mediaType: 'image' };
  }

  function isVideoMedia(url) {
    return getMediaItem(url).mediaType === 'video';
  }

  function isStreamMedia(url) {
    const item = getMediaItem(url);
    const ext = getFileExtension(url);
    return item.isStream || STREAM_EXTENSIONS.has(ext);
  }

  function getDownloadExtension(url, mediaType) {
    const ext = getFileExtension(url);
    if (ext !== 'unknown') return ext;
    return mediaType === 'video' ? 'mp4' : 'jpg';
  }

  function startChromeDownload(options, label) {
    return new Promise((resolve, reject) => {
      chrome.downloads.download(options, (downloadId) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || 'Download failed'));
          return;
        }

        if (!downloadId && downloadId !== 0) {
          reject(new Error('Download did not start'));
          return;
        }

        trackedDownloadIds.set(downloadId, label || options.filename || options.url);
        resolve(downloadId);
      });
    });
  }

  async function downloadWithChrome(options, label) {
    try {
      return await startChromeDownload(options, label);
    } catch (e) {
      if (Array.isArray(options.headers) && options.headers.length > 0) {
        const retryOptions = { ...options };
        delete retryOptions.headers;
        return startChromeDownload(retryOptions, label);
      }
      throw e;
    }
  }

  function buildVideoDownloadHeaders(mediaItem, pageUrl) {
    if (!mediaItem?.src || !/^https?:\/\//i.test(mediaItem.src) || !/^https?:\/\//i.test(pageUrl || '')) {
      return [];
    }

    const headers = [
      { name: 'Referer', value: pageUrl },
      { name: 'Accept', value: 'video/webm,video/mp4,video/*;q=0.9,*/*;q=0.8' }
    ];

    try {
      const pageOrigin = new URL(pageUrl).origin;
      if (pageOrigin && pageOrigin !== 'null') {
        headers.push({ name: 'Origin', value: pageOrigin });
      }
    } catch (e) {
      // Referer is enough when the active tab URL cannot be parsed.
    }

    return headers;
  }

  function buildVideoDownloadOptions(url, filename, mediaItem, pageUrl) {
    const options = {
      url,
      filename: filename || undefined,
      conflictAction: 'uniquify'
    };

    const headers = buildVideoDownloadHeaders(mediaItem, pageUrl);
    if (headers.length > 0) options.headers = headers;

    return options;
  }

  function getDownloadErrorHint(error) {
    const message = error?.message || 'Unknown error';
    if (/USER_CANCELED/i.test(message)) return 'Download was cancelled.';
    if (/Invalid URL|URL/i.test(message)) return 'Invalid or unsupported video URL.';
    if (/filename/i.test(message)) return 'Invalid filename generated for this download.';
    if (/network|forbidden|denied|failed/i.test(message)) {
      return 'The host blocked the download or the URL expired.';
    }
    return message;
  }

  async function downloadIndividual(urlsArray, renameBase, folderName, shouldConvert, webpConversionTarget) {
    let idx = 1;
    let skippedVideoDownloads = 0;
    let blobFallbackCount = 0;
    let pageFallbackCount = 0;
    let streamCount = 0;
    let startedCount = 0;
    let failedCount = 0;
    let lastErrorHint = '';
    const hasVideoDownloads = urlsArray.some(url => isVideoMedia(url));
    const activeTab = hasVideoDownloads ? await getActiveTab().catch(() => null) : null;
    const pageUrl = activeTab?.url || '';

    for (const url of urlsArray) {
      const mediaItem = getMediaItem(url);
      const isVideo = mediaItem.mediaType === 'video';
      let finalUrl = url;
      let ext = getDownloadExtension(url, mediaItem.mediaType);

      if (isVideo) {
        if (!isVideoDownloadable(mediaItem)) {
          skippedVideoDownloads++;
          updateProgress(idx, urlsArray.length);
          idx++;
          continue;
        }

        if (isStreamMedia(url)) streamCount++;

        const finalFilename = generateFilename(url, idx, renameBase, folderName, ext);
        const shouldUsePageDownload = mediaItem.sourceType === 'resource' ||
          mediaItem.sourceType === 'metadata' ||
          mediaItem.sourceType === 'network';

        if (isBlobUrl(url)) {
          try {
            await downloadBlobVideoOnPage(mediaItem, finalFilename);
            blobFallbackCount++;
            startedCount++;
          } catch (e) {
            if (e.fallbackUrl) {
              try {
                await downloadWithChrome(
                  buildVideoDownloadOptions(e.fallbackUrl, finalFilename, mediaItem, pageUrl),
                  finalFilename
                );
                startedCount++;
              } catch (fallbackError) {
                failedCount++;
                lastErrorHint = getDownloadErrorHint(fallbackError || e);
              }
            } else {
              failedCount++;
              lastErrorHint = getDownloadErrorHint(e);
            }
          }

          updateProgress(idx, urlsArray.length);
          idx++;
          continue;
        }

        if (shouldUsePageDownload) {
          try {
            await downloadVideoUrlOnPage(mediaItem, finalFilename);
            pageFallbackCount++;
            startedCount++;
          } catch (e) {
            const fallbackUrl = e.fallbackUrl || finalUrl;
            try {
              await downloadWithChrome(
                buildVideoDownloadOptions(fallbackUrl, finalFilename, mediaItem, pageUrl),
                finalFilename
              );
              startedCount++;
            } catch (fallbackError) {
              failedCount++;
              lastErrorHint = getDownloadErrorHint(fallbackError || e);
            }
          }
        } else {
          try {
            await downloadWithChrome(
              buildVideoDownloadOptions(finalUrl, finalFilename, mediaItem, pageUrl),
              finalFilename
            );
            startedCount++;
          } catch (e) {
            try {
              await downloadVideoUrlOnPage(mediaItem, finalFilename);
              pageFallbackCount++;
              startedCount++;
            } catch (fallbackError) {
              failedCount++;
              lastErrorHint = getDownloadErrorHint(fallbackError || e);
            }
          }
        }

        updateProgress(idx, urlsArray.length);
        idx++;
        continue;
      }

      if (shouldConvert && ext === 'webp') {
        try {
          finalUrl = await convertImageFormat(url, webpConversionTarget);
          ext = getFormatExtension(webpConversionTarget);
        } catch (e) {
          // Use original file if canvas conversion is blocked.
        }
      }

      const finalFilename = generateFilename(url, idx, renameBase, folderName, ext);

      try {
        await downloadWithChrome({
          url: finalUrl,
          filename: finalFilename || undefined,
          conflictAction: 'uniquify'
        }, finalFilename);
        startedCount++;
      } catch (e) {
        failedCount++;
        lastErrorHint = getDownloadErrorHint(e);
      }

      updateProgress(idx, urlsArray.length);
      idx++;
    }

    if (streamCount > 0) {
      notify('Stream URLs were downloaded as manifests; segmented/DRM video is not assembled.', 'info');
    }
    if (blobFallbackCount > 0) {
      notify('Blob download was triggered from the source page. MediaSource/DRM blobs may still need the real stream URL.', 'info');
    }
    if (pageFallbackCount > 0) {
      notify('Some video downloads were triggered from the source page after the browser download API failed.', 'info');
    }
    if (skippedVideoDownloads > 0) {
      notify('Some videos cannot be downloaded directly. Try Rescan after playback, or copy/open the detected stream URL.', 'error');
    } else if (failedCount > 0) {
      notify(`Download failed for ${failedCount} item(s): ${lastErrorHint}`, 'error');
    } else if (startedCount > 0) {
      notify(`Started ${startedCount} download(s).`, 'info');
    }
  }

  async function downloadAsZip(urlsArray, renameBase, folderName, shouldConvert, webpConversionTarget) {
    const videoUrls = urlsArray.filter(isVideoMedia);
    const imageUrls = urlsArray.filter(url => !isVideoMedia(url));

    if (videoUrls.length > 0) {
      notify('Videos are downloaded individually; ZIP is used for images.', 'info');
      await downloadIndividual(videoUrls, renameBase, folderName, shouldConvert, webpConversionTarget);
    }

    if (imageUrls.length === 0) {
      return;
    }

    const zip = new JSZip();
    const folder = folderName ? zip.folder(folderName) : zip;
    let idx = 1;
    let addedCount = 0;

    for (const url of imageUrls) {
      try {
        let ext = getFileExtension(url);
        if (ext === 'unknown') ext = 'jpg';

        let imageData;

        if (shouldConvert && ext === 'webp') {
          try {
            const convertedDataUrl = await convertImageFormat(url, webpConversionTarget);
            imageData = convertedDataUrl.split(',')[1];
            ext = getFormatExtension(webpConversionTarget);
          } catch (e) {
            if (url.startsWith('data:')) {
              imageData = url.split(',')[1];
            } else {
              const resp = await fetch(url);
              imageData = await resp.blob();
            }
          }
        } else if (url.startsWith('data:')) {
          // Data URL - extract base64
          const base64 = url.split(',')[1];
          imageData = base64;
        } else {
          try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            imageData = blob;
          } catch (fetchErr) {
            // CORS blocked - fallback: load via canvas as PNG.
            try {
              const dataUrl = await loadImageAsDataUrl(url);
              imageData = dataUrl.split(',')[1];
              ext = 'png';
            } catch (canvasErr) {
              // CORS blocked - skip this image.
              continue;
            }
          }
        }

        const filename = generateFilename(url, idx, renameBase, '', ext);

        if (typeof imageData === 'string') {
          folder.file(filename, imageData, { base64: true });
        } else {
          folder.file(filename, imageData);
        }
        addedCount++;

        updateProgress(idx, imageUrls.length, 'Fetching');
      } catch (e) {
        // Skip failed images silently
      }
      idx++;
    }

    updateProgress(imageUrls.length, imageUrls.length, 'Creating ZIP');

    try {
      if (addedCount === 0) {
        notify('No images could be added to the ZIP file.', 'error');
        return;
      }

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        progressFill.style.width = metadata.percent.toFixed(0) + '%';
        progressText.textContent = `Compressing ZIP... ${metadata.percent.toFixed(0)}%`;
      });

      const zipUrl = URL.createObjectURL(blob);
      const lastFolderSegment = folderName ? folderName.split('/').filter(Boolean).pop() : '';
      const zipName = lastFolderSegment ? `${sanitizeFileName(lastFolderSegment, 'images')}.zip` : 'images.zip';

      chrome.downloads.download({
        url: zipUrl,
        filename: zipName,
        conflictAction: 'uniquify'
      }, () => {
        // Revoke blob URL after download starts to free memory
        setTimeout(() => URL.revokeObjectURL(zipUrl), 5000);
      });

      notify(`ZIP created with ${addedCount} images!`, '');
    } catch (e) {
      notify('Failed to create ZIP file: ' + (e.message || 'Unknown error'), 'error');
    }
  }

  function loadImageAsDataUrl(url) {
    return convertImageFormat(url, 'png');
  }

  function convertImageFormat(url, format) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        try {
          const c = document.getElementById('conversionCanvas');
          c.width = img.width; c.height = img.height;
          const ctx = c.getContext('2d');

          if (format === 'jpeg') {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, c.width, c.height);
          }

          ctx.drawImage(img, 0, 0);
          const quality = format === 'jpeg' ? 0.92 : undefined;
          resolve(c.toDataURL(getFormatMimeType(format), quality));
        } catch (e) {
          reject(e);
        }
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
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
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
