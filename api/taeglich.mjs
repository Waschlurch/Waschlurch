/* ══════════════════════════════════════════════════════════════
   /api/taeglich – der nächtliche Lauf
   ══════════════════════════════════════════════════════════════
   Von Vercel Cron um 6:00 Uhr aufgerufen. Er tut genau drei Dinge:

     1. erinnern, wenn eine Vormerkung bald endet
     2. abgelaufene Vormerkungen auf EXPIRED setzen
     3. abgelaufene verbindliche Angebote auf EXPIRED setzen

   Er vergibt KEINE Nummern, bewegt KEIN Geld, versendet KEIN
   Angebot und löscht NICHTS. Das ist der Grundsatz: Ein
   Automatismus darf aufräumen und erinnern, mehr nicht.

   Doppelschutz auf zwei Ebenen:
     · eine Laufmarke je Tag in `automatik_laeufe`
     · ein Idempotenzschlüssel je Mail in `mail_ereignisse`
   Die zweite Ebene ist die wichtigere – die Laufmarke schützt vor
   einem zweiten Start, der Mailschlüssel auch vor einem Absturz
   mitten im Lauf.
   ══════════════════════════════════════════════════════════════ */

import { alle, holen, aendern, anlegen, nurNeu, jetztIso } from '../lib/firestore.mjs';
import { tokenErzeugen, antworte } from '../lib/sicherheit.mjs';
import { versende } from '../lib/mail.mjs';
import { erinnerung, abgelaufen } from '../lib/vorlagen.mjs';

const TAG = 86400000;

/* Tagesgenau vergleichen, nicht auf die Millisekunde. Sonst hinge
   es an der Uhrzeit des Laufs, ob eine Vormerkung als abgelaufen
   gilt – und ein Lauf um 06:00 käme zu einem anderen Ergebnis als
   einer um 06:02. */
function tageBis(isoDatum){
  if(!isoDatum) return null;
  const ziel = new Date(isoDatum); ziel.setHours(0,0,0,0);
  const heute = new Date();       heute.setHours(0,0,0,0);
  return Math.round((ziel.getTime() - heute.getTime()) / TAG);
}

