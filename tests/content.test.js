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

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'm3u8', 'mpd']);
const STREAM_EXTENSIONS = new Set(['m3u8', 'mpd']);
const VIDEO_URL_PATTERN = /\.(mp4|webm|mov|m4v|ogv|m3u8|mpd)(?:$|[?#])/i;

function resolveImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return null;
  if (trimmedUrl.startsWith('data:')) return trimmedUrl;

  try {
    const url = new URL(trimmedUrl, document.baseURI);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch (e) {
    return null;
  }
}

function resolveVideoUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) return null;
  if (trimmedUrl.toLowerCase().startsWith('data:video/')) return trimmedUrl;

  try {
    const url = new URL(trimmedUrl, document.baseURI);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:') return url.href;
    return null;
  } catch (e) {
    return null;
  }
}

function resolvePageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  try {
    const url = new URL(rawUrl, document.baseURI);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch (e) {
    return null;
  }
}

function getParentLink(el) {
  const parentLink = el.closest('a');
  return parentLink ? resolvePageUrl(parentLink.href) : null;
}

function getExtensionFromUrl(url) {
  const dataMatch = String(url).match(/^data:video\/([^;,]+)/i);
  if (dataMatch) return dataMatch[1].toLowerCase();

  try {
    const parsedUrl = new URL(url, document.baseURI);
    const match = parsedUrl.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  } catch (e) {
    const match = String(url).toLowerCase().split(/[?#]/)[0].match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  }
}

function isVideoLikeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const normalizedRawUrl = rawUrl.replace(/\\\//g, '/').trim();
  const resolvedUrl = resolveVideoUrl(normalizedRawUrl);
  if (!resolvedUrl) return false;
  if (resolvedUrl.toLowerCase().startsWith('data:video/') || resolvedUrl.toLowerCase().startsWith('blob:')) return true;
  if (VIDEO_URL_PATTERN.test(normalizedRawUrl) || VIDEO_URL_PATTERN.test(resolvedUrl)) return true;

  try {
    const parsedUrl = new URL(resolvedUrl);
    return VIDEO_EXTENSIONS.has(getExtensionFromUrl(resolvedUrl)) ||
      hasVideoMimeHint(parsedUrl) ||
      isKnownVideoCdnUrl(parsedUrl);
  } catch (e) {
    return false;
  }
}

function hasVideoMimeHint(parsedUrl) {
  for (const [rawKey, rawValue] of parsedUrl.searchParams.entries()) {
    const key = rawKey.toLowerCase();
    const value = rawValue.toLowerCase();

    if ((key.includes('mime') || key === 'type' || key === 'format' || key === 'content_type') &&
        (value.includes('video') || VIDEO_EXTENSIONS.has(value.replace(/^video[_/.-]?/, '')))) {
      return true;
    }
  }

  return false;
}

function isKnownVideoCdnUrl(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.toLowerCase();

  const looksLikeTiktokHost =
    host.includes('tiktok') ||
    host.includes('byteoversea') ||
    host.includes('bytecdn') ||
    host.includes('ibytedtos') ||
    host.includes('snssdk') ||
    (host.includes('akamaized') && /^v\d+[a-z-]*\./.test(host));

  if (!looksLikeTiktokHost) return false;

  return path.includes('/video/') ||
    path.includes('/tos/') ||
    path.includes('/tos-') ||
    parsedUrl.searchParams.has('x-expires') ||
    parsedUrl.searchParams.has('x-signature');
}

function addImage(imageMap, rawSrc, metadata) {
  const src = resolveImageUrl(rawSrc);
  if (!src || imageMap.has(src)) return;

  imageMap.set(src, {
    src,
    link: metadata.link || null,
    alt: metadata.alt || '',
    width: metadata.width || 0,
    height: metadata.height || 0,
    type: metadata.type || 'img',
    mediaType: 'image'
  });
}

function addVideo(videoMap, rawSrc, metadata) {
  const src = resolveVideoUrl(rawSrc);
  if (!src || videoMap.has(src)) return;

  videoMap.set(src, {
    src,
    link: metadata.link || null,
    alt: metadata.alt || 'video',
    width: metadata.width || 0,
    height: metadata.height || 0,
    type: 'video',
    mediaType: 'video',
    poster: resolveImageUrl(metadata.poster) || null,
    sourceType: metadata.sourceType || 'video',
    isStream: STREAM_EXTENSIONS.has(getExtensionFromUrl(src)),
    downloadable: !src.toLowerCase().startsWith('blob:')
  });
}

function getImageElementSrc(img) {
  const attrSrc = img.getAttribute('src');
  return img.currentSrc || (attrSrc && attrSrc.trim() ? attrSrc : null);
}

function getVideoElementMetadata(video, sourceType) {
  return {
    link: getParentLink(video),
    alt: video.getAttribute('aria-label') || video.getAttribute('title') || 'video',
    poster: video.getAttribute('poster') || video.poster || null,
    width: parseInt(video.getAttribute('data-w'), 10) || video.videoWidth || video.width || 0,
    height: parseInt(video.getAttribute('data-h'), 10) || video.videoHeight || video.height || 0,
    sourceType
  };
}

// Inline the getImages extraction path for testing.
function getImages() {
  const imageMap = new Map();

  document.querySelectorAll("img").forEach((img) => {
    addImage(imageMap, getImageElementSrc(img), {
      link: getParentLink(img),
      alt: img.alt || '',
      width: parseInt(img.getAttribute('data-w')) || img.naturalWidth || img.width || 0,
      height: parseInt(img.getAttribute('data-h')) || img.naturalHeight || img.height || 0,
      type: 'img'
    });
  });

  document.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    const srcset = el.getAttribute('srcset');
    if (!srcset) return;
    srcset.split(',').forEach(entry => {
      const parts = entry.trim().split(/\s+/);
      addImage(imageMap, parts[0], {
        link: getParentLink(el),
        alt: el.alt || '',
        width: 0,
        height: 0,
        type: 'img'
      });
    });
  });

  document.querySelectorAll('*').forEach((el) => {
    const bgImage = window.getComputedStyle(el).backgroundImage;
    if (!bgImage || bgImage === 'none') return;

    const urlMatches = bgImage.matchAll(/url\(["']?([^"')]+)["']?\)/g);
    for (const match of urlMatches) {
      addImage(imageMap, match[1], {
        link: getParentLink(el),
        alt: 'background',
        width: 0,
        height: 0,
        type: 'bg'
      });
    }
  });

  document.querySelectorAll("video[poster]").forEach((video) => {
    addImage(imageMap, video.getAttribute('poster') || video.poster, {
      link: null,
      alt: 'video poster',
      width: video.width || 0,
      height: video.height || 0,
      type: 'img'
    });
  });

  return Array.from(imageMap.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height));
}

