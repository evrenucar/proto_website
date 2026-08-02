# Our own browser, an app, or a distro: answering the embedding question by name

Written 2026-08-01 for the Later-lane card: "brainstorm a solution for sites that refuse to be
embedded. Do we try to build our own firefox based browser? Or do we do a app? Or do we go for a
linux distribution?"

`vnc_and_iframe_embedding_2026-07-30.md` already covers the mechanism and ranks four options. This
note does not repeat it. It answers the three options the card names, with costs, and it corrects
one thing that note got wrong.

## The correction, first, because it changes the answer

The 2026-07-30 note says:

> Electron/Tauri webviews are not subject to X-Frame-Options

That is wrong as written. Electron runs Chromium. Tauri runs WebView2 on Windows, WKWebView on
macOS and WebKitGTK on Linux. All of those enforce `X-Frame-Options` and CSP `frame-ancestors`
inside an `<iframe>` exactly like the browser does. Tauri's own issue tracker says so plainly:
sites that set those headers do not load in an iframe, and the recommended workaround is a
dedicated window or multiple native webviews, "since you cannot modify the X-Frame-Options headers
from external sites when they're loaded in iframes."

What a desktop shell actually buys is one of two different things:

1. **Control of the network layer.** In Electron you can delete `x-frame-options` and the
   `frame-ancestors` part of CSP in `session.webRequest.onHeadersReceived` before the response
   reaches the renderer. The site then loads in a normal `<iframe>`. This is the well-worn approach
   and it has been in Electron since PR #573.
2. **A surface that is not a frame.** A native child webview is a separate top-level document, so
   framing policy does not apply to it. Tauri's only path. Electron can do this too via
   `WebContentsView`.

Those two are not interchangeable for us, and the difference is the whole decision. See the Tauri
versus Electron section.

## Option A: our own Firefox-based browser

### It does not solve the stated problem

Start here, because everything else is secondary. A browser we build still has to decide to ignore
`X-Frame-Options`. That decision is a patch, roughly the same patch a browser extension makes on
stock Firefox. You do not need to own an engine to relax a response header.

And Firefox is the browser where that extension is easiest. Mozilla kept **blocking
`webRequest`** in Manifest V3 and ships `declarativeNetRequest` alongside it, unlike Chrome, which
removed blocking `webRequest`. So on the user's own machine, the entire capability a "Cosmoboard
browser" would deliver is available today as a small extension that strips two headers. That is
option 2 in the 2026-07-30 note and it remains the correct low-cost answer for a single developer's
machine.

So a Gecko fork buys nothing on this problem that costs less than a weekend. Everything below is
what it costs anyway.

### What it costs

**Scale.** mozilla-central is commonly estimated at 20 to 30 million lines, with recent figures
near 31 million. Treat that as approximate, it is a hard thing to count and I did not count it.
Either way it is two to three orders of magnitude past the 10,640-line runtime this project is.

**The update treadmill just got twice as fast.** Mozilla is moving Firefox desktop and Android from
a four-week to a **two-week** release cadence, starting with **Firefox 155 on 1 September 2026**.
Chrome went biweekly in March 2026. ESR stays annual. For anyone shipping a downstream build this
is the central fact: you rebase and re-ship every two weeks, forever, or you ship known-vulnerable
code. There is no third option, because the release notes list the CVEs publicly.

**The distinction that matters between forks.** LibreWolf, Mullvad Browser and Zen are not engine
forks. They are patch sets and configuration on top of Mozilla's releases, with their own build and
update servers. That is the survivable model, and even at that level maintainers lag upstream
because they wait for Mozilla, then integrate, then package. Pale Moon is the cautionary case of an
actual engine fork: it diverged, and it has spent years behind on web platform features and on
security work it now has to do itself. If we did this, we would be doing the LibreWolf thing, which
means we would be shipping Firefox with a patch, which means we should just ship the patch as an
extension.

**Signing and distribution, per year:**

- Windows OV code signing: roughly 108 to 226 USD per year depending on vendor. Since June 2023 the
  CA/Browser Forum requires the private key on a hardware token or HSM, so there is a token to own
  and a cloud-HSM option at about 120 USD per year. From 1 March 2026 the maximum certificate
  validity drops from 39 months to 460 days, so the renewal cycle is now yearly-ish by rule.
- Apple Developer Program: 99 USD per year, which covers Developer ID signing and notarization at
  no extra fee.
- Update infrastructure: Mozilla uses Balrog. A downstream either runs something equivalent or
  ships an unsigned self-update path, which is worse than no update path.

Call it 250 to 350 USD per year in fees. The fees are not the problem. The problem is that every
two weeks somebody has to rebase, build for three platforms, sign, notarize and push, and if that
somebody is on holiday, users are running a browser with published CVEs. **Shipping a browser
engine means owning a security response process.** That is the liability, and it does not scale
down to one person.

**Verdict: no.** Not because it is hard, but because it is the most expensive way to get a result
that a 30-line extension already gets on the exact browser the user runs.

## Option B: an app

