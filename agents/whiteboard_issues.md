# Whiteboard (Braindump) Known Issues & Backlog

This document tracks known issues, technical debt, and future improvements for the Braindump whiteboard feature.

prioritize top to bottom.

(Fixed_ISSUE)-There is a gray bar on the rightmost side of the window. Is from the scroll bar. Can you fit it so the whiteboard is there until the right side. On the pages where there is scrollable content it can stay there but not necessary to have on the whiteboard.

(Fixed_ISSUE)-When in pan mode it still drags components around. Even if im clicking on a component with pan mode it should just pan. panning tool can move elements. No it shouldn't be able to move elements its only for being able to move around


(Fixed_ISSUE)-Drag and select and regular works well on al components but not the but on text boxes it doesn't work if i click once inside the box. Probably tied to double click edit text behavior. Fix this

(Fixed_ISSUE)-I can single select and drag select drawings but their exterior bounding box doesn't highlight. It sohuld highligh and also sometimes the exterior bounding box of drawings are larger than the actual drawing. fix this

(Fixed_ISSUE)-Right click should behave the same as middle mousing click to be able to pan around. It shouldn't pull out the context menu.

(Fixed_ISSUE)-pinch zoom on windows still too slow. Regular scroll zoom is perfect. Make pinch zoom x8 faster on mousepad

(Fixed_ISSUE)- when I move around when in pen mode either middle or right click the pointer icon changes and doesn't return to the pen icon plus. Also pen icon should be a circle not a cross. Also if I do drag around with space when pen tool is selected pointer returns to the standard pointer and not the pen pointer

(Fixed_ISSUE)- When drawing the drawing is under all other elements. As soon as i stop dropping it jumps above. Drawing should stay above

(Fixed_ISSUE)- Make a plan for, ctrl+z , ctrl+shift+z, ctrl+x , It should work for all elements. And be able to go back and forth in the same session. Even after a save I should be able to go back and forth but ideally the data is not baked into an exported .canvas file. (the plan is at implementation plan.md)

(Fixed_ISSUE)- exporting .canvas doesn't work on chrome browser

(Fixed_ISSUE)- when the text tool is selected clicking doesn't crate an empty text box

(Fixed_ISSUE)- when I zoom in text and images are blurry. Why is that

(Fixed_ISSUE)- When I drah a photo if I clicked on the photo it doesn't move it around but it acts as if its dragging the image to drag and drop. That should be fixed

(Fixed_ISSUE)- when I zoom pen pointer should match the size of the drawn line. When I zoom out the circle is still very big.

- **DOM Bottleneck**: Currently, every drawing stroke, image, and text block is rendered as a distinct HTML DOM element (absolute-positioned `div`s with `svg` paths inside). While the distance throttling protects from instant crashes, drawing thousands of complex scribbles will inevitably lag the browser's DOM renderer. Future migration should consider standardizing these elements into an actively rendered `<canvas>` HTML node if scale increases radically.

- **Save Integrity**: Progress is currently saved locally. The "direct save to repository via dev-server" is excellent for localhost editing, but external users will only be able to rely on their browser's `localStorage` unless a dedicated backend database is wired.

- **Open Graph Limit**: Pasted links fetch their preview thumbnail, title, and description via the free unauthenticated API proxy `https://api.microlink.io`. If this public proxy experiences rate limiting or outages, pasted links will silently default to the backup blank interface.

- **Multi-select Tool**: Box-drawing selection does not visibly select images and text boxes until the selection box explicitly "touches" or encompasses them. The visual feedback for multi-selected elements could be more robust.

- **Deep Zoom Distortions**: While pinch-to-zoom is exponentially anchored against scroll values, extreme zooming (+5000% scale) could eventually break text rendering bounds since CSS `contenteditable` objects don't always natively scale their internal cursors pixel-perfectly when wrapped in heavy transform matrices.

- **Mobile Safari Nav Bar**: Some mobile browsers with dynamic address bars might temporarily shift the viewport's `100vh` boundaries, causing the lower toolbar to shift slightly when users scroll.

- **Keyboard Overlap**: Invoking the text editor on mobile opens the soft keyboard, which might push the entire canvas up and temporarily misalign drawing strokes.

- **Missing Loading States**: Paginating large images or lagging Microlink fetches do not display a "loading spinner" internally, so users might assume a pasted link or massive image broke until it suddenly spawns in.




-When you want to move an image click and drag works as if you are moving the image but not the element. Make it so the imag can't be held on its own with a click and drag and that the element will move!
