// Pro Image Collector - background media request monitor.

const MAX_MEDIA_REQUESTS_PER_TAB = 200;
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'm3u8', 'mpd']);
const STREAM_EXTENSIONS = new Set(['m3u8', 'mpd']);
const YOUTUBE_PROGRESSIVE_ITAGS = new Set(['5', '6', '17', '18', '22', '34', '35', '36', '37', '38', '43', '44', '45', '46', '59', '78', '82', '83', '84', '85', '91', '92', '93', '94', '95', '96']);
const tabMediaRequests = new Map();

function getStorageArea() {
  return chrome.storage?.session || chrome.storage?.local || null;
}

function getTabMediaStorageKey(tabId) {
  return `mediaRequests:${tabId}`;
}

function normalizeRequestOrder(requests) {
  requests.forEach((item, index) => {
    item.resourceIndex = index;
  });
  return requests;
}

function mergeRequestLists(primaryRequests, fallbackRequests) {
  const merged = new Map();

  [...(fallbackRequests || []), ...(primaryRequests || [])].forEach((item) => {
    if (item?.src) merged.set(item.src, item);
  });

  return normalizeRequestOrder(Array.from(merged.values()));
}

function persistMediaRequests(tabId, requests) {
  const storageArea = getStorageArea();
  if (!storageArea || tabId < 0) return;

  try {
    storageArea.set({ [getTabMediaStorageKey(tabId)]: requests });
  } catch (e) {
    // In-memory capture still works if extension storage is unavailable.
  }
}

function readPersistedMediaRequests(tabId) {
  return new Promise((resolve) => {
    const storageArea = getStorageArea();
    if (!storageArea || tabId < 0) {
      resolve([]);
      return;
    }

    try {
      storageArea.get(getTabMediaStorageKey(tabId), (result) => {
        if (chrome.runtime.lastError) {
          resolve([]);
          return;
        }

        const requests = result?.[getTabMediaStorageKey(tabId)];
        resolve(Array.isArray(requests) ? requests : []);
      });
    } catch (e) {
      resolve([]);
    }
  });
}

function forgetPersistedMediaRequests(tabId) {
  const storageArea = getStorageArea();
  if (!storageArea || tabId < 0) return;

  try {
    storageArea.remove(getTabMediaStorageKey(tabId));
  } catch (e) {
    // Nothing else to clean up.
  }
}

function getExtensionFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : '';
  } catch (e) {
    return '';
  }
}

function getPlatformFromUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host.includes('twitter.com') || host === 'x.com' || host.endsWith('.x.com') || host.includes('twimg.com')) return 'twitter';
    if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('youtube-nocookie.com') || host.includes('googlevideo.com') || host.includes('ytimg.com')) return 'youtube';
    if (host.includes('tiktok') || host.includes('tiktokv') || host.includes('byteoversea') || host.includes('bytecdn') || host.includes('ibytedtos') || host.includes('snssdk') || host.includes('muscdn')) return 'tiktok';
    return '';
  } catch (e) {
    return '';
  }
}

function hasVideoMimeHint(url) {
  for (const [rawKey, rawValue] of url.searchParams.entries()) {
    const key = rawKey.toLowerCase();
    const value = rawValue.toLowerCase();

    if ((key.includes('mime') || key === 'type' || key === 'format' || key === 'content_type') &&
        (value.includes('video') || VIDEO_EXTENSIONS.has(value.replace(/^video[_/.-]?/, '')))) {
      return true;
    }
  }

  return false;
}

function isYouTubeProgressiveUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.toLowerCase().includes('googlevideo.com')) return false;
    if (!url.pathname.toLowerCase().includes('/videoplayback')) return false;

    const itag = url.searchParams.get('itag') || '';
    const mime = (url.searchParams.get('mime') || '').toLowerCase();
    return mime.includes('video/') && YOUTUBE_PROGRESSIVE_ITAGS.has(itag);
  } catch (e) {
    return false;
  }
}

function isKnownPlatformVideoUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if ((host.includes('video.twimg.com') || host.includes('twimg.com')) &&
        (path.includes('/ext_tw_video/') || path.includes('/amplify_video/') || path.includes('/tweet_video/') || path.includes('/vid/') || path.endsWith('.mp4'))) {
      return true;
    }

    if (host.includes('googlevideo.com') && path.includes('/videoplayback') && hasVideoMimeHint(url)) {
      return true;
    }

    if ((host.includes('tiktok') || host.includes('tiktokv') || host.includes('byteoversea') || host.includes('bytecdn') || host.includes('ibytedtos') || host.includes('snssdk') || host.includes('muscdn') || host.includes('akamaized')) &&
        (path.includes('/video/') || path.includes('/tos/') || path.includes('/tos-') || hasVideoMimeHint(url))) {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

function isVideoLikeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  const ext = getExtensionFromUrl(rawUrl);
  if (VIDEO_EXTENSIONS.has(ext)) return true;

  return isKnownPlatformVideoUrl(rawUrl);
}

function isDownloadable(rawUrl, platform) {
  if (STREAM_EXTENSIONS.has(getExtensionFromUrl(rawUrl))) return false;
  if (platform === 'youtube') return isYouTubeProgressiveUrl(rawUrl);
  return true;
}

function makeMediaItem(rawUrl, tabId) {
  const platform = getPlatformFromUrl(rawUrl);
  const ext = getExtensionFromUrl(rawUrl);

  return {
    src: rawUrl,
    alt: platform ? `${platform} video request` : 'video request',
    width: 0,
    height: 0,
    type: 'video',
    mediaType: 'video',
    poster: null,
    thumbnail: null,
    sourceType: 'network',
    platform,
    isStream: STREAM_EXTENSIONS.has(ext),
    downloadable: isDownloadable(rawUrl, platform),
    resourceIndex: 0,
    tabId
  };
}

function rememberMediaRequest(tabId, rawUrl) {
  if (tabId < 0 || !isVideoLikeUrl(rawUrl)) return;

  const requests = tabMediaRequests.get(tabId) || [];
  const existingIndex = requests.findIndex(item => item.src === rawUrl);
  if (existingIndex !== -1) requests.splice(existingIndex, 1);

  requests.push(makeMediaItem(rawUrl, tabId));

  while (requests.length > MAX_MEDIA_REQUESTS_PER_TAB) {
    requests.shift();
  }

  normalizeRequestOrder(requests);

  tabMediaRequests.set(tabId, requests);
  persistMediaRequests(tabId, requests);
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => rememberMediaRequest(details.tabId, details.url),
  {
    urls: [
      '*://*.x.com/*',
      '*://*.twitter.com/*',
      '*://*.twimg.com/*',
      '*://*.youtube.com/*',
      '*://*.youtu.be/*',
      '*://*.youtube-nocookie.com/*',
      '*://*.googlevideo.com/*',
      '*://*.tiktok.com/*',
      '*://*.tiktokv.com/*',
      '*://*.tiktokcdn.com/*',
      '*://*.byteoversea.com/*',
      '*://*.bytecdn.com/*',
      '*://*.ibytedtos.com/*',
      '*://*.snssdk.com/*',
      '*://*.muscdn.com/*',
      '*://*.akamaized.net/*'
    ],
    types: ['media', 'xmlhttprequest', 'other']
  }
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCapturedMedia') {
    const tabId = Number(request.tabId);
    readPersistedMediaRequests(tabId).then((persistedRequests) => {
      const media = mergeRequestLists(tabMediaRequests.get(tabId) || [], persistedRequests);
      tabMediaRequests.set(tabId, media);
      sendResponse({ ok: true, media });
    });
    return true;
  }

  if (request.action === 'clearCapturedMedia') {
    const tabId = Number(request.tabId);
    tabMediaRequests.delete(tabId);
    forgetPersistedMediaRequests(tabId);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabMediaRequests.delete(tabId);
  forgetPersistedMediaRequests(tabId);
});
