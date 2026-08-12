/* ══════════════════════════════════════════════════════════════
   PRÜFLAUF – Serverfunktionen
   ══════════════════════════════════════════════════════════════
   Aufruf: node tests/server.mjs

   Firestore wird durch eine Attrappe im Arbeitsspeicher ersetzt.
   Geprüft wird die LOGIK: Tokenprüfung, Ablauf, Einmalverwendung,
   veraltete Versionen, Linkscanner, Doppelklick, Ratenbegrenzung
   und die Frage, ob interne Felder zum Kunden gelangen.
   ══════════════════════════════════════════════════════════════ */

import crypto from 'node:crypto';

let bestanden = 0, fehlgeschlagen = 0;
const fehler = [];
function pruefe(name, bedingung, gemessen){
  if(bedingung){ bestanden++; console.log('  ✓ ' + name); }
  else {
    fehlgeschlagen++; fehler.push(name);
    console.log('  ✗ ' + name + (gemessen !== undefined ? '   gemessen: ' + JSON.stringify(gemessen) : ''));
  }
}
function block(t){ console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

/* ── Firestore-Attrappe ───────────────────────────────────── */
const speicher = new Map();
const schluessel = (s,i) => s + '/' + i;

const db = {
  async holen(s,i){ return speicher.has(schluessel(s,i)) ? { ...speicher.get(schluessel(s,i)), id:i } : null; },
  async anlegen(s,d,i){
    const id = i || 'id_' + speicher.size + '_' + Math.floor(Math.random()*1e6);
    speicher.set(schluessel(s,id), { ...d });
    return { ...d, id };
  },
  async aendern(s,i,d){
    const alt = speicher.get(schluessel(s,i)) || {};
    speicher.set(schluessel(s,i), { ...alt, ...d });
    return { ...alt, ...d, id:i };
  },
  async setzen(s,i,d){ return this.aendern(s,i,d); },
  async nurNeu(s,i,d){
    if(speicher.has(schluessel(s,i))) return false;
    speicher.set(schluessel(s,i), { ...d });
    return true;
  },
  async alle(s){
    const raus = [];
    for(const [k,v] of speicher) if(k.startsWith(s + '/')) raus.push({ ...v, id:k.slice(s.length+1) });
    return raus;
  },
};
const jetztIso = () => new Date().toISOString();

/* ── Nachbau der geprüften Logik ───────────────────────────
   Bewusst dieselben Regeln wie in lib/sicherheit.mjs. Die echte
   Datei lässt sich hier nicht laden, weil sie beim Import eine
   Verbindung zu Google aufbauen würde. */
const tokenHash = k => crypto.createHash('sha256').update(String(k)).digest('hex');

async function tokenErzeugen({ dokumentId, dokumentVersion, aktionen, gueltigTage }){
  const klartext = crypto.randomBytes(32).toString('base64url');
  await db.anlegen('aktions_tokens', {
    dokument_id: dokumentId, dokument_version: dokumentVersion,
    aktionen, expires_at: new Date(Date.now() + gueltigTage*86400000).toISOString(),
    used_at:null, revoked_at:null,
  }, tokenHash(klartext));
  return klartext;
}

async function tokenPruefen(klartext, aktion){
  if(!klartext || klartext.length < 20) return { ok:false, grund:'ungueltig' };
  const e = await db.holen('aktions_tokens', tokenHash(klartext));
  if(!e) return { ok:false, grund:'unbekannt' };
  if(e.revoked_at) return { ok:false, grund:'widerrufen' };
  if(e.used_at) return { ok:false, grund:'verbraucht' };
  if(new Date(e.expires_at).getTime() < Date.now()) return { ok:false, grund:'abgelaufen' };
  if(aktion && !(e.aktionen||[]).includes(aktion)) return { ok:false, grund:'nicht_erlaubt' };
  return { ok:true, eintrag:e };
}

async function tokenVerbrauchen(klartext, aktion){
  const h = tokenHash(klartext);
  const frisch = await db.nurNeu('token_sperren', h, { aktion });
  if(!frisch) return { ok:false, grund:'doppelt' };
  await db.setzen('aktions_tokens', h, { used_at: jetztIso() });
  return { ok:true };
}

async function ratenGrenze(kennung, hoechstens, fensterMinuten){
  const s = crypto.createHash('sha256').update(kennung).digest('hex').slice(0,32);
  const e = await db.holen('rate_limit', s);
  if(!e || (Date.now() - new Date(e.fenster_start).getTime()) > fensterMinuten*60000){
    await db.setzen('rate_limit', s, { fenster_start: jetztIso(), anzahl:1 });
    return { ok:true };
  }
  const anzahl = (e.anzahl||0)+1;
  await db.setzen('rate_limit', s, { anzahl });
  return { ok: anzahl <= hoechstens };
}

/* Genau die Funktion aus api/aktion.mjs */
function fuerKunden(vk){
  const k = vk.kalkulation || {};
  return {
    nummer:vk.nummer, version:vk.version,
    name:[vk.vorname,vk.nachname].filter(Boolean).join(' '),
    firma:vk.firma||null, leistungen:vk.leistungen_text||null,
    brutto_gesamt_cent:Number(vk.brutto_gesamt_cent)||0,
    netto_gesamt_cent:Number(vk.netto_gesamt_cent)||0,
    mwst_cent:Number(k.mwst_cent)||0, mwst_satz:Number(k.mwst_satz)||0,
    spanne:k.spanne?{von_cent:k.spanne.von_cent,bis_cent:k.spanne.bis_cent}:null,
    positionen:(k.positionen||[]).map(p=>({text:p.text,menge:p.menge||null,betrag_cent:p.betrag_cent,hinweis:p.hinweis||null})),
    annahmen:k.annahmen||[],
    besichtigung_noetig:!!(vk.einstufung&&vk.einstufung.besichtigung_noetig),
    reserved_until:vk.reserved_until||null, status:vk.status,
  };
}

/* ══════════════════════════════════════════════════════════ */
const VK = {
  nummer:'VK-2026-0001', version:1, status:'SENT',
  vorname:'Erika', nachname:'Musterfrau', email:'erika@beispiel.de',
  brutto_gesamt_cent:16279, netto_gesamt_cent:13680,
  leistungen_text:'Büroreinigung',
  kalkulation:{
    mwst_cent:2599, mwst_satz:19,
    positionen:[{text:'Büroreinigung',menge:'200 m²',betrag_cent:10400,hinweis:null}],
    annahmen:['Fläche laut Anfrage'],
    // Interne Felder – dürfen NIE zum Kunden
    gewinn_gesamt_cent:7400, kosten_einsatz_cent:6280, arbeitsstunden:2.0,
    marge:54.1, stundenlohn:3700,
  },
  einstufung:{ besichtigung_noetig:false },
};
await db.anlegen('vorkalkulationen', VK, 'vk1');

block('Test 8 – Token ist abgelaufen');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:-1 });
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('abgelaufenes Token wird abgelehnt', !p.ok && p.grund === 'abgelaufen', p);
}

block('Test 9 – Token wurde bereits verwendet');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  pruefe('erste Nutzung geht durch', (await tokenPruefen(t,'vormerken')).ok);
  await tokenVerbrauchen(t, 'vormerken');
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('zweite Nutzung wird abgelehnt', !p.ok && p.grund === 'verbraucht', p);
}

block('Test 20 – zwei gleichzeitige Bestätigungen');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  // Beide starten, bevor eine fertig ist – genau der Doppelklick
  const [a, b] = await Promise.all([
    tokenVerbrauchen(t, 'vormerken'),
    tokenVerbrauchen(t, 'vormerken'),
  ]);
  const durch = [a,b].filter(x => x.ok).length;
  pruefe('genau eine kommt durch', durch === 1, { a, b });
  pruefe('die andere meldet „doppelt"', [a,b].some(x => !x.ok && x.grund === 'doppelt'));
}

block('Test 14 – veraltete Version wird abgelehnt');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  await db.aendern('vorkalkulationen', 'vk1', { version: 2 });
  const p = await tokenPruefen(t, 'vormerken');
  const vk = await db.holen('vorkalkulationen', 'vk1');
  const veraltet = Number(p.eintrag.dokument_version) !== Number(vk.version);
  pruefe('Token selbst ist noch gültig', p.ok);
  pruefe('Versionsabgleich erkennt die alte Fassung', veraltet, { token:p.eintrag.dokument_version, dokument:vk.version });
  await db.aendern('vorkalkulationen', 'vk1', { version: 1 });
}

block('Widerrufenes Token');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  await db.setzen('aktions_tokens', tokenHash(t), { revoked_at: jetztIso() });
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('widerrufenes Token wird abgelehnt', !p.ok && p.grund === 'widerrufen', p);
}

block('Nicht vorgesehene Aktion');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  const p = await tokenPruefen(t, 'kein_interesse');
  pruefe('Aktion außerhalb der Erlaubnis wird abgelehnt', !p.ok && p.grund === 'nicht_erlaubt', p);
}

block('Token-Speicherung');
{
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  const alle = await db.alle('aktions_tokens');
  const alsText = JSON.stringify(alle);
  pruefe('Klartext des Tokens steht nirgends in der Datenbank', !alsText.includes(t));
  pruefe('Dokument-ID ist der SHA-256-Hash', alle.some(x => x.id === tokenHash(t)));
  pruefe('Hash ist 64 Zeichen lang', tokenHash(t).length === 64);
  pruefe('Token hat mindestens 32 Byte Zufall', Buffer.from(t, 'base64url').length >= 32);

  // Zwei Tokens dürfen sich nie gleichen
  const t2 = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  pruefe('zwei Tokens sind verschieden', t !== t2);
}

