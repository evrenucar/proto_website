// A VNC server, small enough to read, real enough to test against.
//
// It speaks RFB 3.8 over WebSocket, which is the shape a browser can reach:
// KasmVNC, x11vnc with websockets, or websockify in front of any VNC server all
// present this. Authentication is the classic VNC challenge/response, DES with
// the bit-reversed password as the key, so a test can prove that the right
// credential connects and the wrong one is refused. It then paints one solid
// colour and answers framebuffer requests.
//
// It exists so the board's VNC node can be tested without a desktop to connect
// to. Anything it accepts, a real server accepts.

import { createCipheriv } from "node:crypto";
import { WebSocketServer } from "ws";

const SECURITY_VNC_AUTH = 2;
const SECURITY_NONE = 1;

// VNC's one quirk: the password is used as a DES key with every byte's bits
// reversed, padded or truncated to eight bytes.
function vncKeyFromPassword(password) {
  const key = Buffer.alloc(8, 0);
  const bytes = Buffer.from(String(password), "latin1");
  for (let i = 0; i < 8 && i < bytes.length; i++) {
    let b = bytes[i];
    let reversed = 0;
    for (let bit = 0; bit < 8; bit++) reversed |= ((b >> bit) & 1) << (7 - bit);
    key[i] = reversed;
  }
  return key;
}

function vncAuthResponse(challenge, password) {
  // VNC auth is plain single DES, which OpenSSL 3 has moved to the legacy
  // provider and Node will not give us. Triple DES with all three keys the same
  // is single DES by definition (E(D(E(x))) collapses when K1 = K2 = K3), and
  // that cipher is still in the default provider.
  const key = vncKeyFromPassword(password);
  const cipher = createCipheriv("des-ede3-ecb", Buffer.concat([key, key, key]), null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(challenge), cipher.final()]);
}

// A fixed challenge keeps the exchange reproducible; a real server would use
// random bytes, and nothing in the protocol depends on which it is.
const FIXED_CHALLENGE = Buffer.from("0123456789abcdef", "latin1");

