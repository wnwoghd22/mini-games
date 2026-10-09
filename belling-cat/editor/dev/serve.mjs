// Static dev server: serves the webview bundle, dev harness and the scene files for editing
// outside VS Code. Usage: node dev/serve.mjs [port]   then open http://127.0.0.1:8139/
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const scenes = resolve(root, "../bevy/assets/scenes");
const port = Number(process.argv[2] ?? 8139);
const types = { ".png": "image/png", ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".map": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let file;
  if (url.pathname === "/") file = join(root, "dev/index.html");
  else if (url.pathname.startsWith("/scene/")) file = join(scenes, url.pathname.slice(7));
  else if (url.pathname.startsWith("/assets/")) file = join(scenes, "..", url.pathname.slice(8));
  else file = join(root, url.pathname);
  try {
    if (req.method === "PUT") {
      let body = "";
      for await (const chunk of req) body += chunk;
      await writeFile(file, body);
      res.writeHead(204).end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`cut editor dev harness: http://127.0.0.1:${port}/`));
