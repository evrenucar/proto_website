# Browser terminal via Wetty: does it dissolve the problem, or relocate it?

Agent opus5-45. Card: *"Add a CLI functionality? maybe implemented like this: … Wetty …"* (`!p3`).
No board code was changed to write this; two other things exist. Verdict at the bottom.

## 1. What already exists, and why the ask is probably already answered

**A CLI already exists.** `scripts/cosmo.mjs`, run as `npm run cosmo`, gives `boards`, `nodes`,
`grep`, `add-note`, `export`, every read command with `--json`, and the same stale-base guard the
browser obeys, sharing the actual sanitizer and path resolution with the server via
`scripts/lib/board-store.mjs` rather than reimplementing them. It reads and writes the same
`.canvas` JSON and markdown sidecars the board uses; no new data model, no server has to be
running. This is board operations from a shell, already shipped, and it is proven (see the `[A]
[cli]` card in `todo.md`, and `tests/cli/cli-over-board-data.test.mjs`).

If what prompted this card is "I want to work on my boards from a terminal," that is done and the
gap is discoverability, not a missing server. There is also a "Enable CLI use" settings checkbox
already shipped (`[A]` bug card in `todo.md`) that names what it turns on rather than hiding it
behind "experimental."

**A browser terminal was separately asked for and deliberately refused**, on a security ground,
not a laziness one (`[A] [runtime] A terminal node` card). The client half (xterm.js + node-pty
over ConPTY) is not the blocker. The host is: a PTY served from `scripts/preview-server.mjs` would
be a shell for every website open in any tab, not just the LAN, because a WebSocket upgrade is not
covered by CORS or same-origin policy, and that server binds broadly and (until a recent fix)
checked no Origin at all. Four requirements were written down before it ships: loopback-only bind,
an Origin allowlist on the upgrade, a per-run token, and off behind an explicit flag. The Origin
check for POST/PUT/DELETE landed since (`[x]` card, "preview server binds broadly and checks no
Origin"), but explicitly **not** for a WebSocket upgrade, and the bind deliberately stays
`0.0.0.0` for phone testing on LAN. Neither of those two facts changed for this card.

The computer-window node (the VNC/RDP/local switch) already has a `terminal` protocol entry in
`COMPUTER_PROTOCOLS` (`JavaScript/braindump.js:8823`) with `ready: false` and a requirements panel
that says exactly this, plus what it would need. Nothing can dial a service that isn't there.

## 2. What Wetty actually is (verified against its source, not just its README)

Wetty (`butlerx/wetty` on GitHub, `npm install -g wetty`) is a Node.js server: Express serves a
static page with xterm.js, Socket.IO carries the terminal stream. Verified from source
(`src/shared/defaults.ts`, `src/server/socketServer/socket.ts`, `src/server/command.ts`):

- **Authentication is a real system login, not an anonymous handout.** As a non-root user, Wetty
  launches SSH to a target host (`localhost` by default) using the requesting user's system
  credentials, controlled by `--ssh-auth` (`password` by default, or `publickey,password`). As
  root without `--force-ssh`, it launches `/bin/login`, i.e. PAM. Either way, connecting to the
  page gets you a login prompt inside the terminal, not a shell. **This is the one genuine
  difference from a raw PTY over a WebSocket**, which the refused approach was: node-pty spawns a
  shell for whoever's WebSocket connects, no login step of any kind.
- **Default bind is `0.0.0.0`, not loopback.** `serverDefault.host = '0.0.0.0'` in
  `src/shared/defaults.ts`. The user's own proposed command, `wetty --port 3000`, inherits this
  default and listens on every interface, exactly the exposure class the terminal card's
  requirement #1 exists to close. `--host 127.0.0.1` has to be passed by hand.
- **No Origin allowlist on the Socket.IO endpoint.** `src/server/socketServer/socket.ts` creates
  the Socket.IO server with no `cors` option, and nothing in `command.ts` checks the request
  Origin before accepting a connection; it only allowlists which URL query params (`pass`,
  `command`, `path`, `host`, `port`) get honored, and only when `allowRemoteCommand` /
  `allowRemoteHosts` are explicitly turned on (off by default). So a hostile page's fetch or
  hidden iframe can reach a `0.0.0.0`-bound Wetty and load the login prompt, same as it could reach
  a raw PTY server, the difference is what happens next: it hits an SSH or PAM login it cannot
  answer, not a shell. Unless the operator has configured passwordless key auth, which Wetty's own
  docs flag as insecure, or set `--ssh-auth none`.
- **No per-run token**, and no built-in mechanism for one. The project's own docs recommend a
  reverse proxy for HTTPS and, optionally, HTTP basic auth in front of it (Caddy, nginx, Traefik)
  for exactly the coverage a token would give.
- **Dependency and maintenance footprint:** Express, Socket.IO, xterm.js, an SSH client library,
  Node.js ≥20, and native build tooling (make, Python, build-essential) for some of the transitive
  deps. It is a real package to install and keep patched, not a header on an existing route.
- **Windows is a poor fit for the exact command the user proposed.** Wetty's non-root default path
  is SSH to `localhost`; its root path is PAM's `/bin/login`. Neither exists on Windows out of the
  box, this machine has no OpenSSH *server* enabled by default and no `/bin/login`, so
  `wetty --port 3000` on this machine, as literally proposed, fails to produce a terminal at all
  until an SSH server is set up and a real Windows account password is behind it. Worth knowing
  before recommending the exact steps as written.

## 3. The security comparison, specifically

Relocating the problem is the right instinct, but it is not the same as solving it. Both facts
matter and point in opposite directions:

- **Wetty does not dissolve the bind/Origin problem.** Run exactly as proposed, it inherits the
  same class of exposure the terminal card refused: bound to every interface, no Origin check on
  the upgrade. A site in another tab can reach it.
- **Wetty does change what that exposure buys an attacker.** Because it requires a real SSH or PAM
  login, reaching the endpoint gets a login prompt, not a shell, as long as the operator hasn't
  weakened that (passwordless key, or disabling auth). A raw node-pty-over-WebSocket, the shape
  the terminal card refused, has no equivalent gate: anyone who opens the socket gets a shell,
  full stop.
- **Running it as a separate, user-launched process is also a real, independent improvement**, on
  top of the auth difference, for a reason specific to this repo: `scripts/preview-server.mjs`
  already runs broadly bound and, per the terminal card, "runs all day on this machine." Bolting a
  PTY onto that process turns an already-broad, always-on surface into a shell surface, for as
  long as the dev server happens to be up, which is most of the time. A separate binary the user
  starts by hand only when they want a terminal, and can kill afterward, shrinks the exposure
  window to exactly the minutes it's wanted, and never touches the file that already owns
  `/api/save-board` and the other write routes.

So: **materially safer, but only if run with `--host 127.0.0.1` and default SSH/PAM auth left on**,
neither of which the user's proposed three commands do or mention. Run exactly as proposed
(`wetty --port 3000`), it is the same class of hole, just in a second process instead of the first.
That's a correction worth making before anyone runs it, not a reason to refuse it.

## 4. Recommendation

**Do not build a hosted terminal into the board or the preview server for this card.** Nothing
about Wetty changes the four requirements already on file for that; if a terminal is ever hosted
by this codebase, the four requirements stand as written.

**Do let the user run Wetty themselves, as a separate opt-in process, and view it in the board.**
Concretely:

1. The user starts it by hand, on their terms: `wetty --host 127.0.0.1 --port 3000` (the
   `--host` flag matters, the default is `0.0.0.0`; see above). SSH or PAM auth stays on, i.e.
   don't pair it with a passwordless key or `--ssh-auth none`.
2. **No new node type or protocol is needed.** Wetty already serves a complete web page with
   xterm.js built in; it isn't a raw wire protocol the board would need to speak, the way VNC's
   RFB is. The board already has a generic live-embed iframe on the `link` node type
   (`nodeObj.embedMode === "live"`, `JavaScript/braindump.js:8537`, `bd-embed-iframe`, sandboxed
   with `allow-scripts allow-same-origin allow-popups allow-forms allow-presentation`) and on the
   `app` node type (`bd-app-iframe`, same sandbox minus `allow-presentation`,
   `JavaScript/braindump.js:9204`). Pasting the user's own `http://127.0.0.1:3000` into a link
   node and switching it to Live embed is the entire integration. Zero board code changes, zero
   PTY hosting by the board, and the only "credential" ever involved is what the user types into
   the SSH/PAM prompt inside that iframe, which never touches board JSON.
3. **Checked whether the computer-window's Terminal switch is the right place to point at this,
   and it isn't.** That switch (`COMPUTER_PROTOCOLS.terminal`) models a raw protocol the board
   dials directly, the same shape as its VNC entry, which speaks RFB straight to a server over a
   WebSocket the board owns. Wetty isn't that: it's a full web app the board would just be
   iframing, which is exactly what the `link`/`app` live-embed path already does for any URL.
   Typing a Wetty address into that switch's Target field wouldn't do anything today either;
   `ready: false` short-circuits before any connection is attempted, regardless of what's in the
   field. Making it "ready" for Wetty specifically would mean adding a Wetty-aware connection
   branch, which is more code than the zero-code iframe path above, not less. So the switch is
   left exactly as it is; it's honestly modeling a different, harder integration that nothing
   provides yet.

**Smallest integration, shipped:** a one-hunk copy edit to the Terminal entry's own requirements
panel, so a user who opens that switch today, hits the dead end, and is looking for the actual
answer, finds it in the same place instead of a card three files away. It only tells them the
`link`/`app` route exists and warns about the default bind; it adds no capability, no code path,
and no exposure. See `.tmp/scratch/opus5-45/patch.json`, anchor verified to occur exactly once in
`JavaScript/braindump.js`.

## What this does not cover

- Whether the site should ship a documented "how to add a terminal to your board" walkthrough
  (README, settings copy) beyond the one panel edited here. Left for a future card if the user
  wants it; this note is the decision record, not the doc.
- Auto-detecting a running Wetty instance, or any board-side health check against it. Deliberately
  not proposed: it would mean the board making network requests to a user-chosen local address,
  which is unnecessary for a feature that's just "paste a URL into an iframe."
