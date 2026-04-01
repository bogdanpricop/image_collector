/**
 * 📚 Content Script Tests — Image Extraction from DOM
 *
 * These tests verify that getImages() correctly finds images from
 * different sources: <img> tags, srcset, video posters.
 * We use Jest's jsdom environment to simulate a real page DOM.
 *
 * WHY THIS MATTERS: If extraction breaks, the extension shows "No images found"
 * on pages that clearly have images — the #1 user complaint for image tools.
 */

/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://example.com"}
 */

// Inline the getImages function for testing (extracted from content.js)
function getImages() {
  const imageMap = new Map();

  document.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute('src');
    if (src && !imageMap.has(src)) {
      const parentLink = img.closest('a');
      imageMap.set(src, {
        src: src,
        link: parentLink ? parentLink.href : null,
        alt: img.alt || '',
        width: parseInt(img.getAttribute('data-w')) || 0,
        height: parseInt(img.getAttribute('data-h')) || 0,
        type: 'img'
      });
    }
  });

  document.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    const srcset = el.getAttribute('srcset');
    if (!srcset) return;
    srcset.split(',').forEach(entry => {
      const parts = entry.trim().split(/\s+/);
      if (parts[0] && !imageMap.has(parts[0])) {
        let src = parts[0];
        if (src.startsWith('/')) src = window.location.origin + src;
        if (!src.startsWith('http')) return;
        imageMap.set(src, {
          src: src, link: null, alt: '', width: 0, height: 0, type: 'img'
        });
      }
    });
  });

  document.querySelectorAll("video[poster]").forEach((video) => {
    let src = video.getAttribute('poster');
    if (src && !imageMap.has(src)) {
      if (src.startsWith('/')) src = window.location.origin + src;
      imageMap.set(src, {
        src: src, link: null, alt: 'video poster', width: 0, height: 0, type: 'img'
      });
    }
  });

  return Array.from(imageMap.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ============================================================
// Standard <img> extraction
// ============================================================
describe('getImages — <img> tags', () => {

  // 📚 HAPPY PATH: Basic image extraction
  it('should extract images from <img> tags', () => {
    document.body.innerHTML = `
      <img src="https://example.com/photo1.jpg" alt="Photo 1" data-w="800" data-h="600">
      <img src="https://example.com/photo2.png" alt="Photo 2" data-w="400" data-h="300">
    `;
    const images = getImages();
    expect(images.length).toBe(2);
    expect(images[0].src).toBe('https://example.com/photo1.jpg');
    expect(images[0].alt).toBe('Photo 1');
  });

  // 📚 DEDUPLICATION: Same URL appearing multiple times
  // This was a real bug — Set doesn't dedup objects, Map by URL does
  it('should deduplicate images with the same src', () => {
    document.body.innerHTML = `
      <img src="https://example.com/photo.jpg" alt="First" data-w="100" data-h="100">
      <img src="https://example.com/photo.jpg" alt="Duplicate" data-w="100" data-h="100">
      <img src="https://example.com/photo.jpg" alt="Triplicate" data-w="100" data-h="100">
    `;
    const images = getImages();
    expect(images.length).toBe(1);
  });

  // 📚 SORTING: Largest images first — users care about big images, not 1x1 trackers
  it('should sort images by area (largest first)', () => {
    document.body.innerHTML = `
      <img src="https://example.com/small.jpg" data-w="100" data-h="100">
      <img src="https://example.com/large.jpg" data-w="1920" data-h="1080">
      <img src="https://example.com/medium.jpg" data-w="400" data-h="300">
    `;
    const images = getImages();
    expect(images[0].src).toContain('large');
    expect(images[1].src).toContain('medium');
    expect(images[2].src).toContain('small');
  });

  // 📚 SMART LINKING: Detect parent <a> tags to find product pages
  it('should extract parent link when image is inside an anchor tag', () => {
    document.body.innerHTML = `
      <a href="https://shop.com/product/123">
        <img src="https://cdn.shop.com/product123.jpg" data-w="300" data-h="300">
      </a>
    `;
    const images = getImages();
    expect(images[0].link).toBe('https://shop.com/product/123');
  });

  it('should set link to null when image has no parent anchor', () => {
    document.body.innerHTML = `<img src="https://example.com/standalone.jpg">`;
    const images = getImages();
    expect(images[0].link).toBeNull();
  });

  // 📚 EDGE: Images without src attribute should be skipped
  it('should skip images without src', () => {
    document.body.innerHTML = `
      <img alt="No source">
      <img src="" alt="Empty source">
      <img src="https://example.com/valid.jpg" data-w="100" data-h="100">
    `;
    const images = getImages();
    expect(images.length).toBe(1);
  });

  // 📚 EDGE: Alt text should default to empty string
  it('should default alt to empty string when not set', () => {
    document.body.innerHTML = `<img src="https://example.com/no-alt.jpg">`;
    const images = getImages();
    expect(images[0].alt).toBe('');
  });
});

// ============================================================
// srcset extraction
// ============================================================
describe('getImages — srcset', () => {

  // 📚 srcset contains multiple resolutions of the same image
  it('should extract images from srcset attribute', () => {
    document.body.innerHTML = `
      <img src="https://example.com/photo.jpg"
           srcset="https://example.com/photo-2x.jpg 2x, https://example.com/photo-3x.jpg 3x">
    `;
    const images = getImages();
    expect(images.length).toBe(3);
  });

  // 📚 source elements inside <picture> tags
  it('should extract from source[srcset] inside picture elements', () => {
    document.body.innerHTML = `
      <picture>
        <source srcset="https://example.com/wide.webp" media="(min-width: 800px)">
        <img src="https://example.com/fallback.jpg">
      </picture>
    `;
    const images = getImages();
    expect(images.length).toBe(2);
  });

  // 📚 Relative paths in srcset should be resolved
  it('should resolve relative paths in srcset', () => {
    document.body.innerHTML = `
      <img src="https://example.com/img.jpg"
           srcset="/images/large.jpg 2x">
    `;
    const images = getImages();
    const largeSrc = images.find(i => i.src.includes('large'));
    expect(largeSrc.src).toBe('https://example.com/images/large.jpg');
  });

  // 📚 DEDUP: srcset entries matching src should not duplicate
  it('should not duplicate when srcset contains same URL as src', () => {
    document.body.innerHTML = `
      <img src="https://example.com/photo.jpg"
           srcset="https://example.com/photo.jpg 1x, https://example.com/photo-2x.jpg 2x">
    `;
    const images = getImages();
    expect(images.length).toBe(2);
  });
});

// ============================================================
// Video poster extraction
// ============================================================
describe('getImages — video poster', () => {

  // 📚 Video posters are often high-quality images worth downloading
  it('should extract poster from video elements', () => {
    document.body.innerHTML = `
      <video poster="https://example.com/poster.jpg" width="640" height="360">
        <source src="video.mp4">
      </video>
    `;
    const images = getImages();
    expect(images.length).toBe(1);
    expect(images[0].src).toBe('https://example.com/poster.jpg');
    expect(images[0].alt).toBe('video poster');
  });

  // 📚 Relative poster paths
  it('should resolve relative poster paths', () => {
    document.body.innerHTML = `<video poster="/videos/thumb.jpg"></video>`;
    const images = getImages();
    expect(images[0].src).toBe('https://example.com/videos/thumb.jpg');
  });

  // 📚 Videos without poster should be ignored
  it('should skip videos without poster attribute', () => {
    document.body.innerHTML = `<video src="video.mp4"></video>`;
    const images = getImages();
    expect(images.length).toBe(0);
  });
});

// ============================================================
// Empty / edge case pages
// ============================================================
describe('getImages — edge cases', () => {

  // 📚 EMPTY PAGE: Should return empty array, not throw
  it('should return empty array on page with no images', () => {
    document.body.innerHTML = `<h1>No images here</h1><p>Just text.</p>`;
    const images = getImages();
    expect(images).toEqual([]);
  });

  // 📚 MIXED: All source types on one page
  it('should combine images from all sources without duplicates', () => {
    document.body.innerHTML = `
      <img src="https://example.com/img1.jpg" data-w="100" data-h="100">
      <img src="https://example.com/img2.png" srcset="https://example.com/img2-2x.png 2x" data-w="50" data-h="50">
      <video poster="https://example.com/poster.jpg"></video>
    `;
    const images = getImages();
    expect(images.length).toBe(4);
  });
});
