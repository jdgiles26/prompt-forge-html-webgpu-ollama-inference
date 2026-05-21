#!/usr/bin/env python3
"""
Minimal local HTTP server for prompt-forge.html with the headers WebGPU /
SharedArrayBuffer need.

  Why this exists:
    Chrome treats file:// as an opaque origin. That blocks SharedArrayBuffer
    and cross-origin Worker redirects, which means transformers.js / ONNX
    Runtime cannot reliably run WebGPU inference from a file:// URL.
    Opening the same HTML over http://localhost with COOP+COEP set fixes it.

  Run:
    python3 serve.py
    # then open  http://localhost:8765/prompt-forge.html
"""

import http.server
import socketserver
import webbrowser
import sys
import os

PORT = int(os.environ.get("PF_PORT", "8765"))
HOST = "127.0.0.1"

class ReusableServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Cross-origin isolation: required for SharedArrayBuffer + threaded WASM
        self.send_header("Cross-Origin-Opener-Policy",   "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        # Allow the CDN model & runtime fetches to be embedded
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] %s - %s\n" % (self.address_string(), fmt % args))

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with ReusableServer((HOST, PORT), Handler) as httpd:
        url = f"http://{HOST}:{PORT}/prompt-forge.html"
        print(f"[serve] serving {os.getcwd()}")
        print(f"[serve] open:    {url}")
        print(f"[serve] stop:    Ctrl-C")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[serve] bye")

if __name__ == "__main__":
    main()