function getVideos() {
  const videoMap = new Map();

  document.querySelectorAll('video').forEach((video) => {
    const videoMetadata = getVideoElementMetadata(video, 'video');
    addVideo(videoMap, video.currentSrc || video.getAttribute('src') || video.src, videoMetadata);

    video.querySelectorAll('source[src]').forEach((source) => {
      addVideo(videoMap, source.getAttribute('src') || source.src, {
        ...videoMetadata,
        link: getParentLink(source) || videoMetadata.link,
        sourceType: 'source'
      });
    });
  });

  document.querySelectorAll('source[src][type^="video/"]').forEach((source) => {
    addVideo(videoMap, source.getAttribute('src') || source.src, {
      link: getParentLink(source),
      alt: source.getAttribute('type') || 'video',
      sourceType: 'source'
    });
  });

  document.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') || anchor.href;
    if (!isVideoLikeUrl(href)) return;
    addVideo(videoMap, href, {
      link: resolvePageUrl(anchor.href),
      alt: anchor.textContent.trim().slice(0, 80) || 'video link',
      sourceType: 'link'
    });
  });

  document.querySelectorAll('[data-src], [data-video], [data-video-src], [data-mp4], [data-hls], [data-stream], [data-url], [data-file]').forEach((el) => {
    ['data-src', 'data-video', 'data-video-src', 'data-mp4', 'data-hls', 'data-stream', 'data-url', 'data-file'].forEach((attr) => {
      const value = el.getAttribute(attr);
      if (!isVideoLikeUrl(value)) return;
      addVideo(videoMap, value, {
        link: getParentLink(el),
        alt: el.getAttribute('aria-label') || el.getAttribute('title') || 'video',
        poster: el.getAttribute('poster') || el.getAttribute('data-poster') || null,
        sourceType: attr
      });
    });
  });

  const absoluteUrlPattern = /(?:https?:)?\/\/[^"'<>\s\\]+/gi;
  document.querySelectorAll('script, template').forEach((el) => {
    const text = (el.textContent || '')
      .replace(/\\u002[fF]/g, '/')
      .replace(/\\\//g, '/');

    for (const match of text.matchAll(absoluteUrlPattern)) {
      const rawUrl = match[0].startsWith('//') ? `${location.protocol}${match[0]}` : match[0];
      if (!isVideoLikeUrl(rawUrl)) continue;
      addVideo(videoMap, rawUrl, {
        alt: 'video metadata',
        sourceType: 'metadata'
      });
    }
  });

  return Array.from(videoMap.values()).sort((a, b) => {
    if (a.isStream !== b.isStream) return a.isStream ? 1 : -1;
    return (b.width * b.height) - (a.width * a.height);
  });
}

function getMedia() {
  return [...getImages(), ...getVideos()];
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

  it('should ignore unsafe parent link protocols', () => {
    document.body.innerHTML = `
      <a href="javascript:alert(1)">
        <img src="https://cdn.shop.com/product123.jpg" data-w="300" data-h="300">
      </a>
    `;
    const images = getImages();
    expect(images[0].link).toBeNull();
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

  it('should resolve non-root relative paths in srcset', () => {
    document.body.innerHTML = `
      <img src="https://example.com/img.jpg"
           srcset="images/large.jpg 2x, ../shared/other.png 3x">
    `;
    const images = getImages();
    expect(images.some(i => i.src === 'https://example.com/images/large.jpg')).toBe(true);
    expect(images.some(i => i.src === 'https://example.com/shared/other.png')).toBe(true);
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
// CSS background extraction
// ============================================================
describe('getImages — CSS backgrounds', () => {

  it('should extract absolute and relative CSS background URLs', () => {
    document.body.innerHTML = `
      <div style="background-image: url('https://cdn.example.com/bg.jpg')"></div>
      <div style="background-image: url('../assets/card.png')"></div>
    `;
    const images = getImages();
    expect(images.some(i => i.src === 'https://cdn.example.com/bg.jpg')).toBe(true);
    expect(images.some(i => i.src === 'https://example.com/assets/card.png')).toBe(true);
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
// Video media extraction
// ============================================================
describe('getVideos', () => {
  it('should extract direct video sources from <video> tags', () => {
    document.body.innerHTML = `
      <video src="/videos/trailer.mp4" poster="/videos/poster.jpg" data-w="1920" data-h="1080"></video>
    `;
    const videos = getVideos();
    expect(videos.length).toBe(1);
    expect(videos[0].src).toBe('https://example.com/videos/trailer.mp4');
    expect(videos[0].poster).toBe('https://example.com/videos/poster.jpg');
    expect(videos[0].mediaType).toBe('video');
    expect(videos[0].downloadable).toBe(true);
  });

  it('should extract nested <source> video URLs', () => {
    document.body.innerHTML = `
      <video poster="/poster.jpg">
        <source src="clips/intro.webm" type="video/webm">
        <source src="clips/intro.mp4" type="video/mp4">
      </video>
    `;
    const videos = getVideos();
    expect(videos.map(video => video.src)).toEqual(expect.arrayContaining([
      'https://example.com/clips/intro.webm',
      'https://example.com/clips/intro.mp4'
    ]));
  });

  it('should extract video links and mark HLS streams', () => {
    document.body.innerHTML = `
      <a href="https://cdn.example.com/movie.mp4">Download film</a>
      <a href="https://cdn.example.com/live/playlist.m3u8?token=abc">HLS</a>
    `;
    const videos = getVideos();
    const hls = videos.find(video => video.src.includes('playlist.m3u8'));
    expect(videos.length).toBe(2);
    expect(hls.isStream).toBe(true);
  });

  it('should extract video URLs from common data attributes', () => {
    document.body.innerHTML = `
      <div data-video-src="../assets/film.mov" data-poster="/assets/film.jpg"></div>
    `;
    const videos = getVideos();
    expect(videos[0].src).toBe('https://example.com/assets/film.mov');
    expect(videos[0].poster).toBe('https://example.com/assets/film.jpg');
    expect(videos[0].sourceType).toBe('data-video-src');
  });

  it('should extract escaped video URLs from metadata scripts', () => {
    document.body.innerHTML = `
      <script type="application/json">
        {"contentUrl":"https:\\/\\/cdn.example.com\\/campaign\\/hero.mp4?download=1"}
      </script>
    `;
    const videos = getVideos();
    expect(videos[0].src).toBe('https://cdn.example.com/campaign/hero.mp4?download=1');
    expect(videos[0].sourceType).toBe('metadata');
  });

  it('should extract TikTok-style video URLs without file extensions', () => {
    document.body.innerHTML = `
      <script type="application/json">
        {"playAddr":"https:\\u002F\\u002Fv16-webapp-prime.tiktok.com\\u002Fvideo\\u002Ftos\\u002Fuseast2a\\u002Ftos-useast2a-ve-0068c004\\u002Fclip\\u002F?mime_type=video_mp4&x-expires=1800000000&x-signature=abc"}
      </script>
    `;
    const videos = getVideos();
    expect(videos.length).toBe(1);
    expect(videos[0].src).toContain('v16-webapp-prime.tiktok.com/video/tos/');
    expect(videos[0].src).toContain('mime_type=video_mp4');
    expect(videos[0].sourceType).toBe('metadata');
  });

  it('should combine images and videos in getMedia', () => {
    document.body.innerHTML = `
      <img src="/photo.jpg" data-w="100" data-h="100">
      <video src="/clip.mp4"></video>
    `;
    const media = getMedia();
    expect(media.some(item => item.mediaType === 'image')).toBe(true);
    expect(media.some(item => item.mediaType === 'video')).toBe(true);
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