This is the real option. The question is which shell.

### The numbers

| | Tauri v2 | Electron |
| --- | --- | --- |
| Engine | System webview: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux | Bundled Chromium, same everywhere |
| Claimed minimum | under 600 KB | n/a |
| Measured hello world | 3.2 MB | 85 MB |
| Measured six-window app | 8.6 MB | 244 MB |
| Typical installer | 5 to 10 MB | 50 to 200 MB |
| Idle RAM, one comparison | around 42 MB | around 168 MB |
| Backend language | Rust | Node |

The size numbers come from third-party 2026 comparisons, not from our own build, so treat them as
order-of-magnitude. The direction is not in doubt: Tauri is roughly 20 to 30 times smaller.

### Why the size advantage does not survive contact with this codebase

The migration is not "port the frontend". The frontend already runs unchanged in both. The
migration is what happens to `scripts/preview-server.mjs`.

That file is **957 lines of Node**, its only non-stdlib import is `ws`, and it owns
`/api/save-board`, `/api/save-markdown`, `/api/save-asset`, `/api/list-markdown`,
`/api/get-video-meta`, `/api/add-todo`, `/api/todo-update` and `/api/frame-check`. That is already
an Electron main process. Wrapping it is close to a no-op: point a `BrowserWindow` at the existing
pages, run the same server in-process, keep every route. The runtime side is one dependency-free
10,640-line file plus 3,667 lines of CSS with no build step, so there is nothing to bundle or
transpile.

Tauri means either rewriting those 957 lines in Rust, including the `.canvas` save logic, the
markdown sidecar logic, the todo-file rewriting and the frame-check probe, or shipping Node as a
sidecar binary. `node.exe` on this machine is **87.4 MB** (v24.15.0). A Tauri app with a Node
sidecar is therefore about the same size as Electron, with two runtimes instead of one.

So the honest trade is: **Electron costs about 85 MB and roughly zero migration work. Tauri costs
about 5 MB and a Rust rewrite of the entire server, or about 90 MB and no size win at all.**

### The thing that actually decides it: a canvas is not a window manager

Cosmoboard is a pan and zoom canvas. Embeds sit on the canvas and have to move with it, scale with
it, clip against other nodes, and render underneath the toolbar.

- **Electron's header stripping keeps embeds as real `<iframe>` elements inside the page.** They
  are DOM. They inherit the canvas CSS transform. Pan, zoom, z-order, rounded corners and clipping
  all keep working with no new code, because they are the same iframes the board already draws.
- **A native child webview is an OS rectangle.** You position it with
  `setBounds({ x, y, width, height })` in window coordinates, integers, axis-aligned. It does not
  participate in CSS transforms. It will not zoom, it will not clip behind another node, it will
  not sit under a translucent toolbar. You would have to reimplement pan and zoom by recomputing
  bounds every frame, and it would still float above everything.

For a spatial canvas, that is not a smaller version of the feature. It is the wrong feature.

And the native-webview path in Tauri is not even finished. Multiple webviews per window has been
behind an **unstable Cargo feature flag** since Tauri 2.0 while the API is reviewed, with open bugs
on positioning and on resizing stopping, including a Linux layout bug filed in 2026. Building the
core embedding capability of the product on an explicitly unstable API with open layout bugs is not
a reasonable bet.

**Verdict: if we do an app, it is Electron, and the mechanism is `onHeadersReceived`, not native
webviews.** This flips the usual Tauri-versus-Electron verdict, and it flips it for one specific
reason: we need embedded sites to be DOM nodes on a transformed canvas, and only the
header-stripping approach keeps them as DOM nodes.

### What it costs us in return

- **We become the browser for security purposes.** Stripping `x-frame-options` and
  `frame-ancestors` is global to the session. Every iframe in the app loses framing protection,
  including ones we did not intend. Clickjacking a logged-in banking session inside our canvas
  becomes our problem. Mitigation is a per-partition session so only nodes the user explicitly
  marked as "force embed" get the stripped session, and everything else keeps normal enforcement.
  That is a real design constraint, not a footnote.
- **Chromium updates.** Smaller than the Firefox-fork treadmill because Electron does the rebasing,
  but we still have to ship Electron upgrades or run an old Chromium. Same class of obligation, one
  or two orders of magnitude less work.
- **The static site does not go away.** The current objective is a stranger opening
  `evrenucar.com`. An app does not serve that. The app is a second target, and every feature has to
  keep working without it.
- **Local-first gets better, not worse.** Real filesystem access with no picker, no permission
  dance, no Safari seven-day storage cap. See `filesystem_integration_2026-08-01.md`. This is
  arguably a bigger win than the embedding fix.

## Option C: a Linux distribution

**It solves zero percent of the stated problem.** `X-Frame-Options` is enforced by the engine that
renders the page. A distribution does not sit in the HTTP path. Whatever browser ships inside the
distro enforces the header exactly as it does on Windows. To make the distro fix embedding you
would have to also patch the browser it ships, which is option A, plus an operating system.

