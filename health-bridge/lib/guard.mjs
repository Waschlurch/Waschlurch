/* Zugang: PULS_TOKEN (langer Schlüssel) für iPhone-Sync und Claude, PULS_PASSCODE für das Dashboard.
   Ohne gesetzte Werte nur lokal offen – in Produktion wird dann alles abgelehnt. */

import crypto from 'node:crypto';

export const MAX_BODY_BYTES = 4_400_000; // knapp unter Vercels 4,5-MB-Grenze

export function antworte(res, status, daten, kopf = {}){
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for(const [k, v] of Object.entries(kopf)) res.setHeader(k, v);
  res.end(daten === undefined ? '' : JSON.stringify(daten));
}

function gleich(a, b){
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

const lokal = env => env.NODE_ENV !== 'production' && !env.VERCEL;

function url(req){ return new URL(req.url || '/', 'http://x'); }

/** Token aus „Authorization: Bearer …“, „x-puls-token“ oder ?key=… (für Claude-Connector-URLs). */
export function tokenOk(req, env = process.env){
  const soll = env.PULS_TOKEN;
  if(!soll) return lokal(env);
  if(!lokal(env) && soll.length < 24) return false; // Token muss lang und zufällig sein
  const auth = String(req.headers.authorization || '');
  const ist = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : req.headers['x-puls-token'] || url(req).searchParams.get('key') || '';
  return !!ist && gleich(ist, soll);
}

export const MIN_CODE = 10;
/** In Produktion muss der Zugangscode mindestens 10 Zeichen haben – sonst wird alles abgelehnt. */
export const codeZuKurz = (env = process.env) => !lokal(env) && (!env.PULS_PASSCODE || env.PULS_PASSCODE.length < MIN_CODE);

export function passcodeOk(req, env = process.env){
  const soll = env.PULS_PASSCODE;
  if(!soll) return lokal(env);
  if(codeZuKurz(env)) return false;
  return gleich(req.headers['x-puls-code'] || '', soll);
}

const fenster = new Map();
export function ratenGrenze(schluessel, max = 60, ms = 60_000, jetzt = Date.now()){
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
  if(typeof req.body === 'string') return parse(req.body);
  const teile = []; let groesse = 0;
  for await (const t of req){
    groesse += t.length;
    if(groesse > max){ const e = new Error('zu_gross'); e.status = 413; throw e; }
    teile.push(t);
  }
  return parse(Buffer.concat(teile).toString('utf8'));
}

function parse(roh){
  if(!roh.trim()) return {};
  try { return JSON.parse(roh); }
  catch { const e = new Error('kein_json'); e.status = 400; throw e; }
}
