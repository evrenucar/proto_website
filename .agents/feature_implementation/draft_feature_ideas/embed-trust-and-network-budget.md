# Embed Trust And Network Budget

## Problem / Why
Once a board can hold dozens of unfurls, live iframes, saved sessions, and value pins, two problems show up at once. First, security: which embeds are allowed to talk to the network and run scripts. Second, performance: opening a heavy board should not fire fifty requests on load. A single trust and budget layer keeps preview-first honest.

## Sketch
- Every embed declares a kind: `frozen` (no network, no scripts, render from cache only), `preview` (one fetch on first view, then frozen), `live` (full iframe with explicit permissions). Default is `preview`.
- Per-domain trust list in vault config. Untrusted domains are forced down to `frozen` regardless of what the embed asks for, with a clear "click to trust this domain" affordance.
- Network budget per board: max N concurrent fetches and max M total per minute. Embeds beyond the budget stay in preview-from-cache and queue up. The sidebar shows a small budget meter while a board loads.
- Click-to-activate is the universal upgrade path. Every frozen or preview embed has the same affordance to go live, and going live always asks once per session for permission if the domain is not on the trust list.
- An "audit this board" view lists every embed, its kind, its domain, and its last fetch, so the user can see at a glance what their board is actually doing.

## Notes
- Precedents: browser permission prompts, Content Security Policy, GitHub's "show rendered" toggle for untrusted HTML, Notion's "load embed" placeholder for heavy blocks.
- Touches: embed renderer wrapper, vault config schema, a small fetch coordinator, and the sidebar UI for the audit view.
- Open question: do we expose the trust list as a plain text file the user can hand-edit, which fits local-first, or hide it behind a settings UI only. Probably both.
