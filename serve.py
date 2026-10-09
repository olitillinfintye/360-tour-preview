import http.server, json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        if not self.path.split("?")[0].endswith((".jpg", ".png")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        path, _, qs = self.path.partition("?")
        if path != "/save":
            self.send_error(404)
            return
        key = dict(q.split("=", 1) for q in qs.split("&") if "=" in q).get("tour", "dembi")
        if key not in ("dembi", "wushwush", "bebeka", "bluenile", "jimma"):
            self.send_error(400, "unknown tour")
            return
        out = "tour.edited.json" if key == "dembi" else os.path.join(key, "tour.edited.json")
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            json.loads(data)
        except ValueError:
            self.send_error(400, "invalid json")
            return
        with open(os.path.join(ROOT, out), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
