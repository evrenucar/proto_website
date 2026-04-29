# Lazy Hydration for Nested Boards

## Problem / Why
A page with multiple nested `.canvas` boards parses and lays out every board on load, even ones that are scrolled offscreen or collapsed. On a cold cache this is the slowest part of opening a dense page, and on mobile it stalls first paint.

## Sketch
- At page render, emit each nested board as a lightweight placeholder with known width and height, plus a `data-canvas-src` attribute. Do not parse the canvas JSON yet.
- Use an `IntersectionObserver` with a generous root margin (for example 200 px) to fetch and hydrate the board only when it nears the viewport. Collapsed boards stay placeholders until expanded.
- Cache parsed canvas state per src in a small in-memory LRU so scroll-back does not re-parse. On navigation away, drop the cache.
- For SSR or static export, ship the placeholder dimensions in the HTML so layout does not jump when hydration completes. This keeps CLS near zero.
- Add a `?eager=1` query flag for printing or for crawlers that need everything resolved up front.

## Notes
- Same pattern Notion uses for embedded blocks and that Obsidian uses for embedded canvases in preview.
- Open question: how do we handle search across un-hydrated boards? Likely a separate static index built at save time, not a runtime scan.
- Touches: the canvas embed component, the page renderer, and the build step that emits placeholders.
