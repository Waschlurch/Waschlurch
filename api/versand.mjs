/* ══════════════════════════════════════════════════════════════
   /api/versand – Vorabkalkulation an den Kunden senden
   ══════════════════════════════════════════════════════════════
   Wird ausschließlich aus dem Dashboard aufgerufen, nach Freigabe.

   ⚠️ Der Browser schickt NUR die Dokumentkennung und das fertige
   PDF. Betrag, Empfänger und Texte liest diese Funktion selbst aus
   der Datenbank. Käme der Empfänger aus dem Browser, ließe er sich
   im Entwicklerwerkzeug ändern – und der Server verschickte
   fremde Kalkulationen an beliebige Adressen.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';
import { holen, aendern, anlegen, jetztIso } from '../lib/firestore.mjs';
import { pruefeVerwalter, tokenErzeugen, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { versende, ANHANG_GRENZE_BYTES } from '../lib/mail.mjs';
import { vorabkalkulation, verbindlichesAngebot } from '../lib/vorlagen.mjs';

/* Prüft den mitgeschickten Anhang und berechnet die Prüfsumme
   selbst. Ein fehlender Anhang ist erlaubt – dann geht die Mail
   ohne PDF hinaus, was besser ist als gar keine Mail. */
function pdfPruefen(base64){
  if(!base64) return { ok:true, base64:null, hash:null };
  if(typeof base64 !== 'string') return { ok:false, fehler:'Der Anhang hat ein unerwartetes Format.' };
  if(!/^[A-Za-z0-9+/]+=*$/.test(base64))
    return { ok:false, fehler:'Der Anhang ist nicht sauber kodiert.' };

  const bytes = Buffer.from(base64, 'base64');
  if(bytes.length > ANHANG_GRENZE_BYTES)
    return { ok:false, fehler:'Der Anhang ist zu groß (' + Math.round(bytes.length/1024) + ' KB).' };
  /* Ein PDF beginnt mit %PDF-. Alles andere hat im Anhang einer
     Angebotsmail nichts verloren. */
  if(bytes.slice(0, 5).toString('latin1') !== '%PDF-')
    return { ok:false, fehler:'Der Anhang ist kein PDF.' };

  return {
    ok: true, base64,
    hash: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}

const STANDARD_TEXTE = {
  unverbindlich:
    'Diese Vorabkalkulation basiert ausschließlich auf den bisher übermittelten Angaben und stellt kein ' +
    'verbindliches Angebot dar. Änderungen des Leistungsumfangs, der örtlichen Gegebenheiten oder des ' +
    'tatsächlichen Aufwands können zu Preisänderungen führen. Ein Vertrag kommt hierdurch nicht zustande. ' +
    'Ein verbindliches Angebot erhalten Sie erst nach Prüfung beziehungsweise Besprechung und ausdrücklicher ' +
    'Freigabe durch Waschlurch.',
  abgleich: 'Ihre angegebenen Kontaktdaten wurden mit Ihrer ursprünglichen Anfrage abgeglichen.',
};

export default async function handler(anfrage, antwort){
  if(anfrage.method !== 'POST'){
    return antworte(antwort, 405, { fehler:'Nur POST.' });
  }

  try {
    const koerper = await koerperLesen(anfrage);

    // ── 1. Ist das wirklich der Verwalter? ────────────────────
    const wer = await pruefeVerwalter(koerper.idToken);
    if(!wer.ok) return antworte(antwort, 401, { fehler: wer.grund });

    const { dokument_typ, dokument_id, pdf_base64 } = koerper;
    if(dokument_typ !== 'vorkalkulation' && dokument_typ !== 'angebot')
      return antworte(antwort, 400, { fehler:'Unbekannter Dokumenttyp.' });
    if(!dokument_id)
      return antworte(antwort, 400, { fehler:'Keine Dokumentkennung.' });

    /* ⚠️ Die Prüfsumme wird HIER berechnet, nicht aus dem Browser
       übernommen. Sie soll belegen, welches Dokument tatsächlich
       hinausging – ein Wert, den der Absender selbst mitliefert,
       belegt nichts. Der Browser schickt zwar auch einen; der wird
       bewusst verworfen.

       Ebenso die Größe: Ohne Grenze könnte ein manipulierter Aufruf
       beliebig große Anhänge durch den Postausgang schieben. */
    const pruefung = pdfPruefen(pdf_base64);
    if(!pruefung.ok) return antworte(antwort, 400, { fehler: pruefung.fehler });

    if(dokument_typ === 'angebot'){
      return versendeAngebot(antwort, dokument_id, pruefung.base64, pruefung.hash, wer);
    }
    const pdf_hash = pruefung.hash;

    // ── 2. Dokument laden und selbst prüfen ───────────────────
    const vk = await holen('vorkalkulationen', dokument_id);
    if(!vk) return antworte(antwort, 404, { fehler:'Vorabkalkulation nicht gefunden.' });

    /* Die Freigabe wird hier NOCH EINMAL geprüft, obwohl das
       Dashboard es schon getan hat. Der Browser ist kein
       Vertrauensanker: Wer den Aufruf nachbaut, umgeht jede Prüfung,
       die nur dort stattfindet. */
    if(vk.status !== 'ADMIN_APPROVED')
      return antworte(antwort, 409, { fehler:'Nur freigegebene Kalkulationen können versendet werden. Aktueller Stand: ' + vk.status });
    if(!vk.approved_by || !vk.approved_at)
      return antworte(antwort, 409, { fehler:'Es fehlt der Freigabevermerk.' });
    if(!vk.email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(vk.email))
      return antworte(antwort, 409, { fehler:'Keine gültige Empfängeradresse hinterlegt.' });
    if(!(Number(vk.brutto_gesamt_cent) > 0))
      return antworte(antwort, 409, { fehler:'Der Gesamtbetrag ist null.' });

    // ── 3. Einstellungen laden ────────────────────────────────
    const [rechtstexte, vorsortierung] = await Promise.all([
      holen('einstellungen', 'rechtstexte'),
      holen('einstellungen', 'vorsortierung'),
    ]);
    const vormerkungTage = Number((vorsortierung && vorsortierung.vormerkung_tage) || 14);
    const texte = {
      unverbindlich: (rechtstexte && rechtstexte.unverbindlich_hinweis) || STANDARD_TEXTE.unverbindlich,
      abgleich:      (rechtstexte && rechtstexte.abgleich_hinweis)      || STANDARD_TEXTE.abgleich,
      vormerkungTage,
    };

    // ── 4. Unveränderbaren Schnappschuss anlegen ──────────────
    /* Vor dem Versand, nicht danach: Was hinausgeht, muss belegbar
       sein, auch wenn der Versand mittendrin abbricht. */
    const schnappschuss = await anlegen('dokument_versionen', {
      dokument_typ:'vorkalkulation',
      dokument_id, nummer: vk.nummer, version: Number(vk.version) || 1,
      status_beim_versand:'SENT',
      kunde_key: vk.kunde_key || null,
      empfaenger: vk.email,
      brutto_gesamt_cent: Number(vk.brutto_gesamt_cent) || 0,
      netto_gesamt_cent: Number(vk.netto_gesamt_cent) || 0,
      kalkulation: vk.kalkulation || null,
      einstufung_wert: vk.einstufung_wert || null,
      rechtstext_version: Number(vk.rechtstext_version) || 1,
      agb_version: (rechtstexte && rechtstexte.agb_version) || null,
      pdf_hash: pdf_hash || null,
      freigegeben_von: vk.approved_by,
      freigegeben_am: vk.approved_at,
      versendet_von: wer.email,
      versendet_am: jetztIso(),
    });

    // ── 5. Einmal-Token für die Kundenaktionen ────────────────
    const token = await tokenErzeugen({
      dokumentTyp:'vorkalkulation',
      dokumentId: dokument_id,
      dokumentVersion: Number(vk.version) || 1,
      kundeKey: vk.kunde_key,
      aktionen:['termin','vormerken','aenderung','korrektur','kein_interesse'],
      gueltigTage: vormerkungTage + 30,
    });

    // ── 6. Versenden ──────────────────────────────────────────
    const nachricht = vorabkalkulation(vk, token, texte);
    const anhaenge = pdf_base64
      ? [{ name: (vk.nummer || 'Vorabkalkulation') + '.pdf', base64: pdf_base64 }]
      : [];

    const ergebnis = await versende({
      an: vk.email,
      betreff: nachricht.betreff,
      html: nachricht.html,
      text: nachricht.text,
      anhaenge,
      /* Version im Schlüssel: Eine NEUE Version desselben Dokuments
         darf versendet werden, ein zweiter Klick auf dieselbe nicht. */
      idempotenzSchluessel: `vk-versand-${dokument_id}-v${vk.version || 1}`,
      zweck:'vorabkalkulation',
      bezug:{ typ:'vorkalkulation', id: dokument_id },
    });

    if(ergebnis.uebersprungen){
      return antworte(antwort, 200, {
        ok:true, hinweis:'Diese Fassung wurde bereits versendet – es ging nichts doppelt hinaus.',
      });
    }

    // ── 7. Zustand fortschreiben ──────────────────────────────
    await aendern('vorkalkulationen', dokument_id, {
      status:'SENT',
      sent_at: jetztIso(),
      versendet_an: vk.email,
      version_id: schnappschuss.id,
      token_hash_hinweis:'Der Klartext des Aktionslinks wird nicht gespeichert.',
    });

    await anlegen('protokoll', {
      vorgang:'vk_versendet',
      dokument:'vorkalkulation', dokument_id, nummer: vk.nummer, version: vk.version,
      empfaenger: vk.email, brutto_cent: vk.brutto_gesamt_cent,
      version_id: schnappschuss.id, pdf_hash: pdf_hash || null,
      benutzer: wer.email, zeitpunkt: jetztIso(),
    });

    return antworte(antwort, 200, { ok:true, versendet_an: vk.email, version_id: schnappschuss.id });

  } catch(err){
    console.error('Versand fehlgeschlagen:', err);
    return antworte(antwort, 500, { fehler: err.message || 'Unbekannter Fehler beim Versand.' });
  }
}


/* ══════════════════════════════════════════════════════════════
   VERBINDLICHES ANGEBOT VERSENDEN (Phase 6)
   ══════════════════════════════════════════════════════════════
   Strenger als bei der Vorabkalkulation: Was hier hinausgeht,
   kann der Kunde zahlungspflichtig beauftragen. */
async function versendeAngebot(antwort, id, pdfBase64, pdfHash, wer){
  const a = await holen('angebote', id);
  if(!a) return antworte(antwort, 404, { fehler:'Angebot nicht gefunden.' });

  if(a.status !== 'ADMIN_APPROVED')
    return antworte(antwort, 409, { fehler:'Nur freigegebene Angebote können versendet werden. Aktueller Stand: ' + a.status });
  if(!a.approved_by || !a.approved_at)
    return antworte(antwort, 409, { fehler:'Es fehlt der Freigabevermerk.' });
  if(!a.email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(a.email))
    return antworte(antwort, 409, { fehler:'Keine gültige Empfängeradresse hinterlegt.' });
  if(!(Number(a.brutto_gesamt_cent) > 0))
    return antworte(antwort, 409, { fehler:'Der Gesamtbetrag ist null.' });
  if(a.spanne)
    return antworte(antwort, 409, { fehler:'Ein verbindliches Angebot darf keine Preisspanne enthalten.' });
  if(!a.gueltig_bis || new Date(a.gueltig_bis).getTime() < Date.now())
    return antworte(antwort, 409, { fehler:'Die Gültigkeit fehlt oder liegt in der Vergangenheit.' });

  const rechtstexte = await holen('einstellungen', 'rechtstexte');

  /* Verbraucherpflichten hier NOCH EINMAL geprüft, obwohl das
     Dashboard es getan hat. Fehlt die Belehrung, beginnt die
     Widerrufsfrist nicht zu laufen (§ 356 Abs. 3 BGB). */
  if(a.verbraucher){
    const belehrung = (rechtstexte && rechtstexte.widerruf_belehrung) || '';
    if(!String(belehrung).trim())
      return antworte(antwort, 409, { fehler:'Für Privatkunden fehlt die Widerrufsbelehrung.' });
  }

  const schnappschuss = await anlegen('dokument_versionen', {
    dokument_typ:'angebot',
    dokument_id: id, nummer: a.nummer, version: Number(a.version) || 1,
    status_beim_versand:'SENT',
    kunde_key: a.kunde_key || null,
    empfaenger: a.email,
    brutto_gesamt_cent: Number(a.brutto_gesamt_cent) || 0,
    netto_gesamt_cent: Number(a.netto_gesamt_cent) || 0,
    positionen: a.positionen || [],
    verbraucher: a.verbraucher === true,
    kundenart: a.kundenart || null,
    gueltig_bis: a.gueltig_bis,
    zahlungsbedingungen: a.zahlungsbedingungen || null,
    rechtstext_version: Number(a.rechtstext_version) || 1,
    agb_version: a.agb_version || null,
    pdf_hash: pdfHash || null,
    freigegeben_von: a.approved_by, freigegeben_am: a.approved_at,
    versendet_von: wer.email, versendet_am: jetztIso(),
  });

  /* Der Token erlaubt die zahlungspflichtige Beauftragung. Er läuft
     mit der Angebotsgültigkeit ab, nicht später – ein Angebot, das
     abgelaufen ist, darf sich nicht mehr annehmen lassen. */
  const tageBisAblauf = Math.max(1,
    Math.ceil((new Date(a.gueltig_bis).getTime() - Date.now()) / 86400000));

  const token = await tokenErzeugen({
    dokumentTyp:'angebot',
    dokumentId: id,
    dokumentVersion: Number(a.version) || 1,
    kundeKey: a.kunde_key,
    aktionen:['beauftragen','ablehnen','aenderung','frist'],
    gueltigTage: tageBisAblauf,
  });

  const nachricht = verbindlichesAngebot(a, token, {
    widerruf: (rechtstexte && rechtstexte.widerruf_belehrung) || '',
  });

  const ergebnis = await versende({
    an: a.email,
    betreff: nachricht.betreff, html: nachricht.html, text: nachricht.text,
    anhaenge: pdfBase64 ? [{ name: (a.nummer || 'Angebot') + '.pdf', base64: pdfBase64 }] : [],
    idempotenzSchluessel: `angebot-versand-${id}-v${a.version || 1}`,
    zweck:'angebot', bezug:{ typ:'angebot', id },
  });

  if(ergebnis.uebersprungen){
    return antworte(antwort, 200, {
      ok:true, hinweis:'Diese Fassung wurde bereits versendet – es ging nichts doppelt hinaus.',
    });
  }

  await aendern('angebote', id, {
    status:'SENT', sent_at: jetztIso(),
    versendet_an: a.email, version_id: schnappschuss.id,
  });

  await anlegen('protokoll', {
    vorgang:'angebot_versendet',
    dokument:'angebot', dokument_id: id, nummer: a.nummer, version: a.version,
    empfaenger: a.email, brutto_cent: a.brutto_gesamt_cent,
    version_id: schnappschuss.id, pdf_hash: pdfHash || null,
    benutzer: wer.email, zeitpunkt: jetztIso(),
  });

  return antworte(antwort, 200, { ok:true, versendet_an: a.email, version_id: schnappschuss.id });
}
