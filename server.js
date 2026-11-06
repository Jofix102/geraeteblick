// Kleiner statischer Webserver nur für die Auslieferung in StackBlitz (kein Teil der Anwendung).
const http = require("http");
const fs = require("fs");
const path = require("path");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8" };
const root = __dirname;
http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end("Verboten"); }
  // Fremdcode: liegt lokal unter js/vendor; in StackBlitz kommt er aus node_modules (npm-Paket qrcode-generator).
  const fallback = urlPath === "/js/vendor/qrcode.js" ? path.join(root, "node_modules", "qrcode-generator", "qrcode.js") : null;
  fs.readFile(file, (err, data) => {
    if (err && fallback) return fs.readFile(fallback, (e2, d2) => send(res, e2, d2, file));
    send(res, err, data, file);
  });
}).listen(3000, () => console.log("Geräteblick läuft auf Port 3000"));

function send(res, err, data, file) {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Nicht gefunden"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    res.end(data);
}
