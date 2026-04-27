# Security Review — `new_features_expension` branch

**Date:** 2026-04-26T22:49:37Z
**Branch:** new_features_expension
**Reviewer:** /security-review (Claude Opus 4.7)
**Base:** main

Three findings, all in the local preview/dev server surface area newly added on this branch.

---

## Vuln 1: SSRF — `scripts/preview-server.mjs:226-256` (route registered at 324-327)

* **Severity:** HIGH
* **Category:** ssrf
* **Confidence:** 9/10
* **Description:** The new `/api/get-video-meta` handler reads `url` from the query string with only a presence check, then calls `https.get(videoUrl, …)` directly. There is no scheme allow-list, no host allow-list, and no private-IP / DNS-rebinding protection. The redirect handler recursively re-invokes the function on the `Location:` header without depth limiting or destination revalidation. The server also binds to `0.0.0.0` (line 367), so the endpoint is reachable from the LAN as well as from any cross-origin page the developer visits (a query-string GET is a CORS "simple" request and the response status / parsed `og:video:*` metadata are observable, distinguishing reachable vs unreachable internal hosts).
* **Exploit Scenario:** A malicious page the developer visits — or any host on the developer's LAN — issues `GET http://<dev-host>:4173/api/get-video-meta?url=https://internal.corp.local/admin` (or any HTTPS service reachable from the developer's machine: intranet apps, internal CI/CD, cloud admin panels). The server fetches up to ~50 KB of the response. Open-redirect chains via `Location:` can pivot deeper. Internal-host probing is observable through response status leakage.
* **Recommendation:** (a) Allow-list hosts (e.g., only `youtube.com`, `youtu.be`, `i.ytimg.com`); (b) explicitly require `https:` after parsing with `new URL(...)`; (c) resolve DNS and refuse private IPv4/IPv6 ranges, then pin the connection to the resolved IP to defeat DNS rebinding; (d) cap redirect depth and re-validate each `Location:` against the allow-list; (e) bind the preview server to `127.0.0.1` by default — make `0.0.0.0` opt-in.

---

## Vuln 2: CSRF / arbitrary board-content write — `scripts/preview-server.mjs:69-97` (`handleSaveBoard`) and `146-189` (`handleSaveMarkdown`), routed at 309-317

* **Severity:** HIGH
* **Category:** csrf / arbitrary-file-write
* **Confidence:** 8/10
* **Description:** Both new write endpoints accept POSTed JSON without (a) any `Origin`/`Referer` validation, (b) any auth or CSRF token, (c) any `Content-Type` enforcement (the body is parsed as JSON regardless of header), and (d) any preflight-forcing condition. A browser `fetch(..., { method:'POST', body: JSON.stringify(...) })` defaults to `Content-Type: text/plain`, qualifying as a CORS simple request — no preflight is sent and the side-effect (file write) lands even though the response body is unreadable to the attacker. Combined with the `0.0.0.0` bind, both cross-site CSRF and direct LAN POSTs work. Path sanitization correctly bounds writes to `content/boards/<slug>/*.{canvas,md}`, so the title's "write-anything" is overstated — but writes to committed repo paths under a well-known directory are still privileged.
* **Exploit Scenario:** Developer is running `preview-server.mjs` and visits any other webpage in the same browser. That page runs `fetch('http://127.0.0.1:4173/api/save-board?slug=braindump', { method:'POST', body: JSON.stringify({nodes:[…attacker-crafted node…]})})`. The server overwrites the board file. When the developer next opens that board, the existing unescaped-`innerHTML` interpolation inside the bookmark/link renderer, plus the new markdown line renderer (Vuln 3), turns this into stored XSS in the dev-server origin — which can then re-invoke the same write endpoints to persist further changes. Even without the XSS chain, the developer's working tree is silently corrupted with attacker-controlled JSON that may then be committed and published.
* **Recommendation:** (a) Reject requests whose `Origin`/`Referer` does not match the server's own origin; (b) require `Content-Type: application/json` (this forces a CORS preflight that will fail without explicit allow headers); (c) bind to `127.0.0.1` by default and make `0.0.0.0` an explicit opt-in; (d) optionally add a per-process random shared secret in a header for write endpoints.

---

## Vuln 3: XSS in new per-line markdown renderer — `JavaScript/braindump.js:3770-3801` (`renderMarkdownLineToHtml`), sinks at lines 3844 and 3853

* **Severity:** MEDIUM (HIGH if combined with Vuln 2)
* **Category:** xss
* **Confidence:** 8/10
* **Description:** `renderMarkdownLineToHtml` is new on this branch (no equivalent on `main`). Its `escapeAndInline` chain runs HTML-escaping for `&`/`<`/`>` first, then performs the Markdown-link substitution with regex `/\[([^\]]+)\]\(([^)]+)\)/g` and replacement `'<a href="$2" target="_blank" rel="noreferrer">$1</a>'`. The URL group `$2` is interpolated raw into an HTML attribute: it is neither attribute-escaped (no `"` → `&quot;`) nor scheme-validated. The result is assigned via `lineEl.innerHTML = …` at lines 3844 and 3853.
* **Exploit Scenario:** Combined with Vuln 2 (unauthenticated `/api/save-markdown`), an attacker plants a `.md` file containing `[click](javascript:alert(document.domain))` or attribute-breakout payloads such as `[x](" onclick="alert(1))` (which yields `<a href="" onclick="alert(1)" target="_blank" rel="noreferrer">x</a>` — fires on click) or `[x](http://e/" onmouseover="alert(1))` (fires on hover). When the developer opens that note in the braindump editor, the line renderer inserts the HTML and a single user interaction executes JS in the dev-server origin. From there the attacker can read other site state, re-invoke save endpoints to drop further `.md`/`.canvas` files, etc. The same path is reachable via a poisoned `.md` in a PR that any reviewer opens locally. `target="_blank" rel="noreferrer"` does not prevent JS execution.
* **Recommendation:** In the link replacement, validate the URL scheme (allow only `http:`, `https:`, `mailto:`, and relative paths) and HTML-attribute-escape the href value (`"` → `&quot;`, `&` → `&amp;`, etc.). Also HTML-escape the link label `$1` after inline tokens are resolved. Apply the same fix to the legacy `parseMarkdownToHtml.inlineMarkup` for consistency.