export function startMockRfbServer({
  password = "hunter2",
  requireAuth = true,
  width = 320,
  height = 240,
  desktopName = "Mock desktop",
  colour = [0x2f, 0xda, 0xca],
} = {}) {
  const wss = new WebSocketServer({ port: 0 });
  const log = { connections: 0, authAttempts: [], authFailures: 0, sessions: 0, errors: [] };

  wss.on("connection", (ws) => {
    log.connections++;
    // Buffer the client's bytes and hand them out as each step needs them, so
    // the handshake reads as a sequence rather than a state machine.
    let inbox = Buffer.alloc(0);
    const waiters = [];
    const send = (buf) => ws.readyState === ws.OPEN && ws.send(buf, { binary: true });

    const pump = () => {
      while (waiters.length && inbox.length >= waiters[0].bytes) {
        const { bytes, resolve } = waiters.shift();
        const chunk = inbox.subarray(0, bytes);
        inbox = inbox.subarray(bytes);
        resolve(Buffer.from(chunk));
      }
    };
    const read = (bytes) => new Promise((resolve, reject) => {
      waiters.push({ bytes, resolve, reject });
      pump();
    });

    ws.on("message", (data) => {
      inbox = Buffer.concat([inbox, Buffer.from(data)]);
      pump();
    });

    // One close handler for the whole connection, not one per read: the reads
    // are sequential but a handshake makes a dozen of them.
    ws.on("close", () => {
      while (waiters.length) waiters.shift().reject(new Error("client went away"));
    });

    (async () => {
      // 1. Protocol version.
      send(Buffer.from("RFB 003.008\n", "latin1"));
      await read(12);

      // 2. Security types, then the client's pick.
      const offered = requireAuth ? SECURITY_VNC_AUTH : SECURITY_NONE;
      send(Buffer.from([1, offered]));
      const [chosen] = await read(1);

      if (chosen === SECURITY_VNC_AUTH) {
        send(FIXED_CHALLENGE);
        const answer = await read(16);
        const expected = vncAuthResponse(FIXED_CHALLENGE, password);
        const ok = answer.equals(expected);
        log.authAttempts.push({ ok });
        if (!ok) {
          log.authFailures++;
          // SecurityResult failure, then the reason string RFB 3.8 requires.
          const reason = Buffer.from("Authentication failed", "latin1");
          const failure = Buffer.alloc(8 + reason.length);
          failure.writeUInt32BE(1, 0);
          failure.writeUInt32BE(reason.length, 4);
          reason.copy(failure, 8);
          send(failure);
          ws.close();
          return;
        }
      }

      // 3. SecurityResult: accepted.
      const okResult = Buffer.alloc(4);
      okResult.writeUInt32BE(0, 0);
      send(okResult);

      // 4. ClientInit (shared flag), then ServerInit.
      await read(1);
      const name = Buffer.from(desktopName, "latin1");
      const init = Buffer.alloc(24 + name.length);
      init.writeUInt16BE(width, 0);
      init.writeUInt16BE(height, 2);
      // Pixel format: 32bpp, 24 depth, little endian, true colour BGRX, which is
      // what noVNC's raw decoder expects to receive.
      init.writeUInt8(32, 4);   // bits-per-pixel
      init.writeUInt8(24, 5);   // depth
      init.writeUInt8(0, 6);    // big-endian-flag
      init.writeUInt8(1, 7);    // true-colour-flag
      init.writeUInt16BE(255, 8);   // red-max
      init.writeUInt16BE(255, 10);  // green-max
      init.writeUInt16BE(255, 12);  // blue-max
      init.writeUInt8(16, 14);  // red-shift
      init.writeUInt8(8, 15);   // green-shift
      init.writeUInt8(0, 16);   // blue-shift
      init.writeUInt32BE(name.length, 20);
      name.copy(init, 24);
      send(init);
      log.sessions++;

      // 5. Serve the client's messages. Only the framebuffer request needs a
      //    real answer; the rest are read and dropped so the stream stays in
      //    step.
      const messageLengths = {
        3: 10,  // FramebufferUpdateRequest
        4: 8,   // KeyEvent
        5: 6,   // PointerEvent
      };
      // Channel order the client asked for. noVNC always requests 32bpp little
      // endian and picks its own shifts, so a server that ignored this would
      // paint the right picture in the wrong colours.
      let shifts = { red: 16, green: 8, blue: 0 };
      for (;;) {
        const [type] = await read(1);
        if (type === 0) { // SetPixelFormat: 3 bytes padding, then 16 of format
          const rest = await read(19);
          shifts = { red: rest[13], green: rest[14], blue: rest[15] };
          continue;
        }
        if (type === 2) { // SetEncodings: two bytes of padding/count, then the list
          const head = await read(3);
          await read(head.readUInt16BE(1) * 4);
          continue;
        }
        if (type === 6) { // ClientCutText
          const head = await read(7);
          await read(head.readUInt32BE(3));
          continue;
        }
        const length = messageLengths[type];
        if (length === undefined) throw new Error(`unknown client message ${type}`);
        await read(length - 1);
        if (type !== 3) continue;

        // FramebufferUpdate, one raw rectangle covering the screen.
        const pixels = Buffer.alloc(width * height * 4, 255);
        for (let i = 0; i < pixels.length; i += 4) {
          pixels[i + (shifts.red >> 3)] = colour[0];
          pixels[i + (shifts.green >> 3)] = colour[1];
          pixels[i + (shifts.blue >> 3)] = colour[2];
        }
        const header = Buffer.alloc(16);
        header.writeUInt8(0, 0);          // message type: FramebufferUpdate
        header.writeUInt8(0, 1);          // padding
        header.writeUInt16BE(1, 2);       // one rectangle
        header.writeUInt16BE(0, 4);       // x
        header.writeUInt16BE(0, 6);       // y
        header.writeUInt16BE(width, 8);
        header.writeUInt16BE(height, 10);
        header.writeInt32BE(0, 12);       // encoding: raw
        send(Buffer.concat([header, pixels]));
      }
    })().catch((error) => {
      if (!/client went away/.test(String(error))) {
        log.errors.push(String(error));
        console.error("[mock-rfb]", error);
      }
      ws.close();
    });
  });

  return new Promise((resolve) => {
    wss.on("listening", () => {
      resolve({
        url: `ws://127.0.0.1:${wss.address().port}`,
        log,
        close: () => new Promise((done) => wss.close(done)),
      });
    });
  });
}
