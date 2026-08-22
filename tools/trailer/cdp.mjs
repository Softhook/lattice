/**
 * **The transport, lifted from `tools/looking/look.mjs`.** A dependency-free CDP client: a
 * minimal RFC 6455 client, a one-target session, and the Chrome launcher.
 *
 * It is a copy rather than an import because `look.mjs` exports its *measurements* — `look`,
 * `judge`, `decodePng` — and keeps `MiniSocket` and `Session` module-private, and that file is
 * owned by another agent. Copying two classes is cheaper than an edit to somebody else's tool,
 * and the house rule it is copied *for* — **no npm dependencies in a tool** — is the reason both
 * files hand-roll a WebSocket in the first place.
 *
 * Changes from the original, all of them additive:
 *
 * | | why |
 * |---|---|
 * | `launch()` extracted | the capture tool needs the browser for minutes and many navigations, not one shot |
 * | `--disable-gpu` is optional | headless-new can rasterise on the GPU, and a trailer wants the nicer path if it is there |
 * | no PNG decode | frames are written straight to disk as the bytes Chrome produced |
 *
 * Impure by nature: spawns a browser, opens a socket, writes a temp directory.
 */

import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Where a browser might be, in the order worth trying. Same list as `look.mjs`. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
  '/snap/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

/** The first browser on disk, or `null`. */
export function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Enough of RFC 6455 to talk to a browser on loopback: text frames, continuation frames, ping,
 * close. No permessage-deflate, no extensions, no reconnection.
 *
 * The one non-obvious rule: a client **must** mask every frame it sends and a server **must not**
 * mask what it sends back. Get that backwards and Chrome closes the socket without a word.
 */
class MiniSocket {
  #socket;
  #buffer = Buffer.alloc(0);
  #fragments = [];
  #fragmentOpcode = 0;
  #onMessage;
  #onClose;

  constructor(socket, onMessage, onClose) {
    this.#socket = socket;
    this.#onMessage = onMessage;
    this.#onClose = onClose;
    socket.on('data', (chunk) => this.#feed(chunk));
    socket.on('close', () => onClose());
    socket.on('error', () => onClose());
  }

  /** Open a connection to `ws://host:port/path`, resolving once the handshake is accepted. */
  static open(url, onMessage, onClose) {
    const parsed = new URL(url);
    const key = randomBytes(16).toString('base64');
    const expected = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    return new Promise((resolve, reject) => {
      const socket = connect({ host: parsed.hostname, port: Number(parsed.port || 80) }, () => {
        socket.write(
          `GET ${parsed.pathname}${parsed.search} HTTP/1.1\r\n` +
            `Host: ${parsed.host}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${key}\r\n` +
            'Sec-WebSocket-Version: 13\r\n\r\n',
        );
      });
      socket.setNoDelay(true);

      let head = Buffer.alloc(0);
      const onHead = (chunk) => {
        head = Buffer.concat([head, chunk]);
        const end = head.indexOf('\r\n\r\n');
        if (end === -1) return;
        const headers = head.subarray(0, end).toString('latin1');
        socket.removeListener('data', onHead);
        if (!/^HTTP\/1\.1 101/.test(headers)) {
          socket.destroy();
          reject(new Error(`capture: the browser refused the debugger handshake — ${headers.split('\r\n')[0]}`));
          return;
        }
        if (!headers.toLowerCase().includes(expected.toLowerCase())) {
          socket.destroy();
          reject(new Error('capture: the debugger handshake did not verify (Sec-WebSocket-Accept mismatch)'));
          return;
        }
        const wire = new MiniSocket(socket, onMessage, onClose);
        const rest = head.subarray(end + 4);
        if (rest.length) wire.#feed(rest);
        resolve(wire);
      };
      socket.on('data', onHead);
      socket.on('error', (err) =>
        reject(new Error(`capture: could not reach the browser debugger — ${err.message}`)),
      );
    });
  }

  send(text) {
    const payload = Buffer.from(text, 'utf8');
    const mask = randomBytes(4);
    const length = payload.length;
    const header = length < 126 ? Buffer.alloc(6) : length < 65536 ? Buffer.alloc(8) : Buffer.alloc(14);

    header[0] = 0x81; // FIN + text
    if (length < 126) {
      header[1] = 0x80 | length;
      mask.copy(header, 2);
    } else if (length < 65536) {
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
      mask.copy(header, 4);
    } else {
      header[1] = 0x80 | 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(length, 6);
      mask.copy(header, 10);
    }

    const masked = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) masked[i] = payload[i] ^ mask[i & 3];
    this.#socket.write(Buffer.concat([header, masked]));
  }

  close() {
    try {
      this.#socket.destroy();
    } catch {
      /* the process is going away anyway */
    }
  }

