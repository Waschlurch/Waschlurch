/* ══════════════════════════════════════════════════════════════
   PRÜFLAUF – Kalkulationsmotor und Vorsortierung
   ══════════════════════════════════════════════════════════════
   Aufruf:   node tests/lauf.mjs
   Ergebnis: Klartext, Rückgabewert 1 bei mindestens einem Fehler.

   Diese Datei gehört NICHT auf den Server. Sie liegt im Repo, damit
   sie mit dem Quelltext zusammen gepflegt wird; Vercel liefert
   `.mjs` im Unterordner `tests/` nicht als Seite aus.
   ══════════════════════════════════════════════════════════════ */

import { baueKern } from './kern.mjs';

let bestanden = 0, fehlgeschlagen = 0;
const fehler = [];

function pruefe(name, bedingung, gemessen){
  if(bedingung){ bestanden++; console.log('  ✓ ' + name); }
  else {
    fehlgeschlagen++;
    fehler.push(name + (gemessen !== undefined ? '  → gemessen: ' + JSON.stringify(gemessen) : ''));
    console.log('  ✗ ' + name + (gemessen !== undefined ? '   gemessen: ' + JSON.stringify(gemessen) : ''));
  }
}
function block(titel){ console.log('\n── ' + titel + ' ' + '─'.repeat(Math.max(0, 58 - titel.length))); }

const K = baueKern();

/* ══════════════════════════════════════════════════════════════ */
block('Cent-Rechnung');

pruefe('zuCent rundet kaufmännisch', K.zuCent(12.345) === 1235 || K.zuCent(12.345) === 1234, K.zuCent(12.345));
pruefe('zuCent(0) ist 0, nicht leer', K.zuCent(0) === 0, K.zuCent(0));
pruefe('zuCent verkraftet Unsinn', K.zuCent('abc') === 0, K.zuCent('abc'));
pruefe('0,1 + 0,2 ergibt exakt 30 Cent', K.zuCent(0.1) + K.zuCent(0.2) === 30, K.zuCent(0.1) + K.zuCent(0.2));
pruefe('prozentVonCent(10000, 19) = 1900', K.prozentVonCent(10000, 19) === 1900, K.prozentVonCent(10000, 19));
pruefe('prozentVonCent rundet auf ganze Cent', Number.isInteger(K.prozentVonCent(3333, 19)), K.prozentVonCent(3333, 19));

/* ══════════════════════════════════════════════════════════════ */
block('Test 21 – fehlerhafter oder unvollständiger Preis');

const leer = K.berechneKalkulation({});
pruefe('leere Eingabe ergibt 0, nicht NaN', leer.brutto_gesamt_cent === 0 || leer.brutto_gesamt_cent === K.zuCent(0), leer.brutto_gesamt_cent);
pruefe('leere Eingabe: keine Position', leer.positionen.filter(p => p.art === 'leistung').length === 0);
pruefe('kein NaN in den Summen',
  [leer.netto_gesamt_cent, leer.mwst_cent, leer.brutto_gesamt_cent].every(Number.isFinite),
  [leer.netto_gesamt_cent, leer.mwst_cent, leer.brutto_gesamt_cent]);

const negativ = K.berechneKalkulation({ leistungen: [{ id:'haushalt', qty:-50 }] });
pruefe('negative Menge senkt die Summe nicht', negativ.netto_gesamt_cent >= 0, negativ.netto_gesamt_cent);

const unsinn = K.berechneKalkulation({ leistungen: [{ id:'gibtesnicht', qty:10 }] });
pruefe('unbekannte Leistung wird übergangen', unsinn.positionen.filter(p => p.art==='leistung').length === 0);

const alleGanz = K.berechneKalkulation({
  leistungen: [{ id:'haushalt', qty:73 }, { id:'fenster', qty:11, qty2:3 }],
  km: 12.5, zuschlaege: { wochenende:true }, sicherheitsaufschlag_prozent: 7,
});
pruefe('alle Beträge sind ganze Cent',
  alleGanz.positionen.every(p => Number.isInteger(p.betrag_cent))
  && Number.isInteger(alleGanz.netto_gesamt_cent)
  && Number.isInteger(alleGanz.mwst_cent)
  && Number.isInteger(alleGanz.brutto_gesamt_cent));
