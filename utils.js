// Pure utility functions extracted for testability.
// These are used by popup.js and by the Jest suite.

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'png',
  'webp',
  'svg',
  'gif',
  'avif',
  'bmp',
  'ico'
]);

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mov',
  'm4v',
  'ogv',
  'm3u8',
  'mpd'
]);

const SUPPORTED_MEDIA_EXTENSIONS = new Set([
  ...SUPPORTED_IMAGE_EXTENSIONS,
  ...SUPPORTED_VIDEO_EXTENSIONS
]);

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function normalizeExtension(ext) {
  if (!ext || typeof ext !== 'string') return null;

  let normalized = ext.trim().toLowerCase().replace(/^\./, '');
  if (normalized === 'jpeg' || normalized === 'pjpeg') normalized = 'jpg';
  if (normalized === 'svg+xml') normalized = 'svg';
  if (normalized === 'quicktime') normalized = 'mov';
  if (normalized === 'x-mpegurl' || normalized === 'vnd.apple.mpegurl') normalized = 'm3u8';

  return SUPPORTED_MEDIA_EXTENSIONS.has(normalized) ? normalized : null;
}

function getDataMediaExtension(url) {
  const match = String(url).match(/^data:(?:image|video)\/([^;,]+)/i);
  return normalizeExtension(match?.[1]) || 'png';
}

function getUrlPathname(url) {
  try {
    return new URL(url, 'https://image-collector.local/').pathname;
  } catch (e) {
    return String(url).split('?')[0].split('#')[0];
  }
}

function getUrlBasename(url) {
  if (!url || String(url).startsWith('data:')) return '';

  const pathname = getUrlPathname(url);
  const basename = pathname.substring(pathname.lastIndexOf('/') + 1);

  try {
    return decodeURIComponent(basename);
  } catch (e) {
    return basename;
  }
}

/**
 * Get file extension from URL.
 */
function getFileExtension(url) {
  if (!url || typeof url !== 'string') return 'unknown';
  if (url.startsWith('data:image') || url.startsWith('data:video')) return getDataMediaExtension(url);

  const basename = getUrlBasename(url);
  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === basename.length - 1) return 'unknown';

  return normalizeExtension(basename.slice(dotIndex + 1)) || 'unknown';
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str).replace(/[&<>"']/g, c => map[c]);
}

/**
 * Filter media based on active filter criteria.
 */
function filterImages(images, filters) {
  return images.filter(img => {
    const isVideo = img.mediaType === 'video';
    if (!isVideo && (img.width < filters.minW || img.height < filters.minH)) return false;
    const ext = getFileExtension(img.src);
    if (ext !== 'unknown' && !filters.types.includes(ext)) return false;
    if (filters.text) {
      const srcMatch = img.src.toLowerCase().includes(filters.text);
      const altMatch = img.alt && img.alt.toLowerCase().includes(filters.text);
      if (!srcMatch && !altMatch) return false;
    }
    return true;
  });
}

function sanitizePathSegment(segment, fallback = '') {
  let cleaned = String(segment || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');

  if (cleaned === '.' || cleaned === '..') cleaned = '';
  if (WINDOWS_RESERVED_NAMES.test(cleaned)) cleaned = `_${cleaned}`;

  return cleaned || fallback;
}

/**
 * Sanitize a single filename for Chrome downloads and ZIP entries.
 */
function sanitizeFileName(name, fallback = 'image') {
  return sanitizePathSegment(name, fallback);
}

/**
 * Sanitize folder name for filesystem while preserving intentional subfolders.
 */
function sanitizeFolderName(name) {
  return String(name || '')
    .split(/[\\/]+/)
    .map(segment => sanitizePathSegment(segment))
    .filter(Boolean)
    .join('/');
}

/**
 * Generate filename for download.
 */
function generateFilename(url, idx, renameBase, folderName, forcedExtension) {
  const forcedExt = normalizeExtension(forcedExtension);
  const detectedExt = getFileExtension(url);
  const ext = forcedExt || (detectedExt === 'unknown' ? 'jpg' : detectedExt);
  const safeFolderName = sanitizeFolderName(folderName);
  const safeRenameBase = sanitizePathSegment(renameBase);

  let filename;
  if (safeRenameBase) {
    filename = `${safeRenameBase}_${idx.toString().padStart(3, '0')}.${ext}`;
  } else if (!String(url).startsWith('data:')) {
    const basename = sanitizeFileName(getUrlBasename(url), '');
    if (basename && basename.length < 50) {
      const basenameExt = getFileExtension(basename);
      filename = basenameExt === 'unknown'
        ? `${basename}.${ext}`
        : basename.replace(/\.[^.]+$/, `.${ext}`);
    } else {
      filename = `image_${idx}.${ext}`;
    }
  } else {
    filename = `processed_${idx}.${ext}`;
  }

  return safeFolderName ? `${safeFolderName}/${filename}` : filename;
}

// Export for testing (Node.js) or use in browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getFileExtension,
    escapeHtml,
    filterImages,
    generateFilename,
    sanitizeFileName,
    sanitizeFolderName
  };
}
