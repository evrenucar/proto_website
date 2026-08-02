# Testing Cosmoboard on a real phone

## What this is for

One bug is blocked on this: "crashing on mobile if you zoom out and in too fast". It never
reproduced under desktop emulation. 60 sustained pinch cycles, heap flat at 3.7MB, zero errors.
So the cause is probably something a desktop cannot show, most likely the grid layer. The grid is
a 240000 by 240000 SVG that the phone's GPU has to hold while a pinch is running.

To settle it we need one thing that only your phone can give: what happens on the device when it
dies. This page is how to get it.

There are two setups here. The Android one is stronger and takes about 15 minutes. The iPhone and
iPad one is weaker, and the reason why is explained at the bottom rather than hidden.

## Start here, either way

On the computer, in the project folder:

```
npm run mobile:diag
```

It prints the address to open on the phone. It looks like `http://192.168.2.18:4190/go`.

That server is deliberately crippled. It serves the site read only. It has no save routes at all,
so nothing you do on the phone can write to `content/`. It has one extra job: when a page URL ends
in `?diag=1` it injects a small probe into the page, and the probe posts what it measures back to
the computer, into `.tmp/diag/`.

You do not need `npm run preview` running as well. If it is, leave it. They use different ports.

## Route A, Android on a USB cable. Do this one if you have an Android phone.

This route needs no wifi and no firewall change, because the phone talks to the computer through
the cable.

**Once, on the computer:**

1. Download Android platform tools:
   https://developer.android.com/tools/releases/platform-tools . It is a zip, not an installer.
2. Unzip it somewhere you will find again, for example `C:\platform-tools`.

**Once, on the phone:**

3. Settings, About phone, tap **Build number** seven times. It will say you are a developer now.
4. Settings, System, Developer options, turn on **USB debugging**.

**Every session:**

5. Plug the phone in. On the phone, accept **Allow USB debugging**. Tick "always allow".
6. On the computer, open PowerShell in `C:\platform-tools` and run:

   ```
   .\adb devices
   ```

   The phone should be listed as `device`. If it says `unauthorized`, look at the phone, the
   prompt is waiting.

7. Run this. It is the whole trick:

   ```
   .\adb reverse tcp:4190 tcp:4190
   ```

   That makes port 4190 on the phone point at port 4190 on the computer, through the cable.

8. On the phone, open Chrome and go to `http://localhost:4190/go`. Not the 192.168 address.
   Tap a board.

9. On the computer, open Chrome and go to `chrome://inspect#devices`. Your phone's tab is listed.
   Press **inspect**. You now have real DevTools on the phone's page.

Then run the test steps below. While you do, the person or agent at the computer should have:

- **Rendering panel** (DevTools, three dots, More tools, Rendering): turn on **Layer borders** and
  **Frame rendering stats**.
- **Layers panel** (More tools, Layers): this shows every compositor layer and its memory
  estimate. This is the readout the whole crash question turns on. If the grid layer is holding
  hundreds of megabytes while you pinch, that is the answer, and the fix is already understood.
- **Performance monitor** (More tools): GPU memory and JS heap as live lines.

## Route B, any phone over wifi, including iPhone and iPad

This is the only route for iOS. There is no cable trick for iPhone, see the last section.

**The thing that will stop you first:** on this machine the Windows firewall has no inbound rule
for Node, and the wifi network is categorised **Public**. Checked on 2026-08-01. That means the
phone's request will hang forever with no error. Nothing about the phone is wrong when this
happens.

Fix it once, in PowerShell **as administrator**:

```powershell
New-NetFirewallRule -DisplayName "Cosmoboard mobile diag 4190" -Direction Inbound `
  -Protocol TCP -LocalPort 4190 -Action Allow -Profile Private,Public -RemoteAddress LocalSubnet
```

`-RemoteAddress LocalSubnet` matters. Without it you are opening a port to whatever else is on a
public wifi. With it, only devices on the same network can reach it. To undo it later:

```powershell
Remove-NetFirewallRule -DisplayName "Cosmoboard mobile diag 4190"
```

Then:

1. Phone and computer on the same wifi.
2. On the phone, open the `http://192.168.x.x:4190/go` address that `npm run mobile:diag` printed.
3. Tap a board.

**If you use Tailscale**, and this machine already runs it, there is a better version of this.
Install Tailscale on the iPhone or iPad, sign in to the same account, and use the tailnet address
instead, `http://100.65.84.5:4190/go`. It works off the local wifi too. You still need the
firewall rule, but you can scope it tighter by replacing `LocalSubnet` with `100.64.0.0/10`.

## The test itself

The probe puts a small dark box in the top left of the board. It shows the current step, the frame
rate, the worst frame in the last second, the memory if the browser exposes any, the zoom scale
and the error count.

Tap the box to open the panel. It has **next step**, **copy**, **save file**, **send now** and
**clear crash flag**.

Work through the steps. Press **next step** after each one, so the log on the computer says which
step you were on.

1. Idle, board just loaded. Leave it alone for ten seconds.
2. Pinch out slowly, all the way.
3. Pinch in slowly, all the way.
4. **Pinch out and in fast, twenty times, do not stop.** This is the step the bug report is about.
   Go faster than feels reasonable.
5. Drag the board around fast while zoomed out.
6. Use it normally for a minute.

Do step 4 on the biggest board you have, not the test board. A board with videos, images and
markdown on it is the case that hurts.

### What a crash looks like

If the tab dies, iOS says "a problem repeatedly occurred" and reloads. Android usually shows
"Aw, snap" or just reloads. Either way, **reopen the board with `?diag=1` and read the box.**