  #feed(chunk) {
    this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, chunk]) : chunk;
    for (;;) {
      const frame = this.#readFrame();
      if (!frame) return;
      if (frame.opcode === 0x8) {
        this.#onClose();
        this.close();
        return;
      }
      if (frame.opcode === 0x9) continue; // a ping we do not need to answer on loopback
      if (frame.opcode === 0x0) {
        this.#fragments.push(frame.payload);
      } else {
        this.#fragments = [frame.payload];
        this.#fragmentOpcode = frame.opcode;
      }
      if (!frame.fin) continue;
      const whole = Buffer.concat(this.#fragments);
      this.#fragments = [];
      if (this.#fragmentOpcode === 0x1) this.#onMessage(whole.toString('utf8'));
    }
  }

  /** One frame off the front of the buffer, or `null` if it has not all arrived yet. */
  #readFrame() {
    const buf = this.#buffer;
    if (buf.length < 2) return null;
    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let length = buf[1] & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (buf.length < 4) return null;
      length = buf.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buf.length < 10) return null;
      const high = buf.readUInt32BE(2);
      if (high !== 0) throw new Error('capture: the browser sent a frame larger than 4 GB');
      length = buf.readUInt32BE(6);
      offset = 10;
    }
    if (masked) offset += 4;
    if (buf.length < offset + length) return null;

    const payload = buf.subarray(offset, offset + length);
    this.#buffer = buf.subarray(offset + length);
    return { fin, opcode, payload };
  }
}

/** A CDP connection to one page target. Attached to the page's own socket, so there is one tab. */
export class Session {
  #wire;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Map();
  #dead = false;

  static async attach(wsUrl) {
    const session = new Session();
    session.#wire = await MiniSocket.open(
      wsUrl,
      (text) => session.#receive(text),
      () => session.#die(),
    );
    return session;
  }

  send(method, params = {}) {
    if (this.#dead) return Promise.reject(new Error('capture: the browser closed the connection'));
    const id = this.#nextId++;
    const promise = new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject }));
    this.#wire.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  on(method, handler) {
    const list = this.#listeners.get(method) ?? [];
    list.push(handler);
    this.#listeners.set(method, list);
  }

  close() {
    this.#wire?.close();
  }

  #receive(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (message.id !== undefined) {
      const waiter = this.#pending.get(message.id);
      if (!waiter) return;
      this.#pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`capture: ${message.error.message}`));
      else waiter.resolve(message.result);
      return;
    }
    for (const handler of this.#listeners.get(message.method) ?? []) handler(message.params);
  }

  #die() {
    this.#dead = true;
    for (const { reject } of this.#pending.values()) {
      reject(new Error('capture: the browser closed the connection'));
    }
    this.#pending.clear();
  }
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chrome writes its chosen port here once the debugger is listening; poll until it appears. */
async function readDevToolsPort(userDataDir, timeoutMs) {
  const portFile = join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(portFile)) {
      const [port] = readFileSync(portFile, 'utf8').split('\n');
      if (port && Number(port) > 0) return Number(port);
    }
    await wait(50);
  }
  return null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    httpGet(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * A headless browser with one page attached, and the function that puts it away.
 *
 * `--force-device-scale-factor=1` and `--hide-scrollbars` are not cosmetic: without the first the
 * PNG comes back at the host's DPR and the frame is not the size the edit was cut for, and without
 * the second a scrollbar gutter appears in nine of nine shots.
 *
 * @returns {Promise<{ session: Session, close: () => void }>}
 */
export async function launch({ width, height, gpu = false }) {
  const binary = findChrome();
  if (!binary) {
    throw Object.assign(
      new Error(
        'capture: no Chrome, Chromium or Edge found. Set CHROME_PATH to a browser binary — ' +
          'without a browser there is nothing to capture.',
      ),
      { fatal: true },
    );
  }

  const userDataDir = mkdtempSync(join(tmpdir(), 'lattice-trailer-'));
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      `--window-size=${width},${height}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--no-first-run',
      '--no-default-browser-check',
      ...(gpu ? [] : ['--disable-gpu']),
      '--disable-extensions',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--mute-audio',
      'about:blank',
    ],
    // Chrome's own stderr is normally noise. `TRAILER_CHROME_LOG=1` lets it through, which is the
    // only way to see a renderer crash: CDP reports one as "the browser closed the connection",
    // which is true and says nothing about why.
    { stdio: process.env.TRAILER_CHROME_LOG ? 'inherit' : 'ignore' },
  );

  const close = () => {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* a leftover temp dir is not worth failing a capture over */
    }
  };

  try {
    const port = await readDevToolsPort(userDataDir, 20_000);
    if (!port) throw Object.assign(new Error('capture: the browser never opened a debugger port'), { fatal: true });
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!page) throw Object.assign(new Error('capture: the browser opened no page to attach to'), { fatal: true });
    const session = await Session.attach(page.webSocketDebuggerUrl);
    return { session, close };
  } catch (err) {
    close();
    throw err;
  }
}
