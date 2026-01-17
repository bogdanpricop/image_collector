let allImages = [];
let selectedImages = new Set();
let filteredImagesCount = 0;

// Variables for Modal
let currentModalImage = null;
let currentRotation = 0;

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const imageList = document.getElementById('imageList');
  const statusDiv = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const rescanBtn = document.getElementById('rescanBtn');
  
  // Inputs
  const minWidthInput = document.getElementById('minWidth');
  const minHeightInput = document.getElementById('minHeight');
  const filterTextInput = document.getElementById('filterText'); 
  const subfolderInput = document.getElementById('subfolderName');
  const renameInput = document.getElementById('renamePattern');
  const convertWebpCheckbox = document.getElementById('convertWebp');
  const typeCheckboxes = document.querySelectorAll('.type-check input[type="checkbox"]');

  // Modal
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImg');
  const closeModal = document.getElementById('closeModal');
  const rotateBtn = document.getElementById('rotateBtn');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');

  // Initialization
  scanPage();

  // Listeners
  rescanBtn.addEventListener('click', scanPage);
  
  minWidthInput.addEventListener('input', renderImages);
  minHeightInput.addEventListener('input', renderImages);
  filterTextInput.addEventListener('input', renderImages); 
  // Note: typeCheckboxes exclude convertWebp which has a different ID, so we filter it out if needed or just select carefully
  typeCheckboxes.forEach(cb => {
      if(cb.id !== 'convertWebp') cb.addEventListener('change', renderImages);
  });

  selectAllBtn.addEventListener('click', toggleSelectAll);
  downloadBtn.addEventListener('click', () => startDownloadProcess(Array.from(selectedImages)));

  // Modal Listeners
  closeModal.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
  
  rotateBtn.addEventListener('click', () => {
      currentRotation = (currentRotation + 90) % 360;
      modalImg.style.transform = `rotate(${currentRotation}deg)`;
  });

  modalDownloadBtn.addEventListener('click', () => {
      if(currentModalImage) {
          startDownloadProcess([currentModalImage]);
      }
  });

  // --- Core Functions ---

  function scanPage() {
    statusDiv.textContent = 'Scanning...';
    imageList.innerHTML = '';
    allImages = [];
    selectedImages.clear();
    updateStatus();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, () => {
        chrome.tabs.sendMessage(tabId, { action: 'getImages' }, (response) => {
          if (response && response.length > 0) {
            allImages = response;
            renderImages();
          } else {
            statusDiv.textContent = 'No images found.';
          }
        });
      });
    });
  }

  function getActiveFilters() {
    const allowedTypes = Array.from(typeCheckboxes)
      .filter(cb => cb.checked && cb.id !== 'convertWebp') // Exclude webp2png converter check
      .map(cb => cb.value);
      
    return {
      minW: parseInt(minWidthInput.value) || 0,
      minH: parseInt(minHeightInput.value) || 0,
      text: filterTextInput.value.toLowerCase().trim(),
      types: allowedTypes
    };
  }

  function getFileExtension(url) {
    if (url.startsWith('data:image')) return 'img';
    const cleanUrl = url.split('?')[0]; 
    const ext = cleanUrl.split('.').pop().toLowerCase();
    if (ext === 'jpeg') return 'jpg';
    if (['jpg', 'png', 'webp', 'svg', 'gif'].includes(ext)) return ext;
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
          const matchUrl = img.src.toLowerCase().includes(filters.text);
          const matchAlt = img.alt && img.alt.toLowerCase().includes(filters.text);
          if (!matchUrl && !matchAlt) return false;
      }
      return true;
    });

    filteredImagesCount = filtered.length;
    updateStatus();

    filtered.forEach(img => {
      let li = document.createElement('li');
      if (selectedImages.has(img.src)) li.classList.add('selected');
      let extDisplay = getFileExtension(img.src);

      // Buttons: View, Link, Lens, TinEye, Preview
      let actionButtons = `
        <div class="action-bar">
            <div class="mini-btn view-btn" title="Open Image">&#128065;</div>
            ${img.link ? `<div class="mini-btn link-btn" title="Go to Link" data-link="${img.link}">&#128279;</div>` : `<div class="mini-btn disabled">&#128279;</div>`}
            <div class="mini-btn lens-btn" title="Google Lens">&#128247;</div>
            <div class="mini-btn tineye-btn" title="TinEye">&#128064;</div>
            <div class="mini-btn preview-btn" title="Preview">&#128444;</div>
        </div>
      `;

      li.innerHTML = `
        <div class="img-wrapper"><img src="${img.src}" loading="lazy" title="${img.alt || img.src}"></div>
        ${actionButtons}
        <div class="selection-overlay"><div class="check-icon"></div></div>
        <div class="meta-ext">${extDisplay}</div>
        <div class="meta-size">${img.width}x${img.height}</div>
      `;

      // Event Listeners
      li.addEventListener('click', () => {
        if (selectedImages.has(img.src)) selectedImages.delete(img.src);
        else selectedImages.add(img.src);
        li.classList.toggle('selected');
        updateStatus();
      });

      li.querySelector('.view-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: img.src }); });
      if(img.link) li.querySelector('.link-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: img.link }); });
      li.querySelector('.lens-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(img.src)}` }); });
      li.querySelector('.tineye-btn').addEventListener('click', (e) => { e.stopPropagation(); chrome.tabs.create({ url: `https://tineye.com/search?url=${encodeURIComponent(img.src)}` }); });
      li.querySelector('.preview-btn').addEventListener('click', (e) => { e.stopPropagation(); openModal(img.src); });

      imageList.appendChild(li);
    });
  }

  function openModal(src) {
      currentModalImage = src;
      currentRotation = 0;
      modalImg.src = src;
      modalImg.style.transform = `rotate(0deg)`;
      modal.style.display = 'flex';
  }

  // --- UPDATED STATUS FORMAT ---
  function updateStatus() {
    const selectedCount = selectedImages.size;
    const totalFound = allImages.length;
    
    // Format requested: Found | Shown | Selected
    statusDiv.textContent = `Found: ${totalFound}  |  Shown: ${filteredImagesCount}  |  Selected: ${selectedCount}`;
    
    downloadBtn.textContent = selectedCount > 0 ? `Download (${selectedCount})` : 'Download';
    downloadBtn.disabled = selectedCount === 0;
  }

  function toggleSelectAll() {
    const filters = getActiveFilters();
    const visibleImages = allImages.filter(img => {
      const ext = getFileExtension(img.src);
      const typeMatch = ext === 'unknown' || filters.types.includes(ext);
      const sizeMatch = img.width >= filters.minW && img.height >= filters.minH;
      let textMatch = true;
      if (filters.text) textMatch = img.src.toLowerCase().includes(filters.text) || (img.alt && img.alt.toLowerCase().includes(filters.text));
      return sizeMatch && typeMatch && textMatch;
    });

    const allVisibleSelected = visibleImages.every(img => selectedImages.has(img.src));
    if (allVisibleSelected) {
      visibleImages.forEach(img => selectedImages.delete(img.src));
    } else {
      visibleImages.forEach(img => selectedImages.add(img.src));
    }
    renderImages();
    updateStatus();
  }

  async function startDownloadProcess(urlsArray) {
    const renameBase = renameInput.value.trim();
    const folderName = subfolderInput.value.trim().replace(/[<>:"/\\|?*]+/g, ''); 
    const shouldConvert = convertWebpCheckbox.checked;

    const originalText = downloadBtn.textContent;
    downloadBtn.textContent = '...';
    downloadBtn.disabled = true;

    let idx = 1;
    for (const url of urlsArray) {
      let finalUrl = url;
      let finalFilename = '';
      let ext = getFileExtension(url);
      if (ext === 'unknown') ext = 'jpg';

      if (shouldConvert && ext === 'webp') {
        try { finalUrl = await convertWebPtoPNG(url); ext = 'png'; } 
        catch (e) { console.error(e); }
      }

      if (renameBase) {
        finalFilename = `${renameBase}_${idx.toString().padStart(3, '0')}.${ext}`;
      } else if (folderName) {
        let originalName = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
        if(!originalName || originalName.length > 50) originalName = `image_${idx}.${ext}`;
        finalFilename = originalName;
      }

      if (folderName) {
         if (!finalFilename) {
             let originalName = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
             if(!originalName) originalName = `image_${idx}.${ext}`;
             finalFilename = originalName;
         }
         finalFilename = `${folderName}/${finalFilename}`;
      }
      
      chrome.downloads.download({ url: finalUrl, filename: finalFilename || undefined, conflictAction: 'uniquify' });
      idx++;
    }

    setTimeout(() => {
        updateStatus(); // Reset text
    }, 1500);
  }

  function convertWebPtoPNG(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      img.onload = () => {
        const canvas = document.getElementById('conversionCanvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
    });
  }
});