# Reaching real PC files from Cosmoboard

Written 2026-08-01 for the Later-lane card: "ideate on how to integrate the file system from the
PC into this. Ideally it should be safe and convenient."

The card says safe first. So the threat model comes before the API tour.

Everything about browser support below was checked on 2026-08-01 against caniuse, MDN and the
Chrome capabilities docs. Sources are listed at the end. Anything I could not check is marked
unverified. Line numbers into `JavaScript/braindump.js` were correct on 2026-08-01 and that file is
under active edit, so search for the quoted symbol rather than the number.

## The short answer

The browser API that would do this properly, the File System Access API, does not exist in
Firefox or Safari and is not going to. caniuse puts it at **28.56 percent global support**.
Mozilla's formal standards position on the three pickers is **harmful**. MDN flags the feature as
**Limited availability** and experimental. Firefox matters here specifically: this repo carries a
shipped Firefox workaround at `JavaScript/braindump.js:2602` for the bare-Alt menu-bar behaviour,
so the user runs Firefox, and a Chrome-only file feature would not work on the machine it was
built for.

So the answer is not one mechanism. It is three, layered:

1. **Read-only folder import** that works in every browser today, at 92 to 96 percent support.
2. **The local preview server** as the real read-write path on desktop. It already exists, it
   already owns the write APIs, and it is the honest answer for "open a folder as a board".
3. **The File System Access API** as a Chromium-only convenience, opt-in, one root, later.

There is also a security bug to fix in the thing we already ship, described under Threat model.

## Threat model first

### A directory handle is ambient authority

A page that can read a directory is a page that can read a directory. There is no per-script
scoping inside an origin. If `evrenucar.com` holds a persisted handle to `C:\Users\evren\Documents`,
then every line of JavaScript on that origin holds it. That includes anything injected through a
compromised host, a bad deploy, or a supply-chain problem in a dependency.

The one genuinely strong safety argument this project has is that there is almost nothing to
compromise. `package.json` lists two devDependencies, `playwright` and `ws`, and **zero runtime
dependencies**. The whole board runtime is one file, `JavaScript/braindump.js`, 10,640 lines, no
imports from npm. That is an unusually small attack surface for a web app in 2026. Adding a
persistent handle to the user's Documents folder is the single change that would make that surface
worth attacking. It converts "someone defaced the portfolio site" into "someone read the user's
files".

That is not an argument never to do it. It is an argument that the grant must be narrow, explicit,
and visible.

### What the browser does and does not protect

- Chrome blocks writes to core OS directories such as `Windows` and the macOS `Library` folders and
  prompts for an alternative location. It does **not** block the home folder or Documents. Those
  are granted with a warning the user will click through.
- The picker must be triggered by a user gesture. There is no silent crawl.
- Handles are serializable into IndexedDB, but **the permission does not travel with the handle**.
  You get the handle back and you get a `PermissionStatus` of `prompt`, which is why
  `queryPermission()` then `requestPermission()` is the mandatory dance on every load.
- Before Chrome 122, closing every tab for the origin dropped access entirely, and the next visit
  re-prompted. Chrome 122 shipped a three-way prompt with "Allow this time" and "Allow on every
  visit", so indefinite access is now a thing the user can choose. It is off unless chosen.
- Revocation is per-origin, buried in the site settings panel. Most users will never find it. Any
  feature we build should offer its own visible "forget this folder" control rather than relying on
  the browser's.

### The real hole is in our own server, not the browser API

`scripts/preview-server.mjs` owns `/api/save-board`, `/api/save-markdown`, `/api/save-asset`,
`/api/list-markdown`, `/api/get-video-meta`, `/api/add-todo`, `/api/todo-update` and
`/api/frame-check`. It writes into the repo. Two facts about it, read off the file today:

- It calls `server.listen(port, "0.0.0.0", ...)`. It binds every interface, and the startup banner
  prints LAN URLs on purpose. On shared wifi, anything on the network can POST to `/api/save-asset`.
- `grep -c "request.headers" scripts/preview-server.mjs` returns **0**. There is no `Origin` check
  and no `Host` check on any route. A `POST` with a simple content type does not trigger a CORS
  preflight, so any website open in the same browser can write into the repo through
  `http://127.0.0.1:4174/api/save-asset` and never needs to read the response.

The existing mitigations are real but partial: `sanitizeAssetFilename` strips path separators,
`BLOCKED_ASSET_EXTENSIONS` blocks 11 executable extensions (`.exe .bat .cmd .com .msi .dll .ps1
.vbs .sh .jar .scr`), there is a 200 MB cap, and the resolved path is checked against `rootDir`.
So the worst case is writing junk files inside the repo, not arbitrary code execution. It is still
worse than the browser API, which at least asks.

**If we care about safe first, this is the cheapest and highest-value fix on the whole card.** Bind
to `127.0.0.1` by default with an explicit `--host` opt-in for the LAN case, and reject writes
whose `Origin` header is not in a small allowlist. That is maybe 20 lines. It should land before
any new filesystem feature, because every path below routes through this server.

