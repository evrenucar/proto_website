# Soft Keyboard Aware Editor

## Problem / Why
On phones, when the soft keyboard opens it covers the bottom of the screen and often hides the very text being edited. The default behavior of pinching the canvas plus the keyboard popping up makes editing markdown cards unusable on mobile, which kills the whole "write anywhere" promise.

## Sketch
- Use the `VisualViewport` API to subscribe to keyboard show and hide. Adjust a CSS variable `--kb-inset` and apply it as bottom padding on the editing surface, plus shift the active card into view with `scrollIntoView({ block: 'center' })`.
- Detect keyboard open via the gap between `window.innerHeight` and `visualViewport.height`. Gracefully no op on browsers without VisualViewport.
- Pin the formatting toolbar above the keyboard, not at the screen top, so common actions like bold, link, and toggle list are reachable with one thumb.
- When the user taps off, restore the previous canvas viewport so the world does not feel like it shifted under them.
- Preserve caret position across keyboard show and hide events, including IME composition for languages like Japanese and Turkish.

## Notes
- Precedents: iA Writer mobile, Bear, Notion. Notion handles this well, iOS Safari is the toughest target.
- Code areas: the markdown editor component, app shell padding, possibly a small `useKeyboardInset` hook.
- Open question: do we want the canvas itself to zoom to the active card, or just scroll. Zoom is showier but can disorient. Scroll plus a subtle highlight is probably enough.