pruefe('Summe der Positionen = Zwischensumme',
  alleGanz.positionen.reduce((s,p) => s + p.betrag_cent, 0) === alleGanz.zwischensumme_cent,
  { positionen: alleGanz.positionen.reduce((s,p)=>s+p.betrag_cent,0), zwischensumme: alleGanz.zwischensumme_cent });
pruefe('Netto + USt = Brutto',
  alleGanz.netto_gesamt_cent + alleGanz.mwst_cent === alleGanz.brutto_gesamt_cent);

/* Determinismus – dieselbe Eingabe, dasselbe Ergebnis. */
const a1 = K.berechneKalkulation({ leistungen:[{id:'buero',qty:240}], km:9, zuschlaege:{express:true} });
const a2 = K.berechneKalkulation({ leistungen:[{id:'buero',qty:240}], km:9, zuschlaege:{express:true} });
pruefe('gleiche Eingabe ergibt gleiches Ergebnis',
  JSON.stringify(a1) === JSON.stringify(a2));
pruefe('Regelversion wird mitgeschrieben', a1.regelversion === K.KALK_REGELVERSION, a1.regelversion);

/* ══════════════════════════════════════════════════════════════ */
block('Rechenweg von Hand nachgerechnet');

/* Büroreinigung 200 m² × 0,52 €/m² = 104,00 €
   Anfahrt 10 km × 2 × 0,50 €      =  10,00 €
   Zwischensumme                    = 114,00 €
   Wochenende +20 %                 =  22,80 €
   Netto je Einsatz                 = 136,80 €
   Einzelrechnung, ×1               = 136,80 €
   USt 19 %                         =  25,99 €  (136,80 × 0,19 = 25,992 → 25,99)
   Brutto                           = 162,79 € */
const hand = K.berechneKalkulation({
  leistungen: [{ id:'buero', qty:200 }],
  km: 10, zuschlaege: { wochenende:true },
});
pruefe('Leistungen = 104,00 €', hand.leistungen_cent === 10400, hand.leistungen_cent);
pruefe('Anfahrt = 10,00 €', hand.anfahrt_cent === 1000, hand.anfahrt_cent);
pruefe('Zwischensumme = 114,00 €', hand.zwischensumme_cent === 11400, hand.zwischensumme_cent);
pruefe('Zuschlag 20 % = 22,80 €', hand.zuschlag_cent === 2280, hand.zuschlag_cent);
pruefe('Netto je Einsatz = 136,80 €', hand.netto_einsatz_cent === 13680, hand.netto_einsatz_cent);
pruefe('USt 19 % = 25,99 €', hand.mwst_cent === 2599, hand.mwst_cent);
pruefe('Brutto = 162,79 €', hand.brutto_gesamt_cent === 16279, hand.brutto_gesamt_cent);

/* Mindestpreis greift: Haushaltsreinigung 40 m² × 0,42 = 16,80 €,
   Mindestpreis der Leistung ist 38,00 €. */
const mindest = K.berechneKalkulation({ leistungen: [{ id:'haushalt', qty:40 }], km:0, anfahrtspauschale:false });
pruefe('Mindestpreis der Leistung greift', mindest.leistungen_cent === 3800, mindest.leistungen_cent);
pruefe('Mindestpreis wird als Hinweis vermerkt',
  mindest.positionen.some(p => p.hinweis && p.hinweis.includes('Mindestpreis')));

/* Mindestabnahme: Hausmeister 1 Std., min_qty 2 → 2 × 27 = 54 € */
const minMenge = K.berechneKalkulation({ leistungen: [{ id:'hausmeister', qty:1 }], km:0, anfahrtspauschale:false });
pruefe('Mindestabnahme greift', minMenge.leistungen_cent === 5400, minMenge.leistungen_cent);

/* Kleinunternehmer: 0 % USt darf nicht durch 19 % ersetzt werden. */
const klein = baueKern({ vorgaben: { mwst_satz: 0, kleinunternehmer: true } });
const ohneUst = klein.berechneKalkulation({ leistungen: [{ id:'buero', qty:200 }], km:0, anfahrtspauschale:false });
pruefe('Kleinunternehmer: 0 % USt bleibt 0', ohneUst.mwst_cent === 0, ohneUst.mwst_cent);
pruefe('Kleinunternehmer: Brutto = Netto', ohneUst.brutto_gesamt_cent === ohneUst.netto_gesamt_cent);