### Local-first has a second failure mode: Safari deletes your data

Board state lives in `localStorage` (27 references in `braindump.js`, the write is at line 1889).
Assets live in IndexedDB. Safari's Intelligent Tracking Prevention caps all script-writable storage
at seven days of Safari use without interaction with the site, and that cap covers IndexedDB,
localStorage, sessionStorage and Service Worker registrations. The counter resets on every visit,
and Apple exempts web apps added to the home screen. So a Safari user who makes a board and does
not come back for a week loses it.

This is not a hypothetical about a future feature. It is true of the boards today. It is the
strongest argument in this note for treating the disk, not the browser, as the source of truth.

## The APIs, with the numbers

### File System Access API: showOpenFilePicker, showSaveFilePicker, showDirectoryPicker

| Browser | Pickers |
| --- | --- |
| Chrome desktop | Yes. caniuse lists 105+, the Chrome docs say 86+ for the earliest methods. Treat 105 as the safe floor. |
| Edge desktop | Yes, same versions |
| Opera | Yes, 91+ |
| Firefox | **No, all versions 2 through 156** |
| Safari, macOS and iOS | **No, all versions** |
| Chrome for Android | **No** |
| **Global** | **28.56 percent** |

Mozilla's position on `showOpenFilePicker`, `showSaveFilePicker` and `showDirectoryPicker` is
**harmful**. Mozilla separately holds a **positive** position on the "File System" spec, which is
the Origin Private File System half. Those are two different documents and the confusion between
them is why a lot of blog posts wrongly claim Firefox 111 supports this API. Firefox 111 shipped
OPFS. It did not ship the pickers.

The Chrome capabilities doc has the same confusion baked into its own support table, listing
"Firefox 111+, Safari 15.2+". Those numbers are OPFS numbers. Do not repeat them.

This repo already uses the API where it is safe to: `openCanvasPicker()` at
`braindump.js:8840` and `importContentPicker()` at `8865` both call `showOpenFilePicker` when
present and fall back to `openCanvasInput.click()` / `fileInput.click()` otherwise, gated on
`supportsFileSystemAccessAPI` at line 2026. That is exactly the right pattern. It picks single
files, it does not persist handles, and it degrades to a plain `<input type="file">`. Nothing about
this note argues against what is already there.

### Origin Private File System

`navigator.storage.getDirectory()` is at **93.51 percent global**: Chrome and Edge 86, Firefox 111,
Safari 15.2, Safari iOS 15.2, Chrome for Android 150. It is fast, it supports synchronous access
handles in workers, and it is genuinely cross-browser.

It is also **not the user's filesystem**. It is a private per-origin store the user cannot see in
Explorer or Finder, cannot back up, cannot put in git, and cannot open in Obsidian. For a product
whose stated direction is "the filesystem should remain the primary hierarchy and source of
organization" and "markdown and `.canvas` are the core formats", OPFS is the opposite of the goal.
It is a good cache. It is a bad home. And on Safari it is subject to the same seven-day cap as
everything else script-writable.

Use it for large asset blobs and undo history if we ever need the performance. Do not use it as the
place boards live.

### The cross-browser folder paths that actually work

Two things are near-universal and get overlooked because they are old:

- **`<input type="file" webkitdirectory>`**: 91.98 percent global. Chrome 30, Edge 14, **Firefox
  50**, **Safari 11.1**, Safari iOS 18.4. The user picks a folder and the page receives every file
  inside it, with `webkitRelativePath` preserving the tree. Read-only, one-shot, no handle.
- **`DataTransferItem.webkitGetAsEntry()`**: 96.24 percent global. Chrome 13, Edge 14, **Firefox
  50**, **Safari 11.1**, Safari iOS 11.3. Drop a **folder** onto the page and walk it recursively.

Today `braindump.js:8003` handles `drop` by reading `e.dataTransfer.files`, which means dropping a
folder does nothing useful. Switching that handler to try `webkitGetAsEntry()` first would make
"drag a folder of markdown onto the board" work in Firefox and Safari as well as Chrome. That is
the single highest convenience-per-risk change available, and it needs no permission model at all,
because the user dragged the folder.

Both are read-only. Neither gives you write-back. Which is fine, because the write-back path
already exists.

## Mapping it onto Cosmoboard

Boards are already `.canvas` JSON plus markdown sidecars on disk. `content/boards/dev/` holds
`current.canvas` at 29,048 bytes next to `cosmoboard_migration.md`,
`performance_analysis_2026-07-30.md`, `vnc_and_iframe_embedding_2026-07-30.md` and a PDF. Assets are
saved next to the board by `/api/save-asset`. There is no database. There is no proprietary
container. A board **is** a folder already.

That is unusually good luck, and it means "open a folder as a board" is a small feature, not a
rewrite.

