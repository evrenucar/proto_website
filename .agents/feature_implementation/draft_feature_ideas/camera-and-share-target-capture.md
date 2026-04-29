# Camera And Share Target Capture

## Problem / Why
The fastest path to a new card on mobile is a photo of a whiteboard, a book page, or a sketch. Today users have to leave the app, open the camera, save, then come back and upload. A direct camera input plus a PWA share target collapses that into one tap, and it stays fully local since the file lands straight in the user's vault.

## Sketch
- Add an `input[type=file] accept="image/*" capture="environment"` behind a camera button on mobile. On desktop the same button opens a normal file picker, no special casing needed.
- Ship a minimal `manifest.webmanifest` with a `share_target` entry so the OS share sheet can hand images and links to the app. Files arrive at a known route, get staged as new cards on the active board, and saved to the filesystem.
- Keep everything in scope of the existing local first storage. No upload, no server. The share target route is a pure client side handler.
- After capture, drop the image as a preview first embed at the tap point on the canvas, with a quick crop and rotate affordance available on long press.
- For Android Chrome and iOS 16.4 plus, this works as installed PWA. On older iOS the camera input still works, only the share target is gated.

## Notes
- Precedents: Obsidian mobile share sheet, Bear share extension, Google Keep camera button.
- Could pair nicely with the existing `photo-cropping` draft. Capture feeds it, cropping refines it.
- Open question: where do shared links go. Probably a default inbox board per vault, configurable later.
