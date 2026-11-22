/* Lokaler Server: node dev.mjs → http://localhost:5174
   Ohne DATABASE_URL läuft PGlite im Speicher. PULS_DEMO=1 füllt 120 Tage Beispieldaten. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sync from './api/sync.mjs';
import daten from './api/daten.mjs';
import mcp from './api/mcp.mjs';

const wurzel = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5174;
const TYPEN = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const OEFFENTLICH = new Set(['index.html', 'app.css', 'app.js', 'diagramme.js', 'sw.js', 'icon.svg', 'manifest.webmanifest']);

if(process.env.PULS_DEMO){
  const { demoNutzlast } = await import('./scripts/demo-daten.mjs');
  const { lesen } = await import('./lib/import.mjs');
  const { speichern } = await import('./lib/abfragen.mjs');
  console.log('Demo-Daten:', await speichern(lesen(demoNutzlast(120))));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const mcpPfad = url.pathname.match(/^\/mcp(?:\/([^/]+))?$/);
  if(mcpPfad){ if(mcpPfad[1]) req.url = '/api/mcp?key=' + encodeURIComponent(mcpPfad[1]); return mcp(req, res); }
  if(url.pathname === '/api/mcp') return mcp(req, res);
  if(url.pathname === '/api/sync') return sync(req, res);
  if(url.pathname === '/api/daten') return daten(req, res);
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if(!OEFFENTLICH.has(name)){ res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', TYPEN[path.extname(name)] || 'application/octet-stream');
  res.end(await fs.readFile(path.join(wurzel, name)));
}).listen(port, () => console.log(`Puls läuft auf http://localhost:${port}`));