### What "open a folder as a board" would do

- Point at a folder. Read every `.canvas` in it as a board and every `.md` as a candidate node.
- Files not referenced by the canvas appear as unplaced nodes in a tray, so the folder is the
  source of truth and the canvas is a view over it, not a second copy of it.
- Writes go back to the same folder: the canvas file, the markdown sidecars, and new assets
  dropped in.
- Non-markdown files get preview nodes: PDFs already render, images already render.

### What it would break

- **Asset paths.** Assets are currently resolved relative to the board's directory under
  `content/`. An arbitrary folder has no relation to the site root, so the static site cannot serve
  its images. Either the loader rewrites them to blob URLs at load time, or the server gains a
  scoped static route for the opened folder. The first is safer.
- **Slug routing.** `resolveBoardSavePath(slug)` maps a slug to a path under `rootDir`, and the
  path is rejected if it escapes `rootDir`. An external folder is outside `rootDir` by definition,
  so this feature requires deliberately relaxing the one containment check the server has. That
  relaxation has to be a per-session, per-folder allowlist set at pick time, never a general
  "allow any path" flag.
- **External edits.** Neither the File System Access API nor `webkitdirectory` gives you file
  watching. You poll `getFile().lastModified`. So if the user edits a note in Obsidian while the
  board is open, autosave will overwrite it. This is the same stale-tab clobber problem the roadmap
  already names under "operation-level canvas writes", and folder mode makes it much more likely.
  Folder mode should start read-only until that is solved.
- **Renames and moves are invisible.** A file that moves out from under a node just disappears.
  There is no rename event to follow.
- **The current objective.** The shipped goal is a stranger opening `evrenucar.com` and sending a
  suggestion through download, upload, commit. Folder mode serves the user's own desktop, not a
  stranger's first visit. It is a Later card for a reason.

## Recommendation

**Now, in order:**

1. Fix `preview-server.mjs`: bind `127.0.0.1` by default, add an `Origin` allowlist on the write
   routes. Small, and it is the actual open hole. Not strictly a filesystem feature, but every
   filesystem feature makes it worse.
2. Make folder drop work. Try `webkitGetAsEntry()` in the existing `drop` handler at
   `braindump.js:8003` before falling back to `dataTransfer.files`. 96.24 percent support, works in
   the user's Firefox, no new permission surface, and it is the gesture people already expect.
3. Add `webkitdirectory` to a "Import folder" button next to the existing import. 91.98 percent
   support, read-only, one gesture.

**Later, when there is a reason:**

4. Read-only folder-as-board on top of 2 and 3. The folder is the hierarchy, the canvas is a view.
   Writes still go through the preview server, which stays the only thing that touches disk.
5. Read-write folder-as-board, only after the operation-level write model lands. Otherwise autosave
   eats external edits.

**Chromium-only, opt-in, and last:**

6. `showDirectoryPicker` plus a handle in IndexedDB, for exactly one root at a time, with
   `queryPermission` re-checked on every load and a visible "forget this folder" control in the
   board UI. This is convenience on top of 4 and 5, not a replacement for them, because it cannot
   work in Firefox or Safari.

**Do not build:** silent crawling of anything, more than one persisted root, a persisted handle to
a home directory, or OPFS as the place boards live.

**Trigger that moves 6 up the list:** either Mozilla changes its position from harmful, which there
is no sign of, or the desktop shell exists, in which case 6 becomes unnecessary because the shell
has real filesystem access without any of this. **The most likely outcome is that 6 never happens,
and that is fine.** Steps 1 through 5 give the user a real folder on their real disk, in every
browser they use.

## What I did not verify

- Whether any Firefox release after 156 has changed the picker position. caniuse's table ended at
  156 on 2026-08-01 and showed no support.
- Whether Chrome's persistent-permission prompt behaves the same for a plain site as for an
  installed PWA. The Chrome blog describes the three-way prompt without restricting it to PWAs, but
  I did not test it.
- The exact Safari version where the seven-day cap applies to OPFS specifically, as opposed to
  IndexedDB and localStorage. WebKit's announcement covers "all script-writable storage", so I read
  OPFS as included, but I did not find a statement naming OPFS.

## Sources checked 2026-08-01

- [caniuse: File System Access API](https://caniuse.com/native-filesystem-api)
- [caniuse: StorageManager.getDirectory](https://caniuse.com/mdn-api_storagemanager_getdirectory)
- [caniuse: input webkitdirectory](https://caniuse.com/input-file-directory)
- [caniuse: DataTransferItem.webkitGetAsEntry](https://caniuse.com/mdn-api_datatransferitem_webkitgetasentry)
- [MDN: Window.showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [Mozilla Standards Positions](https://mozilla.github.io/standards-positions/)
- [Chrome for Developers: The File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [Chrome for Developers: Persistent permissions for the File System Access API](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- [Search Engine Land: what Safari's 7-day cap on script-writable storage means](https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519)
