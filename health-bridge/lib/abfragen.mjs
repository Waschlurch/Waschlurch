/* Lesen und Schreiben – von Dashboard und MCP-Server gemeinsam genutzt. */

import { db, upsert } from './db.mjs';
import { KATALOG, BEREICHE, info } from './katalog.mjs';
import { ZONE, lokalerTag, tagesbeginn, tagPlus, istTag } from './zeit.mjs';

const zahlen = r => { for(const k in r) if(typeof r[k] === 'string' && /_min$|^(wert|min|max|summe|mittel|letzter|n|energie_kcal|distanz_km|hf_mittel|hf_max|dauer_min)$/.test(k)) r[k] = Number(r[k]); return r; };
const runde = (v, nk = 1) => v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** nk) / 10 ** nk;
const isoZeit = v => v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();

export async function speichern(aus){
  const { q } = await db();
  const m = await upsert(q, 'messwerte', ['metrik', 'zeit', 'quelle', 'wert', 'min', 'max'], ['metrik', 'zeit', 'quelle'], aus.messwerte);
  const n = await upsert(q, 'schlaf_naechte', ['nacht', 'quelle', 'start', 'ende', 'gesamt_min', 'tief_min', 'kern_min', 'rem_min', 'wach_min', 'im_bett_min'], ['nacht', 'quelle'], aus.naechte);
  const w = await upsert(q, 'workouts', ['id', 'art', 'start', 'ende', 'dauer_min', 'energie_kcal', 'distanz_km', 'hf_mittel', 'hf_max', 'quelle'], ['id'], aus.workouts);
  await q('insert into syncs (format, messwerte, naechte, workouts, verworfen) values ($1,$2,$3,$4,$5)', [aus.format, m, n, w, aus.verworfen]);
  return { messwerte: m, naechte: n, workouts: w, verworfen: aus.verworfen, format: aus.format };
}

/** Zeitraum aus von/bis (YYYY-MM-DD, beide inklusive) oder „letzte n Tage“. */
export function zeitraum({ von, bis, tage } = {}, standardTage = 14, maxTage = 400){
  const heute = lokalerTag(new Date());
  const b = istTag(bis) ? bis : heute;
  let v = istTag(von) ? von : tagPlus(b, -(Math.max(1, Math.min(maxTage, Number(tage) || standardTage)) - 1));
  if(v > b) v = b;
  const spanne = Math.round((new Date(b) - new Date(v)) / 864e5) + 1;
  if(spanne > maxTage) v = tagPlus(b, -(maxTage - 1));
  return { von: v, bis: b };
}

export function tageListe({ von, bis }){
  const t = []; for(let d = von; d <= bis; d = tagPlus(d, 1)) t.push(d); return t;
}

/** Ein Wert je Tag und Metrik. Summen: stärkste Quelle zählt (keine Doppelzählung iPhone + Watch). */
export async function tageswerte(metriken, bereich){
  const { q } = await db();
  const zeilen = await q(`
    with t as (
      select metrik, (zeit at time zone $4)::date as tag, quelle, wert, coalesce(min, wert) mn, coalesce(max, wert) mx, zeit
      from messwerte where metrik = any($1::text[]) and zeit >= $2::timestamptz and zeit < $3::timestamptz
    ), pq as (
      select metrik, tag, quelle, sum(wert) s, avg(wert) a, min(mn) mn, max(mx) mx, count(*) n,
             (array_agg(wert order by zeit desc))[1] l, max(zeit) lz
      from t group by 1, 2, 3
    )
    select metrik, tag::text as tag, max(s) as summe, sum(a * n) / sum(n) as mittel, min(mn) as min, max(mx) as max,
           sum(n)::int as n, (array_agg(l order by lz desc))[1] as letzter
    from pq group by 1, 2 order by 1, 2`,
    [metriken, tagesbeginn(bereich.von).toISOString(), tagesbeginn(tagPlus(bereich.bis, 1)).toISOString(), ZONE()]);
  const aus = {};
  for(const r of zeilen.map(zahlen)){
    const i = info(r.metrik);
    (aus[r.metrik] ||= []).push({ tag: r.tag, wert: runde(i.agg === 'summe' ? r.summe : i.agg === 'letzter' ? r.letzter : r.mittel, Math.max(i.nk, 1)),
      ...(i.agg === 'mittel' && r.min !== r.max ? { min: runde(r.min, i.nk), max: runde(r.max, i.nk) } : {}), n: r.n });
  }
  return aus;
}

export async function schlaf(bereich){
  const { q } = await db();
  const zeilen = await q(`
    select distinct on (nacht) nacht::text as nacht, quelle, start, ende, gesamt_min, tief_min, kern_min, rem_min, wach_min, im_bett_min
    from schlaf_naechte where nacht between $1::date and $2::date
    order by nacht, (tief_min is not null) desc, gesamt_min desc`, [bereich.von, bereich.bis]);
  return zeilen.map(zahlen).map(r => ({
    nacht: r.nacht, start: isoZeit(r.start), ende: isoZeit(r.ende),
    gesamt_min: runde(r.gesamt_min, 0), tief_min: runde(r.tief_min, 0), kern_min: runde(r.kern_min, 0), rem_min: runde(r.rem_min, 0),
    wach_min: runde(r.wach_min, 0), im_bett_min: runde(r.im_bett_min, 0), quelle: r.quelle,
  }));
}

