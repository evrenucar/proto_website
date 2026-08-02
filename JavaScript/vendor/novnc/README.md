# noVNC, vendored

noVNC 1.7.0, taken from the `@novnc/novnc` npm package (`core/` and `vendor/` verbatim, plus
`LICENSE.txt` and `AUTHORS`). MPL-2.0.

The board's `vnc` node loads `core/rfb.js` with a dynamic `import()` the first time a session
connects, so a board with no VNC node pays nothing for it.

Vendored rather than depended on for the same reason `fflate.min.js` is: the site is a static
build with no bundler, and a board should keep working from a folder without an install step.

To update: `npm pack @novnc/novnc`, unpack, and replace `core/` and `vendor/` wholesale. Nothing
here is patched, so a straight replacement is safe. Check `tests/board/vnc-node.test.mjs`
afterwards; it drives a real RFB handshake against a mock server and will catch a break.
