/* Protokoll: Cheat Days, Ausnahmen vom Trainingsrhythmus, Notizen – ein Eintrag pro Tag. */
import { db } from './db.mjs';

const istTag = t => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t);

export function saeubern(e = {}){
  if(!istTag(e.tag)) return null;
  const einheiten = (Array.isArray(e.einheiten) ? e.einheiten : []).slice(0, 10)
    .map(x => ({ art: String(x?.art || '').trim().slice(0, 60), dauer_min: Math.round(Number(x?.dauer_min)) }))
    .filter(x => x.art && Number.isFinite(x.dauer_min) && x.dauer_min >= 1 && x.dauer_min <= 600);
  return { tag: e.tag, cheat: e.cheat === true, tagtyp: e.tagtyp === 'training' || e.tagtyp === 'rest' ? e.tagtyp : null, notiz: String(e.notiz || '').slice(0, 500),
    fokus: String(e.fokus || '').trim().slice(0, 60) || null, einheiten };
}

export async function laden(bereich){
  const { q } = await db();
  const r = await q(`select tag::text as tag, cheat, tagtyp, notiz, fokus, einheiten from protokoll where tag between $1::date and $2::date order by tag`, [bereich.von, bereich.bis]);
  return r.map(x => ({ tag: x.tag, cheat: x.cheat === true || x.cheat === 't', tagtyp: x.tagtyp || null, notiz: x.notiz || '', fokus: x.fokus || null,
    einheiten: typeof x.einheiten === 'string' ? JSON.parse(x.einheiten) : x.einheiten || [] }));
}

/** Speichert einen Tag; ein leerer Eintrag (kein Cheat, kein Typ, keine Notiz) wird gelöscht. */
export async function speichern(e){
  const s = saeubern(e);
  if(!s){ const err = new Error('tag'); err.status = 400; throw err; }
  const { q } = await db();
  if(!s.cheat && !s.tagtyp && !s.notiz && !s.fokus && !s.einheiten.length){ await q('delete from protokoll where tag = $1::date', [s.tag]); return { ...s, geloescht: true }; }
  await q(`insert into protokoll (tag, cheat, tagtyp, notiz, fokus, einheiten) values ($1::date, $2, $3, $4, $5, $6::jsonb)
    on conflict (tag) do update set cheat = excluded.cheat, tagtyp = excluded.tagtyp, notiz = excluded.notiz, fokus = excluded.fokus, einheiten = excluded.einheiten`,
    [s.tag, s.cheat, s.tagtyp, s.notiz, s.fokus, JSON.stringify(s.einheiten)]);
  return s;
}
