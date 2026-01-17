let allImages = [];
let selectedImages = new Set();
let filteredImagesCount = 0;

// -- MODAL STATE --
let originalImageSrc = null;
let currentCanvas = null;
let currentCtx = null;
let currentRotation = 0;
let pendingOperation = null; 

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const imageList = document.getElementById('imageList');
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const rescanBtn = document.getElementById('rescanBtn');
  
  // Inputs & Filters
  const minWidthInput = document.getElementById('minWidth');
  const minHeightInput = document.getElementById('minHeight');
  const filterTextInput = document.getElementById('filterText'); 
  const subfolderInput = document.getElementById('subfolderName');
  const renameInput = document.getElementById('renamePattern');
  const convertWebpCheckbox = document.getElementById('convertWebp');
  const typeCheckboxes = document.querySelectorAll('.type-check input[type="checkbox"]');

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
  // BUTOANE NOI
  const btnFlip = document.getElementById('btnFlip');
  const btnNoise = document.getElementById('btnNoise');
  const btnColor = document.getElementById('btnColor');
  
  const btnObfuscate = document.getElementById('btnObfuscate');
  const btnRecompress = document.getElementById('btnRecompress');
  const btnRotate = document.getElementById('btnRotate');
  const btnMagic = document.getElementById('btnMagic');
  const btnReset = document.getElementById('btnReset');
  const btnDownloadSingle = document.getElementById('btnDownloadSingle');

  // Initialization
  scanPage();

  // --- LISTENERS ---
  rescanBtn.addEventListener('click', scanPage);
  minWidthInput.addEventListener('input', renderImages);
  minHeightInput.addEventListener('input', renderImages);
  filterTextInput.addEventListener('input', renderImages); 
  typeCheckboxes.forEach(cb => { if(cb.id !== 'convertWebp') cb.addEventListener('change', renderImages); });

  selectAllBtn.addEventListener('click', toggleSelectAll);
  downloadBtn.addEventListener('click', () => startDownloadProcess(Array.from(selectedImages)));

  closeModal.addEventListener('click', closeEditor);
  modal.addEventListener('click', (e) => { if(e.target === modal) closeEditor(); });

  // 1. ROTATE
  btnRotate.addEventListener('click', () => {
      currentRotation = (currentRotation + 90) % 360;
      modalImg.style.transform = `rotate(${currentRotation}deg)`;
  });

  // 2. RESET
  btnReset.addEventListener('click', () => {
      loadToCanvas(originalImageSrc);
      setStatus("Image reset to original.", "white");
      currentRotation = 0;
      modalImg.style.transform = `rotate(0deg)`;
  });

  // 3. MANUAL TOOLS - Deschide Interfata
  btnCrop.addEventListener('click', () => showToolUI('crop', 'Crop Percentage:', 2, '%'));
  btnResize.addEventListener('click', () => showToolUI('resize', 'Resize Scale:', 97, '%'));
  btnObfuscate.addEventListener('click', () => showToolUI('obfuscate', 'Blur Radius:', 0.5, 'px'));
  btnRecompress.addEventListener('click', () => showToolUI('recompress', 'JPEG Quality:', 75, '0-100'));
  
  // NEW TOOLS
  btnFlip.addEventListener('click', () => applyOperation('flip')); // Instant
  btnNoise.addEventListener('click', () => showToolUI('noise', 'Noise Amount:', 15, '0-100'));
  btnColor.addEventListener('click', () => showToolUI('color', 'Hue Shift:', 10, 'deg'));

  // 4. APPLY & CANCEL
  btnCancelTool.addEventListener('click', hideToolUI);
  
  btnApplyTool.addEventListener('click', () => {
      const val = parseFloat(toolInput.value);
      if (isNaN(val)) return alert("Invalid number");
      
      let params = {};
      if (pendingOperation === 'crop') params = { percent: val };
      if (pendingOperation === 'resize') params = { scale: val };
      if (pendingOperation === 'obfuscate') params = { blur: val };
      if (pendingOperation === 'recompress') params = { quality: val };
      if (pendingOperation === 'noise') params = { amount: val };
      if (pendingOperation === 'color') params = { shift: val };

      applyOperation(pendingOperation, params);
      hideToolUI();
  });

  toolInput.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') btnApplyTool.click();
      if(e.key === 'Escape') btnCancelTool.click();
  });

  // 5. MAGIC CASCADE (UPDATED)
  btnMagic.addEventListener('click', async () => {
      setStatus("Running Magic Cascade...", "#6f42c1");
      try {
          await applyOperation('crop', { percent: 2 }, false);
          await new Promise(r => setTimeout(r, 50)); 
          await applyOperation('resize', { scale: 97 }, false);
          
          // Noi pasi in cascada
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

  // 6. DOWNLOAD SINGLE
  btnDownloadSingle.addEventListener('click', () => {
      const finalUrl = currentCanvas.toDataURL('image/png');
      startDownloadProcess([finalUrl]);
  });


  // --- UI HELPER FUNCTIONS ---

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

  // --- IMAGE ENGINE ---

  function openModal(src) {
      originalImageSrc = src;
      currentRotation = 0;
      modal.style.display = 'flex';
      modalImg.style.transform = `rotate(0deg)`;
      setStatus("Loading...", "#aaa");
      loadToCanvas(src);
  }

  function loadToCanvas(src) {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = src;
      img.onload = () => {
          currentCanvas = document.createElement('canvas');
          currentCanvas.width = img.width;
          currentCanvas.height = img.height;
          currentCtx = currentCanvas.getContext('2d');
          currentCtx.drawImage(img, 0, 0);
          updatePreview();
          setStatus("Ready to edit.", "#aaa");
      };
  }

  function updatePreview() {
      modalImg.src = currentCanvas.toDataURL('image/png');
  }

  function setStatus(text, color) {
      processStatus.textContent = text;
      processStatus.style.color = color || "#aaa";
  }

  async function applyOperation(type, params = {}, updateUI = true) {
      if(!currentCanvas) return;
      if(updateUI) setStatus(`Applying ${type}...`, "#fff");
      
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      const w = currentCanvas.width;
      const h = currentCanvas.height;

      switch(type) {
          case 'crop':
              const pct = (params.percent !== undefined ? params.percent : 2) / 100;
              if(pct <= 0 || pct >= 0.5) return; 
              const cutX = w * pct; const cutY = h * pct;
              const cutW = w * (1 - pct*2); const cutH = h * (1 - pct*2);
              tempCanvas.width = cutW; tempCanvas.height = cutH;
              tempCtx.drawImage(currentCanvas, cutX, cutY, cutW, cutH, 0, 0, cutW, cutH);
              break;

          case 'resize':
              const scale = (params.scale !== undefined ? params.scale : 97) / 100;
              tempCanvas.width = w * scale; tempCanvas.height = h * scale;
              tempCtx.drawImage(currentCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
              break;

          case 'flip':
              tempCanvas.width = w; tempCanvas.height = h;
              tempCtx.translate(w, 0); tempCtx.scale(-1, 1);
              tempCtx.drawImage(currentCanvas, 0, 0);
              tempCtx.setTransform(1, 0, 0, 1, 0, 0);
              break;

          case 'noise':
              const amount = params.amount !== undefined ? params.amount : 15;
              tempCanvas.width = w; tempCanvas.height = h;
              tempCtx.drawImage(currentCanvas, 0, 0);
              const imgDataN = tempCtx.getImageData(0, 0, w, h);
              const dataN = imgDataN.data;
              for (let i = 0; i < dataN.length; i += 4) {
                 const noise = (Math.random() - 0.5) * amount;
                 dataN[i] = Math.min(255, Math.max(0, dataN[i] + noise));
                 dataN[i+1] = Math.min(255, Math.max(0, dataN[i+1] + noise));
                 dataN[i+2] = Math.min(255, Math.max(0, dataN[i+2] + noise));
              }
              tempCtx.putImageData(imgDataN, 0, 0);
              break;

          case 'color':
              const shift = params.shift !== undefined ? params.shift : 10;
              tempCanvas.width = w; tempCanvas.height = h;
              tempCtx.filter = `hue-rotate(${shift}deg) saturate(1.1)`;
              tempCtx.drawImage(currentCanvas, 0, 0);
              tempCtx.filter = 'none';
              break;

          case 'obfuscate':
              const blurRadius = params.blur !== undefined ? params.blur : 0.5;
              tempCanvas.width = w; tempCanvas.height = h;
              tempCtx.filter = `blur(${blurRadius}px) contrast(1.05)`;
              tempCtx.drawImage(currentCanvas, 0, 0);
              tempCtx.filter = 'none'; 
              const imgData = tempCtx.getImageData(0, 0, w, h);
              const sharpened = applySharpenFilter(tempCtx, imgData);
              tempCtx.putImageData(sharpened, 0, 0);
              break;

          case 'recompress':
              const quality = (params.quality !== undefined ? params.quality : 75) / 100;
              const jpegUrl = currentCanvas.toDataURL('image/jpeg', quality);
              await new Promise((resolve) => {
                  const jImg = new Image();
                  jImg.onload = () => {
                      tempCanvas.width = w; tempCanvas.height = h;
                      tempCtx.drawImage(jImg, 0, 0); resolve();
                  };
                  jImg.src = jpegUrl;
              });
              break;
      }

      currentCanvas = tempCanvas;
      currentCtx = tempCtx;
      updatePreview();
      if(updateUI) setStatus(`Done: ${type}`, "#81c995");
  }

  function applySharpenFilter(ctx, imgData) {
      const w = imgData.width; const h = imgData.height;
      const src = imgData.data;
      const output = ctx.createImageData(w, h);
      const dst = output.data;
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]; 

      for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
              let r=0, g=0, b=0;
              for (let ky = -1; ky <= 1; ky++) {
                  for (let kx = -1; kx <= 1; kx++) {
                      const pos = ((y + ky) * w + (x + kx)) * 4;
                      const weight = kernel[(ky + 1) * 3 + (kx + 1)];
                      r += src[pos] * weight; g += src[pos+1] * weight; b += src[pos+2] * weight;
                  }
              }
              const destPos = (y * w + x) * 4;
              dst[destPos] = Math.max(0, Math.min(255, r));
              dst[destPos+1] = Math.max(0, Math.min(255, g));
              dst[destPos+2] = Math.max(0, Math.min(255, b));
              dst[destPos+3] = 255; 
          }
      }
      return output;
  }

  // --- STANDARD FUNCTIONS ---
  function scanPage() {
    statusDiv.textContent = 'Scanning...';
    imageList.innerHTML = ''; allImages = []; selectedImages.clear(); updateStatus();
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ['content.js'] }, () => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getImages' }, (response) => {
          if (response && response.length > 0) { allImages = response; renderImages(); } 
          else { statusDiv.textContent = 'No images found.'; }
        });
      });
    });
  }

  function getActiveFilters() {
    const allowedTypes = Array.from(typeCheckboxes).filter(cb => cb.checked && cb.id !== 'convertWebp').map(cb => cb.value);
    return {
      minW: parseInt(minWidthInput.value) || 0, minH: parseInt(minHeightInput.value) || 0,
      text: filterTextInput.value.toLowerCase().trim(), types: allowedTypes
    };
  }

  function getFileExtension(url) {
    if (url.startsWith('data:image')) return 'png';
    const cleanUrl = url.split('?')[0]; const ext = cleanUrl.split('.').pop().toLowerCase();
    if (ext === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp', 'svg', 'gif'].includes(ext)) return ext;
    return 'unknown';
  }

  function renderImages() {
    imageList.innerHTML = ''; const filters = getActiveFilters();
    const filtered = allImages.filter(img => {
      if (img.width < filters.minW || img.height < filters.minH) return false;
      const ext = getFileExtension(img.src);
      if (ext !== 'unknown' && !filters.types.includes(ext)) return false;
      if (filters.text && !(img.src.toLowerCase().includes(filters.text) || (img.alt && img.alt.toLowerCase().includes(filters.text)))) return false;
      return true;
    });
    filteredImagesCount = filtered.length; updateStatus();
    filtered.forEach(img => {
      let li = document.createElement('li');
      if (selectedImages.has(img.src)) li.classList.add('selected');
      let extDisplay = getFileExtension(img.src);
      let actionButtons = `
        <div class="action-bar">
            <div class="mini-btn view-btn" title="View">&#128065;</div>
            ${img.link ? `<div class="mini-btn link-btn" title="Link" data-link="${img.link}">&#128279;</div>` : `<div class="mini-btn disabled">&#128279;</div>`}
            <div class="mini-btn lens-btn" title="Lens">&#128247;</div>
            <div class="mini-btn tineye-btn" title="TinEye">&#128064;</div>
            <div class="mini-btn preview-btn" title="Editor">&#128444;</div>
        </div>`;
      li.innerHTML = `<div class="img-wrapper"><img src="${img.src}" loading="lazy"></div>${actionButtons}<div class="selection-overlay"><div class="check-icon"></div></div><div class="meta-ext">${extDisplay}</div><div class="meta-size">${img.width}x${img.height}</div>`;
      li.addEventListener('click', () => { if (selectedImages.has(img.src)) selectedImages.delete(img.src); else selectedImages.add(img.src); li.classList.toggle('selected'); updateStatus(); });
      li.querySelector('.view-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: img.src }); });
      if(img.link) li.querySelector('.link-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: img.link }); });
      li.querySelector('.lens-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(img.src)}` }); });
      li.querySelector('.tineye-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: `https://tineye.com/search?url=${encodeURIComponent(img.src)}` }); });
      li.querySelector('.preview-btn').addEventListener('click', (e) => { e.stopPropagation(); openModal(img.src); });
      imageList.appendChild(li);
    });
  }

  function updateStatus() {
    statusDiv.textContent = `Found: ${allImages.length} | Shown: ${filteredImagesCount} | Selected: ${selectedImages.size}`;
    downloadBtn.textContent = selectedImages.size > 0 ? `Download (${selectedImages.size})` : 'Download';
    downloadBtn.disabled = selectedImages.size === 0;
  }

  function toggleSelectAll() {
    const filters = getActiveFilters();
    const visibleImages = allImages.filter(img => { if(img.width < filters.minW || img.height < filters.minH) return false; return true; }); 
    const allSelected = visibleImages.every(img => selectedImages.has(img.src));
    if(allSelected) visibleImages.forEach(img => selectedImages.delete(img.src)); else visibleImages.forEach(img => selectedImages.add(img.src));
    renderImages(); updateStatus();
  }

  async function startDownloadProcess(urlsArray) {
    const renameBase = renameInput.value.trim(); const folderName = subfolderInput.value.trim().replace(/[<>:"/\\|?*]+/g, ''); const shouldConvert = convertWebpCheckbox.checked;
    downloadBtn.textContent = '...'; downloadBtn.disabled = true;
    let idx = 1;
    for (const url of urlsArray) {
      let finalUrl = url; let finalFilename = ''; let ext = url.startsWith('data:image') ? 'png' : getFileExtension(url);
      if (ext === 'unknown') ext = 'jpg';
      if (shouldConvert && ext === 'webp' && !url.startsWith('data:image')) { try { finalUrl = await convertWebPtoPNG(url); ext = 'png'; } catch(e){} }
      if (renameBase) finalFilename = `${renameBase}_${idx.toString().padStart(3, '0')}.${ext}`;
      else if (folderName) {
          if(!url.startsWith('data:image')) { let n = url.substring(url.lastIndexOf('/') + 1).split('?')[0]; finalFilename = (n && n.length < 50) ? n : `image_${idx}.${ext}`; } 
          else finalFilename = `processed_${idx}.${ext}`;
      }
      if (folderName) { if(!finalFilename) finalFilename = `image_${idx}.${ext}`; finalFilename = `${folderName}/${finalFilename}`; }
      chrome.downloads.download({ url: finalUrl, filename: finalFilename || undefined, conflictAction: 'uniquify' }); idx++;
    }
    setTimeout(() => { updateStatus(); }, 1500);
  }

  function convertWebPtoPNG(url) {
    return new Promise((resolve, reject) => {
      const img = new Image(); img.crossOrigin = "Anonymous"; img.src = url;
      img.onload = () => { const c = document.getElementById('conversionCanvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); };
      img.onerror = reject;
    });
  }
});