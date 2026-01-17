function getImages() {
  const images = new Set(); 

  // 1. Extrage imagini standard <img>
  document.querySelectorAll("img").forEach((img) => {
    if (img.src) {
      // Cautam link-ul parinte (<a>) daca exista
      const parentLink = img.closest('a');
      
      images.add({
        src: img.src,
        link: parentLink ? parentLink.href : null, // Link catre pagina produsului/articolului
        alt: img.alt || '', 
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
        type: 'img'
      });
    }
  });

  // 2. Extrage imagini din CSS Backgrounds
  const allElements = document.querySelectorAll('*');
  allElements.forEach((el) => {
    const style = window.getComputedStyle(el);
    const bgImage = style.backgroundImage;

    if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
      let src = bgImage.slice(4, -1).replace(/['"]/g, "");
      
      if (src.startsWith('/')) {
        src = window.location.origin + src;
      } else if (!src.startsWith('http')) {
        return; 
      }

      const parentLink = el.closest('a');

      images.add({
        src: src,
        link: parentLink ? parentLink.href : null,
        alt: 'background',
        width: el.offsetWidth,
        height: el.offsetHeight,
        type: 'bg'
      });
    }
  });

  const result = Array.from(images).sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return result;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getImages") {
    const images = getImages();
    sendResponse(images);
  }
});