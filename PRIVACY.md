# Privacy Policy - Pro Image Collector

**Last updated:** April 2026

## Data Collection
Pro Image Collector does **NOT** collect, store, transmit, or share any personal data, browsing history, or user information.

## What the extension accesses
- **Active tab content:** The extension scans the currently active tab's DOM to find images. This happens locally in your browser and no data is sent to any external server.
- **Local storage:** User preferences (filter settings, grid size) are stored locally using Chrome's `storage.local` API. This data never leaves your device.

## Permissions explained
- **activeTab:** Required to scan the current page for images.
- **scripting:** Required to inject the content script that extracts image information from pages.
- **downloads:** Required to save images to your computer.
- **storage:** Required to persist your filter preferences locally.

## Third-party services
The extension provides buttons to open images in Google Lens and TinEye for reverse image search. These are opened in new tabs — the extension does not send data to these services directly; it only constructs a URL that you navigate to.

## Contact
For questions about this privacy policy, contact: bogdan.pricop@gmail.com
