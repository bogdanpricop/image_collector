// Pure utility functions extracted for testability
// These are used by popup.js — keep in sync

/**
 * Get file extension from URL
 */
function getFileExtension(url) {
  if (url.startsWith('data:image')) return 'png';
  const cleanUrl = url.split('?')[0].split('#')[0];
  const ext = cleanUrl.split('.').pop().toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  if (['jpg', 'png', 'webp', 'svg', 'gif', 'avif', 'bmp', 'ico'].includes(ext)) return ext;
  return 'unknown';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

/**
 * Filter images based on active filter criteria
 */
function filterImages(images, filters) {
  return images.filter(img => {
    if (img.width < filters.minW || img.height < filters.minH) return false;
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

/**
 * Generate filename for download
 */
function generateFilename(url, idx, renameBase, folderName) {
  let ext = url.startsWith('data:image') ? 'png' : getFileExtension(url);
  if (ext === 'unknown') ext = 'jpg';

  let filename;
  if (renameBase) {
    filename = `${renameBase}_${idx.toString().padStart(3, '0')}.${ext}`;
  } else if (!url.startsWith('data:image')) {
    const n = url.substring(url.lastIndexOf('/') + 1).split('?')[0];
    filename = (n && n.length < 50 && n.length > 0) ? n : `image_${idx}.${ext}`;
  } else {
    filename = `processed_${idx}.${ext}`;
  }

  if (folderName) {
    filename = `${folderName}/${filename}`;
  }
  return filename;
}

/**
 * Sanitize folder name for filesystem
 */
function sanitizeFolderName(name) {
  return name.trim().replace(/[<>:"/\\|?*]+/g, '');
}

// Export for testing (Node.js) or use in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getFileExtension, escapeHtml, filterImages, generateFilename, sanitizeFolderName };
}
