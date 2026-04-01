// Pro Image Collector - Content Script
// Injectat în pagină pentru extragerea imaginilor din DOM

function getImages() {
  const imageMap = new Map();

  // 1. Extrage imagini standard <img>
  document.querySelectorAll("img").forEach((img) => {
    if (img.src && !imageMap.has(img.src)) {
      const parentLink = img.closest('a');
      imageMap.set(img.src, {
        src: img.src,
        link: parentLink ? parentLink.href : null,
        alt: img.alt || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        type: 'img'
      });
    }
  });

  // 2. Extrage imagini din srcset
  document.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    const srcset = el.getAttribute('srcset');
    if (!srcset) return;
    srcset.split(',').forEach(entry => {
      const parts = entry.trim().split(/\s+/);
      if (parts[0] && !imageMap.has(parts[0])) {
        let src = parts[0];
        if (src.startsWith('/')) src = window.location.origin + src;
        if (!src.startsWith('http')) return;
        const parentLink = el.closest('a');
        imageMap.set(src, {
          src: src,
          link: parentLink ? parentLink.href : null,
          alt: el.alt || '',
          width: 0,
          height: 0,
          type: 'img'
        });
      }
    });
  });

  // 3. Extrage imagini din CSS Backgrounds
  document.querySelectorAll('*').forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;

    if (bgImage && bgImage !== 'none') {
      // Poate conține multiple url()
      const urlMatches = bgImage.matchAll(/url\(["']?([^"')]+)["']?\)/g);
      for (const match of urlMatches) {
        let src = match[1];
        if (src.startsWith('data:') && src.length < 100) continue; // skip tiny data URIs
        if (src.startsWith('/')) src = window.location.origin + src;
        else if (!src.startsWith('http') && !src.startsWith('data:')) continue;

        if (!imageMap.has(src)) {
          const parentLink = el.closest('a');
          imageMap.set(src, {
            src: src,
            link: parentLink ? parentLink.href : null,
            alt: 'background',
            width: el.offsetWidth,
            height: el.offsetHeight,
            type: 'bg'
          });
        }
      }
    }
  });

  // 4. Extrage din <video poster>
  document.querySelectorAll("video[poster]").forEach((video) => {
    let src = video.poster;
    if (src && !imageMap.has(src)) {
      if (src.startsWith('/')) src = window.location.origin + src;
      imageMap.set(src, {
        src: src,
        link: null,
        alt: 'video poster',
        width: video.width || 0,
        height: video.height || 0,
        type: 'img'
      });
    }
  });

  return Array.from(imageMap.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

// Listener pentru mesaje din popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getImages") {
    const images = getImages();
    sendResponse(images);
  }
  return true; // Keep channel open for async
});

// MutationObserver - detectează imagini noi adăugate dinamic
let mutationTimeout = null;
const observer = new MutationObserver(() => {
  clearTimeout(mutationTimeout);
  mutationTimeout = setTimeout(() => {
    // Notifică popup-ul că sunt imagini noi
    try {
      chrome.runtime.sendMessage({ action: "newImagesDetected" });
    } catch (e) { /* popup may be closed */ }
  }, 1000);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