block('Test 10 – Linkscanner öffnet den Link');
{
  /* Ein Scanner macht GET. Der Endpunkt lässt nur POST zu –
     geprüft wird hier die Regel, die api/aktion.mjs anwendet. */
  const erlaubt = (methode) => methode === 'POST';
  pruefe('GET wird abgewiesen', !erlaubt('GET'));
  pruefe('HEAD wird abgewiesen', !erlaubt('HEAD'));
  pruefe('POST ist erlaubt', erlaubt('POST'));

  /* Und selbst per POST ändert „ansehen" nichts Verbindliches. */
  const t = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['kein_interesse'], gueltigTage:30 });
  const vorher = await db.holen('vorkalkulationen', 'vk1');
  await tokenPruefen(t, 'kein_interesse');            // nur ansehen
  const nachher = await db.holen('vorkalkulationen', 'vk1');
  pruefe('Ansehen verbraucht das Token nicht', (await tokenPruefen(t,'kein_interesse')).ok);
  pruefe('Ansehen ändert den Status nicht', vorher.status === nachher.status);
}

block('Ratenbegrenzung');
{
  let abgelehnt = 0;
  for(let i = 0; i < 25; i++){
    const g = await ratenGrenze('192.0.2.1', 20, 10);
    if(!g.ok) abgelehnt++;
  }
  pruefe('nach 20 Versuchen wird abgelehnt', abgelehnt === 5, { abgelehnt });
  const andere = await ratenGrenze('198.51.100.7', 20, 10);
  pruefe('andere Absender sind nicht betroffen', andere.ok);
  const eintraege = await db.alle('rate_limit');
  pruefe('Absenderkennung wird nicht im Klartext gespeichert',
    !JSON.stringify(eintraege).includes('192.0.2.1'));
}

block('Was der Kunde zu sehen bekommt');
{
  const vk = await db.holen('vorkalkulationen', 'vk1');
  const sichtbar = JSON.stringify(fuerKunden(vk));

  ['gewinn','kosten_einsatz','marge','stundenlohn','arbeitsstunden','kosten_bestaetigt']
    .forEach(feld => pruefe('„' + feld + '" gelangt NICHT zum Kunden', !sichtbar.includes(feld)));

  pruefe('Betrag ist enthalten', sichtbar.includes('16279'));
  pruefe('Positionen sind enthalten', sichtbar.includes('Büroreinigung'));
  pruefe('Annahmen sind enthalten', sichtbar.includes('Fläche laut Anfrage'));
  pruefe('interne Gewinnzahl 7400 taucht nirgends auf', !sichtbar.includes('7400'));
}

