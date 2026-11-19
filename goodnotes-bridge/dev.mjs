/* Lokaler Server: node dev.mjs  →  http://localhost:5173
   BRIDGE_MOCK=1 simuliert Claude ohne API-Schlüssel (für Oberflächentests). */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfHandler from './api/pdf.mjs';
import chatHandler, { erstelleHandler } from './api/chat.mjs';
import { attrappe } from './tests/attrappe.mjs';

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5173;
const chat = process.env.BRIDGE_MOCK ? erstelleHandler(() => attrappe()) : chatHandler;
const TYPEN = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript',
  '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const OEFFENTLICH = new Set(['index.html','app.css','app.js','bibliothek.js','werkzeuge-client.js','lib/prompts.mjs',
  'sw.js','icon.svg','icon-180.png','icon-512.png','manifest.webmanifest']);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if(url.pathname === '/api/chat') return chat(req, res);
  if(url.pathname === '/api/pdf') return pdfHandler(req, res);
  const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\//, '');
  if(!OEFFENTLICH.has(name)){ res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TYPEN[path.extname(name)] || 'application/octet-stream');
  res.end(await fs.readFile(path.join(wurzel, name)));
}).listen(port, () => console.log(`Ink Bridge läuft auf http://localhost:${port}${process.env.BRIDGE_MOCK ? '  (Claude simuliert)' : ''}`));
