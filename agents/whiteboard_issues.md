# Whiteboard (Braindump) Known Issues & Backlog

This document tracks known issues, technical debt, and future improvements for the Braindump whiteboard feature.

prioritize top to bottom.

- currently the moving around doesn't work. Middle mouse or clicking on the whiteboard while I have the hand tool selected or space   

- **DOM Bottleneck**: Currently, every drawing stroke, image, and text block is rendered as a distinct HTML DOM element (absolute-positioned `div`s with `svg` paths inside). While the distance throttling protects from instant crashes, drawing thousands of complex scribbles will inevitably lag the browser's DOM renderer. Future migration should consider standardizing these elements into an actively rendered `<canvas>` HTML node if scale increases radically.

- **Save Integrity**: Progress is currently saved locally. The "direct save to repository via dev-server" is excellent for localhost editing, but external users will only be able to rely on their browser's `localStorage` unless a dedicated backend database is wired.

- **Open Graph Limit**: Pasted links fetch their preview thumbnail, title, and description via the free unauthenticated API proxy `https://api.microlink.io`. If this public proxy experiences rate limiting or outages, pasted links will silently default to the backup blank interface.

- **Multi-select Tool**: Box-drawing selection does not visibly select images and text boxes until the selection box explicitly "touches" or encompasses them. The visual feedback for multi-selected elements could be more robust.

- **Deep Zoom Distortions**: While pinch-to-zoom is exponentially anchored against scroll values, extreme zooming (+5000% scale) could eventually break text rendering bounds since CSS `contenteditable` objects don't always natively scale their internal cursors pixel-perfectly when wrapped in heavy transform matrices.

- **Mobile Safari Nav Bar**: Some mobile browsers with dynamic address bars might temporarily shift the viewport's `100vh` boundaries, causing the lower toolbar to shift slightly when users scroll.

- **Keyboard Overlap**: Invoking the text editor on mobile opens the soft keyboard, which might push the entire canvas up and temporarily misalign drawing strokes.

- **Missing Loading States**: Paginating large images or lagging Microlink fetches do not display a "loading spinner" internally, so users might assume a pasted link or massive image broke until it suddenly spawns in.

- panning tool can move elements. No it shouldn't be able to move elements its only for being able to move around

-pinch zoom still too slow. Regular scroll zoom is perfect. Make pinch zoom x4 faster

-When you want to move an image click and drag works as if you are moving the image but not the element. Make it so the imag can't be held on its own with a click and drag and that the element will move!