export async function workouts(bereich){
  const { q } = await db();
  const zeilen = await q(`select * from workouts where start >= $1::timestamptz and start < $2::timestamptz order by start desc limit 500`,
    [tagesbeginn(bereich.von).toISOString(), tagesbeginn(tagPlus(bereich.bis, 1)).toISOString()]);
  return zeilen.map(zahlen).map(r => ({ id: r.id, art: r.art, start: isoZeit(r.start), ende: isoZeit(r.ende), dauer_min: runde(r.dauer_min, 0),
    energie_kcal: runde(r.energie_kcal, 0), distanz_km: runde(r.distanz_km, 2), hf_mittel: runde(r.hf_mittel, 0), hf_max: runde(r.hf_max, 0) }));
}

export async function rohwerte(metrik, bereich, limit = 500){
  const { q } = await db();
  const zeilen = await q(`select zeit, wert, min, max, quelle from messwerte where metrik = $1 and zeit >= $2::timestamptz and zeit < $3::timestamptz order by zeit limit $4`,
    [metrik, tagesbeginn(bereich.von).toISOString(), tagesbeginn(tagPlus(bereich.bis, 1)).toISOString(), Math.min(5000, Math.max(1, limit))]);
  return zeilen.map(zahlen).map(r => ({ zeit: isoZeit(r.zeit), wert: runde(r.wert, 2), ...(r.min != null ? { min: r.min, max: r.max } : {}), quelle: r.quelle }));
}

export async function verfuegbar(){
  const { q } = await db();
  const m = (await q(`select metrik, count(*)::int as n, min(zeit) as erste, max(zeit) as letzte from messwerte group by metrik order by metrik`)).map(zahlen);
  const s = (await q(`select count(*)::int as n, min(nacht)::text as erste, max(nacht)::text as letzte from schlaf_naechte`))[0];
  const w = (await q(`select count(*)::int as n, min(start) as erste, max(start) as letzte from workouts`))[0];
  const tag = v => v ? lokalerTag(new Date(v)) : null;
  return {
    metriken: m.map(r => ({ metrik: r.metrik, titel: info(r.metrik).titel, bereich: info(r.metrik).bereich, einheit: info(r.metrik).einheit,
      tageswert: info(r.metrik).agg, messungen: r.n, erster_tag: tag(r.erste), letzter_tag: tag(r.letzte) })),
    schlaf: { naechte: Number(s.n), erste: s.erste, letzte: s.letzte },
    workouts: { anzahl: Number(w.n), erster_tag: tag(w.erste), letzter_tag: tag(w.letzte) },
  };
}

export async function letzterSync(){
  const { q } = await db();
  const r = (await q('select zeit, format, messwerte, naechte, workouts from syncs order by id desc limit 1'))[0];
  return r ? { zeit: isoZeit(r.zeit), format: r.format, messwerte: Number(r.messwerte), naechte: Number(r.naechte), workouts: Number(r.workouts) } : null;
}

const mittel = a => { const v = a.filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/** Kompakter Gesamtüberblick: Mittelwerte, letzter Wert und Veränderung gegenüber dem Zeitraum davor. */
export async function ueberblick(tage = 7){
  tage = Math.max(1, Math.min(180, Number(tage) || 7));
  const jetzt = zeitraum({ tage });
  const vorher = { von: tagPlus(jetzt.von, -tage), bis: tagPlus(jetzt.von, -1) };
  const alle = Object.keys(KATALOG);
  const [a, b, sa, sb, wo, sync] = await Promise.all([tageswerte(alle, jetzt), tageswerte(alle, vorher), schlaf(jetzt), schlaf(vorher), workouts(jetzt), letzterSync()]);
  const bereiche = {};
  for(const [name, i] of Object.entries(KATALOG)){
    if(!a[name]?.length) continue;
    const m = mittel(a[name].map(x => x.wert)), mv = mittel((b[name] || []).map(x => x.wert));
    const letzt = a[name].at(-1);
    (bereiche[i.bereich] ||= {})[name] = {
      titel: i.titel, einheit: i.einheit, mittel_pro_tag: runde(m, i.nk), letzter: { tag: letzt.tag, wert: letzt.wert },
      tage_mit_daten: a[name].length, vorzeitraum_mittel: runde(mv, i.nk), veraenderung_prozent: m != null && mv ? runde((m - mv) / mv * 100, 1) : null,
    };
  }
  if(sa.length){
    const g = mittel(sa.map(n => n.gesamt_min)), gv = mittel(sb.map(n => n.gesamt_min));
    bereiche.schlaf = { ...(bereiche.schlaf || {}),
      dauer: { mittel_min: runde(g, 0), vorzeitraum_mittel_min: runde(gv, 0), naechte: sa.length },
      phasen_mittel_min: { tief: runde(mittel(sa.map(n => n.tief_min)), 0), kern: runde(mittel(sa.map(n => n.kern_min)), 0), rem: runde(mittel(sa.map(n => n.rem_min)), 0), wach: runde(mittel(sa.map(n => n.wach_min)), 0) },
      letzte_nacht: sa.at(-1),
    };
  }
  if(wo.length) (bereiche.aktivitaet ||= {}).workouts = { anzahl: wo.length, minuten: runde(wo.reduce((s, w) => s + (w.dauer_min || 0), 0), 0), arten: [...new Set(wo.map(w => w.art))] };
  return { zeitraum: jetzt, vergleich_mit: vorher, zeitzone: ZONE(), letzter_sync: sync,
    bereiche: Object.fromEntries(Object.keys(BEREICHE).filter(k => bereiche[k]).map(k => [k, bereiche[k]])) };
}
