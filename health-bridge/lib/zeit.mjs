/* Zeit und Zahlen aus iPhone-Exporten lesen – tolerant gegenüber Format und Sprache. */

export const ZONE = () => process.env.PULS_TZ || 'Europe/Berlin';

const tagFmt = new Map();
/** Date → 'YYYY-MM-DD' in der Zeitzone des Nutzers. */
export function lokalerTag(d, zone = ZONE()){
  if(!tagFmt.has(zone)) tagFmt.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return tagFmt.get(zone).format(d);
}

/** Versatz der Zone zu UTC in Minuten zum Zeitpunkt d. */
function versatz(d, zone){
  const t = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    .formatToParts(d).reduce((o, p) => (o[p.type] = p.value, o), {});
  return (Date.UTC(+t.year, t.month - 1, +t.day, +t.hour, +t.minute, +t.second) - d.getTime()) / 60000;
}

/** Lokale Wanduhrzeit in der Zone → Date. */
export function ausLokal(j, mo, t, h = 0, mi = 0, s = 0, zone = ZONE()){
  const utc = Date.UTC(j, mo - 1, t, h, mi, s);
  const erst = versatz(new Date(utc), zone);
  const d = new Date(utc - erst * 60000);
  const zweit = versatz(d, zone);
  return zweit === erst ? d : new Date(utc - zweit * 60000);
}

/** Beginn des lokalen Tages 'YYYY-MM-DD' als Date. */
export const tagesbeginn = (tag, zone = ZONE()) => { const [j, m, t] = tag.split('-').map(Number); return ausLokal(j, m, t, 0, 0, 0, zone); };

export function tagPlus(tag, n){
  const d = new Date(tag + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const istTag = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));

/** Liest: ISO 8601, „2026-11-21 23:12:00 +0100“ (Health Auto Export), „21.11.2026, 23:12“, „2026-11-21“, Unix-Sekunden/-ms. */
export function zeitLesen(roh, zone = ZONE()){
  if(roh == null || roh === '') return null;
  if(roh instanceof Date) return isNaN(roh) ? null : roh;
  if(typeof roh === 'number') return new Date(roh < 1e12 ? roh * 1000 : roh);
  const s = String(roh).trim();
  let x = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if(x){
    const [, j, mo, t, h, mi, se = 0, z] = x;
    if(z){
      const iso = `${j}-${mo}-${t}T${h.padStart(2, '0')}:${mi}:${String(se).padStart(2, '0')}${z.toUpperCase() === 'Z' ? 'Z' : z.length === 5 ? z.slice(0, 3) + ':' + z.slice(3) : z}`;
      const d = new Date(iso); return isNaN(d) ? null : d;
    }
    return ausLokal(+j, +mo, +t, +h, +mi, +se, zone);
  }
  x = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(x) return ausLokal(+x[1], +x[2], +x[3], 0, 0, 0, zone);
  x = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s*(?:um\s*)?(?:(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(x){ const j = +x[3] < 100 ? 2000 + +x[3] : +x[3]; return ausLokal(j, +x[2], +x[1], +(x[4] || 0), +(x[5] || 0), +(x[6] || 0), zone); }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/** „8.412“, „7,5“, „1.234,5 kcal“, 72 → Zahl. */
export function zahlLesen(roh){
  if(typeof roh === 'number') return Number.isFinite(roh) ? roh : null;
  if(roh == null) return null;
  let s = String(roh).replace(/[^\d.,\-]/g, '');
  if(!s || s === '-') return null;
  if(s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if(s.includes(',')) s = s.replace(',', '.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