It is also the largest possible commitment. A distro means owning package builds, kernel and driver
updates, an installer, hardware compatibility, and a security advisory pipeline for everything in
the archive, not just for the app. That is a full-time organisation.

The ambition underneath the question is not silly, and it is already written down. The north star
in `holistic_planning.md` says Cosmoboard grows "toward an operating environment", and
`COSMOBOARD_MIGRATION.md` Stage 5 is literally "Dedicated browser or operating environment",
explicitly gated behind the earlier stages. The migration doc's own design principle says: "Do not
scaffold browser-engine, VNC, container, or operating-system layers before their stage begins."

The useful reframe: what people want from "an operating environment" is not a bootloader. It is
owning the process boundary. Terminals, long-running jobs, VNC sessions, persisted application
state, files without a permission prompt. That is **Stage 3, application and session hosting**, and
a desktop app delivers all of it. The distro adds nothing on top except responsibility for
somebody's graphics driver.

**Verdict: no, and the ambition it comes from is served by option B.**

## Recommendation

**Now: nothing new.** The fallback card path is built and `handleFrameCheck` in
`scripts/preview-server.mjs` does a real header probe, so refused embeds already degrade to a
preview card instead of a grey box. That covers the common case. The current objective is a
stranger seeing boards on the web, and none of these three options serves that.

**Now, optional, one evening:** a small Firefox extension for the user's own machine that strips
`x-frame-options` and CSP `frame-ancestors` for the board origin only. Firefox kept blocking
`webRequest` in MV3, so this is straightforward there, and it delivers the entire practical benefit
of option A at roughly zero cost. Personal tool, never a requirement for visitors.

**Later: Electron, at Stage 4 of the proposed roadmap, "session surfaces".** Not Tauri, for the two
reasons above: the server is already a Node main process, and native child webviews cannot live on
a pan-and-zoom canvas. Bundle the existing `preview-server.mjs` as the main process, keep every
route, add a per-partition session with header stripping used only by nodes the user explicitly
marks "force embed".

**Never: the distro.** And the Gecko fork only if the product itself becomes a browser, which is a
different product with a different customer.

**Trigger that moves Electron from later to now.** Any one of:

1. The user hits a live embed they actually need and the preview card is not enough, repeatedly.
   One annoyance is not a trigger. A recurring workflow is.
2. A terminal node, a long-running process node, or a real VNC workflow gets scheduled. Those need
   a trusted runtime regardless of embedding, so the shell stops being optional. This is Stage 3 in
   `COSMOBOARD_MIGRATION.md`.
3. The filesystem work in `filesystem_integration_2026-08-01.md` reaches step 6 and we are about to
   ship a Chromium-only feature to a Firefox user. At that point the shell is strictly better than
   the browser API and we should build it instead.

Until one of those is true, the fallback card plus a personal extension is the whole answer.

## What I did not verify

- The bundle-size and RAM numbers are from third-party 2026 comparison articles, not our own
  builds. Order of magnitude is reliable, the exact figures are not.
- The mozilla-central line count is a published estimate, not something I measured.
- I did not build an Electron prototype. The claim that header stripping preserves canvas transform
  behaviour follows from the embeds staying as DOM `<iframe>` nodes, and the claim that native
  webviews do not follows from `setBounds({ x, y, width, height })` being the only positioning API.
  Both are reasoned from the API shape, not tested.
- Whether WKWebView or WebKitGTK expose any response-header interception that Tauri could surface
  later. I found no such Tauri API and its issue tracker points people at native webviews instead,
  but I did not read the WebKit APIs directly.

## Sources checked 2026-08-01

- [Tauri: process model, webview per platform](https://v2.tauri.app/concept/process-model/)
- [Tauri issue 7005: cannot load some webpages in iframe](https://github.com/tauri-apps/tauri/issues/7005)
- [Tauri PR 8280: multiple webviews per window, unstable feature](https://github.com/tauri-apps/tauri/pull/8280)
- [Tauri issue 10420 and 13071: multiwebview positioning and Linux layout bugs](https://github.com/tauri-apps/tauri/issues/13071)
- [Electron PR 573: removing the X-Frame-Options header for frames](https://github.com/electron/electron/pull/573)
- [Electron issue 32630: ignore X-Frame-Options](https://github.com/electron/electron/issues/32630)
- [Electron WebContentsView docs](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [The Register, 2026-07-17: Mozilla speeds Firefox release schedule to biweekly](https://www.theregister.com/software/2026/07/17/mozilla-speeds-firefox-release-schedule-to-biweekly/5274423)
- [SSL2Buy: changes in issuing OV code signing certificates after June 2023](https://www.ssl2buy.com/wiki/changes-issuing-ov-code-signing-certificate)
- [Apple Developer: program enrollment fee](https://developer.apple.com/help/account/membership/program-enrollment)
- [PkgPulse: Electron vs Tauri 2026 bundle size and RAM](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)
- [MDN: declarativeNetRequest, and Firefox retaining blocking webRequest in MV3](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest)