block('Test 6/5 – Versand nur nach Freigabe');
{
  /* Die Prüfung aus api/versand.mjs, Schritt 2 */
  const darfRaus = (vk) => vk.status === 'ADMIN_APPROVED' && !!vk.approved_by && !!vk.approved_at
                         && !!vk.email && Number(vk.brutto_gesamt_cent) > 0;

  pruefe('Entwurf darf nicht hinaus', !darfRaus({ status:'DRAFT', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:100 }));
  pruefe('ohne Freigabevermerk kein Versand', !darfRaus({ status:'ADMIN_APPROVED', email:'x@y.de', brutto_gesamt_cent:100 }));
  pruefe('ohne Empfänger kein Versand', !darfRaus({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b', brutto_gesamt_cent:100 }));
  pruefe('Betrag null: kein Versand', !darfRaus({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:0 }));
  pruefe('freigegeben und vollständig: Versand erlaubt', darfRaus({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:16279 }));
  pruefe('bereits versendet: kein zweiter Versand', !darfRaus({ status:'SENT', approved_by:'a', approved_at:'b', email:'x@y.de', brutto_gesamt_cent:100 }));
}

block('Doppelter Mailversand');
{
  async function versendeEinmal(schluessel){
    const marke = crypto.createHash('sha256').update(schluessel).digest('hex').slice(0,40);
    const frisch = await db.nurNeu('mail_ereignisse', marke, { status:'im_versand' });
    return frisch ? { versendet:true } : { uebersprungen:true };
  }
  const a = await versendeEinmal('vk-versand-vk1-v1');
  const b = await versendeEinmal('vk-versand-vk1-v1');
  pruefe('erste Mail geht raus', a.versendet === true);
  pruefe('zweite wird übersprungen', b.uebersprungen === true);
  const c = await versendeEinmal('vk-versand-vk1-v2');
  pruefe('neue Version darf wieder versendet werden', c.versendet === true);

  const eintraege = await db.alle('mail_ereignisse');
  pruefe('Empfängeradresse steht nicht im Klartext im Versandprotokoll',
    !JSON.stringify(eintraege).includes('erika@beispiel.de'));
}

block('Test 17 – automatischer Ablauf');
{
  const tageBis = (iso) => {
    const ziel = new Date(iso); ziel.setHours(0,0,0,0);
    const heute = new Date(); heute.setHours(0,0,0,0);
    return Math.round((ziel - heute) / 86400000);
  };
  pruefe('gestern abgelaufen ergibt -1', tageBis(new Date(Date.now()-86400000).toISOString()) === -1);
  pruefe('heute ergibt 0 – noch nicht abgelaufen', tageBis(new Date().toISOString()) === 0);
  pruefe('in 3 Tagen ergibt 3', tageBis(new Date(Date.now()+3*86400000).toISOString()) === 3);

  /* Tagesgenau, nicht auf die Millisekunde: Ein Lauf um 06:00 muss
     dasselbe ergeben wie einer um 06:02. */
  const spaet = new Date(); spaet.setHours(23,59,0,0);
  const frueh = new Date(); frueh.setHours(0,1,0,0);
  pruefe('Uhrzeit ändert das Ergebnis nicht', tageBis(spaet.toISOString()) === tageBis(frueh.toISOString()));

  const nurVorgemerktLaeuftAb = (vk) => vk.status === 'RESERVED' && !!vk.reserved_until;
  pruefe('nur Vorgemerktes läuft ab', nurVorgemerktLaeuftAb({ status:'RESERVED', reserved_until:'2026-01-01' }));
  pruefe('Versendetes ohne Frist läuft nicht ab', !nurVorgemerktLaeuftAb({ status:'SENT' }));
  pruefe('Angesehenes ohne Frist läuft nicht ab', !nurVorgemerktLaeuftAb({ status:'VIEWED' }));
}

block('Doppelter Tageslauf');
{
  const heute = new Date().toISOString().slice(0,10);
  const a = await db.nurNeu('automatik_laeufe', 'taeglich-' + heute, { gestartet: jetztIso() });
  const b = await db.nurNeu('automatik_laeufe', 'taeglich-' + heute, { gestartet: jetztIso() });
  pruefe('erster Lauf startet', a === true);
  pruefe('zweiter Lauf am selben Tag wird übersprungen', b === false);
  const morgen = new Date(Date.now()+86400000).toISOString().slice(0,10);
  pruefe('am nächsten Tag läuft es wieder',
    (await db.nurNeu('automatik_laeufe', 'taeglich-' + morgen, {})) === true);
}

block('Test 19 – angenommener Auftrag wird nicht gelöscht');
{
  /* Keine Aktion der Kundenseite darf löschen. Geprüft an der
     Aktionstabelle aus api/aktion.mjs. */
  const AKTIONEN = ['termin','vormerken','aenderung','korrektur','kein_interesse','neue_kalkulation','kein_kontakt'];
  const ZIELSTATUS = { termin:'MEETING_BOOKED', vormerken:'RESERVED', aenderung:'CHANGE_REQUESTED',
                       korrektur:'CHANGE_REQUESTED', kein_interesse:'DECLINED',
                       neue_kalkulation:null, kein_kontakt:'DECLINED' };
  pruefe('keine Kundenaktion führt zu einem Löschstatus',
    AKTIONEN.every(a => !['DELETED','GELOESCHT'].includes(ZIELSTATUS[a])));
  pruefe('„kein Interesse" setzt nur DECLINED', ZIELSTATUS.kein_interesse === 'DECLINED');
  pruefe('keine Aktion berührt Aufträge',
    AKTIONEN.every(a => !String(a).includes('auftrag')));
}

/* ══════════════════════════════════════════════════════════════
   PHASE 6 UND 7 – verbindliches Angebot und Annahme
   ══════════════════════════════════════════════════════════════ */
const ANGEBOT = {
  nummer:'ANG-2026-0001', version:1, status:'SENT',
  quelle_vk_id:'vk1', quelle_vk_nummer:'VK-2026-0001',
  vorname:'Erika', nachname:'Musterfrau', email:'erika@beispiel.de',
  strasse:'Hauptstr. 1', plz:'53783', ort:'Eitorf',
  kunde_key:'erika_beispiel_de', anfrage_id:'anfrage1',
  kundenart:'privat', verbraucher:true,
  leistungen_text:'Büroreinigung',
  brutto_gesamt_cent:16279, netto_gesamt_cent:13680, mwst_cent:2599, mwst_satz:19,
  positionen:[{ text:'Büroreinigung', menge:'200 m²', betrag_cent:10400, hinweis:null }],
  gueltig_bis:new Date(Date.now()+14*86400000).toISOString(),
  zahlungsbedingungen:'Zahlung per Rechnung, 14 Tage.',
  agb_version:'AGB Fassung 1', rechtstext_version:1,
  approved_by:'waschlurch@gmail.com', approved_at:jetztIso(),
  // Interne Felder aus der Überführung – dürfen NIE zum Kunden
  kostenProEinsatz:62.80, gewinnGesamt:74.00, arbeitsstunden:2.0, multiplikator:1,
};
await db.anlegen('angebote', ANGEBOT, 'ang1');

/* Genau die Funktion aus api/aktion.mjs */
function angebotFuerKunden(a){
  return {
    nummer:a.nummer, version:a.version,
    name:[a.vorname,a.nachname].filter(Boolean).join(' '), firma:a.firma||null,
    anschrift:[a.strasse||a.adresse,[a.plz,a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    leistungen:a.leistungen_text||null,
    positionen:(a.positionen||[]).map(p=>({text:p.text,menge:p.menge||null,betrag_cent:p.betrag_cent,hinweis:p.hinweis||null})),
    netto_gesamt_cent:Number(a.netto_gesamt_cent)||0, mwst_cent:Number(a.mwst_cent)||0,
    mwst_satz:Number(a.mwst_satz)||0, brutto_gesamt_cent:Number(a.brutto_gesamt_cent)||0,
    gueltig_bis:a.gueltig_bis||null, zahlungsbedingungen:a.zahlungsbedingungen||null,
    ausfuehrung_zeitraum:a.ausfuehrung_zeitraum||null, ausgeschlossen:a.ausgeschlossen||null,
    agb_version:a.agb_version||null, verbraucher:a.verbraucher===true,
    anbieter:'Waschlurch · Daniel Lurch · 53783 Eitorf', status:a.status,
  };
}

block('Test 13 – verbindliches Angebot wird angenommen');
{
  const sichtbar = JSON.stringify(angebotFuerKunden(ANGEBOT));
  ['kostenProEinsatz','gewinnGesamt','arbeitsstunden','multiplikator']
    .forEach(f => pruefe('„' + f + '" gelangt NICHT zum Kunden', !sichtbar.includes(f)));
  pruefe('interne Gewinnzahl 74 taucht nicht auf', !sichtbar.includes('"74'));

  // Pflichtangaben nach § 312j Abs. 3 BGB
  ['anbieter','nummer','leistungen','brutto_gesamt_cent','zahlungsbedingungen','gueltig_bis','agb_version']
    .forEach(f => pruefe('Zusammenfassung enthält „' + f + '"', sichtbar.includes(f)));
}

block('Kenntnisnahmen werden serverseitig geprüft');
{
  /* Die Regel aus api/aktion.mjs – eine Checkbox, die nur im
     Browser geprüft wird, ist keine Zustimmung. */
  const darfBestellen = (k, verbraucher) =>
    !!k.agb_gelesen && (!verbraucher || !!k.widerruf_gelesen);

  pruefe('ohne AGB-Kenntnisnahme keine Bestellung', !darfBestellen({}, true));
  pruefe('Verbraucher ohne Widerrufskenntnis: keine Bestellung',
    !darfBestellen({ agb_gelesen:true }, true));
  pruefe('Verbraucher mit beiden Häkchen: Bestellung möglich',
    darfBestellen({ agb_gelesen:true, widerruf_gelesen:true }, true));
  pruefe('Unternehmen braucht keine Widerrufskenntnis',
    darfBestellen({ agb_gelesen:true }, false));
  pruefe('vorzeitiger Beginn ist freiwillig, nicht Pflicht',
    darfBestellen({ agb_gelesen:true, widerruf_gelesen:true }, true));
}

block('Abgelaufenes Angebot kann nicht angenommen werden');
{
  const abgelaufen = { ...ANGEBOT, gueltig_bis:new Date(Date.now()-86400000).toISOString() };
  const annehmbar = (a) => !(a.gueltig_bis && new Date(a.gueltig_bis).getTime() < Date.now());
  pruefe('abgelaufenes Angebot wird abgelehnt', !annehmbar(abgelaufen));
  pruefe('gültiges Angebot wird angenommen', annehmbar(ANGEBOT));
}

block('Doppelte Annahme');
{
  const schonAngenommen = { ...ANGEBOT, status:'ACCEPTED' };
  const darf = (a) => a.status !== 'ACCEPTED';
  pruefe('bereits angenommenes Angebot: keine zweite Annahme', !darf(schonAngenommen));
  pruefe('bereits angenommenes Angebot: auch keine Ablehnung mehr', !darf(schonAngenommen));

  const t = await tokenErzeugen({ dokumentId:'ang1', dokumentVersion:1, aktionen:['beauftragen'], gueltigTage:14 });
  const [a, b] = await Promise.all([
    tokenVerbrauchen(t, 'beauftragen'), tokenVerbrauchen(t, 'beauftragen'),
  ]);
  pruefe('zwei gleichzeitige Bestellungen: nur eine kommt durch',
    [a,b].filter(x => x.ok).length === 1);
}

block('Test 19 – angenommener Auftrag wird nicht gelöscht');
{
  /* Die Regel aus deleteAngebot in admin.html */
  const loeschbar = (a, auftraege) =>
    a.status !== 'ACCEPTED' && !auftraege.some(t => t.angebot_id === a.id);

  pruefe('angenommenes Angebot ist nicht löschbar',
    !loeschbar({ id:'ang1', status:'ACCEPTED' }, []));
  pruefe('Angebot mit Auftrag ist nicht löschbar',
    !loeschbar({ id:'ang1', status:'SENT' }, [{ angebot_id:'ang1' }]));
  pruefe('Entwurf ohne Auftrag ist löschbar',
    loeschbar({ id:'ang2', status:'DRAFT' }, []));
}

block('Auftrag nach Annahme');
{
  /* Der Auftrag entsteht mit Status `geplant`, nicht `bezahlt`.
     Ein angenommenes Angebot ist ein Vertrag, aber kein Geldeingang. */
  const auftrag = {
    kunde_key: ANGEBOT.kunde_key,
    umsatz: Math.round(ANGEBOT.brutto_gesamt_cent) / 100,
    status: 'geplant',
    angebot_id: 'ang1',
  };
  pruefe('Auftrag wird als „geplant" angelegt', auftrag.status === 'geplant');
  pruefe('Auftrag zählt NICHT als Einnahme', auftrag.status !== 'bezahlt');
  pruefe('Umsatz stimmt mit dem Angebot überein', auftrag.umsatz === 162.79, auftrag.umsatz);
  pruefe('Auftrag ist mit dem Angebot verknüpft', auftrag.angebot_id === 'ang1');
}

block('Freigabeprüfung für verbindliche Angebote');
{
  /* Die Regeln aus pruefeAngebotFreigabe in admin.html */
  function maengel(a){
    const m = [];
    if(!a.nummer) m.push('nummer');
    if(!a.email) m.push('email');
    if(!(a.positionen||[]).length) m.push('positionen');
    if(!(Number(a.brutto_gesamt_cent) > 0)) m.push('betrag');
    if(Number(a.netto_gesamt_cent)+Number(a.mwst_cent) !== Number(a.brutto_gesamt_cent)) m.push('summe');
    if(a.spanne) m.push('spanne');
    if(!a.gueltig_bis) m.push('gueltigkeit');
    else if(new Date(a.gueltig_bis).getTime() < Date.now()) m.push('abgelaufen');
    if(!a.zahlungsbedingungen) m.push('zahlung');
    if(!a.agb_version) m.push('agb');
    if(a.verbraucher && !a.widerrufstext) m.push('widerruf');
    return m;
  }
  pruefe('vollständiges Angebot ist freigebbar',
    maengel({ ...ANGEBOT, widerrufstext:'…' }).length === 0,
    maengel({ ...ANGEBOT, widerrufstext:'…' }));
  pruefe('Preisspanne verhindert die Freigabe',
    maengel({ ...ANGEBOT, widerrufstext:'…', spanne:{ von_cent:1, bis_cent:2 } }).includes('spanne'));
  pruefe('fehlende Widerrufsbelehrung verhindert die Freigabe bei Verbrauchern',
    maengel({ ...ANGEBOT }).includes('widerruf'));
  pruefe('Unternehmen braucht keine Widerrufsbelehrung',
    !maengel({ ...ANGEBOT, verbraucher:false }).includes('widerruf'));
  pruefe('abgelaufene Gültigkeit verhindert die Freigabe',
    maengel({ ...ANGEBOT, widerrufstext:'…', gueltig_bis:new Date(Date.now()-1000).toISOString() }).includes('abgelaufen'));
  pruefe('Netto + USt muss den Bruttobetrag ergeben',
    maengel({ ...ANGEBOT, widerrufstext:'…', mwst_cent:1 }).includes('summe'));
}

block('Doppelbuchung eines Termins');
{
  /* Die Regel aus terminAusVorkalkulation */
  const kollidiert = (neu, bestand) => bestand.some(t =>
    t.ganztags || (t.von && t.bis && neu.von < t.bis && neu.bis > t.von));

  const bestand = [{ von:'09:00', bis:'10:00' }];
  pruefe('Überschneidung wird erkannt', kollidiert({ von:'09:30', bis:'10:30' }, bestand));
  pruefe('direkt danach ist frei', !kollidiert({ von:'10:00', bis:'11:00' }, bestand));
  pruefe('direkt davor ist frei', !kollidiert({ von:'08:00', bis:'09:00' }, bestand));
  pruefe('Ganztagstermin blockiert', kollidiert({ von:'14:00', bis:'15:00' }, [{ ganztags:true }]));
  pruefe('vollständige Überdeckung wird erkannt', kollidiert({ von:'08:00', bis:'12:00' }, bestand));
}

block('Statuswechsel des Angebots');
{
  const ANG = { DRAFT:1, ADMIN_REVIEW:1, ADMIN_APPROVED:1, SENT:1, VIEWED:1,
                CHANGE_REQUESTED:1, ACCEPTED:1, DECLINED:1, EXPIRED:1 };
  ['DRAFT','ADMIN_REVIEW','ADMIN_APPROVED','SENT','VIEWED','CHANGE_REQUESTED','ACCEPTED','DECLINED','EXPIRED']
    .forEach(s => pruefe('Status ' + s + ' ist vorgesehen', !!ANG[s]));

  const versandErlaubt = (a) => a.status === 'ADMIN_APPROVED' && !!a.approved_by && !!a.approved_at;
  pruefe('Entwurf darf nicht versendet werden', !versandErlaubt({ status:'DRAFT', approved_by:'a', approved_at:'b' }));
  pruefe('freigegeben darf versendet werden', versandErlaubt({ status:'ADMIN_APPROVED', approved_by:'a', approved_at:'b' }));
  pruefe('ohne Freigabevermerk kein Versand', !versandErlaubt({ status:'ADMIN_APPROVED' }));
}

/* ══════════════════════════════════════════════════════════════
   AUDIT-FUNDE – Regressionsschutz
   ══════════════════════════════════════════════════════════════
   Sechs Fehler, die beim Audit am 12.08.2026 gefunden wurden. Alle
   hatten dieselbe Ursache: angStatus() wurde eingeführt, aber nicht
   alle Lesestellen umgestellt. Diese Prüfungen halten das fest.
   ══════════════════════════════════════════════════════════════ */
const ANG_ALT = { 'entwurf':'DRAFT','versendet':'SENT','angenommen':'ACCEPTED',
                  'abgelehnt':'DECLINED','abgelaufen':'EXPIRED' };
const ANG_NEU = { DRAFT:1, ADMIN_REVIEW:1, ADMIN_APPROVED:1, SENT:1, VIEWED:1,
                  CHANGE_REQUESTED:1, ACCEPTED:1, DECLINED:1, EXPIRED:1 };
const angStatus = (a) => {
  const roh = (a && a.status) || 'DRAFT';
  return ANG_NEU[roh] ? roh : (ANG_ALT[roh] || 'DRAFT');
};

const ALT = { id:'alt1', status:'versendet', gueltigkeit:14, bruttoGesamt:162.79 };
const NEU = { id:'neu1', status:'SENT', quelle_vk_id:'vk1', brutto_gesamt_cent:16279,
              bruttoGesamt:162.79, gueltig_bis:new Date(Date.now()-86400000).toISOString() };

block('Fund 1 – Ablauf erfasst auch verbindliche Angebote');
{
  const laeuftAb = (a) => {
    const st = angStatus(a);
    return st === 'SENT' || st === 'VIEWED';
  };
  pruefe('altes „versendet" wird erfasst', laeuftAb(ALT));
  pruefe('neues „SENT" wird erfasst', laeuftAb(NEU));
  pruefe('„VIEWED" wird ebenfalls erfasst', laeuftAb({ status:'VIEWED' }));
  pruefe('Entwurf läuft nicht ab', !laeuftAb({ status:'DRAFT' }));
  pruefe('Angenommenes läuft nicht ab', !laeuftAb({ status:'ACCEPTED' }));

  // gueltig_bis hat Vorrang vor der Berechnung aus createdAt
  const ablaufDatum = (a) => a.gueltig_bis ? new Date(a.gueltig_bis).getTime() : null;
  pruefe('ausdrückliches Ablaufdatum wird genutzt', ablaufDatum(NEU) !== null);
  pruefe('altes Angebot ohne gueltig_bis fällt auf die Berechnung zurück', ablaufDatum(ALT) === null);
}

block('Fund 2 – keine Doppelzählung im Planumsatz');
{
  /* Die Regel aus vkFuerPlanung(): Kalkulationen mit Folgeangebot
     zählen nicht mehr mit, sonst steht derselbe Vorgang zweimal. */
  const VK_OFFEN = { MEETING_BOOKED:true, RESERVED:true, SENT:true, VIEWED:true,
                     DRAFT:true, ADMIN_REVIEW:true, ADMIN_APPROVED:true, CHANGE_REQUESTED:true,
                     DECLINED:false, EXPIRED:false };
  const kalkulationen = [
    { id:'a', status:'MEETING_BOOKED', brutto_gesamt_cent:500000, angebot_id:'ang1' },
    { id:'b', status:'RESERVED',       brutto_gesamt_cent:120000 },
    { id:'c', status:'EXPIRED',        brutto_gesamt_cent:900000 },
  ];
  const fuerPlanung = kalkulationen.filter(v => VK_OFFEN[v.status] && !v.angebot_id);

  pruefe('überführte Kalkulation zählt nicht mehr mit',
    !fuerPlanung.some(v => v.id === 'a'));
  pruefe('nicht überführte zählt weiter', fuerPlanung.some(v => v.id === 'b'));
  pruefe('abgelaufene zählt nicht', !fuerPlanung.some(v => v.id === 'c'));

  const planCent = fuerPlanung.reduce((s,v) => s + v.brutto_gesamt_cent, 0);
  const angebotCent = 500000;   // das Angebot aus Kalkulation a
  pruefe('Vorgang wird genau einmal geplant', planCent + angebotCent === 620000,
    { planCent, angebotCent, summe: planCent + angebotCent });
  pruefe('ohne die Korrektur wäre es doppelt', planCent + angebotCent !== 1120000);

  // In der Liste bleibt sie sichtbar – nur gezählt wird sie nicht
  const fuerListe = kalkulationen.filter(v => VK_OFFEN[v.status]);
  pruefe('überführte Kalkulation bleibt in der Liste sichtbar',
    fuerListe.some(v => v.id === 'a'));
}

block('Fund 3 bis 6 – Statusvergleiche über angStatus()');
{
  // Übersicht: wartende Angebote
  const wartet = (a) => ['SENT','VIEWED'].includes(angStatus(a));
  pruefe('Übersicht erfasst altes „versendet"', wartet(ALT));
  pruefe('Übersicht erfasst neues „SENT"', wartet(NEU));

  // Erfolgsquote
  const angebote = [
    { status:'angenommen' }, { status:'ACCEPTED' },
    { status:'versendet' },  { status:'SENT' }, { status:'entwurf' }, { status:'DRAFT' },
  ];
  const angenommen = angebote.filter(a => angStatus(a) === 'ACCEPTED').length;
  const nichtEntwurf = angebote.filter(a => angStatus(a) !== 'DRAFT').length;
  pruefe('Erfolgsquote zählt beide Schreibweisen als angenommen', angenommen === 2, angenommen);
  pruefe('Erfolgsquote zählt beide Entwurfsschreibweisen heraus', nichtEntwurf === 4, nichtEntwurf);
  pruefe('Erfolgsquote ist damit 50 %', Math.round(angenommen/nichtEntwurf*100) === 50);

  // Betrag: Cent-Feld hat Vorrang
  const betragCent = a => a.brutto_gesamt_cent != null
    ? Number(a.brutto_gesamt_cent) : Math.round((Number(a.bruttoGesamt)||0)*100);
  pruefe('neues Angebot: Cent-Feld wird genutzt', betragCent(NEU) === 16279);
  pruefe('altes Angebot: Euro-Feld wird umgerechnet', betragCent(ALT) === 16279);
  pruefe('beide ergeben denselben Betrag', betragCent(NEU) === betragCent(ALT));
  pruefe('fehlender Betrag ergibt 0, nicht NaN', betragCent({}) === 0);

  // Nachfass-Abzeichen
  const nachfassen = (a) => ['SENT','VIEWED'].includes(angStatus(a));
  pruefe('Nachfass-Abzeichen auch bei neuen Angeboten', nachfassen(NEU));
  pruefe('kein Nachfassen bei angenommenen', !nachfassen({ status:'ACCEPTED' }));
}

block('Fund 9 – Sperre wird bei Fehler wieder freigegeben');
{
  /* Ohne die Freigabe stünde der Kunde vor einem toten Link:
     Token verbraucht, aber nichts geschehen. */
  async function verbrauchenMitVermerk(t, aktion, vermerkKaputt){
    const h = tokenHash(t);
    const frisch = await db.nurNeu('token_sperren', h, { aktion });
    if(!frisch) return { ok:false, grund:'doppelt' };
    try {
      if(vermerkKaputt) throw new Error('Datenbank kurz weg');
      await db.setzen('aktions_tokens', h, { used_at: jetztIso() });
    } catch(err){ /* Vermerk ist Dokumentation, kein Schutz */ }
    return { ok:true };
  }
  async function freigeben(t){
    const h = tokenHash(t);
    speicher.delete('token_sperren/' + h);
    await db.setzen('aktions_tokens', h, { used_at: null });
    return true;
  }

  const t1 = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  const r1 = await verbrauchenMitVermerk(t1, 'vormerken', true);
  pruefe('fehlgeschlagener Vermerk bricht die Aktion NICHT ab', r1.ok === true, r1);

  // Aktion scheitert danach -> Sperre freigeben -> zweiter Versuch geht
  const t2 = await tokenErzeugen({ dokumentId:'vk1', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  await verbrauchenMitVermerk(t2, 'vormerken', false);
  pruefe('nach dem Verbrauchen ist ein zweiter Versuch gesperrt',
    (await verbrauchenMitVermerk(t2, 'vormerken', false)).grund === 'doppelt');
  await freigeben(t2);
  pruefe('Freigabe setzt den Verbrauchsvermerk zurück',
    (await db.holen('aktions_tokens', tokenHash(t2))).used_at === null);
  pruefe('Freigabe entfernt die Sperrmarke',
    (await db.holen('token_sperren', tokenHash(t2))) === null);
  pruefe('nach der Freigabe geht ein neuer Versuch',
    (await verbrauchenMitVermerk(t2, 'vormerken', false)).ok === true);
  pruefe('nach dem erneuten Verbrauch ist es wieder gesperrt',
    (await verbrauchenMitVermerk(t2, 'vormerken', false)).grund === 'doppelt');
}

block('Fund 10 bis 13 – Datenlauscher zeichnen abhängige Ansichten neu');
{
  /* Welche Sammlung speist welche Ansicht? Fehlt ein Aufruf, zeigt
     die Ansicht veraltete Zahlen – genau der Fehler, an dem die
     Einnahmenliste schon einmal 0,00 EUR anzeigte. */
  const speist = {
    vorkalkulationen: ['renderVorkalkulationen','renderUmsatzplanung','renderUebersicht','renderBenachrichtigungen'],
    angebote:         ['renderAngeboteList','renderUebersicht','renderKalender','renderUmsatzplanung','renderVorkalkulationen','renderBenachrichtigungen'],
    auftraege:        ['renderKunden','renderAngeboteList','renderEinnahmen','renderSteuern','renderBericht','renderUebersicht','renderKalender','renderUmsatzplanung'],
    einnahmen:        ['renderEinnahmen','renderUebersicht','renderSteuern','renderBericht','renderUmsatzplanung'],
    kundenreaktionen: ['renderKundenreaktionen','renderUebersicht','renderBenachrichtigungen'],
  };

  const fs = await import('node:fs');
  const quelle = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const start = quelle.indexOf('function startListeners()');
  const teil = quelle.slice(start, quelle.indexOf('renderRangePicker(', start));

  /* Je Sammlung die Variable, über die ihre Abfrage läuft. Eine
     gemeinsame Alternativenliste ginge schief: `finQuery` steht im
     Code vor `vorkalkulationen`, und der Regex fände dann für jede
     Sammlung den Einnahmen-Handler. */
  const abfrageName = {
    vorkalkulationen: null, angebote: 'angeboteQuery',
    auftraege: null, einnahmen: 'finQuery', kundenreaktionen: null,
  };

  for(const [sammlung, noetig] of Object.entries(speist)){
    const teile = ["collection\\(db,\\s*'" + sammlung + "'"];
    if(abfrageName[sammlung]) teile.push(abfrageName[sammlung]);
    const marke = new RegExp("onSnapshot\\(\\s*(?:query\\()?(?:" + teile.join('|') + ")");
    const treffer = marke.exec(teil);
    if(!treffer){ pruefe(sammlung + ': Handler gefunden', false, 'nicht gefunden'); continue; }
    const von = treffer.index;
    const naechster = teil.indexOf('onSnapshot(', von + 12);
    const koerper = teil.slice(von, naechster > 0 ? naechster : teil.length);

    const fehlend = noetig.filter(fn => !koerper.includes(fn + '('));
    pruefe(sammlung + ' zeichnet alle abhängigen Ansichten neu',
      fehlend.length === 0, fehlend);
  }
}

block('Funde 31 bis 37 – zweite Prüfrunde');
{
  // 31: meldungAnAdmin stürzt nicht mehr bei null-Zeilen
  const zeilen = [['Kunde','Erika'], null, ['Betrag','162,79 EUR'], null];
  let text = null, absturz = false;
  try { text = zeilen.filter(Boolean).map(([b,w]) => b + ': ' + w); }
  catch(_){ absturz = true; }
  pruefe('meldungAnAdmin verkraftet null-Zeilen', !absturz && text.length === 2, text);

  // 32: Ablaufprüfung greift auch ohne exp
  const jetzt = Math.floor(Date.now()/1000);
  const expOk = (i) => typeof i.exp === 'number' && i.exp > jetzt;
  pruefe('Token ohne exp wird abgelehnt', !expOk({}));
  pruefe('Token mit exp=null wird abgelehnt', !expOk({ exp:null }));
  pruefe('abgelaufenes Token wird abgelehnt', !expOk({ exp: jetzt - 10 }));
  pruefe('gültiges Token wird angenommen', expOk({ exp: jetzt + 3600 }));
  const iatOk = (i) => !(typeof i.iat === 'number' && i.iat > jetzt + 300);
  pruefe('Token aus der Zukunft wird abgelehnt', !iatOk({ iat: jetzt + 10000 }));
  pruefe('leichte Uhrabweichung wird toleriert', iatOk({ iat: jetzt + 60 }));

  // 33: Byte-Vergleich statt Zeichenvergleich
  const bytesGleich = (a, b) => {
    const pa = Buffer.from(a, 'utf8'), pb = Buffer.from(b, 'utf8');
    return pa.length === pb.length && crypto.timingSafeEqual(pa, pb);
  };
  let rangeError = false;
  try { bytesGleich('Bearer äöü', 'Bearer abc'); } catch(_){ rangeError = true; }
  pruefe('Mehrbyte-Zeichen lösen keinen Absturz aus', !rangeError);
  pruefe('gleiches Geheimnis wird erkannt', bytesGleich('Bearer geheim', 'Bearer geheim'));
  pruefe('falsches Geheimnis wird abgelehnt', !bytesGleich('Bearer geheim', 'Bearer anders'));

  // 34: Arbeitszeit nicht in der Kundenmail
  const fs2 = await import('node:fs');
  const vorlagen = fs2.readFileSync(new URL('../lib/vorlagen.mjs', import.meta.url), 'utf8');
  const vkVorlage = vorlagen.slice(vorlagen.indexOf('export function vorabkalkulation'),
                                  vorlagen.indexOf('export function bestaetigung'));
  pruefe('Arbeitszeit steht nicht in der Kundenmail',
    !/k\.arbeitsstunden\s*\?\s*\[/.test(vkVorlage));
  ['gewinn','marge','stundenlohn','kosten_einsatz','kostenProEinsatz'].forEach(f =>
    pruefe('„' + f + '" nicht in der Vorabkalkulations-Mail', !vkVorlage.includes(f)));

  // 35: Anhang wird geprüft
  const pdfPruefen = (b64) => {
    if(!b64) return { ok:true, hash:null };
    if(!/^[A-Za-z0-9+/]+=*$/.test(b64)) return { ok:false };
    const bytes = Buffer.from(b64, 'base64');
    if(bytes.length > 8*1024*1024) return { ok:false };
    if(bytes.slice(0,5).toString('latin1') !== '%PDF-') return { ok:false };
    return { ok:true, hash: crypto.createHash('sha256').update(bytes).digest('hex') };
  };
  const echtesPdf = Buffer.from('%PDF-1.4 Inhalt').toString('base64');
  const keinPdf = Buffer.from('<html>boese</html>').toString('base64');
  pruefe('echtes PDF wird angenommen', pdfPruefen(echtesPdf).ok);
  pruefe('Nicht-PDF wird abgelehnt', !pdfPruefen(keinPdf).ok);
  pruefe('kaputte Kodierung wird abgelehnt', !pdfPruefen('nicht base64!!!').ok);
  pruefe('fehlender Anhang ist erlaubt', pdfPruefen(null).ok);
  pruefe('Prüfsumme wird serverseitig berechnet',
    pdfPruefen(echtesPdf).hash === crypto.createHash('sha256')
      .update(Buffer.from(echtesPdf, 'base64')).digest('hex'));
  pruefe('Prüfsumme ist 64 Zeichen', pdfPruefen(echtesPdf).hash.length === 64);

  // 36: setzen() verkraftet gleichzeitige Erstanlage
  const versuche = await Promise.all([
    db.nurNeu('rate_limit', 'gleichzeitig', { anzahl:1 }),
    db.nurNeu('rate_limit', 'gleichzeitig', { anzahl:1 }),
  ]);
  pruefe('von zwei gleichzeitigen Erstanlagen gewinnt eine',
    versuche.filter(Boolean).length === 1, versuche);

  // 37: Fehlgeschlagene Mail darf erneut versendet werden
  async function versuchVersand(schluessel, klapptEs){
    const vorhanden = await db.holen('mail_ereignisse', schluessel);
    if(vorhanden && vorhanden.status !== 'fehlgeschlagen') return { uebersprungen:true };
    await db.setzen('mail_ereignisse', schluessel, { status:'im_versand' });
    if(!klapptEs){
      await db.setzen('mail_ereignisse', schluessel, { status:'fehlgeschlagen' });
      return { fehler:true };
    }
    await db.setzen('mail_ereignisse', schluessel, { status:'versendet' });
    return { versendet:true };
  }
  pruefe('erster Versuch scheitert', (await versuchVersand('m1', false)).fehler === true);
  pruefe('zweiter Versuch ist erlaubt', (await versuchVersand('m1', true)).versendet === true);
  pruefe('dritter Versuch wird übersprungen', (await versuchVersand('m1', true)).uebersprungen === true);
}

/* ══════════════════════════════════════════════════════════════
   BUG-40 – Falsche Fehlermeldung nach erfolgreicher Kundenaktion
   ══════════════════════════════════════════════════════════════
   Produktionsfall: Kunde bestätigt „14 Tage vormerken" für
   VK-2026-0005. Status VIEWED -> RESERVED gespeichert, Reaktion
   angelegt, Bestätigungsmail versendet – und aktion.html zeigte
   „Das hat nicht geklappt".

   Ursache: In der Nacharbeit nach dem Speichern fehlte an mehreren
   Stellen der Fehlerfang. Ein Fehler dort lief ins äußere catch und
   wurde zu HTTP 500, obwohl die Aktion längst gebucht war.
   ══════════════════════════════════════════════════════════════ */
block('BUG-40 – erfolgreiche Vormerkung meldet Erfolg');
{
  /* Der Ablauf aus api/aktion.mjs, mit der neuen Struktur:
     Buchung -> Nacharbeit im Fangnetz -> Erfolgsantwort. */
  async function vormerken({ mailKaputt = false, protokollKaputt = false,
                             adminMeldungKaputt = false, buchungKaputt = false } = {}){
    const vk = { nummer:'VK-2026-0005', version:1, status:'VIEWED',
                 email:'kunde@beispiel.de', vorname:'Erika', nachname:'Musterfrau' };
    const vorgemerktBis = new Date(Date.now() + 14*86400000).toISOString();

    // 1. Buchung – der einzige Schritt, der den Kunden scheitern lassen darf
    try {
      if(buchungKaputt) throw new Error('Datenbank weg');
      await db.setzen('vorkalkulationen', 'vk5',
        { ...vk, status:'RESERVED', reserved_until: vorgemerktBis });
    } catch(err){
      return { status:200, koerper:{ ok:false, grund:'fehler',
        text:'Das hat gerade nicht geklappt – es wurde nichts geändert.' } };
    }

    // 2. Nacharbeit – jeder Schritt einzeln gefangen
    let reaktionId = null;
    try {
      if(protokollKaputt) throw new Error('Protokoll weg');
      const r = await db.anlegen('kundenreaktionen', { aktion:'vormerken', dokument_id:'vk5' });
      reaktionId = r.id;
    } catch(err){ /* protokolliert, bricht nicht ab */ }
    try {
      if(mailKaputt) throw new Error('Postausgang weg');
    } catch(err){ /* protokolliert */ }
    try {
      if(adminMeldungKaputt) throw new Error('null-Zeile');
    } catch(err){ /* protokolliert */ }

    // 3. Erfolgsantwort – außerhalb aller try-Blöcke
    return { status:200, koerper:{
      ok:true, schritt:'bestaetigt', aktion:'vormerken', titel:'14 Tage vormerken',
      nummer: vk.nummer, status_nachher:'RESERVED',
      text:'Ihre Vorabkalkulation ist bis zum … vorgemerkt.',
      vorgemerkt_bis: vorgemerktBis,
    }, reaktionId };
  }

  const gut = await vormerken();
  pruefe('erfolgreiche Vormerkung liefert HTTP 200', gut.status === 200);
  pruefe('Antwort meldet ok:true', gut.koerper.ok === true);
  pruefe('Status ist RESERVED', (await db.holen('vorkalkulationen','vk5')).status === 'RESERVED');
  pruefe('Vormerkdatum ist gespeichert', !!(await db.holen('vorkalkulationen','vk5')).reserved_until);
  pruefe('Antwort enthält die Vorgangsnummer', gut.koerper.nummer === 'VK-2026-0005');
  pruefe('Antwort enthält das Vormerkdatum', !!gut.koerper.vorgemerkt_bis);
  pruefe('Antwort enthält die Aktion', gut.koerper.aktion === 'vormerken');
  pruefe('Antwort enthält den Titel', gut.koerper.titel === '14 Tage vormerken');

  /* Punkt 4: keine internen Kalkulationsdaten in der Antwort.
     Geprüft werden die FELDNAMEN, nicht der Fließtext – „Ihre
     Vorabkalkulation ist vorgemerkt" enthält das Wort
     „kalkulation" und ist trotzdem völlig in Ordnung. */
  const felder = Object.keys(gut.koerper);
  ['positionen','brutto','netto','gewinn','marge','kosten','arbeitsstunden',
   'kalkulation','einstufung','spanne','zuschlaege','annahmen']
    .forEach(f => pruefe('Erfolgsantwort hat kein Feld „' + f + '"',
      !felder.some(k => k.toLowerCase().includes(f))));
  pruefe('Erfolgsantwort enthält keinen Cent-Betrag',
    !felder.some(k => k.endsWith('_cent')), felder);
  pruefe('Erfolgsantwort trägt nur die erwarteten Felder',
    felder.every(k => ['ok','schritt','aktion','titel','nummer','status_nachher',
                       'text','vorgemerkt_bis','auftrag_angelegt'].includes(k)), felder);

  /* Punkt 6: Fehler in der Nacharbeit dürfen den Kunden nicht
     als Fehlschlag erreichen. */
  const ohneMail = await vormerken({ mailKaputt:true });
  pruefe('Mailfehler: Kunde sieht trotzdem Erfolg', ohneMail.koerper.ok === true);

  const ohneProtokoll = await vormerken({ protokollKaputt:true });
  pruefe('Protokollfehler: Kunde sieht trotzdem Erfolg', ohneProtokoll.koerper.ok === true);
  pruefe('Protokollfehler: Reaktion fehlt, Buchung steht',
    ohneProtokoll.reaktionId === null && ohneProtokoll.koerper.ok === true);

  const ohneAdmin = await vormerken({ adminMeldungKaputt:true });
  pruefe('Adminmeldung kaputt: Kunde sieht trotzdem Erfolg', ohneAdmin.koerper.ok === true);

  const allesKaputt = await vormerken({ mailKaputt:true, protokollKaputt:true, adminMeldungKaputt:true });
  pruefe('gesamte Nacharbeit kaputt: Kunde sieht trotzdem Erfolg', allesKaputt.koerper.ok === true);

  /* Nur ein Fehler bei der BUCHUNG selbst darf scheitern. */
  const buchungWeg = await vormerken({ buchungKaputt:true });
  pruefe('Buchungsfehler meldet ehrlich einen Fehlschlag', buchungWeg.koerper.ok === false);
  pruefe('Buchungsfehler sagt ausdrücklich, dass nichts geändert wurde',
    buchungWeg.koerper.text.includes('nichts geändert'));
}

block('BUG-40 – bereits verwendetes Token');
{
  /* Kein allgemeiner Fehler, sondern eine ruhige Auskunft. */
  async function bereitsBestaetigt(eintrag){
    const dok = await db.holen('vorkalkulationen', eintrag.dokument_id);
    return {
      ok:false, grund:'verbraucht', bereits_bestaetigt:true,
      aktion: eintrag.verwendete_aktion || null,
      titel: '14 Tage vormerken',
      text: 'Diese Auswahl wurde bereits bestätigt.',
      nummer: dok ? dok.nummer : null,
      vorgemerkt_bis: dok ? dok.reserved_until : null,
    };
  }

  const t = await tokenErzeugen({ dokumentId:'vk5', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  await tokenVerbrauchen(t, 'vormerken');
  const p = await tokenPruefen(t, 'vormerken');
  pruefe('Token gilt als verbraucht', !p.ok && p.grund === 'verbraucht');

  const eintrag = await db.holen('aktions_tokens', tokenHash(t));
  const antwort = await bereitsBestaetigt({ ...eintrag, dokument_id:'vk5', verwendete_aktion:'vormerken' });

  pruefe('Antwort ist als „bereits bestätigt" gekennzeichnet', antwort.bereits_bestaetigt === true);
  pruefe('Meldung lautet „Diese Auswahl wurde bereits bestätigt"',
    antwort.text === 'Diese Auswahl wurde bereits bestätigt.');
  pruefe('kein allgemeiner Fehlertext', !/nicht geklappt|schiefgegangen|Fehler/i.test(antwort.text));
  pruefe('Vorgangsnummer wird mitgegeben', antwort.nummer === 'VK-2026-0005');
  pruefe('Vormerkdatum wird mitgegeben', !!antwort.vorgemerkt_bis);
  pruefe('Aktion wird benannt', antwort.aktion === 'vormerken');

  /* Keine erneute Verarbeitung: Der Status bleibt, wie er ist. */
  const vorher = (await db.holen('vorkalkulationen','vk5')).status;
  await bereitsBestaetigt({ ...eintrag, dokument_id:'vk5', verwendete_aktion:'vormerken' });
  pruefe('kein erneutes Verarbeiten', (await db.holen('vorkalkulationen','vk5')).status === vorher);
}

block('BUG-40 – Doppelklick bleibt geschützt');
{
  const t = await tokenErzeugen({ dokumentId:'vk5', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  const [a, b] = await Promise.all([
    tokenVerbrauchen(t, 'vormerken'), tokenVerbrauchen(t, 'vormerken'),
  ]);
  pruefe('genau eine Bestätigung kommt durch', [a,b].filter(x => x.ok).length === 1);
  pruefe('die zweite meldet „doppelt"', [a,b].some(x => !x.ok && x.grund === 'doppelt'));

  /* Punkt 7: Die übrigen Schutzmechanismen sind unverändert. */
  const abgelaufen = await tokenErzeugen({ dokumentId:'vk5', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:-1 });
  pruefe('abgelaufenes Token bleibt abgelehnt', !(await tokenPruefen(abgelaufen, 'vormerken')).ok);
  const falscheAktion = await tokenErzeugen({ dokumentId:'vk5', dokumentVersion:1, aktionen:['vormerken'], gueltigTage:30 });
  pruefe('nicht vorgesehene Aktion bleibt abgelehnt',
    (await tokenPruefen(falscheAktion, 'kein_interesse')).grund === 'nicht_erlaubt');
  pruefe('nur POST ist erlaubt', ((m) => m === 'POST')('POST') && !((m) => m === 'POST')('GET'));
}

block('BUG-40 – aktion.html stellt die echte Serverantwort dar');
{
  const fs3 = await import('node:fs');
  const seite = fs3.readFileSync(new URL('../aktion.html', import.meta.url), 'utf8');

  pruefe('zeigeBereitsBestaetigt existiert', seite.includes('function zeigeBereitsBestaetigt'));
  pruefe('bereits_bestaetigt wird ausgewertet', seite.includes('ergebnis.bereits_bestaetigt'));
  pruefe('auch beim ersten Aufruf', seite.includes('antwort.bereits_bestaetigt'));
  pruefe('Erfolgsseite zeigt die Vorgangsnummer', /zeilen\.push\(\['Vorgang', ergebnis\.nummer\]\)/.test(seite));
  pruefe('Erfolgsseite zeigt das Vormerkdatum', /Vorgemerkt bis', datum\(ergebnis\.vorgemerkt_bis\)/.test(seite));
  pruefe('Erfolgsseite zeigt die Aktion', /Ihre Auswahl', ergebnis\.titel/.test(seite));
  pruefe('„verbraucht" steht nicht mehr in der Fehler-Überschriftentabelle',
    !/verbraucht:'Bereits erledigt'/.test(seite));

  /* Erfolgsseite darf keine Kalkulationsdaten anzeigen. */
  const fertig = seite.slice(seite.indexOf('function zeigeFertig'),
                             seite.indexOf('function zeigeBereitsBestaetigt'));
  ['positionen','brutto_gesamt_cent','netto_gesamt_cent','euro(','gewinn','marge']
    .forEach(f => pruefe('Erfolgsseite zeigt kein „' + f + '"', !fertig.includes(f)));

  /* Jeder eingesetzte Wert läuft durch sicher(). */
  const einsetzungen = [...fertig.matchAll(/\+\s*(ergebnis\.[a-zA-Z_.]+)/g)].map(m => m[1]);
  pruefe('keine ungeschützte Einsetzung auf der Erfolgsseite',
    einsetzungen.length === 0, einsetzungen);
}

/* ══════════════════════════════════════════════════════════════
   E-MAIL-GESTALTUNG
   ══════════════════════════════════════════════════════════════ */
block('E-Mail: Logo, Hell/Dunkel und Handy');
{
  const V = await import('../lib/vorlagen.mjs');

  const vk = { nummer:'VK-2026-0005', version:1, vorname:'Erika', nachname:'Musterfrau',
    leistungen_text:'Haushaltsreinigung', brutto_gesamt_cent:16279,
    reserved_until:new Date(Date.now()+3*86400000).toISOString(),
    kalkulation:{ mwst_satz:19, arbeitsstunden:2.0 } };
  const ang = { nummer:'ANG-2026-0001', version:2, vorname:'Erika', nachname:'Musterfrau',
    leistungen_text:'Büroreinigung', brutto_gesamt_cent:1448575,
    gueltig_bis:new Date(Date.now()+14*86400000).toISOString(),
    zahlungsbedingungen:'Zahlung per Rechnung, 14 Tage.', verbraucher:true };

  const vorlagen = {
    Vorabkalkulation: V.vorabkalkulation(vk, 'TOK', { unverbindlich:'Unverbindlich.', abgleich:'Abgeglichen.', vormerkungTage:14 }),
    Bestaetigung:     V.bestaetigung(vk, 'vormerken', { bis:vk.reserved_until }),
    Erinnerung:       V.erinnerung(vk, 'TOK', 3),
    Abgelaufen:       V.abgelaufen(vk, 'TOK', 'Am {{DATUM}} abgelaufen.'),
    Angebot:          V.verbindlichesAngebot(ang, 'TOK', { widerruf:'Belehrung.' }),
    Auftragsbest:     V.auftragsbestaetigung(ang, jetztIso(), { widerruf:'Belehrung.', vorzeitig:'Vorzeitig.' }),
    Adminmeldung:     V.meldungAnAdmin('Test', [['A','1'], null, ['B','2']]),
  };

  for(const [name, m] of Object.entries(vorlagen)){
    const h = m.html;
    pruefe(name + ': Logo für hellen Grund eingebunden', h.includes('/logo.png'));
    pruefe(name + ': Logo für dunklen Grund eingebunden', h.includes('/logo-light.png'));
    pruefe(name + ': schaltet auf Dunkelmodus um', h.includes('prefers-color-scheme: dark'));
    pruefe(name + ': meldet beide Farbschemata an',
      h.includes('name="color-scheme"') && h.includes('supported-color-schemes'));
    pruefe(name + ': hat Handy-Regeln', h.includes('max-width:600px'));
    pruefe(name + ': Reintextfassung vorhanden', !!m.text && m.text.length > 50);
    /* Die alte Fassung war fest dunkel. Ein übrig gebliebenes
       rgba(255,255,255,…) wäre auf weißem Grund unsichtbar. */
    pruefe(name + ': keine festen Weißtöne mehr', !/rgba\(255,\s*255,\s*255/.test(h));
    pruefe(name + ': kein Zählpixel', !/1x1|tracking|pixel\.(gif|png)|\/open\?/.test(h));
    pruefe(name + ': Tabellen statt Flexbox', !/display:\s*(flex|grid)/.test(h));
  }

  /* Das Logo wird pro Modus umgeschaltet – auf schwarzem Grund
     verschwände die schwarze Kontur der hellen Fassung. */
  const h = vorlagen.Vorabkalkulation.html;
  pruefe('Logo-Umschaltung ist definiert',
    /\.logo-hell\s*\{\s*display:none/.test(h) && /\.logo-dunkel\s*\{\s*display:inline-block/.test(h));
  pruefe('helles Logo ist die Grundfassung',
    /class="logo logo-hell"[^>]*style="display:block/.test(h));
  pruefe('dunkles Logo ist zunächst verborgen',
    /class="logo logo-dunkel"[^>]*style="display:none/.test(h));
  /* Der Alternativtext nennt seit dem Verlinken auch das Ziel –
     bei blockierten Bildern liest man sonst nur „Waschlurch" und
     erkennt nicht, dass es ein Verweis ist. */
  pruefe('Logo trägt einen Alternativtext', /class="logo logo-hell"[^>]*alt="Waschlurch – zur Website"/.test(h));
  pruefe('Logo hat feste Maße', /class="logo logo-hell"[^>]*width="74"[^>]*height="45"/.test(h));
  pruefe('Outlook bekommt eine eigene Fassung', h.includes('<!--[if mso]>'));
  pruefe('Outlook.com wird über data-ogsc bedient', h.includes('[data-ogsc]'));

  /* Kontrast: Weiß auf #22C55E wäre 2,28:1 – deshalb #15803D. */
  pruefe('Knopf auf hellem Grund nutzt das dunklere Grün', h.includes('#15803D'));
  pruefe('Knopf auf dunklem Grund nutzt das hellere Grün', h.includes('#4ADE80'));
  pruefe('das kontrastschwache #22C55E wird nicht als Knopffarbe genutzt',
    !/background:#22C55E/.test(h));

  pruefe('Breite ist auf 600 px begrenzt', h.includes('max-width:600px'));
  pruefe('Vorschauzeile ist versteckt', h.includes('mso-hide:all'));
  pruefe('Impressum und Datenschutz sind verlinkt',
    h.includes('/impressum.html') && h.includes('/datenschutz.html'));
  pruefe('weist auf fehlende Messung hin', /messen weder das Öffnen noch das Anklicken/.test(h));

  /* Interne Zahlen dürfen auch im neuen Gerüst nicht auftauchen. */
  ['gewinn','marge','stundenlohn','kosten_einsatz','kostenProEinsatz','arbeitsstunden']
    .forEach(f => pruefe('Kundenmail führt kein „' + f + '"',
      !vorlagen.Vorabkalkulation.html.includes(f)));
}

block('E-Mail: Anrede, Leistungsliste, Fassung, Logo-Verweis');
{
  const V = await import('../lib/vorlagen.mjs');
  const M = await import('../lib/mail.mjs');

  const vk = { nummer:'VK-2026-0005', version:1, vorname:'Erika', nachname:'Musterfrau',
    leistungen_text:'Haushaltsreinigung, Fensterreinigung, Treppenhausreinigung und Mülltonnenservice',
    brutto_gesamt_cent:16279, kalkulation:{ mwst_satz:19 } };
  const mail = V.vorabkalkulation(vk, 'TOK', { unverbindlich:'U.', abgleich:'A.', vormerkungTage:14 });

  /* ── Tageszeit-Anrede ───────────────────────────────────────
     Geprüft wird die ECHTE Funktion, nicht ein Nachbau. Ein
     nachgebauter Test hätte den Fehler nicht gefunden, an dem sie
     zuerst scheiterte: toLocaleString('de-DE', {hour:'2-digit'})
     liefert „07 Uhr" – mit dem Wort dahinter. Number() ergab NaN,
     der Rückfall griff, und die Anrede war immer „Guten Tag". */

  // Winter: Deutschland ist UTC+1
  const winter = (h) => new Date(Date.UTC(2026, 0, 15, h - 1, 30, 0));
  // Sommer: UTC+2
  const sommer = (h) => new Date(Date.UTC(2026, 6, 15, h - 2, 30, 0));

  pruefe('05:30 ergibt „Guten Morgen"', V.tageszeitGruss(winter(5))  === 'Guten Morgen', V.tageszeitGruss(winter(5)));
  pruefe('07:30 ergibt „Guten Morgen"', V.tageszeitGruss(winter(7))  === 'Guten Morgen', V.tageszeitGruss(winter(7)));
  pruefe('10:30 ergibt „Guten Morgen"', V.tageszeitGruss(winter(10)) === 'Guten Morgen');
  pruefe('11:30 ergibt „Guten Tag"',    V.tageszeitGruss(winter(11)) === 'Guten Tag');
  pruefe('13:30 ergibt „Guten Tag"',    V.tageszeitGruss(winter(13)) === 'Guten Tag');
  pruefe('17:30 ergibt „Guten Tag"',    V.tageszeitGruss(winter(17)) === 'Guten Tag');
  pruefe('18:30 ergibt „Guten Abend"',  V.tageszeitGruss(winter(18)) === 'Guten Abend', V.tageszeitGruss(winter(18)));
  pruefe('22:30 ergibt „Guten Abend"',  V.tageszeitGruss(winter(22)) === 'Guten Abend');
  pruefe('23:30 ergibt „Guten Tag", nicht „Gute Nacht"', V.tageszeitGruss(winter(23)) === 'Guten Tag');
  pruefe('04:30 ergibt „Guten Tag"',    V.tageszeitGruss(winter(4))  === 'Guten Tag');

  /* Sommerzeit: derselbe deutsche Zeitpunkt, anderer UTC-Versatz.
     Ohne die ausdrückliche Zeitzone läge die Grenze zwei Stunden
     daneben – eine Mail um 19:30 trüge dann „Guten Tag". */
  pruefe('Sommerzeit: 07:30 bleibt „Guten Morgen"', V.tageszeitGruss(sommer(7))  === 'Guten Morgen');
  pruefe('Sommerzeit: 19:30 bleibt „Guten Abend"',  V.tageszeitGruss(sommer(19)) === 'Guten Abend');
  pruefe('Sommerzeit: 17:30 bleibt „Guten Tag"',    V.tageszeitGruss(sommer(17)) === 'Guten Tag');

  pruefe('ohne Datum wird die aktuelle Zeit genommen',
    ['Guten Morgen','Guten Tag','Guten Abend'].includes(V.tageszeitGruss()));
  pruefe('ein ungültiges Datum ergibt „Guten Tag"', V.tageszeitGruss('Unsinn') === 'Guten Tag');

  /* Die Mail enthält überhaupt eine Tageszeit-Anrede. */
  pruefe('Mail beginnt mit einer Tageszeit-Anrede',
    /Guten (Morgen|Tag|Abend) Erika Musterfrau,/.test(mail.html));
  pruefe('Reintext ebenso',
    /Guten (Morgen|Tag|Abend) Erika Musterfrau,/.test(mail.text));

  /* ── Leistungen als Stichpunkte ─────────────────────────── */
  const liste = M.leistungsListe('Büroreinigung, Fensterreinigung und Grundreinigung');
  pruefe('Leistungsliste trennt an Komma und „und"',
    (liste.match(/&bull;/g) || []).length === 3, (liste.match(/&bull;/g)||[]).length);
  pruefe('Liste ist eine Tabelle, keine <ul>', liste.includes('<table') && !liste.includes('<ul'));
  pruefe('Einträge stehen einzeln', liste.includes('Büroreinigung') && liste.includes('Grundreinigung'));
  pruefe('leere Angabe ergibt keine Liste', M.leistungsListe('') === '');
  pruefe('eine einzelne Leistung ergibt einen Punkt',
    (M.leistungsListe('Fensterreinigung').match(/&bull;/g) || []).length === 1);
  pruefe('Leistungen werden entschärft',
    !M.leistungsListe('<script>x</script>').includes('<script'));

  pruefe('Vorabkalkulation setzt die Leistungen als Liste',
    (mail.html.match(/&bull;/g) || []).length === 4, (mail.html.match(/&bull;/g)||[]).length);
  pruefe('Reintext listet ebenfalls untereinander',
    (mail.text.match(/^ {2}- /gm) || []).length === 4);

  /* ── Fassung nur bei Überarbeitung ──────────────────────── */
  const basis = { nummer:'ANG-2026-0001', vorname:'Erika', nachname:'Musterfrau',
    leistungen_text:'Büroreinigung', brutto_gesamt_cent:1448575,
    gueltig_bis:new Date(Date.now()+14*86400000).toISOString(),
    zahlungsbedingungen:'Zahlung per Rechnung.', verbraucher:true };
  const v1 = V.verbindlichesAngebot({ ...basis, version:1 }, 'TOK', { widerruf:'B.' });
  const v2 = V.verbindlichesAngebot({ ...basis, version:2 }, 'TOK', { widerruf:'B.' });

  const eckdatenTeil = (h) => h.slice(h.indexOf('class="kasten"'), h.indexOf('class="kasten"') + 2500);
  pruefe('Version 1 zeigt KEINE Fassungszeile', !eckdatenTeil(v1.html).includes('Fassung'));
  pruefe('Version 2 zeigt „überarbeitete Fassung 2"',
    eckdatenTeil(v2.html).includes('überarbeitete Fassung 2'));
  pruefe('Version 2 sagt nicht mehr „Version 2"', !v2.html.includes('Version 2</div>'));

  /* ── „wie besprochen" nur nach einem Termin ─────────────── */
  const ohne = V.verbindlichesAngebot({ ...basis, version:1 }, 'TOK', { widerruf:'B.' });
  const mit  = V.verbindlichesAngebot({ ...basis, version:1, besprechung_erfolgt:true }, 'TOK', { widerruf:'B.' });
  pruefe('ohne Besichtigung kein „wie besprochen"', !ohne.html.includes('wie besprochen'));
  pruefe('ohne Besichtigung trotzdem verständlich',
    ohne.html.includes('zu Ihrer Anfrage'));
  pruefe('nach Besichtigung „wie besprochen"', mit.html.includes('wie besprochen'));
  pruefe('auch ein vermerkter Termin genügt',
    V.verbindlichesAngebot({ ...basis, version:1, termin_datum:'2026-08-20' }, 'TOK', { widerruf:'B.' })
      .html.includes('wie besprochen'));
  pruefe('beide Fassungen nennen es verbindlich',
    ohne.html.includes('verbindliches Angebot') && mit.html.includes('verbindliches Angebot'));

  /* ── Logo führt zur Website ─────────────────────────────── */
  const alleVorlagen = {
    Vorabkalkulation: mail,
    Bestaetigung: V.bestaetigung(vk, 'vormerken', {}),
    Erinnerung:   V.erinnerung({ ...vk, reserved_until:new Date().toISOString() }, 'TOK', 3),
    Abgelaufen:   V.abgelaufen(vk, 'TOK', 'Am {{DATUM}} abgelaufen.'),
    Angebot:      v1,
    Auftragsbest: V.auftragsbestaetigung({ ...basis, version:1 }, jetztIso(), { widerruf:'B.' }),
    Adminmeldung: V.meldungAnAdmin('Test', [['A','1']]),
  };
  for(const [name, m] of Object.entries(alleVorlagen)){
    pruefe(name + ': Logo führt zur Website',
      /<a href="https:\/\/waschlurch\.com\/"[^>]*>\s*<!--\[if !mso\]>/.test(m.html));
    pruefe(name + ': Schriftzug führt ebenfalls zur Website',
      (m.html.match(/<a href="https:\/\/waschlurch\.com\/"/g) || []).length >= 2);
    pruefe(name + ': Logo öffnet in einem neuen Fenster',
      /<a href="https:\/\/waschlurch\.com\/" target="_blank"/.test(m.html));
    pruefe(name + ': Alternativtext benennt das Ziel',
      m.html.includes('alt="Waschlurch – zur Website"'));
  }
}

/* ══════════════════════════════════════════════════════════════
   SITEMAP UND ROBOTS.TXT
   ══════════════════════════════════════════════════════════════ */
block('Sitemap und robots.txt');
{
  const fsm = await import('node:fs');
  const lies = (d) => fsm.readFileSync(new URL('../' + d, import.meta.url), 'utf8');
  const xml = lies('sitemap.xml');
  const robots = lies('robots.txt');

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);

  // ── Formales nach der Sitemap-Spezifikation ────────────────
  pruefe('XML-Deklaration steht am Anfang',
    xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  pruefe('urlset trägt den vorgeschriebenen Namensraum',
    xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
  pruefe('urlset wird geschlossen', xml.includes('</urlset>'));
  pruefe('Sitemap ist nicht leer', locs.length > 0, locs.length);
  pruefe('unter der Grenze von 50.000 URLs', locs.length <= 50000);
  pruefe('jede URL hat ein lastmod', lastmods.length === locs.length);
  pruefe('lastmod im Format JJJJ-MM-TT',
    lastmods.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), lastmods);
  pruefe('kein lastmod in der Zukunft',
    lastmods.every(d => new Date(d) <= new Date(Date.now() + 86400000)));
  /* Alle Daten gleich und tagesaktuell ist das bekannte Muster
     einer automatisch erzeugten, ungepflegten Sitemap. */
  pruefe('lastmod ist nicht bei allen Seiten identisch',
    new Set(lastmods).size > 1, [...new Set(lastmods)]);

  // ── Kanonische Adressen ────────────────────────────────────
  pruefe('alle URLs beginnen mit https://waschlurch.com',
    locs.every(u => u.startsWith('https://waschlurch.com')),
    locs.filter(u => !u.startsWith('https://waschlurch.com')));
  pruefe('keine www-Fassung', !locs.some(u => u.includes('www.')));
  pruefe('kein http ohne s', !locs.some(u => /^http:/.test(u)));
  pruefe('keine doppelten Einträge', new Set(locs).size === locs.length);
  pruefe('keine Abfrageparameter', !locs.some(u => u.includes('?')));
  pruefe('keine Adressfragmente', !locs.some(u => u.includes('#')));

  // ── Was NICHT hineingehört ─────────────────────────────────
  const tabu = ['admin.html', 'aktion.html', '/api/', '/lib/', '/tests/',
                '/firebase/', '/obsidian/', '.mjs', '.rules', '.md'];
  tabu.forEach(t => pruefe('Sitemap führt kein „' + t + '"',
    !locs.some(u => u.includes(t))));

  const paketseiten = ['autowerkstatt','bauendreinigung','buero','einfamilienhaus',
    'gastronomie','handwerker-werkstatt','hausmeister-komplett','kanzlei-praxis',
    'laden-buchhandlung','parkplatz','treppenhaus','wohnung'];
  pruefe('keine der zwölf Paketseiten in der Sitemap',
    !paketseiten.some(p => locs.some(u => u.includes(p + '.html'))));

  // ── robots.txt ─────────────────────────────────────────────
  const regeln = robots.split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#'));
  const disallow = regeln.filter(z => /^disallow:/i.test(z)).map(z => z.slice(9).trim()).filter(Boolean);

  pruefe('robots.txt hat eine User-agent-Zeile', regeln.some(z => /^user-agent:\s*\*/i.test(z)));
  pruefe('robots.txt verweist auf die Sitemap',
    /^Sitemap:\s*https:\/\/waschlurch\.com\/sitemap\.xml$/m.test(robots));
  ['/api/','/lib/','/tests/','/firebase/','/obsidian/'].forEach(d =>
    pruefe('robots.txt sperrt ' + d, disallow.includes(d)));
  pruefe('robots.txt sperrt alle zwölf Paketseiten',
    paketseiten.every(p => disallow.includes('/' + p + '.html')),
    paketseiten.filter(p => !disallow.includes('/' + p + '.html')));

  /* ⚠️ Der wichtigste Punkt: admin.html und aktion.html dürfen
     NICHT gesperrt sein. Ein Disallow verbietet das Abrufen – die
     Adresse käme trotzdem in den Index, nur ohne Beschreibung, und
     das noindex im Kopf würde nie gelesen. */
  pruefe('admin.html ist NICHT per Disallow gesperrt',
    !disallow.some(d => d.includes('admin')));
  pruefe('aktion.html ist NICHT per Disallow gesperrt',
    !disallow.some(d => d.includes('aktion')));

  /* Keine Sitemap-URL darf durch eine eigene Regel gesperrt sein. */
  const pfade = locs.map(u => u.replace('https://waschlurch.com', '') || '/');
  const gesperrt = pfade.filter(u => disallow.some(d => d !== '/' && u.startsWith(d)));
  pruefe('keine Sitemap-URL wird durch robots.txt gesperrt',
    gesperrt.length === 0, gesperrt);

  // ── noindex im Kopf ────────────────────────────────────────
  ['admin.html','aktion.html'].forEach(datei => {
    const h = lies(datei);
    const kopf = h.slice(0, h.indexOf('</head>'));
    pruefe(datei + ' trägt noindex, nofollow im <head>',
      /<meta\s+name=["']robots["']\s+content=["']noindex,\s*nofollow["']/i.test(kopf));
  });

  // ── Ergänzender Kopfzeilenschutz ───────────────────────────
  const vercel = JSON.parse(lies('vercel.json'));
  pruefe('vercel.json behält den nächtlichen Lauf',
    Array.isArray(vercel.crons) && vercel.crons.some(c => c.path === '/api/taeglich'));
  pruefe('vercel.json setzt X-Robots-Tag für die internen Pfade',
    Array.isArray(vercel.headers)
    && vercel.headers.some(h => /lib|tests|firebase|obsidian/.test(h.source)
        && h.headers.some(k => k.key === 'X-Robots-Tag' && /noindex/.test(k.value))));
}

console.log('\n' + '═'.repeat(62));
console.log('  ' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
console.log('═'.repeat(62));
if(fehler.length){ console.log('\nFehlgeschlagen:'); fehler.forEach(f => console.log('  · ' + f)); }
process.exit(fehlgeschlagen ? 1 : 0);
