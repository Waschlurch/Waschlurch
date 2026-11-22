/* GET /api/daten?tage=30 – alles, was das Dashboard zeigt. Zugang: x-puls-code (PULS_PASSCODE).
   ?verbindung=1 liefert zusätzlich die Adressen für iPhone und Claude (mit Token). */

import { antworte, passcodeOk, ratenGrenze, absender } from '../lib/guard.mjs';
import { tageswerte, schlaf, workouts, letzterSync, zeitraum, tageListe } from '../lib/abfragen.mjs';
import { KATALOG, BEREICHE } from '../lib/katalog.mjs';
import { ZONE } from '../lib/zeit.mjs';

export function basisUrl(req){
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const proto = req.headers['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function handler(req, res){
  if(req.method !== 'GET') return antworte(res, 405, { code: 'methode', message: 'Nur GET.' }, { Allow: 'GET' });
  if(!ratenGrenze('daten:' + absender(req), 60)) return antworte(res, 429, { code: 'zu_oft', message: 'Zu viele Anfragen.' });
  if(!passcodeOk(req)) return antworte(res, 401, { code: 'zugang', message: 'Zugangscode fehlt oder ist falsch.' });
  const url = new URL(req.url, 'http://x');
  try {
    const z = zeitraum({ tage: url.searchParams.get('tage') || 30, bis: url.searchParams.get('bis') }, 30, 366);
    const [reihen, naechte, wo, sync] = await Promise.all([tageswerte(Object.keys(KATALOG), z), schlaf(z), workouts(z), letzterSync()]);
    const antwort = { zeitraum: z, zeitzone: ZONE(), tage: tageListe(z), reihen, schlaf: naechte, workouts: wo, letzterSync: sync,
      katalog: Object.fromEntries(Object.entries(KATALOG).map(([k, v]) => [k, { titel: v.titel, einheit: v.einheit, bereich: v.bereich, agg: v.agg, nk: v.nk }])), bereiche: BEREICHE };
    if(url.searchParams.get('verbindung')){
      const basis = basisUrl(req), t = process.env.PULS_TOKEN || 'lokal';
      antwort.verbindung = { sync: `${basis}/api/sync?key=${t}`, mcp: `${basis}/mcp/${t}`, token: t, tokenGesetzt: !!process.env.PULS_TOKEN };
    }
    return antworte(res, 200, antwort);
  } catch(e){
    console.error('[daten]', e);
    return antworte(res, e.status || 500, { code: e.code || 'fehler', message: e.code === 'keine_datenbank' ? 'Die Datenbank ist noch nicht verbunden (DATABASE_URL).' : 'Daten konnten nicht geladen werden.' });
  }
}