/* Rabatt kann nicht unter null drücken. */
const ueberRabatt = K.berechneKalkulation({
  leistungen: [{ id:'buero', qty:100 }], km:0, anfahrtspauschale:false,
  rabatt_prozent: 80, rabatt_cent: 100000,
});
pruefe('Rabatt drückt nicht ins Minus', ueberRabatt.netto_gesamt_cent >= 0, ueberRabatt.netto_gesamt_cent);

/* Mindestauftragswert hebt an, senkt aber nie. */
const grossMitMindest = K.berechneKalkulation({
  leistungen: [{ id:'buero', qty:2000 }], km:0, anfahrtspauschale:false, mindestauftragswert: 45,
});
pruefe('Mindestauftragswert senkt einen großen Auftrag nicht',
  grossMitMindest.mindest_angehoben_cent === 0, grossMitMindest.mindest_angehoben_cent);

/* ══════════════════════════════════════════════════════════════ */
block('Entfernung');

pruefe('Sitz Eitorf = 0 km', K.entfernungFuer('53783') === 0, K.entfernungFuer('53783'));
pruefe('Hennef = 9 km', K.entfernungFuer('53773') === 9, K.entfernungFuer('53773'));
pruefe('unbekannte PLZ ergibt null, nicht 0', K.entfernungFuer('99999') === null, K.entfernungFuer('99999'));
pruefe('fehlende PLZ ergibt null', K.entfernungFuer('') === null, K.entfernungFuer(''));
pruefe('Unsinn ergibt null', K.entfernungFuer('abc') === null, K.entfernungFuer('abc'));

const eigeneKm = baueKern({ vorsortierung: { plz_km: '12345=55\n54321: 7' } });
pruefe('eigene Entfernung wird gelesen', eigeneKm.entfernungFuer('12345') === 55, eigeneKm.entfernungFuer('12345'));
pruefe('eigene Entfernung auch mit Doppelpunkt', eigeneKm.entfernungFuer('54321') === 7, eigeneKm.entfernungFuer('54321'));
pruefe('eigene Werte überschreiben die Vorgabe nicht ungefragt', eigeneKm.entfernungFuer('53773') === 9);

/* ══════════════════════════════════════════════════════════════ */
block('Mengen aus der Anfrage');

const mengen = K.mengenAusAnfrage({
  leistungen_ids: ['haushalt','fenster','treppe'],
  flaeche_m2: '85', etagen: '3',
  service_details: { fenster: { anzahl_fenster: '12' } },
});
pruefe('Fläche wird zur Menge', mengen.haushalt && mengen.haushalt.qty === 85, mengen.haushalt);
pruefe('Fensteranzahl wird gelesen', mengen.fenster && mengen.fenster.qty === 12, mengen.fenster);
pruefe('Etagen werden gelesen', mengen.treppe && mengen.treppe.qty === 3, mengen.treppe);
pruefe('Herkunft wird vermerkt', mengen.haushalt.quelle && mengen.haushalt.quelle.length > 0, mengen.haushalt.quelle);
pruefe('nicht gewünschte Leistung fehlt', mengen.buero === undefined);

const altbestand = K.mengenAusAnfrage({ leistungen: 'Büroreinigung, Fensterreinigung', flaeche_m2: '150' });
pruefe('Altbestand ohne IDs wird über den Namen erkannt',
  altbestand.buero && altbestand.buero.qty === 150, altbestand.buero);

const kommazahl = K.mengenAusAnfrage({ leistungen_ids:['haushalt'], flaeche_m2: '72,5' });
pruefe('Komma-Fläche wird verstanden', kommazahl.haushalt.qty === 72.5, kommazahl.haushalt.qty);

/* ══════════════════════════════════════════════════════════════ */
block('Test 2 – Standardauftrag');

const standard = K.vorsortiereAnfrage({
  leistungen_ids:['haushalt'], flaeche_m2:'90', plz:'53773',
  haeufigkeit:'Einmalig', nachricht:'Bitte einmal gründlich durchputzen.',
});
pruefe('Einstufung STANDARD_JOB', standard.einstufung.einstufung === 'STANDARD_JOB', standard.einstufung.einstufung);
pruefe('keine Besichtigung nötig', standard.einstufung.besichtigung_noetig === false);
pruefe('keine Preisspanne nötig', standard.einstufung.spanne_noetig === false);
pruefe('Entwurf darf automatisch entstehen', standard.einstufung.entwurf_automatisch === true);
pruefe('Begründung ist nicht leer', standard.einstufung.begruendung.length > 0);
pruefe('Auftragswert wurde berechnet', standard.kalkulation.brutto_gesamt_cent > 0, standard.kalkulation.brutto_gesamt_cent);