If it says **CRASHED LAST RUN** in red, that is the result. The panel then carries what the dead
session was doing: which step, what zoom range it had reached, its last frame rate and heap. Do
not press "clear crash flag" until someone has read it.

This works because the probe rewrites a note in the phone's local storage once a second saying "I
am still alive", and only a normal exit marks it finished. A tab that gets killed never gets to
mark it. That is the only crash signal iOS gives you, and it needs no debugger at all.

### Getting the data back

Three ways, in order of effort:

- **Nothing.** If the phone could reach the computer, it is already on disk in `.tmp/diag/` as
  one `.jsonl` file per session, written as the session ran. A crash costs at most the last five
  seconds.
- **copy**, then paste it into a message.
- **save file**, which downloads the JSON to the phone.

## iPhone and iPad, the honest version

Everything above works on iOS. What does not work is attaching a real debugger from this computer,
and the reason is worth knowing before you spend an evening on it.

**Safari's Web Inspector, the official one, requires a Mac.** You connect the iPhone to a Mac and
use Safari on macOS. Safari for Windows was discontinued in 2012. There is no supported path from
Windows. Checked 2026-08-01.

What exists instead, ranked:

| Option | Cost | Does it work from Windows | What you actually get |
| --- | --- | --- | --- |
| `ios-webkit-debug-proxy` plus `ios-safari-remote-debug-kit` | free | Yes. Needs Apple Devices or iTunes, both already installed on this machine | The real WebKit Web Inspector in a Chromium tab. Elements, console, sources, network |
| inspect.dev | free tier is 15 min a day, Pro is 79 USD a year | Yes, it is built for this | Chrome DevTools UI against iOS Safari, over USB or wifi |
| `pymobiledevice3` | free | Yes, but iOS 17 and up needs a tunnel started from an admin shell | A JavaScript shell against the page, not a graphical inspector |
| Safari on a Mac | needs a Mac | No | The full thing |

Setup for the free one, if you want it:

1. Install `ios-webkit-debug-proxy`. The simplest way on Windows is scoop:
   `scoop bucket add extras` then `scoop install ios-webkit-debug-proxy`. Scoop is not installed
   on this machine yet.
2. On the iPhone or iPad: Settings, Safari, Advanced, turn on **Web Inspector**.
3. Plug it in and tap **Trust this computer**.
4. Clone `github.com/HimbeersaftLP/ios-safari-remote-debug-kit`, run `generate.ps1` once, then
   `start.ps1` each session, and open the localhost URL it gives you.

**Now the part that matters.** Even when that works, it does not answer this bug:

- WebKit's inspector has no Layers panel and no GPU memory readout. Chrome's does. The layer tree
  and its memory is the exact thing we are trying to read.
- The kit's own README lists the Timelines tab events as not working and canvas content as not
  displaying, so the frame timing view is degraded too.
- When iOS kills the WebContent process for memory, nothing fires in the page and there is no
  crash dump you can reach from the browser. An attached inspector just disconnects.

So on iOS the probe in this guide is not a fallback, it is the better instrument. The one thing
worth having a debugger for on iOS is reading the console, and the probe already reports errors on
screen.

**Also true, and useful:** iOS may simply not reproduce this bug. Safari uses WebKit and its own
compositor, not Chromium's. If an Android phone crashes at step 4 and an iPhone does not, that on
its own points hard at the Chromium compositor and the grid layer, and that is a real result. Run
step 4 on both if you have both.

## What the probe can and cannot measure, per platform

Measured on this machine on 2026-08-01, under Chromium emulating a Pixel 5.

| Reading | Android Chrome | iOS Safari |
| --- | --- | --- |
| Frame rate, worst frame, dropped frames | yes | yes |
| JS heap in MB (`performance.memory`) | yes | **no**, WebKit does not expose it |
| Rough device RAM (`navigator.deviceMemory`) | yes, rounded to 0.25, 0.5, 1, 2, 4, 8 | **no**, Chromium only |
| GPU or compositor memory | only through DevTools on the cable, never from inside the page | no |
| DOM node count, zoom scale, touch counts | yes | yes |
| Errors thrown by the page | yes | yes |
| The tab being killed | breadcrumb only | breadcrumb only, and it is the only signal there is |

No browser lets a page read its own GPU memory. That is not a gap in this tool.

## If something goes wrong

- **The phone page never loads.** Almost always the firewall rule in Route B. Test it from the
  computer first: `http://127.0.0.1:4190/go` should work. If that works and the phone does not,
  it is the network, not the server.
- **The diag box does not appear.** The URL lost its `?diag=1`. Go back to `/go` and tap through.
- **The box shows CRASHED LAST RUN and you know it did not crash.** Force quitting the browser
  looks the same as a crash. Press "clear crash flag" and start again.
- **`.tmp/diag/` is empty.** The phone reached the page but the beacon did not get back. Use
  **copy** or **save file** on the phone instead.
- **`adb devices` shows nothing.** Try a different cable. Charge-only cables are common and give
  exactly this symptom.

## Files

- `scripts/mobile-diag-server.mjs`, the read only server and the collector. Port 4190 by default.
- `tools/mobile-diag.js`, the probe. No dependencies, no board internals, one rAF callback and one
  local storage write per second. Its own cost measured at 0.1ms per write for a 3.5KB record.
- `tests/board/mobile-diagnostics-harness.test.mjs`, proves the harness works under emulation.
- `.tmp/diag/<session>.jsonl`, the output. Git ignores `.tmp/`.
