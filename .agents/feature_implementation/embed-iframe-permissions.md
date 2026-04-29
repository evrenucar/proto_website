# Embed Iframe Permissions

Status: Deferred. Permissions are currently disabled on embed iframes. This spec captures what to do if/when we want to safely re-enable them.

## Why this exists

The canvas embeds arbitrary user-supplied URLs in an iframe (`bd-embed-iframe` in `JavaScript/braindump.js`). Previously the iframe carried:

```
allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
```

That delegated browser permissions to whatever site the user pasted, which caused the canvas page to surface permission prompts (clipboard, sensors, etc.) on behalf of third-party content. The user flagged this as a security concern: paste any URL, get the host's permission prompts, with no per-embed scoping or trust signal.

The `allow=` attribute has been stripped. Embeds still load (sandboxed), still go fullscreen, and still allow user-gesture autoplay. DRM-protected media (`encrypted-media`), motion sensors, picture-in-picture, web-share, and programmatic clipboard writes from inside embeds will not work until this is reintroduced.

## 1. Feature Detail

### Purpose

Allow embedded sites to use a curated set of browser capabilities, scoped per-embed, so the canvas does not unconditionally delegate permissions to arbitrary third-party URLs.

### Required behavior before re-enabling

- **Per-embed allow-list, not blanket.** A pasted URL should not silently inherit the same permissions as a hand-trusted embed. Trust must be opt-in.
- **Visible trust signal.** The embed UI should show which capabilities it is granting, and the user must be able to revoke them.
- **Default deny.** New embeds start with `allow=""`. Capabilities are added explicitly.
- **No prompts for unsupported capabilities.** If the host page does not actually use a capability, it should not appear in `allow=`.

### Capability shortlist (in order of likely demand)

| Capability | Why an embed might need it | Risk if granted blanket |
| --- | --- | --- |
| `autoplay` | YouTube and similar video embeds autoplay on user gesture | Low. No prompt by itself. |
| `encrypted-media` | DRM-protected video playback (some YouTube/Vimeo content) | Low. No prompt by itself. |
| `fullscreen` | Already covered by `allowfullscreen`. Keep as-is. | Low. |
| `picture-in-picture` | Floating video on top of the canvas | Low. |
| `clipboard-write` | Some embeds want to write to clipboard | Medium. Can prompt. |
| `accelerometer`, `gyroscope` | 3D viewers, AR demos | Medium. Mobile prompts. |
| `web-share` | "Share" button inside embed | Low. |
| `microphone`, `camera`, `geolocation` | Not needed today; do not add without an explicit feature ask | High. Always prompts. |

### Acceptance criteria

- A new embed pasted into the canvas does not trigger any browser permission prompt on load.
- An embed marked as "trusted" (mechanism TBD) can opt into a documented subset of capabilities.
- Toggling trust off for an embed reverts its iframe to `allow=""` without reload-from-network if possible.
- Tests confirm no permission prompts fire for an untrusted embed.

## 2. MVP Scope

In scope:

- Per-embed `trust` flag on the node object (default `false`).
- When `trust === true`, the embed iframe re-emits an `allow=` string built from a fixed allow-list (`autoplay; encrypted-media; picture-in-picture` to start, the lowest-prompt set).
- UI affordance to flip the flag from inside the embed header, with a label that names the capabilities being granted.

Out of scope (deferred):

- Per-capability granularity (granting only `autoplay` but not `picture-in-picture`).
- Per-origin policy (auto-trust `youtube.com`).
- Storing the trust flag separately from the canvas file (privacy review).

## 3. Todos

- [ ] Add `trust: false` default on embed nodes; persist across save/load.
- [ ] Build `allow=` string from `trust` + a constant `EMBED_TRUSTED_CAPABILITIES` array.
- [ ] Render trust toggle in `bd-embed-header`. Label = "Allow extras" with a tooltip listing the capabilities.
- [ ] On toggle, re-render the iframe shell so the new `allow=` takes effect (iframe `allow=` cannot be changed after load).
- [ ] Test: untrusted embed has no `allow=` attribute and triggers no permission prompt.
- [ ] Test: trusted embed has the expected `allow=` string and survives save/load.

## 4. Tests

- `tests/board/embed-iframe-no-permissions-on-load.test.mjs` — Pure runtime/DOM assertion. Render an embed node, snapshot the iframe attributes, assert `allow` is empty.
- `tests/board/embed-iframe-trust-toggle.test.mjs` — Toggle `trust` on a node, assert the rendered iframe `allow=` matches `EMBED_TRUSTED_CAPABILITIES.join("; ")`.
- `tests/board/embed-iframe-trust-roundtrip.test.mjs` — Save and reload a board with one trusted and one untrusted embed; assert each iframe ends up with the expected `allow=`.

## 5. Test Reports

TBD. Link reports under `test-results/embed-iframe-permissions_<timestamp>.md` once the feature is implemented.

## 6. Optional / Follow-ups

- Per-capability checkboxes in the embed header instead of a single trust toggle.
- Auto-trust list scoped to known-safe origins (`youtube.com`, `vimeo.com`, etc.) with a clear UI indicator.
- Trust state stored outside the canvas file (so embedding the same canvas on a different machine does not silently inherit trust decisions).
- Mirror the same model on the `bd-app-iframe` if app embeds ever need delegated capabilities.

## Reference: where the iframe is built

`JavaScript/braindump.js` builds the embed shell inline. The iframe currently has no `allow=` attribute. Reintroducing it should be a single template change plus the trust-flag plumbing described above.