/* ══════════════════════════════════════════════════════════════ */
block('Test 1 – Auftrag unter Mindestwert');

const winzig = K.vorsortiereAnfrage({
  leistungen_ids:['muell'], plz:'53783',
  service_details:{ muell:{ anzahl_tonnen:'1' } }, haeufigkeit:'Einmalig',
});
pruefe('Einstufung MICRO_JOB', winzig.einstufung.einstufung === 'MICRO_JOB', winzig.einstufung.einstufung);
pruefe('wird NICHT automatisch abgesagt', winzig.einstufung.einstufung !== 'REJECTED');
pruefe('bietet Mindestwert anwenden an', winzig.einstufung.optionen.includes('mindestwert_anwenden'), winzig.einstufung.optionen);
pruefe('bietet Zusatzleistungen an', winzig.einstufung.optionen.includes('zusatzleistungen_vorschlagen'));
pruefe('bietet Sammeltermin an', winzig.einstufung.optionen.includes('sammeltermin_anbieten'));
pruefe('bietet manuelle Prüfung an', winzig.einstufung.optionen.includes('manuelle_pruefung'));

/* ══════════════════════════════════════════════════════════════ */
block('Test 3 – Großprojekt');

const gross = K.vorsortiereAnfrage({
  leistungen_ids:['buero'], flaeche_m2:'4000', plz:'53721', haeufigkeit:'Einmalig',
});
pruefe('Einstufung LARGE_JOB', gross.einstufung.einstufung === 'LARGE_JOB', gross.einstufung.einstufung);
pruefe('Besichtigung verlangt', gross.einstufung.besichtigung_noetig === true);
pruefe('Preisspanne verlangt', gross.einstufung.spanne_noetig === true);
pruefe('Preisspanne ist berechnet', gross.kalkulation.spanne !== null, gross.kalkulation.spanne);
pruefe('Spanne umschließt den Preis',
  gross.kalkulation.spanne
  && gross.kalkulation.spanne.von_cent < gross.kalkulation.brutto_gesamt_cent
  && gross.kalkulation.spanne.bis_cent > gross.kalkulation.brutto_gesamt_cent);
pruefe('kein automatischer Entwurf', gross.einstufung.entwurf_automatisch === false);

/* ══════════════════════════════════════════════════════════════ */
block('Test 4 – Risikoprojekt');

const risiko = K.vorsortiereAnfrage({
  leistungen_ids:['grund'], flaeche_m2:'120', plz:'53773',
  nachricht:'Im Keller ist Schimmel, außerdem ein alter Wasserschaden.',
});
pruefe('Einstufung HIGH_RISK_JOB', risiko.einstufung.einstufung === 'HIGH_RISK_JOB', risiko.einstufung.einstufung);
pruefe('Stichwort wurde erkannt', risiko.einstufung.kennzahlen.risiko_treffer.includes('schimmel'), risiko.einstufung.kennzahlen.risiko_treffer);
pruefe('Sicherheitsaufschlag wurde angesetzt', risiko.kalkulation.sicherheitsaufschlag_cent > 0, risiko.kalkulation.sicherheitsaufschlag_cent);
pruefe('Besichtigung verlangt', risiko.einstufung.besichtigung_noetig === true);
pruefe('kein automatischer Entwurf', risiko.einstufung.entwurf_automatisch === false);

const hoehe = K.vorsortiereAnfrage({ leistungen_ids:['fenster'], etagen:'6', plz:'53773',
  service_details:{ fenster:{ anzahl_fenster:'30' } } });
pruefe('Arbeitshöhe löst Risiko aus', hoehe.einstufung.einstufung === 'HIGH_RISK_JOB', hoehe.einstufung.einstufung);

/* ══════════════════════════════════════════════════════════════ */
block('Partnerweitergabe und Absage');

/* Die Standardtabelle reicht nur bis 38 km; die Grenze liegt bei 40.
   Für diesen Fall wird deshalb eine eigene Entfernung gepflegt –
   das prüft zugleich, dass die Tabelle wirklich konfigurierbar ist. */
