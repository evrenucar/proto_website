# Live Value Pins From Pages

## Problem / Why
Sometimes you do not want a full unfurl, you want one number or one line from a page. A price, a build status, a follower count, a sensor reading. Today people screenshot it and it is dead the moment they paste. A small, named "live value pin" lets a board feel slightly alive without becoming a dashboard app.

## Sketch
- A pin is defined by a URL plus a CSS or XPath selector plus an optional regex. The user can pick the selector visually by opening the page in a click-to-activate live iframe and clicking the element.
- Render as an inline chip in markdown or a tiny canvas node. Shows the captured value, the source favicon, and last-fetched time. Looks like a teal-accented inline tag.
- Refresh policy is per-pin: `manual`, `on-open`, `every Nh`. The vault has a default. A static export bakes in the last known value and a "captured on" timestamp.
- Offline fallback shows the last value with a dimmed style. A failed fetch never blanks the chip, it just adds a small warning glyph.
- Permissions: pins from a domain need one-time approval. A trust list lives in vault config. Domains outside the list show as "not yet allowed, click to approve".

## Notes
- Precedents: IFTTT and Zapier "scrape" actions, Obsidian Dataview inline fields, Notion's synced databases, browser bookmarklet selectors. The local-first twist is that the pin definition and last value are both plain text in the vault.
- Touches: a tiny scraping worker (could be a service worker for the web build, a node helper for desktop), markdown inline syntax, canvas node type, and a selector-picker overlay for the live iframe.
- Open question: how to handle login-walled pages without becoming a credentials manager. Probably out of scope, document the limitation.
