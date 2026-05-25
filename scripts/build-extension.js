const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist', 'edge-extension');

const runtimeFiles = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'popup.js',
  'content.js',
  'utils.js',
  'jszip.min.js',
  'icon16.png',
  'icon48.png',
  'icon128.png'
];

function assertInsideRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(rootDir + path.sep)) {
    throw new Error(`Refusing to write outside project root: ${resolved}`);
  }
  return resolved;
}

function copyRuntimeFile(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = assertInsideRoot(path.join(outDir, relativePath));

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function validateNoReservedNames(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) {
      throw new Error(`Reserved extension file or directory name found: ${path.join(dir, entry.name)}`);
    }

    if (entry.isDirectory()) {
      validateNoReservedNames(path.join(dir, entry.name));
    }
  }
}

assertInsideRoot(outDir);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of runtimeFiles) {
  copyRuntimeFile(file);
}

validateNoReservedNames(outDir);

console.log(`Extension build ready: ${outDir}`);
