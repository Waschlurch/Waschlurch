/* Baut die Vorschau: node scripts/vorschau.mjs → vorschau/
   Eine Seite mit Beispieldaten, die ohne Server, Datenbank und Verbindung läuft. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

delete process.env.DATABASE_URL; delete process.env.PULS_PASSCODE;
const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ziel = path.join(wurzel, 'vorschau');
const { demoNutzlast } = await import('./demo-daten.mjs');
const { lesen } = await import('../lib/import.mjs');
const { speichern } = await import('../lib/abfragen.mjs');
const daten = (await import('../api/daten.mjs')).default;
const einst = (await import('../api/einstellungen.mjs')).default;

await speichern(lesen(demoNutzlast(150)));

async function ruf(handler, url){
  const req = Readable.from([]); req.method = 'GET'; req.url = url; req.headers = { host: 'vorschau' };
  let body = ''; const res = { statusCode: 0, setHeader(){}, end(t){ body = t; } };
  await handler(req, res);
  if(res.statusCode !== 200) throw new Error(url + ' → ' + res.statusCode + ' ' + body);
  return JSON.parse(body);
}

await fs.rm(ziel, { recursive: true, force: true });
await fs.mkdir(path.join(ziel, 'vorschau-daten'), { recursive: true });
for(const t of [7, 30, 90]){
  const d = await ruf(daten, `/api/daten?tage=${t}`);
  delete d.verbindung;
  d.letzterSync = { ...d.letzterSync, zeit: new Date(Date.now() - 42 * 60000).toISOString() };
  await fs.writeFile(path.join(ziel, 'vorschau-daten', `daten-${t}.json`), JSON.stringify(d));
}
await fs.writeFile(path.join(ziel, 'vorschau-daten', 'meta.json'), JSON.stringify(await ruf(einst, '/api/einstellungen')));

// Seite: nur Inhalt + eigene Kopfzeilen (die Hülle setzt der Host)
const html = await fs.readFile(path.join(wurzel, 'index.html'), 'utf8');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'))
  .replace('<main id="inhalt">', `<main id="inhalt">
  <div class="vorschau-band" role="note"><b>Vorschau</b><span>Beispieldaten – nichts ist mit Apple Health oder Claude verbunden. Alles hier lässt sich ausprobieren, auch „Ansicht &amp; Ziele“ über das Regler-Symbol oben.</span></div>`);
const kopf = `<title>Puls</title>
<meta name="puls-modus" content="vorschau">
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app.css">
<script type="module" src="app.js"></script>
`;
await fs.writeFile(path.join(ziel, 'index.html'), kopf + body);
for(const f of ['app.css', 'app.js', 'diagramme.js']) await fs.copyFile(path.join(wurzel, f), path.join(ziel, f));
const groessen = await Promise.all((await fs.readdir(path.join(ziel, 'vorschau-daten'))).map(async f => `${f} ${((await fs.stat(path.join(ziel, 'vorschau-daten', f))).size / 1024).toFixed(0)} KB`));
console.log('Vorschau gebaut:', groessen.join(', '));
process.exit(0);
