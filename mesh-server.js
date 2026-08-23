#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// AutoNet Mesh-Sync signaling server — feature 5 of Prompt Forge's 2026 pack.
//
// A tiny WebSocket relay that lets multiple Prompt Forge clients on the same
// LAN discover each other via a 6-character join code and exchange WebRTC
// SDP/ICE offers+answers. Actual project state syncs peer-to-peer over WebRTC
// data channels — this server never sees project content, only signaling.
//
// Run:
//   node mesh-server.js                 # default ws://0.0.0.0:8770
//   PF_MESH_PORT=9000 node mesh-server.js
//   PF_MESH_WS=ws://192.168.1.10:8770 node mesh-server.js   # advertised URL
//
//   # TLS (required if Prompt Forge itself is served over https://; browsers
//   # block a plain ws:// connection from a secure https: page as mixed
//   # content, and Prompt Forge's mesh panel defaults to wss:// in that case):
//   PF_MESH_TLS_CERT=/path/to/fullchain.pem PF_MESH_TLS_KEY=/path/to/privkey.pem \
//     node mesh-server.js               # listens wss://0.0.0.0:8770
//
// In the app: click ⤴ SHARE → HOST SESSION (or enter a code → JOIN). If this
// server runs with TLS, set the resulting wss://host:port URL in the mesh
// panel's signaling-URL field (SET HOST) — or just let it default there,
// since Prompt Forge already assumes wss:// on an https: page.
// No external internet required. Graceful: the app hides/degrades the feature
// when this server isn't reachable.
// ═════════════════════════════════════════════════════════════════════════════
'use strict';

const PORT = parseInt(process.env.PF_MESH_PORT || '8770', 10);
const HOST = process.env.PF_MESH_HOST || '0.0.0.0';
const TLS_CERT_PATH = process.env.PF_MESH_TLS_CERT || '';
const TLS_KEY_PATH = process.env.PF_MESH_TLS_KEY || '';

// We avoid an external `ws` dependency: Node 21+ ships a global WebSocket, but
// to support Node 18 we implement a minimal RFC6455 server frame layer on top
// of the raw `http`/`https` + `net` modules. This is intentionally minimal —
// it only handles text frames (signaling JSON), close, and ping/pong. The
// frame layer works identically over TLS: `server.on('upgrade', ...)` hands
// us the raw socket either way (a plain net.Socket for http, a tls.TLSSocket
// for https), and both expose the same .write()/.on('data') API we use below.
const http = require('http');
const https = require('https');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');

const useTls = !!(TLS_CERT_PATH && TLS_KEY_PATH);
if ((TLS_CERT_PATH || TLS_KEY_PATH) && !useTls) {
  console.error('[mesh] PF_MESH_TLS_CERT and PF_MESH_TLS_KEY must both be set to enable TLS — falling back to plain ws://');
}

const requestHandler = (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sessions: sessions.size, peers: peers.size }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Prompt Forge AutoNet mesh signaling server. Connect via WebSocket.\n');
};

const server = useTls
  ? https.createServer({ cert: fs.readFileSync(TLS_CERT_PATH), key: fs.readFileSync(TLS_KEY_PATH) }, requestHandler)
  : http.createServer(requestHandler);

// session code -> Set(peerId)
const sessions = new Map();
// peerId -> { ws, code, peerId }
const peers = new Map();

function log(...a) { console.log('[mesh]', ...a); }

function broadcastPresence(code) {
  const members = sessions.get(code);
  if (!members) return;
  const list = Array.from(members);
  for (const pid of list) {
    const p = peers.get(pid);
    if (p && p.ws && p.ws.readyState === 1) {
      send(p.ws, { type: 'presence', peers: list });
    }
  }
}

