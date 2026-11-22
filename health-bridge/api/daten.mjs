/* GET /api/daten?tage=30 – Rohbasis für das Dashboard; gerechnet wird im Browser mit /kern (Zoom ohne Nachladen).
   Zugang: x-puls-code. ?verbindung=1 liefert zusätzlich die Adressen für iPhone und Claude. */

import { antworte, passcodeOk, ratenGrenze, absender, codeZuKurz, MIN_CODE } from '../lib/guard.mjs';
import { basisLaden, letzterSync, zeitraum } from '../lib/abfragen.mjs';
import { laden as protokollLaden } from '../lib/protokoll.mjs';
import { KATALOG, BEREICHE } from '../lib/katalog.mjs';
import { ZONE, lokalerTag } from '../lib/zeit.mjs';
import { laden as einstellungenLaden, VORLAGEN, KACHELN, BEREICH_TITEL, PHASEN, SUPP_ZEITEN, SUPP_TAGE, SUPP_EINHEITEN } from '../lib/einstellungen.mjs';
import { POSEN } from '../lib/fotos.mjs';
import { basisBereich } from '../lib/bodybuilding.mjs';
import { SPLITS, MUSKELN, ARTEN } from '../kern/rechnen.mjs';

export function basisUrl(req){
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const katalogKurz = () => Object.fromEntries(Object.entries(KATALOG).map(([k, v]) => [k, { titel: v.titel, einheit: v.einheit, bereich: v.bereich, agg: v.agg, nk: v.nk }]));

export default async function handler(req, res){
  if(req.method !== 'GET') return antworte(res, 405, { code: 'methode', message: 'Nur GET.' }, { Allow: 'GET' });
  if(!ratenGrenze('daten:' + absender(req), 60)) return antworte(res, 429, { code: 'zu_oft', message: 'Zu viele Anfragen.' });
  if(codeZuKurz()) return antworte(res, 503, { code: 'code_zu_kurz', message: `Sicherheit: PULS_PASSCODE muss mindestens ${MIN_CODE} Zeichen haben (PULS_TOKEN mindestens 24).` });
  if(!passcodeOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
  const url = new URL(req.url, 'http://x');
  try {
    const z = zeitraum({ tage: url.searchParams.get('tage') || 30 }, 30, 400);
    const einstellungen = await einstellungenLaden();
    const b = basisBereich(z, einstellungen);
    const [basis, protokoll, sync] = await Promise.all([basisLaden(b), protokollLaden({ von: b.von, bis: z.bis }), letzterSync()]);
    const antwort = { heute: lokalerTag(new Date()), tage_geladen: Math.round((new Date(z.bis) - new Date(z.von)) / 864e5) + 1, zeitzone: ZONE(),
      basis, protokoll, einstellungen, letzterSync: sync, katalog: katalogKurz(), bereiche: BEREICHE,
      meta: { vorlagen: VORLAGEN, kacheln: KACHELN, bereiche: BEREICH_TITEL, phasen: PHASEN, splits: SPLITS, muskeln: MUSKELN, arten: ARTEN, supp_zeiten: SUPP_ZEITEN, supp_tage: SUPP_TAGE, supp_einheiten: SUPP_EINHEITEN, posen: POSEN } };
    if(url.searchParams.get('verbindung')){
      const basisU = basisUrl(req), t = process.env.PULS_TOKEN || 'lokal';
      antwort.verbindung = { sync: `${basisU}/api/sync?key=${t}`, mcp: `${basisU}/mcp/${t}`, token: t, tokenGesetzt: !!process.env.PULS_TOKEN };
    }
    return antworte(res, 200, antwort);
  } catch(e){
    console.error('[daten]', e);
    return antworte(res, e.status || 500, { code: e.code || 'fehler', message: e.code === 'keine_datenbank' ? 'Die Datenbank ist noch nicht verbunden (DATABASE_URL).' : 'Daten konnten nicht geladen werden.' });
  }
}
