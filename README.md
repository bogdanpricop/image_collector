# Pro Image Collector (v8.0)

**Author:** Pricop Bogdan — bogdan.pricop@gmail.com

![Version](https://img.shields.io/badge/version-8.0-blue)
![Chrome](https://img.shields.io/badge/browser-chrome-red)
![License](https://img.shields.io/badge/license-MIT-green)

**Pro Image Collector** is an advanced Chrome extension for extracting, filtering, editing, and bulk-downloading images from any webpage.
Built for designers, developers, and OSINT researchers, it goes beyond simple downloading — offering analysis tools (Google Lens, TinEye), a full image editor, ZIP export, automatic conversion, and file organization.

![Main Screenshot](preview.png)
*(Note: main form only)*

---

## Features

### Powerful Extraction
* **Deep Scan:** Detects standard `<img>` tags, CSS background images (`background-image`), `srcset` attributes, and `<video poster>`.
* **Lazy Loading & Dynamic Content:** A MutationObserver automatically detects new images added dynamically to the page.
* **Smart Linking:** Detects whether an image is a link to a product/article page and provides a dedicated navigation button.

### Analysis & OSINT (Open Source Intelligence)
* **Google Lens Integration:** Reverse visual search directly from the popup to find similar products or translations.
* **TinEye Integration:** Verify the original source of an image or check copyright.
* **Smart Filters:** Advanced filtering by dimensions (width/height), file type (JPG, PNG, WebP, SVG, GIF), and text (search in URL or `alt` attribute).

### Built-in Image Editor
* **Crop:** Percentage-based edge cropping.
* **Resize:** Scale to any percentage.
* **Flip & Rotate:** Horizontal mirror and 90° rotation (applied to the actual canvas, not just CSS).
* **Noise:** Add random grain/noise.
* **Color Shift:** Adjust hue and saturation.
* **Obfuscate:** Subtle blur + sharpen to alter pixel data.
* **Re-JPEG:** JPEG recompression at configurable quality.
* **Magic Cascade:** One click applies all transformations in sequence.
* **Undo/Redo:** Stack of up to 20 states (Ctrl+Z).
* **Export Format:** Choose between PNG, JPG, or WebP for download.

### Flexible Download
* **Individual Download:** Download each image separately (classic mode).
* **ZIP Download:** Check "ZIP" to download all selected images in a single `.zip` file.
* **WebP to PNG Converter:** Automatic conversion on download for maximum compatibility.
* **Organization:** Save to dedicated subfolders and auto-rename files (e.g., `Vacation_001.jpg`).
* **Progress Bar:** Real-time progress bar with counter during download.

### Productivity
* **Drag Select:** Drag the mouse over the grid for quick selection (Ctrl+drag = toggle).
* **Keyboard Shortcuts:** `Ctrl+A` select all, `Ctrl+D` download, `Ctrl+Z` undo, `Esc` close editor.
* **Copy URL:** Copy an image URL to clipboard with a single click.
* **Grid Slider:** Adjust the number of columns (3–8) in the grid.
* **Persistent Settings:** Filters and preferences are saved automatically between sessions.

### Compact Interface
* Optimized design for Chrome's maximum allowed popup width (800px).
* Quick action bar on each thumbnail with tooltips.
* Real-time status bar (Found | Shown | Selected).
* Informative empty state when no images are found.
* Full keyboard accessibility with focus-visible styles.

---

## Installation

### From Chrome Web Store
1. Go to the extension page on the Chrome Web Store.
2. Click **"Add to Chrome"**.
3. Done!

### Developer Mode (Sideload)
1. **Download the code:** Clone this repository or download the ZIP archive and extract it.
2. **Open Chrome:** Navigate to `chrome://extensions/`.
3. **Enable Developer Mode:** Toggle the switch in the top-right corner.
4. **Load the extension:**
   * Click **"Load unpacked"**.
   * Select the folder containing the files (`manifest.json`, `popup.html`, etc.).
5. Done! The extension should appear in your toolbar.

---

## Usage Guide

### 1. Control Bar (Top)
* **Min Size:** Set minimum dimensions to exclude small icons (e.g., 50x50).
* **Types:** Check which formats you want to see (JPG, PNG, WebP, SVG, GIF).
* **WebP2PNG:** Check to automatically convert `.webp` images to `.png` on download.
* **Rescan (↻):** Press if you've scrolled on a dynamic page (e.g., Instagram) to find new images.

### 2. Filtering & Organization (Middle)
* **Filter:** Type a keyword (e.g., "shoe") to show only images containing that text in their name or description.
* **Folder:** Enter a folder name (e.g., `Projects/Design`) where images will be saved in Downloads.
* **Rename:** File prefix (e.g., `img` will generate `img_001.jpg`, `img_002.jpg`).

### 3. Download Options
* **Grid Slider:** Slide to adjust the number of columns (3–8).
* **ZIP:** Check to download all selected images as a single ZIP file.
* **Export Format:** Choose the export format for edited images (PNG/JPG/WebP).

### 4. Image Actions (Hover)
Hover over an image to reveal the action bar:
* **View:** Open full image in a new tab.
* **Link:** Go to the product page (if a link exists).
* **Lens:** Search with Google Lens.
* **TinEye:** Search with TinEye.
* **Copy URL:** Copy the image URL to clipboard.
* **Editor:** Open the image editor.

### 5. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+A` | Select / Deselect all visible images |
| `Ctrl+D` | Download selected images |
| `Ctrl+Z` | Undo in editor |
| `Esc` | Close editor |

---

## Project Structure

```text
/
├── manifest.json          # Extension configuration (Manifest V3)
├── popup.html             # User interface (UI)
├── popup.css              # Styles (extracted separately)
├── popup.js               # Main logic (filtering, download, editor, ZIP)
├── content.js             # Injected script for DOM extraction + MutationObserver
├── utils.js               # Pure utility functions (testable)
├── jszip.min.js           # JSZip library for ZIP downloads
├── PRIVACY.md             # Privacy policy
├── store-description.txt  # Chrome Web Store description
├── icon16.png             # Icon 16x16
├── icon48.png             # Icon 48x48
└── icon128.png            # Icon 128x128
```

---

## Permissions

| Permission | Why it's needed |
|---|---|
| `activeTab` | Scan the current tab for images |
| `scripting` | Inject the extraction content script |
| `downloads` | Save images to your computer |
| `storage` | Persist user preferences locally |

This extension does **NOT** collect, transmit, or store any personal data. All processing happens locally in your browser. See [PRIVACY.md](PRIVACY.md) for details.

---

## Changelog

### v8.0 (2026-04-01)
* **Major rewrite** with security fixes and new features
* Fix image deduplication (Set → Map)
* Fix XSS vulnerability (programmatic DOM construction)
* Fix real canvas rotation (not just CSS)
* Fix selectAll now respects all active filters
* Added ZIP download (JSZip)
* Added drag-to-select on grid
* Added MutationObserver for dynamic pages
* Added persistent settings (chrome.storage)
* Added keyboard shortcuts (Ctrl+A/D/Z, Esc)
* Added undo/redo in editor (20 states)
* Added copy URL, export format, grid slider
* Added download progress bar
* Added empty state, tooltips, accessibility (ARIA, focus styles)
* Extracted CSS into separate file
* Added explicit Content Security Policy
* Removed `host_permissions` (improved security)
* Support for srcset, video poster, GIF

### v7.1
* Image editor with Crop, Resize, Flip, Noise, Color, Obfuscate, Re-JPEG
* Magic Cascade
* Google Lens & TinEye integration
* WebP to PNG conversion

---

## License

MIT License — see the LICENSE file for details.

---

---

# README — Versiunea in limba romana

# Pro Image Collector (v8.0)

**Autor:** Pricop Bogdan — bogdan.pricop@gmail.com

![Version](https://img.shields.io/badge/version-8.0-blue)
![Chrome](https://img.shields.io/badge/browser-chrome-red)
![License](https://img.shields.io/badge/license-MIT-green)

**Pro Image Collector** este o extensie Chrome avansata pentru extragerea, filtrarea, editarea si descarcarea imaginilor in masa.
Gandita pentru designeri, dezvoltatori si cercetare OSINT, aceasta extensie merge dincolo de simpla descarcare, oferind instrumente de analiza (Google Lens, TinEye), editor de imagini complet, descarcare ZIP, conversie automata si organizare a fisierelor.

![Screenshot Principal](preview.png)
*(Nota: doar main form)*

---

## Functionalitati Cheie

### Extragere Puternica
* **Deep Scan:** Detecteaza imagini standard `<img>`, imagini de fundal CSS (`background-image`), `srcset` si `<video poster>`.
* **Lazy Loading & Dynamic Content:** MutationObserver detecteaza automat imagini noi adaugate dinamic pe pagina.
* **Smart Linking:** Detecteaza daca o imagine este un link catre un produs/articol si ofera un buton dedicat pentru navigare.

### Analiza & OSINT (Open Source Intelligence)
* **Google Lens Integration:** Cautare vizuala inversa direct din popup pentru a gasi produse similare sau traduceri.
* **TinEye Integration:** Verifica sursa originala a imaginii sau drepturile de autor.
* **Smart Filters:** Filtrare avansata dupa dimensiuni (latime/inaltime), tip fisier (JPG, PNG, WebP, SVG, GIF) si text (cautare in URL sau atributul `alt`).

### Editor de Imagini Integrat
* **Crop:** Decupare procentuala a marginilor.
* **Resize:** Scalare la orice procent.
* **Flip & Rotate:** Oglindire orizontala si rotire 90° (se aplica real pe canvas, nu doar vizual).
* **Noise:** Adauga grain/zgomot aleatoriu.
* **Color Shift:** Modifica nuanta si saturatia.
* **Obfuscate:** Blur subtil + sharpen pentru alterarea pixelilor.
* **Re-JPEG:** Recompresie JPEG la calitate configurabila.
* **Magic Cascade:** Un singur click aplica toate transformarile in secventa.
* **Undo/Redo:** Stack de pana la 20 stari (Ctrl+Z).
* **Export Format:** Alege intre PNG, JPG sau WebP la descarcare.

### Descarcare Flexibila
* **Download Individual:** Descarca fiecare imagine separat (modul clasic).
* **Download ZIP:** Bifeaza "ZIP" pentru a descarca toate imaginile selectate intr-un singur fisier `.zip`.
* **WebP to PNG Converter:** Conversie automata la descarcare pentru compatibilitate maxima.
* **Organizare:** Salvare in sub-foldere dedicate si redenumire automata a fisierelor (ex: `Vacanta_001.jpg`).
* **Progress Bar:** Bara de progres reala cu contor la descarcare.

### Productivitate
* **Drag Select:** Trage mouse-ul peste grid pentru selectie rapida (Ctrl+drag = toggle).
* **Keyboard Shortcuts:** `Ctrl+A` select all, `Ctrl+D` download, `Ctrl+Z` undo, `Esc` close editor.
* **Copy URL:** Copiaza URL-ul imaginii in clipboard dintr-un singur click.
* **Grid Slider:** Ajusteaza numarul de coloane (3-8) din grid.
* **Setari Persistente:** Filtrele si preferintele se salveaza automat intre sesiuni.

### Interfata Compacta
* Design optimizat pentru latimea maxima permisa de Chrome (800px).
* Bara de actiuni rapida (Action Bar) pe fiecare thumbnail cu tooltips.
* Bara de status in timp real (Found | Shown | Selected).
* Empty state cu mesaj informativ cand nu sunt imagini.
* Accesibilitate completa cu stiluri focus-visible si atribute ARIA.

---

## Instalare

### Din Chrome Web Store
1. Mergi la pagina extensiei pe Chrome Web Store.
2. Apasa **"Add to Chrome"**.
3. Gata!

### Developer Mode (Sideload)
1. **Descarca codul:** Cloneaza acest repository sau descarca arhiva ZIP si dezarhiveaz-o.
2. **Deschide Chrome:** Mergi la adresa `chrome://extensions/`.
3. **Activeaza Developer Mode:** Bifeaza comutatorul din coltul dreapta-sus ("Developer mode").
4. **Incarca extensia:**
   * Apasa butonul **"Load unpacked"**.
   * Selecteaza folderul unde ai fisierele (`manifest.json`, `popup.html`, etc.).
5. Gata! Extensia ar trebui sa apara in bara ta de instrumente.

---

## Ghid de Utilizare

### 1. Bara de Control (Sus)
* **Min Size:** Seteaza dimensiunile minime pentru a exclude iconitele mici (ex: 50x50).
* **Tipuri:** Bifeaza ce formate vrei sa vezi (JPG, PNG, WebP, SVG, GIF).
* **WebP2PNG:** Bifeaza pentru a converti automat imaginile `.webp` in `.png` la descarcare.
* **Rescan:** Apasa daca ai dat scroll pe o pagina dinamica (ex: Instagram) pentru a gasi imagini noi.

### 2. Filtrare & Organizare (Mijloc)
* **Filter:** Scrie un cuvant (ex: "pantof") pentru a afisa doar imaginile care contin acel text in nume sau descriere.
* **Folder:** Scrie numele folderului (ex: `Proiecte/Design`) unde vrei sa se salveze imaginile in Downloads.
* **Rename:** Prefix pentru fisiere (ex: `img` va genera `img_001.jpg`, `img_002.jpg`).

### 3. Optiuni de Descarcare
* **Grid Slider:** Gliseaza pentru a ajusta numarul de coloane (3-8).
* **ZIP:** Bifeaza pentru a descarca toate imaginile selectate ca un singur fisier ZIP.
* **Export Format:** Alege formatul de export pentru imaginile editate (PNG/JPG/WebP).

### 4. Actiuni pe Imagine (Hover)
Cand treci cu mouse-ul peste o imagine, apare bara de actiuni:
* **View:** Deschide imaginea in tab nou.
* **Link:** Merge la pagina produsului (daca exista link).
* **Lens:** Cauta cu Google Lens.
* **TinEye:** Cauta cu TinEye.
* **Copy URL:** Copiaza URL-ul imaginii.
* **Editor:** Deschide editorul de imagini.

### 5. Scurtaturi de Tastatura

| Scurtatura | Actiune |
|---|---|
| `Ctrl+A` | Selecteaza / Deselecteaza toate imaginile vizibile |
| `Ctrl+D` | Descarca imaginile selectate |
| `Ctrl+Z` | Undo in editor |
| `Esc` | Inchide editorul |

---

## Permisiuni

| Permisiune | De ce e necesara |
|---|---|
| `activeTab` | Scaneaza tab-ul curent pentru imagini |
| `scripting` | Injecteaza content script-ul de extragere |
| `downloads` | Salveaza imaginile pe calculator |
| `storage` | Persista preferintele utilizatorului local |

Extensia **NU** colecteaza, transmite sau stocheaza date personale. Toate operatiunile au loc local in browser. Vezi [PRIVACY.md](PRIVACY.md) pentru detalii.

---

## Licenta

MIT License — vezi fisierul LICENSE pentru detalii.