export default async function handler(anfrage, antwort){
  /* Vercel Cron schickt einen eigenen Kopf mit. Ohne diese Prüfung
     könnte jeder den Lauf beliebig oft auslösen – die
     Idempotenzschlüssel würden zwar doppelte Mails verhindern, aber
     jeder Aufruf kostet Datenbankzugriffe. */
    const vonCron = anfrage.headers['x-vercel-cron'] !== undefined;
  const geheimnis = process.env.AKTION_GEHEIMNIS;
  const mitGeheimnis = geheimnis && anfrage.headers['authorization'] === 'Bearer ' + geheimnis;
  if(!vonCron && !mitGeheimnis){
    return antworte(antwort, 401, { fehler:'Nicht berechtigt.' });
  }

  const heute = new Date().toISOString().slice(0, 10);
  const bericht = { tag: heute, erinnert:0, abgelaufen:0, angebote_abgelaufen:0, fehler:[] };

  try {
    // ── Laufmarke: höchstens einmal pro Tag ───────────────────
    const frisch = await nurNeu('automatik_laeufe', 'taeglich-' + heute, {
      gestartet: jetztIso(), typ:'taeglich',
    });
    if(!frisch){
      return antworte(antwort, 200, { ok:true, uebersprungen:true,
        hinweis:'Der Lauf für ' + heute + ' ist bereits erfolgt.' });
    }

    const [vorsortierung, rechtstexte] = await Promise.all([
      holen('einstellungen', 'vorsortierung'),
      holen('einstellungen', 'rechtstexte'),
    ]);
    const erinnernAb = Number((vorsortierung && vorsortierung.erinnerung_tage_vorher) || 3);
    const ablaufText = (rechtstexte && rechtstexte.ablauf_text)
      || 'Ihre unverbindliche Vorabkalkulation ist am {{DATUM}} abgelaufen. Die enthaltenen Preise und '
       + 'Kapazitäten sind nicht mehr vorgemerkt. Sie können jederzeit eine aktualisierte Kalkulation '
       + 'oder einen Besprechungstermin anfragen.';

    const kalkulationen = await alle('vorkalkulationen', 300);

    for(const vk of kalkulationen){
      try {
        const offen = ['SENT','VIEWED','RESERVED'].includes(vk.status);
        if(!offen) continue;
        if(vk.kein_kontakt) continue;

        /* Nur Vorgemerktes hat eine zugesagte Frist. Versendet und
           Angesehen laufen nicht von selbst ab – dem Kunden wurde
           dafür kein Datum genannt. */
        if(vk.status !== 'RESERVED' || !vk.reserved_until) continue;

        const rest = tageBis(vk.reserved_until);
        if(rest === null) continue;

        // ── Erinnerung ────────────────────────────────────────
        if(rest === erinnernAb || rest === 1){
          if(!vk.email) continue;
          const token = await tokenErzeugen({
            dokumentTyp:'vorkalkulation', dokumentId: vk.id,
            dokumentVersion: Number(vk.version) || 1, kundeKey: vk.kunde_key,
            aktionen:['termin','aenderung','kein_interesse'], gueltigTage: rest + 14,
          });
          const nachricht = erinnerung(vk, token, rest);
          const ergebnis = await versende({
            an: vk.email, betreff: nachricht.betreff, html: nachricht.html, text: nachricht.text,
            idempotenzSchluessel: `erinnerung-${vk.id}-v${vk.version || 1}-rest${rest}`,
            zweck:'erinnerung', bezug:{ typ:'vorkalkulation', id: vk.id },
          });
          if(!ergebnis.uebersprungen){
            bericht.erinnert++;
            await anlegen('protokoll', {
              vorgang:'erinnerung_versendet', dokument:'vorkalkulation', dokument_id: vk.id,
              nummer: vk.nummer, tage_rest: rest, benutzer:'automatik', zeitpunkt: jetztIso(),
            });
          }
          continue;
        }

        // ── Ablauf ────────────────────────────────────────────
        if(rest < 0){
          await aendern('vorkalkulationen', vk.id, {
            status:'EXPIRED', expired_at: jetztIso(),
          });
          bericht.abgelaufen++;

          await anlegen('protokoll', {
            vorgang:'vk_abgelaufen', dokument:'vorkalkulation', dokument_id: vk.id,
            nummer: vk.nummer, status_vorher: vk.status, status_nachher:'EXPIRED',
            benutzer:'automatik', zeitpunkt: jetztIso(),
          });
          await anlegen('benachrichtigungen', {
            art:'vk_abgelaufen', titel:'Vorabkalkulation ' + vk.nummer + ' abgelaufen',
            text:[vk.vorname, vk.nachname].filter(Boolean).join(' '),
            ziel_bereich:'vorkalkulationen', ziel_id: vk.id,
            gelesen:false, createdAt: jetztIso(),
          }).catch(() => {});

          if(vk.email){
            const token = await tokenErzeugen({
              dokumentTyp:'vorkalkulation', dokumentId: vk.id,
              dokumentVersion: Number(vk.version) || 1, kundeKey: vk.kunde_key,
              aktionen:['neue_kalkulation','termin','kein_kontakt'], gueltigTage: 60,
            });
            const nachricht = abgelaufen(vk, token, ablaufText);
            await versende({
              an: vk.email, betreff: nachricht.betreff, html: nachricht.html, text: nachricht.text,
              idempotenzSchluessel: `ablauf-${vk.id}-v${vk.version || 1}`,
              zweck:'ablauf', bezug:{ typ:'vorkalkulation', id: vk.id },
            });
          }
        }
      } catch(err){
        console.error('Fehler bei ' + vk.nummer + ':', err.message);
        bericht.fehler.push(vk.nummer + ': ' + err.message);
      }
    }

    // ── Verbindliche Angebote ─────────────────────────────────
    /* Bestandsschutz: Die Sammlung enthält Dokumente mit alten
       deutschen Statuswerten. Beide Schreibweisen zählen als offen. */
    const angebote = await alle('angebote', 300);
    for(const a of angebote){
      try {
        const st = a.status;
        const istOffen = st === 'SENT' || st === 'VIEWED' || st === 'versendet';
        if(!istOffen) continue;
        if(!a.gueltig_bis) continue;
        if(tageBis(a.gueltig_bis) >= 0) continue;

        await aendern('angebote', a.id, { status:'EXPIRED', expired_at: jetztIso() });
        bericht.angebote_abgelaufen++;
        await anlegen('protokoll', {
          vorgang:'angebot_abgelaufen', dokument:'angebot', dokument_id: a.id,
          nummer: a.nummer, status_vorher: st, status_nachher:'EXPIRED',
          benutzer:'automatik', zeitpunkt: jetztIso(),
        });
      } catch(err){
        bericht.fehler.push('Angebot ' + (a.nummer || a.id) + ': ' + err.message);
      }
    }

    await aendern('automatik_laeufe', 'taeglich-' + heute, {
      beendet: jetztIso(), bericht: JSON.stringify(bericht),
    }).catch(() => {});

    return antworte(antwort, 200, { ok:true, ...bericht });

  } catch(err){
    console.error('Täglicher Lauf fehlgeschlagen:', err);
    return antworte(antwort, 500, { fehler: err.message, bericht });
  }
}
