# Handoff: Dual Export Strategy & Project Bundling

## Objective
To enable seamless project portability and Git-friendly collaboration for Cosmoboard. This implementation introduces a dual-track export system: single-file JSON patches for quick updates and comprehensive \.zip\ bundles for full project handoffs.

## Current Implementation

### 1. Dual Export tracks
- **Track A: Git-Friendly JSON (\.canvas.json\)**
  - **Purpose**: Rapid recommendations and text-based PR/Issue payloads.
  - **Mechanism**: New/unsaved images are embedded as **Base64** strings.
  - **Benefit**: Self-contained text files that are easy to diff in Git (as long as images aren't too large).
- **Track B: Portable Project Bundle (\.zip\)**
  - **Purpose**: Full project handoff, archiving, and compatibility with external tools (Obsidian, etc.).
  - **Mechanism**: Uses \flate\ to package the board JSON along with an \ssets/\ folder containing raw binary files.
  - **Benefit**: Optimized for performance and clean file structure.

### 2. Core Components
- **Dependency: \flate.min.js\**
  - **Location**: \JavaScript/vendor/fflate.min.js\
  - **Status**: Vendored locally for 100% offline support. High-performance, streaming-capable compression.
- **Export Modal UI**
  - **Location**: \cosmoboard.html\ (\id="braindump-export-modal"\)
  - **Features**: 
    - Toggle for "Include linked sub-pages".
    - Dynamic size estimation (calculates Base64 lengths and performs \HEAD\ requests for external URLs).
- **Logic Layer**
  - **Location**: \JavaScript/braindump.js\
  - **Functions**:
    - \exportProjectBundle(includeSubpages)\: Handles asset fetching, Base64-to-Uint8Array conversion, and ZIP generation.
    - \openLocalFile()\: Enhanced to detect \.zip\ files, unzip them, and map internal \ssets/\ to temporary **Blob URLs** for instant rendering.
    - Fallback handlers for browsers without the File System Access API.

## Usage Instructions

### Exporting a Bundle
1. Click the **Export** button in the toolbar.
2. Configure the bundle options (e.g., include sub-pages).
3. Review the size estimate.
4. Click **Export .zip** and choose a location.

### Importing a Bundle
1. Click the **Import** button or press **Ctrl+O**.
2. Select a \.zip\ file previously exported from Cosmoboard.
3. The board will load, and all bundled images will render using temporary Blob URLs.

## Pending Work / Future Steps
- **Server-Side Extraction Script**: A Node.js script (\
pm run extract-assets\) is documented in \holistic_planning.md\ but not yet implemented. It should be used to parse accepted recommendations and convert Base64 assets into binary files in the repository.
- **Recursive Sub-page Bundling**: Currently, sub-pages are fetched as individual files. Deep recursive bundling could be explored if project complexity grows.

## Related Documentation
- [holistic_planning.md](file:///c:/Users/evren/Documents/GitHub/proto_website/.agents/holistic_planning/holistic_planning.md)
- [holistic_tasks.md](file:///c:/Users/evren/Documents/GitHub/proto_website/.agents/holistic_planning/holistic_tasks.md)
