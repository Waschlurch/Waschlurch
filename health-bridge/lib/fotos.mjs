/* Form-Check-Fotos: speichern, auflisten, laden, löschen. Bilder liegen als JPEG in der eigenen Datenbank. */
import { db } from './db.mjs';

export const POSEN = ['Front entspannt', 'Front Doppelbizeps', 'Seite Brust', 'Rücken entspannt', 'Rücken Doppelbizeps', 'Seite Trizeps', 'Bauch & Beine', 'Most Muscular', 'Sonstige'];
const MAX_BYTES = 3_000_000;
const istTag = t => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);

export async function liste(){
  const { q } = await db();
  return (await q(`select id, tag::text as tag, pose, notiz, breite, hoehe, erstellt from fotos order by tag desc, id desc limit 500`))
    .map(r => ({ id: Number(r.id), tag: r.tag, pose: r.pose, notiz: r.notiz, breite: r.breite, hoehe: r.hoehe }));
}

export async function bild(id){
  const { q } = await db();
  const r = (await q(`select mime, bild from fotos where id = $1`, [Number(id)]))[0];
  return r ? { mime: r.mime, daten: Buffer.from(r.bild) } : null;
}

export async function speichern({ tag, pose, notiz = '', daten, breite, hoehe }){
  if(!istTag(tag) || !POSEN.includes(pose) || typeof daten !== 'string') throw Object.assign(new Error('ungueltig'), { status: 400 });
  const m = daten.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if(!m) throw Object.assign(new Error('format'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if(buf.length > MAX_BYTES) throw Object.assign(new Error('zu_gross'), { status: 413 });
  const { q } = await db();
  const r = (await q(`insert into fotos (tag, pose, notiz, mime, breite, hoehe, bild) values ($1::date, $2, $3, $4, $5, $6, $7) returning id`,
    [tag, pose, String(notiz).slice(0, 200), m[1], Number(breite) || null, Number(hoehe) || null, buf]))[0];
  return { id: Number(r.id), tag, pose };
}

export async function loeschen(id){
  const { q } = await db();
  await q(`delete from fotos where id = $1`, [Number(id)]);
}

/** Für den Form-Check: neueste Aufnahme je Pose plus die älteste derselben Pose als Vergleich (max. 8 Bilder). */
export async function auswahlFuerCheck(ids){
  const alle = await liste();
  let wahl;
  if(Array.isArray(ids) && ids.length) wahl = alle.filter(f => ids.includes(f.id)).slice(0, 8);
  else {
    const proPose = new Map(); for(const f of alle) (proPose.get(f.pose) || proPose.set(f.pose, []).get(f.pose)).push(f);
    wahl = [];
    for(const l of proPose.values()){ wahl.push(l[0]); if(l.length > 1 && l.at(-1).tag !== l[0].tag) wahl.push(l.at(-1)); }
    wahl = wahl.slice(0, 8);
  }
  return Promise.all(wahl.map(async f => ({ ...f, ...(await bild(f.id)) })));
}

export async function letzterCheck(){
  const { q } = await db();
  const r = (await q('select erstellt, foto_ids, modell, inhalt from formchecks order by id desc limit 1'))[0];
  return r ? { erstellt: new Date(r.erstellt).toISOString(), foto_ids: typeof r.foto_ids === 'string' ? JSON.parse(r.foto_ids) : r.foto_ids, modell: r.modell, check: typeof r.inhalt === 'string' ? JSON.parse(r.inhalt) : r.inhalt } : null;
}
export async function checkSpeichern(fotoIds, modell, inhalt){
  const { q } = await db();
  await q('insert into formchecks (foto_ids, modell, inhalt) values ($1::jsonb, $2, $3::jsonb)', [JSON.stringify(fotoIds), modell, JSON.stringify(inhalt)]);
}
