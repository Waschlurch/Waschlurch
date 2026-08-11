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

import { holen, aendern, anlegen, jetztIso } from '../lib/firestore.mjs';
import { pruefeVerwalter, tokenErzeugen, antworte, koerperLesen } from '../lib/sicherheit.mjs';
import { versende } from '../lib/mail.mjs';
import { vorabkalkulation } from '../lib/vorlagen.mjs';

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

    const { dokument_typ, dokument_id, pdf_base64, pdf_hash } = koerper;
    if(dokument_typ !== 'vorkalkulation')
      return antworte(antwort, 400, { fehler:'Unbekannter Dokumenttyp.' });
    if(!dokument_id)
      return antworte(antwort, 400, { fehler:'Keine Dokumentkennung.' });

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