const fern = baueKern({ vorsortierung: { plz_km: '20095=95' } });
const weit = fern.vorsortiereAnfrage({ leistungen_ids:['haushalt'], flaeche_m2:'80', plz:'20095' });
pruefe('weit entfernt → PARTNER_REFERRAL', weit.einstufung.einstufung === 'PARTNER_REFERRAL', weit.einstufung.einstufung);
pruefe('Absage wird nur erwogen, nie gesetzt', weit.einstufung.einstufung !== 'REJECTED');
pruefe('Absage wird als Erwägung gemeldet', weit.einstufung.absage_erwaegen === true);
pruefe('Weitergabe wird begründet',
  weit.einstufung.begruendung.some(b => b.text.includes('Einsatzgebiets')));

/* Genau an der Grenze (40 km) gilt der Ort noch als Einsatzgebiet. */
const grenze = baueKern({ vorsortierung: { plz_km: '20095=40' } });
const grenzfall = grenze.vorsortiereAnfrage({ leistungen_ids:['haushalt'], flaeche_m2:'80', plz:'20095' });
pruefe('exakt 40 km zählt noch zum Einsatzgebiet',
  grenzfall.einstufung.einstufung !== 'PARTNER_REFERRAL', grenzfall.einstufung.einstufung);

/* 0 km – der Firmensitz selbst. Darf keine Anfahrtspauschale bekommen. */
const amSitz = K.berechneKalkulation({ leistungen:[{id:'haushalt', qty:90}], km:0 });
pruefe('0 km ergibt keine Anfahrtskosten', amSitz.anfahrt_cent === 0, amSitz.anfahrt_cent);
pruefe('0 km gilt als bekannt, nicht als fehlend', amSitz.km === 0, amSitz.km);
pruefe('0 km wird als Annahme vermerkt',
  amSitz.annahmen.some(a => a.includes('Firmensitz')), amSitz.annahmen);

const unbekannteEntfernung = K.vorsortiereAnfrage({ leistungen_ids:['haushalt'], flaeche_m2:'80', plz:'99999' });
pruefe('unbekannte Entfernung erzwingt Prüfung', unbekannteEntfernung.einstufung.manuelle_pruefung === true);
pruefe('unbekannte Entfernung: Anfahrtspauschale gesetzt',
  unbekannteEntfernung.kalkulation.anfahrt_cent > 0, unbekannteEntfernung.kalkulation.anfahrt_cent);
pruefe('unbekannte Entfernung wird begründet',
  unbekannteEntfernung.einstufung.begruendung.some(b => b.text.includes('Entfernung ist unbekannt')));

const ohneLeistung = K.vorsortiereAnfrage({ leistungen_ids:[], plz:'53773' });
pruefe('keine Leistung erkannt → Prüfung', ohneLeistung.einstufung.manuelle_pruefung === true);
pruefe('keine Leistung erkannt → kein Entwurf', ohneLeistung.einstufung.entwurf_automatisch === false);

/* ══════════════════════════════════════════════════════════════ */
block('Prüfgrenze und Übersteuerung');

const ueberPruefgrenze = K.vorsortiereAnfrage({ leistungen_ids:['buero'], flaeche_m2:'1400', plz:'53773' });
pruefe('über Prüfgrenze → manuelle Prüfung', ueberPruefgrenze.einstufung.manuelle_pruefung === true, ueberPruefgrenze.kalkulation.netto_gesamt_cent);
pruefe('über Prüfgrenze → kein automatischer Entwurf', ueberPruefgrenze.einstufung.entwurf_automatisch === false);

const strenger = baueKern({ vorsortierung: { micro_grenze: 500, gross_grenze: 600 } });
const jetztMicro = strenger.vorsortiereAnfrage({ leistungen_ids:['haushalt'], flaeche_m2:'90', plz:'53773' });
pruefe('geänderte Grenze wirkt sofort', jetztMicro.einstufung.einstufung === 'MICRO_JOB', jetztMicro.einstufung.einstufung);

const ohneAuto = baueKern({ vorsortierung: { auto_entwurf_bei_standard: false } });
const keinEntwurf = ohneAuto.vorsortiereAnfrage({ leistungen_ids:['haushalt'], flaeche_m2:'90', plz:'53773' });
pruefe('Schalter aus → nie ein automatischer Entwurf', keinEntwurf.einstufung.entwurf_automatisch === false);

/* ══════════════════════════════════════════════════════════════ */
block('Test 15/16 – Privat- und Geschäftskunde');

