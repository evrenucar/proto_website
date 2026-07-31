# VNC sessions and iframe-refusing sites: what it takes

Written 2026-07-30 for the two research cards. Both questions are really one question: how much
of the outside world can live inside a board page, and where the browser's walls actually are.

## VNC in a board

Browsers cannot open raw TCP, and classic VNC (RFB) is raw TCP. Every browser VNC story is
therefore RFB-over-WebSocket, and the only question is who does the translation:

- **websockify / a bridge process**: what stock noVNC setups use. Works, but it is exactly the
  extra desktop-side server you said you do not want.
- **VNC servers that speak WebSockets natively** (no bridge): x11vnc, libvncserver-based servers,
  TigerVNC built with websocket support, and above all **KasmVNC**, which is web-native end to
  end and serves its own client. With one of these, the desktop side is just the VNC server
  itself; nothing else to install.

**Minimum path that works today, zero runtime changes:** run KasmVNC (or x11vnc with its web
client) on the machine you want to reach, and put its URL in a live-embed link node. The session
renders inside the board like any embed.

**The proper v2:** vendor noVNC's JS client (like fflate is vendored) and add a `vnc` node type
whose config is a `wss://host:port` target, connecting in-board without the server's own web
page. Worth doing when a real VNC workflow exists; it is a bounded, dependency-light addition.

## Sites that refuse iframes

`X-Frame-Options` / CSP `frame-ancestors` are enforced by the visitor's browser, and the site,
not us, chooses them. The options, honestly weighed:

- **Fallback cards (do now):** detect the refused embed and render the existing bookmark-preview
  card (title, image, link-out) instead of a grey box. No policy problems, works on the static
  site, and most "I just want to see it on the board" cases are served by a preview plus a click.
- **Header-stripping proxy (do not build):** works only through our server, breaks logins because
  the proxy owns the cookies, is against many sites' terms, and becomes a maintenance tarpit.
  Wrong foundation for a local-first tool.
- **A browser extension (optional dev tool):** a small extension can relax frame headers for your
  own browser only. Reasonable opt-in power-user add-on; never a requirement.
- **A desktop shell (the real answer, later):** Electron/Tauri webviews are not subject to
  X-Frame-Options, so a Cosmoboard desktop app embeds anything, plus real terminals and file
  access. This is exactly Stage 3 (application and session hosting) of
  `COSMOBOARD_MIGRATION.md`, and the honest moment to "jump ship" from browser-only. A full
  Gecko browser or OS remains Stage 5; nothing today needs it.

**Recommendation:** ship fallback cards now; treat VNC via KasmVNC-in-an-embed as available
today; put the desktop shell question where it already lives, the migration plan's Stage 3, and
decide it as a direction call rather than a workaround.
