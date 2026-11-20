/* Führt die Werkzeuge aus, die Claude anfordert – im Browser, auf der
   Bibliothek des Nutzers. Zurück geht ein tool_result-Block. */

import { alleNotizen, baum, ordnerFinden, seitenLesen, groesseText, SEITEN_PRO_AUFRUF } from './bibliothek.js';

const text = t => ({ type: 'text', text: t });
const bild = data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });

/** @param melde (text, fortschritt?) – für die Statuszeile */
export async function werkzeugAusfuehren(aufruf, melde = () => {}){
  const { name, input = {} } = aufruf;
  try {
    if(name === 'ordner_auflisten') return ergebnis(aufruf, await auflisten(String(input.pfad || ''), melde));
    if(name === 'notizen_suchen')   return ergebnis(aufruf, await suchen(String(input.begriff || ''), melde));
    if(name === 'notiz_lesen')      return await lesen(aufruf, melde);
    return ergebnis(aufruf, [text(`Unbekanntes Werkzeug: ${name}`)], true);
  } catch(e){
    if(!e?.sanft) console.error(e);
    return ergebnis(aufruf, [text(e?.sanft ? e.message : 'Das Werkzeug ist fehlgeschlagen: ' + (e?.message || 'unbekannter Fehler'))], true);
  }
}

function ergebnis(aufruf, content, fehler){
  const block = { type: 'tool_result', tool_use_id: aufruf.id, content };
  if(fehler) block.is_error = true;
  return block;
}

async function auflisten(pfad, melde){
  melde(pfad ? `Sieht in „${pfad}“ nach` : 'Sieht sich in der Bibliothek um');
  const alle = await alleNotizen();
  if(!alle.length) return [text('Die Bibliothek ist leer. Der Nutzer muss zuerst Goodnotes-Ordner hineinziehen.')];
  const wurzel = baum(alle);
  const k = ordnerFinden(wurzel, pfad);
  if(!k) return [text(`Kein Ordner „${pfad}“. Oberste Ebene: ${[...wurzel.ordner.keys()].join(', ') || '(nur Dateien)'}`)];

  const zeilen = [`Ordner: ${pfad || '(oberste Ebene)'}`];
  for(const u of [...k.ordner.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))){
    const anzahl = zaehleDateien(u);
    zeilen.push(`[Ordner] ${u.pfad}/  – ${anzahl} Notizbücher, ${u.seiten} Seiten`);
  }
  for(const d of k.dateien){
    zeilen.push(`[Notizbuch] ${d.pfad}  – ${d.seiten ? d.seiten + ' Seiten' : 'Seitenzahl unbekannt'}, ${groesseText(d.groesse)}`);
  }
  if(zeilen.length === 1) zeilen.push('(leer)');
  return [text(zeilen.join('\n'))];
}
const zaehleDateien = k => k.dateien.length + [...k.ordner.values()].reduce((s, u) => s + zaehleDateien(u), 0);

async function suchen(begriff, melde){
  melde(`Sucht nach „${begriff}“`);
  const b = begriff.trim().toLowerCase();
  if(!b) return [text('Kein Suchbegriff angegeben.')];
  const treffer = (await alleNotizen()).filter(n => n.pfad.toLowerCase().includes(b));
  if(!treffer.length) return [text(`Keine Treffer für „${begriff}“. Mit ordner_auflisten("") siehst du, was vorhanden ist.`)];
  return [text(`${treffer.length} Treffer für „${begriff}“:\n` + treffer.slice(0, 60)
    .map(n => `[Notizbuch] ${n.pfad}  – ${n.seiten ? n.seiten + ' Seiten' : 'Seitenzahl unbekannt'}`).join('\n')
    + (treffer.length > 60 ? `\n… und ${treffer.length - 60} weitere.` : ''))];
}

async function lesen(aufruf, melde){
  const { pfad, von = 1, bis = 0 } = aufruf.input || {};
  const name = String(pfad || '').split('/').pop();
  const { seiten, gesamt } = await seitenLesen(String(pfad || ''), Number(von) || 1, Number(bis) || 0,
    (n, ges, hinweis) => melde(hinweis || `Liest „${name}“ – Seite ${n} von ${ges}`, hinweis ? null : { n, ges }));
  if(!seiten.length) return ergebnis(aufruf, [text(`„${pfad}“ hat keine Seite in diesem Bereich (insgesamt ${gesamt}).`)], true);

  const erste = seiten[0].nummer, letzte = seiten.at(-1).nummer;
  const kopf = `${pfad} – Seite ${erste}${letzte > erste ? ` bis ${letzte}` : ''} von ${gesamt}.`
    + (letzte < gesamt ? ` Es folgen noch ${gesamt - letzte} Seiten; rufe notiz_lesen erneut ab Seite ${letzte + 1} auf (höchstens ${SEITEN_PRO_AUFRUF} auf einmal).` : ' Das ist das Ende des Notizbuchs.');
  const content = [text(kopf)];
  for(const s of seiten){ content.push(text(`— Seite ${s.nummer} —`), bild(s.data)); }
  return ergebnis(aufruf, content);
}

/** Grobe Größe eines tool_result in Zeichen – damit die Anfrage nicht platzt. */
export const groesseVon = block => JSON.stringify(block).length;