function relay(fromPeer, msg) {
  const code = fromPeer.code;
  if (!code || !sessions.has(code)) return;
  const members = sessions.get(code);
  for (const pid of members) {
    if (pid === fromPeer.peerId) continue;
    const p = peers.get(pid);
    if (p && p.ws && p.ws.readyState === 1) {
      send(p.ws, Object.assign({}, msg, { from: fromPeer.peerId }));
    }
  }
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

// ── Minimal WebSocket frame encoder/decoder ─────────────────────────────────
function wsSendFrame(socket, opcode, payload) {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = buf.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  socket.write(Buffer.concat([header, buf]));
}

function wsParseFrame(buf) {
  // returns list of {opcode, payload, totalLen}
  const out = [];
  let i = 0;
  while (i < buf.length) {
    if (buf.length - i < 2) break;
    const b0 = buf[i], b1 = buf[i + 1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) === 0x80;
    let len = b1 & 0x7f;
    let off = i + 2;
    if (len === 126) { if (buf.length - off < 2) break; len = buf.readUInt16BE(off); off += 2; }
    else if (len === 127) { if (buf.length - off < 8) break; len = Number(buf.readBigUInt64BE(off)); off += 8; }
    let maskKey = null;
    if (masked) { if (buf.length - off < 4) break; maskKey = buf.slice(off, off + 4); off += 4; }
    if (buf.length - off < len) break;
    let payload = buf.slice(off, off + len);
    if (masked) {
      const un = Buffer.alloc(len);
      for (let k = 0; k < len; k++) un[k] = payload[k] ^ maskKey[k % 4];
      payload = un;
    }
    out.push({ opcode, payload, totalLen: off + len - i });
    i = off + len;
  }
  return out;
}

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n' +
    '\r\n'
  );
  socket.setNoDelay(true);
  const peer = { ws: { readyState: 1, send: (obj) => { try { wsSendFrame(socket, 1, typeof obj === 'string' ? obj : JSON.stringify(obj)); } catch {} } }, code: null, peerId: null };
  let buf = Buffer.alloc(0);
  let fragBuf = null;

  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const frames = wsParseFrame(buf);
    for (const f of frames) {
      buf = buf.slice(f.totalLen);
      if (f.opcode === 0x8) { // close
        try { wsSendFrame(socket, 8, Buffer.alloc(0)); } catch {}
        cleanup();
        socket.end();
        return;
      }
      if (f.opcode === 0x9) { wsSendFrame(socket, 0xA, f.payload); continue; } // ping→pong
      if (f.opcode === 0x1) { // text
        let text = f.payload.toString();
        let msg; try { msg = JSON.parse(text); } catch { continue; }
        handleMessage(peer, msg);
      }
    }
  });

  socket.on('close', cleanup);
  socket.on('error', () => { try { socket.destroy(); } catch {} });

  function cleanup() {
    if (peer.peerId && peers.get(peer.peerId) === peer) {
      peers.delete(peer.peerId);
      if (peer.code && sessions.has(peer.code)) {
        const set = sessions.get(peer.code);
        set.delete(peer.peerId);
        if (!set.size) sessions.delete(peer.code);
        else { broadcastPresence(peer.code); relay(peer, { type: 'peer-left', peerId: peer.peerId }); }
      }
    }
  }
});

function handleMessage(peer, msg) {
  if (msg.type === 'host') {
    peer.peerId = msg.peerId;
    peer.code = msg.code;
    peers.set(peer.peerId, peer);
    if (!sessions.has(peer.code)) sessions.set(peer.code, new Set());
    sessions.get(peer.code).add(peer.peerId);
    send(peer.ws, { type: 'host-ack', code: peer.code });
    broadcastPresence(peer.code);
    log('host', peer.code, 'by', peer.peerId);
  } else if (msg.type === 'join') {
    peer.peerId = msg.peerId;
    const code = msg.code;
    if (!sessions.has(code)) {
      send(peer.ws, { type: 'join-error', reason: 'no such session' });
      return;
    }
    peer.code = code;
    peers.set(peer.peerId, peer);
    sessions.get(code).add(peer.peerId);
    send(peer.ws, { type: 'join-ack', code });
    broadcastPresence(code);
    log('join', code, 'by', peer.peerId);
  } else if (msg.type === 'leave') {
    if (peer.code && sessions.has(peer.code)) {
      sessions.get(peer.code).delete(peer.peerId);
      peers.delete(peer.peerId);
      broadcastPresence(peer.code);
      relay(peer, { type: 'peer-left', peerId: peer.peerId });
    }
  } else if (msg.type === 'sdp' || msg.type === 'ice') {
    // relay to the target peer (msg.to) within the same session
    const target = peers.get(msg.to);
    if (target && target.code === peer.code && target.ws && target.ws.readyState === 1) {
      send(target.ws, { type: msg.type, from: peer.peerId, sdp: msg.sdp, candidate: msg.candidate });
    }
  }
}

server.listen(PORT, HOST, () => {
  const scheme = useTls ? 'wss://' : 'ws://';
  const advertised = process.env.PF_MESH_WS || `${scheme}${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`;
  log('AutoNet mesh signaling server listening on', `${scheme}${HOST}:${PORT}`, useTls ? '(TLS)' : '(plain — no TLS)');
  log('Set this URL in the Prompt Forge mesh panel\'s signaling-URL field (SET HOST): ' + advertised);
  log('Ctrl-C to stop.');
});
