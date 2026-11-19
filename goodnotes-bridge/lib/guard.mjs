/* Zugangsschutz, Ratenbegrenzung und Körper lesen.
   Der API-Schlüssel liegt nur auf dem Server. Damit niemand Fremdes ihn
   verbraucht, verlangt jede Anfrage den Zugangscode aus BRIDGE_PASSCODE. */

import crypto from 'node:crypto';

export const MAX_BODY_BYTES = 4_400_000; // knapp unter Vercels 4,5-MB-Grenze

export function antworte(res, status, daten){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(daten));
}

function gleich(a, b){
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

/** true = durchlassen. Ohne gesetzten Code nur lokal erlaubt. */
export function zugangOk(req, env = process.env){
  const soll = env.BRIDGE_PASSCODE;
  const ist = req.headers['x-bridge-code'] || '';
  if(!soll) return env.NODE_ENV !== 'production' && !env.VERCEL;
  return gleich(ist, soll);
}

const fenster = new Map();
/** Einfache Ratenbegrenzung pro Absender (pro Instanz, im Speicher). */
export function ratenGrenze(schluessel, max = 20, ms = 10 * 60_000, jetzt = Date.now()){
  const liste = (fenster.get(schluessel) || []).filter(t => jetzt - t < ms);
  if(liste.length >= max){ fenster.set(schluessel, liste); return false; }
  liste.push(jetzt); fenster.set(schluessel, liste);
  return true;
}

export function absender(req){
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket?.remoteAddress || 'unbekannt';
}

export async function koerperLesen(req, max = MAX_BODY_BYTES){
  if(req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const teile = []; let groesse = 0;
  for await (const t of req){
    groesse += t.length;
    if(groesse > max){ const e = new Error('zu_gross'); e.status = 413; throw e; }
    teile.push(t);
  }
  const roh = Buffer.concat(teile).toString('utf8');
  if(!roh) return {};
  try { return JSON.parse(roh); }
  catch { const e = new Error('kein_json'); e.status = 400; throw e; }
}
