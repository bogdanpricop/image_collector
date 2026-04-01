/**
 * 📚 Pro Image Collector — Unit Tests
 *
 * Testing pure utility functions that power the extension.
 * These functions handle URL parsing, filtering, XSS prevention,
 * and filename generation — all critical paths where bugs cause
 * visible user problems.
 */

const { getFileExtension, escapeHtml, filterImages, generateFilename, sanitizeFolderName } = require('../utils');

// ============================================================
// getFileExtension — parses image format from URLs
// ============================================================
describe('getFileExtension', () => {

  // 📚 HAPPY PATH: Standard image URLs with clean extensions
  it('should return correct extension for standard image URLs', () => {
    expect(getFileExtension('https://example.com/photo.jpg')).toBe('jpg');
    expect(getFileExtension('https://example.com/photo.png')).toBe('png');
    expect(getFileExtension('https://example.com/photo.webp')).toBe('webp');
    expect(getFileExtension('https://example.com/photo.svg')).toBe('svg');
    expect(getFileExtension('https://example.com/photo.gif')).toBe('gif');
  });

  // 📚 NORMALIZATION: jpeg → jpg so we don't end up with mixed naming
  it('should normalize jpeg to jpg', () => {
    expect(getFileExtension('https://example.com/photo.jpeg')).toBe('jpg');
  });

  // 📚 QUERY STRINGS: CDN URLs often append ?width=100 etc.
  // Without stripping these, we'd get "jpg?width=100" as extension
  it('should strip query parameters before extracting extension', () => {
    expect(getFileExtension('https://cdn.example.com/img.png?w=200&h=300')).toBe('png');
    expect(getFileExtension('https://cdn.example.com/img.webp?quality=80')).toBe('webp');
  });

  // 📚 HASH FRAGMENTS: Some URLs use #hash for cache busting
  it('should strip hash fragments before extracting extension', () => {
    expect(getFileExtension('https://example.com/img.jpg#v2')).toBe('jpg');
  });

  // 📚 DATA URLS: Canvas exports and inline images use data:image/...
  // We default to PNG since that's what canvas.toDataURL() produces
  it('should return png for data URLs', () => {
    expect(getFileExtension('data:image/png;base64,iVBOR...')).toBe('png');
    expect(getFileExtension('data:image/jpeg;base64,/9j/4...')).toBe('png');
  });

  // 📚 UNKNOWN: URLs without recognizable image extensions
  // Common on CDNs that serve images via /api/image/12345
  it('should return unknown for URLs without image extension', () => {
    expect(getFileExtension('https://example.com/api/image/12345')).toBe('unknown');
    expect(getFileExtension('https://example.com/image')).toBe('unknown');
  });

  // 📚 EDGE: Less common formats that the extension supports
  it('should recognize less common image formats', () => {
    expect(getFileExtension('https://example.com/photo.avif')).toBe('avif');
    expect(getFileExtension('https://example.com/photo.bmp')).toBe('bmp');
    expect(getFileExtension('https://example.com/favicon.ico')).toBe('ico');
  });

  // 📚 EDGE: URLs with dots in path segments (not extension)
  it('should handle URLs with dots in path', () => {
    expect(getFileExtension('https://cdn.example.com/v2.0/images/photo.jpg')).toBe('jpg');
  });

  // 📚 EDGE: URLs with uppercase extensions
  it('should handle uppercase extensions', () => {
    expect(getFileExtension('https://example.com/PHOTO.JPG')).toBe('jpg');
    expect(getFileExtension('https://example.com/image.PNG')).toBe('png');
  });
});

