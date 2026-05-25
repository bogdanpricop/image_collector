// Pro Image Collector - Content Script
// Injected into the page to extract image and video media from the DOM.

(() => {
  const INJECTION_KEY = '__proImageCollectorInjected';
  const INJECTION_VERSION = 'media-v5';
  const BLOB_PREVIEW_ID = '__proImageCollectorBlobPreview';
  const RESOURCE_CACHE_KEY = '__proImageCollectorVideoResources';
  const RESOURCE_OBSERVER_KEY = '__proImageCollectorResourceObserver';
  const MAX_CACHED_VIDEO_RESOURCES = 150;
  const VIDEO_THUMBNAIL_MAX_WIDTH = 240;
  const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'm3u8', 'mpd']);
  const STREAM_EXTENSIONS = new Set(['m3u8', 'mpd']);
  const VIDEO_URL_PATTERN = /\.(mp4|webm|mov|m4v|ogv|m3u8|mpd)(?:$|[?#])/i;

  if (window[INJECTION_KEY] === INJECTION_VERSION) {
    return;
  }
  window[INJECTION_KEY] = INJECTION_VERSION;

  function resolveUrl(rawUrl, options = {}) {
    const allowedDataPrefixes = options.allowedDataPrefixes || [];
    const allowBlob = Boolean(options.allowBlob);

    if (!rawUrl || typeof rawUrl !== 'string') return null;

    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) return null;

    const lowerUrl = trimmedUrl.toLowerCase();
    if (allowedDataPrefixes.some(prefix => lowerUrl.startsWith(prefix))) {
      return trimmedUrl;
    }

    try {
      const url = new URL(trimmedUrl, document.baseURI);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
      if (allowBlob && url.protocol === 'blob:') return url.href;
      return null;
    } catch (e) {
      return null;
    }
  }

  function resolveImageUrl(rawUrl) {
    return resolveUrl(rawUrl, { allowedDataPrefixes: ['data:image/'] });
  }

  function resolveVideoUrl(rawUrl) {
    return resolveUrl(rawUrl, {
      allowedDataPrefixes: ['data:video/'],
      allowBlob: true
    });
  }

  function resolvePageUrl(rawUrl) {
    return resolveUrl(rawUrl);
  }

  function getParentLink(el) {
    const parentLink = el.closest('a');
    return parentLink ? resolvePageUrl(parentLink.href) : null;
  }

  function getExtensionFromUrl(url) {
    const dataMatch = String(url).match(/^data:video\/([^;,]+)/i);
    if (dataMatch) {
      const subtype = dataMatch[1].toLowerCase();
      if (subtype === 'quicktime') return 'mov';
      return subtype;
    }

    try {
      const parsedUrl = new URL(url, document.baseURI);
      const pathname = parsedUrl.pathname.toLowerCase();
      const match = pathname.match(/\.([a-z0-9]+)$/);
      return match ? match[1] : '';
    } catch (e) {
      const match = String(url).toLowerCase().split(/[?#]/)[0].match(/\.([a-z0-9]+)$/);
      return match ? match[1] : '';
    }
  }

  function isStreamUrl(url) {
    return STREAM_EXTENSIONS.has(getExtensionFromUrl(url));
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

  function isBlobVideoUrl(url) {
    const resolvedUrl = resolveVideoUrl(url);
    return Boolean(resolvedUrl && resolvedUrl.toLowerCase().startsWith('blob:'));
  }

  function sanitizeDownloadName(name, fallback = 'video') {
    const lastSegment = String(name || '')
      .split(/[\\/]+/)
      .filter(Boolean)
      .pop() || fallback;

    const cleaned = lastSegment
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '');

    return cleaned || fallback;
  }

  function isVideoLikeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;

    const normalizedRawUrl = rawUrl.replace(/\\\//g, '/').trim();
    const resolvedUrl = resolveVideoUrl(normalizedRawUrl);
    if (!resolvedUrl) return false;

    const lowerResolvedUrl = resolvedUrl.toLowerCase();
    if (lowerResolvedUrl.startsWith('data:video/') || lowerResolvedUrl.startsWith('blob:')) {
      return true;
    }

    if (VIDEO_URL_PATTERN.test(normalizedRawUrl) || VIDEO_URL_PATTERN.test(resolvedUrl)) {
      return true;
    }

    try {
      const parsedUrl = new URL(resolvedUrl);
      const extension = getExtensionFromUrl(parsedUrl.href);
      return VIDEO_EXTENSIONS.has(extension) ||
        hasVideoMimeHint(parsedUrl) ||
        isKnownVideoCdnUrl(parsedUrl);
    } catch (e) {
      return false;
    }
  }

  function getVideoResourceCache() {
    if (!Array.isArray(window[RESOURCE_CACHE_KEY])) {
      window[RESOURCE_CACHE_KEY] = [];
    }
    return window[RESOURCE_CACHE_KEY];
  }

  function cacheVideoResource(rawUrl) {
    if (!isVideoLikeUrl(rawUrl)) return;

    const resolvedUrl = resolveVideoUrl(rawUrl);
    if (!resolvedUrl || resolvedUrl.toLowerCase().startsWith('blob:')) return;

    const cache = getVideoResourceCache();
    const existingIndex = cache.indexOf(resolvedUrl);
    if (existingIndex !== -1) {
      cache.splice(existingIndex, 1);
    }

    cache.push(resolvedUrl);
    if (cache.length > MAX_CACHED_VIDEO_RESOURCES) {
      cache.splice(0, cache.length - MAX_CACHED_VIDEO_RESOURCES);
    }
  }

  function getCachedResourceIndex(rawUrl) {
    const resolvedUrl = resolveVideoUrl(rawUrl);
    if (!resolvedUrl) return -1;
    return getVideoResourceCache().indexOf(resolvedUrl);
  }

  function startVideoResourceObserver() {
    if (!window.performance) return;

    try {
      if (typeof window.performance.setResourceTimingBufferSize === 'function') {
        window.performance.setResourceTimingBufferSize(2000);
      }

      if (typeof window.performance.getEntriesByType === 'function') {
        window.performance.getEntriesByType('resource').forEach((entry) => {
          if (entry?.name && (entry.initiatorType === 'video' || isVideoLikeUrl(entry.name))) {
            cacheVideoResource(entry.name);
          }
        });
      }

      if (window[RESOURCE_OBSERVER_KEY] || typeof PerformanceObserver !== 'function') return;

      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry?.name && (entry.initiatorType === 'video' || isVideoLikeUrl(entry.name))) {
            cacheVideoResource(entry.name);
          }
        });
      });

      observer.observe({ type: 'resource', buffered: true });
      window[RESOURCE_OBSERVER_KEY] = observer;
    } catch (e) {
      // Some pages restrict PerformanceObserver usage; scanning still works from DOM/script metadata.
    }
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
      mediaType: 'image',
      isStream: false,
      downloadable: true
    });
  }

  function addVideo(videoMap, rawSrc, metadata = {}) {
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
      thumbnail: resolveImageUrl(metadata.thumbnail) || resolveImageUrl(metadata.poster) || null,
      sourceType: metadata.sourceType || 'video',
      isStream: isStreamUrl(src),
      downloadable: !src.toLowerCase().startsWith('blob:'),
      resourceIndex: typeof metadata.resourceIndex === 'number' ? metadata.resourceIndex : -1
    });
  }

  function getFallbackAlt(el) {
    if (el.alt) return el.alt;
    const pictureImg = el.closest('picture')?.querySelector('img');
    return pictureImg?.alt || '';
  }

  function getImageElementSrc(img) {
    const attrSrc = img.getAttribute('src');
    return img.currentSrc || (attrSrc && attrSrc.trim() ? attrSrc : null);
  }

  function getVideoElementMetadata(video, sourceType) {
    const poster = video.getAttribute('poster') || video.poster || null;

    return {
      link: getParentLink(video),
      alt: video.getAttribute('aria-label') || video.getAttribute('title') || 'video',
      poster,
      thumbnail: poster || captureVideoFrameThumbnail(video),
      width: video.videoWidth || video.width || parseInt(video.getAttribute('width'), 10) || 0,
      height: video.videoHeight || video.height || parseInt(video.getAttribute('height'), 10) || 0,
      sourceType
    };
  }

  function captureVideoFrameThumbnail(video) {
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    try {
      const scale = Math.min(1, VIDEO_THUMBNAIL_MAX_WIDTH / video.videoWidth);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL('image/jpeg', 0.66);
    } catch (e) {
      return null;
    }
  }

  function getBestPageVideoMetadata(sourceType = 'resource') {
    return Array.from(document.querySelectorAll('video'))
      .map(video => ({ video, score: scorePageVideoElement(video) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => getVideoElementMetadata(item.video, sourceType))[0] || {};
  }

  function getImages() {
    const imageMap = new Map();

    document.querySelectorAll('img').forEach((img) => {
      addImage(imageMap, getImageElementSrc(img), {
        link: getParentLink(img),
        alt: img.alt || '',
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        type: 'img'
      });
    });

    document.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
      const srcset = el.getAttribute('srcset');
      if (!srcset) return;

      srcset.split(',').forEach((entry) => {
        const parts = entry.trim().split(/\s+/);
        addImage(imageMap, parts[0], {
          link: getParentLink(el),
          alt: getFallbackAlt(el),
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
        const src = match[1];
        if (src.startsWith('data:') && src.length < 100) continue;

        addImage(imageMap, src, {
          link: getParentLink(el),
          alt: 'background',
          width: el.offsetWidth,
          height: el.offsetHeight,
          type: 'bg'
        });
      }
    });

    document.querySelectorAll('video[poster]').forEach((video) => {
      addImage(imageMap, video.getAttribute('poster') || video.poster, {
        link: null,
        alt: 'video poster',
        width: video.videoWidth || video.width || 0,
        height: video.videoHeight || video.height || 0,
        type: 'img'
      });
    });

    return Array.from(imageMap.values())
      .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  }

  function collectVideoElements(videoMap) {
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
  }

  function collectVideoLinks(videoMap) {
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href') || anchor.href;
      if (!isVideoLikeUrl(href)) return;

      addVideo(videoMap, href, {
        link: resolvePageUrl(anchor.href),
        alt: anchor.textContent.trim().slice(0, 80) || 'video link',
        sourceType: 'link'
      });
    });
  }

  function collectVideoDataAttributes(videoMap) {
    const attributeNames = [
      'data-src',
      'data-video',
      'data-video-src',
      'data-mp4',
      'data-hls',
      'data-stream',
      'data-url',
      'data-file'
    ];
    const selector = attributeNames.map(attr => `[${attr}]`).join(',');

    document.querySelectorAll(selector).forEach((el) => {
      attributeNames.forEach((attr) => {
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
  }

  function collectPerformanceVideos(videoMap) {
    if (!window.performance || typeof window.performance.getEntriesByType !== 'function') return;

    const pageVideoMetadata = getBestPageVideoMetadata('resource');

    window.performance.getEntriesByType('resource').forEach((entry) => {
      if (!entry?.name) return;
      if (entry.initiatorType !== 'video' && !isVideoLikeUrl(entry.name)) return;
      cacheVideoResource(entry.name);

      addVideo(videoMap, entry.name, {
        ...pageVideoMetadata,
        alt: 'video resource',
        sourceType: 'resource',
        resourceIndex: getCachedResourceIndex(entry.name)
      });
    });

    getVideoResourceCache().forEach((url) => {
      addVideo(videoMap, url, {
        ...pageVideoMetadata,
        alt: 'video resource',
        sourceType: 'resource',
        resourceIndex: getCachedResourceIndex(url)
      });
    });
  }

  function collectTextVideoUrls(videoMap) {
    const maxTotalChars = 2 * 1024 * 1024;
    let totalChars = 0;
    const absoluteUrlPattern = /(?:https?:)?\/\/[^"'<>\s\\]+/gi;
    const pageVideoMetadata = getBestPageVideoMetadata('metadata');

    document.querySelectorAll('script, template').forEach((el) => {
      if (totalChars >= maxTotalChars) return;

      const rawText = el.textContent || '';
      if (!rawText) return;

      const remainingChars = maxTotalChars - totalChars;
      const text = rawText
        .slice(0, remainingChars)
        .replace(/\\u002[fF]/g, '/')
        .replace(/\\\//g, '/');
      totalChars += text.length;

      for (const match of text.matchAll(absoluteUrlPattern)) {
        const rawUrl = match[0].startsWith('//') ? `${location.protocol}${match[0]}` : match[0];
        if (!isVideoLikeUrl(rawUrl)) continue;
        addVideo(videoMap, rawUrl, {
          ...pageVideoMetadata,
          alt: 'video metadata',
          sourceType: 'metadata'
        });
      }
    });
  }

  function getVideos() {
    const videoMap = new Map();

    collectVideoElements(videoMap);
    collectVideoLinks(videoMap);
    collectVideoDataAttributes(videoMap);
    collectPerformanceVideos(videoMap);
    collectTextVideoUrls(videoMap);

    return Array.from(videoMap.values()).sort((a, b) => {
      if (a.isStream !== b.isStream) return a.isStream ? 1 : -1;
      return (b.width * b.height) - (a.width * a.height);
    });
  }

  function getMedia() {
    return [...getImages(), ...getVideos()];
  }

  function scoreDownloadCandidate(video) {
    const src = video?.src || '';
    if (!src || src.toLowerCase().startsWith('blob:') || src.toLowerCase().startsWith('data:')) {
      return -1;
    }

    let score = 0;
    const extension = getExtensionFromUrl(src);

    if (!video.isStream) score += 80;
    if (extension === 'mp4' || extension === 'webm') score += 40;
    if (video.sourceType === 'resource') score += 35;
    if (video.sourceType === 'metadata') score += 25;
    if (video.sourceType === 'video' || video.sourceType === 'source') score += 15;
    if (typeof video.resourceIndex === 'number' && video.resourceIndex > -1) {
      score += Math.min(video.resourceIndex, 50);
    }

    try {
      const parsedUrl = new URL(src, document.baseURI);
      if (hasVideoMimeHint(parsedUrl)) score += 45;
      if (isKnownVideoCdnUrl(parsedUrl)) score += 45;
      if (parsedUrl.searchParams.has('x-expires') || parsedUrl.searchParams.has('x-signature')) score += 10;
    } catch (e) {
      // Keep the base score for already-resolved URLs.
    }

    return score;
  }

  function findBestDownloadableVideoCandidate() {
    return getVideos()
      .map(video => ({ video, score: scoreDownloadCandidate(video) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score)[0]?.video || null;
  }

  function closeBlobPreview() {
    const existingOverlay = document.getElementById(BLOB_PREVIEW_ID);
    if (existingOverlay) existingOverlay.remove();
  }

  function createVideoPreviewOverlay(title) {
    closeBlobPreview();

    const overlay = document.createElement('div');
    overlay.id = BLOB_PREVIEW_ID;
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'background:rgba(0,0,0,0.88)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:24px',
      'box-sizing:border-box'
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'position:relative',
      'width:min(960px,96vw)',
      'max-height:92vh',
      'background:#000',
      'border:1px solid rgba(255,255,255,0.25)',
      'box-shadow:0 16px 48px rgba(0,0,0,0.55)'
    ].join(';');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'x';
    closeButton.setAttribute('aria-label', 'Close video preview');
    closeButton.style.cssText = [
      'position:absolute',
      'top:-14px',
      'right:-14px',
      'z-index:2',
      'width:32px',
      'height:32px',
      'border-radius:50%',
      'border:1px solid rgba(255,255,255,0.5)',
      'background:#111',
      'color:#fff',
      'font:700 18px/1 Arial,sans-serif',
      'cursor:pointer'
    ].join(';');
    closeButton.addEventListener('click', closeBlobPreview);

    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', title || 'Video preview');
    video.style.cssText = [
      'display:block',
      'width:100%',
      'max-height:92vh',
      'background:#000'
    ].join(';');

    panel.append(closeButton, video);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeBlobPreview();
    });

    document.documentElement.appendChild(overlay);

    return { video };
  }

  function scorePageVideoElement(video) {
    const rect = video.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    const visibleArea = visibleWidth * visibleHeight;
    const src = video.currentSrc || video.src || video.getAttribute('src') || '';

    let score = visibleArea;
    if (!video.paused) score += 1000000;
    if (video.readyState > 0) score += 100000;
    if (src.toLowerCase().startsWith('blob:')) score += 50000;
    if (video.currentTime > 0) score += 10000;

    return score;
  }

  function findPageVideoElementForBlob(rawSrc) {
    const src = resolveVideoUrl(rawSrc);
    const videos = Array.from(document.querySelectorAll('video'));

    const exactMatch = videos.find((video) => {
      const candidates = [
        video.currentSrc,
        video.src,
        video.getAttribute('src')
      ].filter(Boolean).map(candidate => resolveVideoUrl(candidate));

      return candidates.includes(src);
    });

    if (exactMatch) return exactMatch;

    return videos
      .map(video => ({ video, score: scorePageVideoElement(video) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.video || null;
  }

  function playPreviewVideo(video) {
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }

  function previewBlobVideo(rawSrc, title) {
    const src = resolveVideoUrl(rawSrc);
    if (!src || !isBlobVideoUrl(src)) {
      return { ok: false, error: 'The selected video is not a page-scoped blob URL.' };
    }

    const sourceVideo = findPageVideoElementForBlob(src);
    if (sourceVideo && !sourceVideo.paused && typeof sourceVideo.captureStream === 'function') {
      const stream = sourceVideo.captureStream();
      if (stream && stream.getTracks().length > 0) {
        const preview = createVideoPreviewOverlay(title);
        preview.video.srcObject = stream;
        playPreviewVideo(preview.video);

        return { ok: true, method: 'capture-stream' };
      }
    }

    const candidate = findBestDownloadableVideoCandidate();
    if (candidate?.src) {
      const preview = createVideoPreviewOverlay(title);
      preview.video.src = candidate.src;
      playPreviewVideo(preview.video);
      return { ok: true, method: 'direct-candidate' };
    }

    return {
      ok: false,
      error: 'This blob is a transient MediaSource stream and no reusable video URL was found. Play the video, then Rescan.'
    };
  }

  function clickDownloadLink(rawUrl, filename) {
    const src = resolveVideoUrl(rawUrl);
    if (!src) {
      return { ok: false, error: 'Invalid video URL.' };
    }

    const link = document.createElement('a');
    link.href = src;
    link.download = sanitizeDownloadName(filename, 'video.mp4');
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.style.display = 'none';
    document.documentElement.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 1000);

    return { ok: true, method: 'page-link' };
  }

  async function fetchAndDownloadVideo(rawUrl, filename) {
    const src = resolveVideoUrl(rawUrl);
    if (!src) {
      return { ok: false, error: 'Invalid video URL.' };
    }

    const response = await fetch(src, {
      credentials: 'include',
      mode: 'cors',
      referrer: location.href
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.size) {
      throw new Error('Empty video response');
    }

    const objectUrl = URL.createObjectURL(blob);
    const result = clickDownloadLink(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    return {
      ...result,
      method: 'page-fetch',
      size: blob.size,
      contentType: response.headers.get('content-type') || blob.type || ''
    };
  }

  async function downloadVideoUrl(rawUrl, filename) {
    const src = resolveVideoUrl(rawUrl);
    if (!src || !isVideoLikeUrl(src)) {
      return { ok: false, error: 'The selected URL is not recognized as video.' };
    }

    if (isStreamUrl(src)) {
      return { ok: false, error: 'Stream manifests cannot be assembled by the extension.' };
    }

    try {
      return await fetchAndDownloadVideo(src, filename);
    } catch (e) {
      const linkResult = clickDownloadLink(src, filename);
      return {
        ...linkResult,
        warning: e.message || 'Page fetch failed; used link fallback.'
      };
    }
  }

  async function downloadBlobVideo(rawSrc, filename) {
    const src = resolveVideoUrl(rawSrc);
    if (!src || !isBlobVideoUrl(src)) {
      return { ok: false, error: 'The selected video is not a page-scoped blob URL.' };
    }

    const candidate = findBestDownloadableVideoCandidate();
    if (candidate?.src) {
      return downloadVideoUrl(candidate.src, filename);
    }

    return clickDownloadLink(src, filename);
  }

  startVideoResourceObserver();

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getImages') {
      sendResponse(getImages());
    } else if (request.action === 'getVideos') {
      sendResponse(getVideos());
    } else if (request.action === 'getMedia') {
      sendResponse(getMedia());
    } else if (request.action === 'previewBlobVideo') {
      sendResponse(previewBlobVideo(request.src, request.title));
    } else if (request.action === 'downloadBlobVideo') {
      downloadBlobVideo(request.src, request.filename)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: e.message || 'Blob download failed' }));
      return true;
    } else if (request.action === 'downloadVideoUrl') {
      downloadVideoUrl(request.src, request.filename)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: e.message || 'Video download failed' }));
      return true;
    }
    return false;
  });

  let mutationTimeout = null;
  const observer = new MutationObserver((mutations) => {
    let hasNewMedia = false;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('img, video, source[srcset], source[src], a[href]') ||
            node.querySelector?.('img, video, source[srcset], source[src], a[href]')) {
          hasNewMedia = true;
          break;
        }
      }
      if (hasNewMedia) break;
    }

    if (!hasNewMedia) return;

    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
      try {
        chrome.runtime.sendMessage({ action: 'newImagesDetected' });
      } catch (e) {
        // Popup may be closed.
      }
    }, 1000);
  });

  function startObserver() {
    if (!document.body) return;
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.body) {
    startObserver();
  } else {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  }
})();
