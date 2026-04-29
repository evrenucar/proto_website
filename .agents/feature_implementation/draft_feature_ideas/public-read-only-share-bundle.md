# Public Read-Only Share Bundle

## Problem / Why
"Give me a link I can share" is the highest-leverage portability ask, and we want to answer it without running a backend. If we can produce a tiny static site that renders one board read-only, the user can drop it on GitHub Pages, Netlify, or even a USB stick and the experience is identical.

## Sketch
- Reuse the ZIP bundle export, then add a stripped-down viewer build of the renderer (no editor, no sidebar tree, no file write paths).
- Output a folder containing `index.html`, a single bundled JS chunk, the `board.canvas`, and the referenced assets, all paths relative.
- The viewer supports pan, zoom, nested-board navigation, and "copy as markdown" on selection. No edits, no cursor.
- Provide a "Publish to GitHub Pages" helper that stages the folder into a `gh-pages` orphan branch via the user's existing git, but never auto-pushes.
- Optionally embed a content hash in the filename of the JS chunk so the published site cache-busts cleanly on updates.

## Notes
- Aligns with the static-host compatible product direction and the portfolio site's own deployment pattern.
- Touch points: viewer-only build target, router (no edit routes), bundle export pipeline.
- Open question: do we ship a "view in Cosmoboard" button on the published page that re-imports the bundle when clicked. Probably yes, links to the bundle ZIP.