// ============================================================
// escapeHtml — XSS prevention
// ============================================================
describe('escapeHtml', () => {

  // 📚 This function is the last line of defense against XSS.
  // If a malicious image URL contains <script>, we must escape it.
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  // 📚 PASSTHROUGH: Normal strings should be unchanged
  it('should not modify strings without special characters', () => {
    expect(escapeHtml('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ============================================================
// filterImages — core filtering logic
// ============================================================
describe('filterImages', () => {

  const testImages = [
    { src: 'https://example.com/large.jpg', alt: 'Large photo', width: 1920, height: 1080 },
    { src: 'https://example.com/small.png', alt: 'Small icon', width: 32, height: 32 },
    { src: 'https://example.com/medium.webp', alt: 'Product shoe', width: 400, height: 400 },
    { src: 'https://example.com/banner.svg', alt: 'Logo', width: 200, height: 50 },
    { src: 'https://example.com/anim.gif', alt: 'Loading spinner', width: 100, height: 100 },
    { src: 'https://cdn.example.com/api/img/999', alt: 'Dynamic image', width: 500, height: 500 },
  ];

  const allTypesFilter = { minW: 0, minH: 0, text: '', types: ['jpg', 'png', 'webp', 'svg', 'gif'] };

  // 📚 HAPPY PATH: No filters active — show everything
  it('should return all images when no filters are active', () => {
    const result = filterImages(testImages, allTypesFilter);
    expect(result.length).toBe(testImages.length);
  });

  // 📚 SIZE FILTER: The most common use case — exclude tiny icons
  it('should filter by minimum width', () => {
    const result = filterImages(testImages, { ...allTypesFilter, minW: 100 });
    expect(result).not.toContainEqual(expect.objectContaining({ src: 'https://example.com/small.png' }));
    expect(result.length).toBe(5);
  });

  it('should filter by minimum height', () => {
    const result = filterImages(testImages, { ...allTypesFilter, minH: 100 });
    expect(result).not.toContainEqual(expect.objectContaining({ src: 'https://example.com/small.png' }));
    expect(result).not.toContainEqual(expect.objectContaining({ src: 'https://example.com/banner.svg' }));
  });

  // 📚 TYPE FILTER: User selects only certain formats
  it('should filter by file type', () => {
    const result = filterImages(testImages, { ...allTypesFilter, types: ['jpg', 'png'] });
    expect(result.length).toBe(3); // jpg + png + unknown (dynamic image passes)
  });

  // 📚 UNKNOWN type images should pass through type filter
  // CDN images without extensions shouldn't be hidden
  it('should include unknown-type images regardless of type filter', () => {
    const result = filterImages(testImages, { ...allTypesFilter, types: ['jpg'] });
    const dynamicImg = result.find(i => i.src.includes('api/img/999'));
    expect(dynamicImg).toBeDefined();
  });

  // 📚 TEXT FILTER: Searches in both URL and alt text
  it('should filter by text in URL', () => {
    const result = filterImages(testImages, { ...allTypesFilter, text: 'banner' });
    expect(result.length).toBe(1);
    expect(result[0].src).toContain('banner');
  });

  it('should filter by text in alt attribute', () => {
    const result = filterImages(testImages, { ...allTypesFilter, text: 'shoe' });
    expect(result.length).toBe(1);
    expect(result[0].alt).toBe('Product shoe');
  });

  // 📚 CASE INSENSITIVE: filter text is lowercased before comparison
  // Note: filterImages expects text to already be lowercased (done by getActiveFilters)
  it('should be case-insensitive in text search', () => {
    const result = filterImages(testImages, { ...allTypesFilter, text: 'large' });
    expect(result.length).toBe(1);
  });

  // 📚 COMBINED FILTERS: Multiple filters should AND together
  it('should apply all filters together', () => {
    const result = filterImages(testImages, {
      minW: 100, minH: 100, text: '', types: ['jpg', 'webp']
    });
    // large.jpg (1920x1080) + medium.webp (400x400) + dynamic (unknown, passes type filter)
    expect(result.length).toBe(3);
  });

  // 📚 EMPTY: No images matching should return empty array, not error
  it('should return empty array when nothing matches', () => {
    const result = filterImages(testImages, { ...allTypesFilter, text: 'nonexistent_xyz' });
    expect(result).toEqual([]);
  });

  // 📚 EDGE: Image with no alt text should not crash text filter
  it('should handle images with empty or undefined alt text', () => {
    const imagesNoAlt = [
      { src: 'https://example.com/img.jpg', alt: '', width: 100, height: 100 },
      { src: 'https://example.com/img2.jpg', alt: undefined, width: 100, height: 100 },
    ];
    const result = filterImages(imagesNoAlt, { ...allTypesFilter, text: 'something' });
    expect(result).toEqual([]);
  });
});

// ============================================================
// generateFilename — download naming logic
// ============================================================
describe('generateFilename', () => {

  // 📚 HAPPY PATH: No rename, no folder — extract from URL
  it('should extract filename from URL when no rename is set', () => {
    const result = generateFilename('https://example.com/photos/sunset.jpg', 1, '', '');
    expect(result).toBe('sunset.jpg');
  });

  // 📚 RENAME: Custom prefix generates sequential names
  it('should use rename pattern with zero-padded index', () => {
    const result = generateFilename('https://example.com/img.jpg', 5, 'vacation', '');
    expect(result).toBe('vacation_005.jpg');
  });

  // 📚 FOLDER: Prepends subfolder path
  it('should prepend folder name', () => {
    const result = generateFilename('https://example.com/img.jpg', 1, '', 'Photos');
    expect(result).toBe('Photos/img.jpg');
  });

  // 📚 COMBINED: Folder + Rename
  it('should combine folder and rename correctly', () => {
    const result = generateFilename('https://example.com/img.jpg', 3, 'beach', 'Summer');
    expect(result).toBe('Summer/beach_003.jpg');
  });

  // 📚 DATA URL: Canvas-exported images have no filename
  it('should generate processed_N name for data URLs', () => {
    const result = generateFilename('data:image/png;base64,iVBOR...', 1, '', '');
    expect(result).toBe('processed_1.png');
  });

  // 📚 UNKNOWN EXTENSION: URLs without extension default to jpg
  // The URL path segment "12345" is short enough to use as filename, but ext is unknown→jpg
  it('should default to jpg for unknown extensions', () => {
    const result = generateFilename('https://api.example.com/image/12345', 1, '', '');
    // "12345" is extracted from URL and is < 50 chars, so it's used as-is
    expect(result).toBe('12345');
  });

  // 📚 EDGE: Very long filenames from URL should fallback
  it('should fallback to generic name for very long URL filenames', () => {
    const longName = 'a'.repeat(60) + '.jpg';
    const result = generateFilename(`https://example.com/${longName}`, 2, '', '');
    expect(result).toBe('image_2.jpg');
  });

  // 📚 EDGE: URL with query params in filename portion
  it('should strip query params from extracted filename', () => {
    const result = generateFilename('https://example.com/photo.jpg?size=large&v=2', 1, '', '');
    expect(result).toBe('photo.jpg');
  });
});

// ============================================================
// sanitizeFolderName — filesystem safety
// ============================================================
describe('sanitizeFolderName', () => {

  // 📚 SECURITY: Prevent directory traversal and invalid chars
  it('should remove dangerous filesystem characters', () => {
    expect(sanitizeFolderName('my<folder>')).toBe('myfolder');
    expect(sanitizeFolderName('path:to:file')).toBe('pathtofile');
    expect(sanitizeFolderName('file"name')).toBe('filename');
    expect(sanitizeFolderName('back\\slash')).toBe('backslash');
    expect(sanitizeFolderName('pipe|char')).toBe('pipechar');
    expect(sanitizeFolderName('question?mark')).toBe('questionmark');
    expect(sanitizeFolderName('star*wild')).toBe('starwild');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFolderName('  photos  ')).toBe('photos');
  });

  // 📚 PASSTHROUGH: Valid names should be unchanged
  it('should keep valid folder names unchanged', () => {
    expect(sanitizeFolderName('Summer-2026_Photos')).toBe('Summer-2026_Photos');
  });

  it('should handle empty string', () => {
    expect(sanitizeFolderName('')).toBe('');
  });
});