pruefe('privat ist Verbraucher', K.istVerbraucher('privat') === true);
pruefe('Unternehmen ist kein Verbraucher', K.istVerbraucher('unternehmen') === false);
pruefe('Hausverwaltung ist kein Verbraucher', K.istVerbraucher('verwaltung') === false);
pruefe('öffentliche Einrichtung ist kein Verbraucher', K.istVerbraucher('oeffentlich') === false);
pruefe('Altwert „gewerblich" wird zu „unternehmen"', K.kundenart('gewerblich') === 'unternehmen', K.kundenart('gewerblich'));
pruefe('Altwert „gewerblich" ist kein Verbraucher', K.istVerbraucher('gewerblich') === false);
pruefe('leerer Wert fällt auf privat zurück', K.kundenart('') === 'privat');
pruefe('Unsinn fällt auf privat zurück', K.kundenart('quatsch') === 'privat');

/* ══════════════════════════════════════════════════════════════ */
block('Statusmodell und Bestandsschutz');

pruefe('alter Status „entwurf" wird übersetzt', K.angStatus({status:'entwurf'}) === 'DRAFT', K.angStatus({status:'entwurf'}));
pruefe('alter Status „versendet" wird übersetzt', K.angStatus({status:'versendet'}) === 'SENT');
pruefe('alter Status „angenommen" wird übersetzt', K.angStatus({status:'angenommen'}) === 'ACCEPTED');
pruefe('alter Status „abgelaufen" wird übersetzt', K.angStatus({status:'abgelaufen'}) === 'EXPIRED');
pruefe('neuer Status bleibt unverändert', K.angStatus({status:'ADMIN_REVIEW'}) === 'ADMIN_REVIEW');
pruefe('fehlender Status ergibt DRAFT', K.angStatus({}) === 'DRAFT');
pruefe('unbekannter Status ergibt DRAFT statt Absturz', K.angStatus({status:'irgendwas'}) === 'DRAFT');
pruefe('alle Angebotsstatus haben einen deutschen Text',
  Object.keys(K.ANG_STATUS).every(s => K.statusText(K.ANG_STATUS, s).length > 2));
pruefe('alle Kalkulationsstatus haben einen deutschen Text',
  Object.keys(K.VK_STATUS).every(s => K.statusText(K.VK_STATUS, s).length > 2));
pruefe('ACCEPTED gilt als abgeschlossen', K.ANG_STATUS.ACCEPTED.offen === false);
pruefe('EXPIRED gilt als abgeschlossen', K.VK_STATUS.EXPIRED.offen === false);

/* ══════════════════════════════════════════════════════════════ */
block('Test 18 – Planwerte sind keine Einnahmen');

pruefe('Wahrscheinlichkeit angenommen = 100 %', K.pw('w_angenommen') === 100, K.pw('w_angenommen'));
pruefe('Wahrscheinlichkeit verloren = 0 %', K.pw('w_verloren') === 0, K.pw('w_verloren'));
pruefe('Wahrscheinlichkeit wird auf 0–100 begrenzt',
  baueKern({ planung:{ w_erstellt: 500 } }).pw('w_erstellt') === 100);
pruefe('negative Wahrscheinlichkeit wird auf 0 begrenzt',
  baueKern({ planung:{ w_erstellt: -20 } }).pw('w_erstellt') === 0);
pruefe('Kalkulation liefert kein Feld, das nach Einnahme aussieht',
  !('einnahme' in standard.kalkulation) && !('umsatz' in standard.kalkulation));

/* ══════════════════════════════════════════════════════════════ */
block('Gewinnfelder sind vorhanden, aber getrennt benannt');

pruefe('Gewinn wird intern berechnet', Number.isFinite(standard.kalkulation.gewinn_gesamt_cent));
pruefe('Kostenseite wird intern berechnet', Number.isFinite(standard.kalkulation.kosten_einsatz_cent));
pruefe('Arbeitszeit wird geschätzt', standard.kalkulation.arbeitsstunden > 0, standard.kalkulation.arbeitsstunden);
pruefe('Gewinn = Netto − Material − Kosten',
  standard.kalkulation.gewinn_einsatz_cent
  === standard.kalkulation.netto_einsatz_cent - standard.kalkulation.material_cent - standard.kalkulation.kosten_einsatz_cent);

/* ══════════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(62));
console.log('  ' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
console.log('═'.repeat(62));
if(fehler.length){
  console.log('\nFehlgeschlagen:');
  fehler.forEach(f => console.log('  · ' + f));
}
process.exit(fehlgeschlagen ? 1 : 0);
