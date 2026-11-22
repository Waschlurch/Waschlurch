import { balken, stapel, linie, fenster, spark, leer, tagKurz, divergierend } from './diagramme.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SPEICHER = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const zustand = { tage: Number(SPEICHER.get('puls.tage')) || 30, code: SPEICHER.get('puls.code') || '', daten: null };

const zahl = (v, nk = 0) => v == null ? '–' : v.toLocaleString('de-DE', { maximumFractionDigits: nk, minimumFractionDigits: 0 });
const dauer = min => min == null ? '–' : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;
const mittel = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const farbe = n => getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim();

/* ── Laden ─────────────────────────────────────────────── */
async function laden({ verbindung = false } = {}){
  document.body.classList.add('laedt');
  const r = await fetch(`/api/daten?tage=${zustand.tage}${verbindung ? '&verbindung=1' : ''}`, { headers: { 'x-puls-code': zustand.code } });
  document.body.classList.remove('laedt');
  if(r.status === 401){ schloss(true); return null; }
  const j = await r.json().catch(() => ({}));
  if(!r.ok){ $('#satz').textContent = j.message || 'Die Daten konnten nicht geladen werden.'; return null; }
  return j;
}

function schloss(an, fehler = ''){
  $('#schloss').hidden = !an;
  $('#schloss-fehler').textContent = fehler;
  if(an) setTimeout(() => $('#code').focus(), 50);
}

$('#schloss-form').addEventListener('submit', async e => {
  e.preventDefault();
  zustand.code = $('#code').value.trim();
  const d = await laden();
  if(!d) return schloss(true, 'Der Code stimmt nicht.');
  SPEICHER.set('puls.code', zustand.code);
  schloss(false); zustand.daten = d; zeichnen();
});

/* ── Werte holen ───────────────────────────────────────── */
const reihe = (name, d = zustand.daten) => { const m = new Map((d.reihen[name] || []).map(p => [p.tag, p])); return d.tage.map(t => m.get(t)?.wert ?? null); };
const spanne = (name, d = zustand.daten) => { const m = new Map((d.reihen[name] || []).map(p => [p.tag, p])); return d.tage.map(t => m.get(t) || null); };
const schlafReihe = (feld, d = zustand.daten) => { const m = new Map(d.schlaf.map(n => [n.nacht, n])); return d.tage.map(t => m.get(t)?.[feld] ?? null); };
const letzter = werte => { for(let i = werte.length - 1; i >= 0; i--) if(werte[i] != null) return werte[i]; return null; };

/** Letzter Wert vs. Mittel des Zeitraums. hoch = gut? */
function delta(werte, hochGut = true, fmt = v => zahl(v)){
  const l = letzter(werte), m = mittel(werte.slice(0, werte.lastIndexOf(l)));
  if(l == null || m == null || !m) return '';
  const p = (l - m) / Math.abs(m) * 100;
  if(Math.abs(p) < 1) return `<span class="delta">≈ Ø ${fmt(m)}</span>`;
  const gut = hochGut == null ? '' : (p > 0) === hochGut ? 'gut' : 'schlecht';
  return `<span class="delta ${gut}">${p > 0 ? '↑' : '↓'} ${zahl(Math.abs(p))} % zu Ø</span>`;
}

/* ── Zeichnen ──────────────────────────────────────────── */
function zeichnen(){
  const d = zustand.daten; if(!d) return;
  document.querySelectorAll('#zeitraum button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.tage === zustand.tage)));
  ordnen(d.einstellungen);
  held(d); kacheln(d); aufbau(d); training(d); schlaf(d); herz(d); aktivitaet(d); ernaehrung(d);
  $('#fuss-zone').textContent = `${tagKurz(d.zeitraum.von)} – ${tagKurz(d.zeitraum.bis)} · ${d.zeitzone}`;
}

function held(d){
  const jetzt = new Date(), h = jetzt.getHours();
  $('#datum').textContent = jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#gruss').textContent = h < 5 ? 'Gute Nacht.' : h < 11 ? 'Guten Morgen.' : h < 18 ? 'Guten Tag.' : 'Guten Abend.';
  const nacht = d.schlaf.at(-1), schlafMittel = mittel(d.schlaf.map(n => n.gesamt_min));
  const rhr = reihe('resting_heart_rate'), hrv = reihe('heart_rate_variability'), schritte = reihe('step_count');
  const teile = [];
  if(nacht){
    const vgl = schlafMittel ? nacht.gesamt_min - schlafMittel : 0;
    teile.push(`Letzte Nacht hast du <b>${dauer(nacht.gesamt_min)}</b> geschlafen${Math.abs(vgl) >= 10 ? ` – ${zahl(Math.abs(vgl))} min ${vgl > 0 ? 'mehr' : 'weniger'} als im Schnitt` : ', genau dein Schnitt'}.`);
  }
  if(letzter(hrv) != null && letzter(rhr) != null) teile.push(`Ruhepuls <b>${zahl(letzter(rhr))}</b>, HRV <b>${zahl(letzter(hrv))} ms</b>.`);
  const s = mittel(schritte);
  if(s) teile.push(`Im Schnitt <b>${zahl(s)}</b> Schritte am Tag.`);
  $('#satz').innerHTML = teile.join(' ') || 'Noch keine Daten. Richte den Sync auf dem iPhone ein – oben rechts unter „Claude“ findest du die Adressen.';
  const sy = $('#sync'), ls = d.letzterSync;
  if(ls){
    const std = (Date.now() - new Date(ls.zeit)) / 36e5;
    sy.className = 'sync ' + (std < 30 ? 'frisch' : 'alt');
    sy.querySelector('span').textContent = `Synchronisiert ${std < 1 ? 'vor ' + Math.max(1, Math.round(std * 60)) + ' min' : std < 48 ? 'vor ' + Math.round(std) + ' h' : 'am ' + new Date(ls.zeit).toLocaleDateString('de-DE')}`;
  } else { sy.className = 'sync'; sy.querySelector('span').textContent = 'Noch kein Sync'; }
  pulslinie(rhr, hrv);
}

/** Signatur: eine Pulslinie über dem Kopf, gezeichnet aus Ruhepuls und HRV des Zeitraums. */
function pulslinie(rhr, hrv){
  const svg = $('#pulslinie'); const b = svg.clientWidth || 1000, h = 170;
  svg.setAttribute('viewBox', `0 0 ${b} ${h}`);
  const pfad = (werte, amp, phase) => {
    const v = werte.filter(x => x != null); if(v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1;
    let p = '', i = 0; const n = werte.length, schritt = b / n;
    for(let k = 0; k < n; k++){
      const x = k * schritt, w = werte[k] ?? (lo + hi) / 2, y = h / 2 + ((w - lo) / sp - .5) * amp;
      if(k % 3 === phase){ p += `${i++ ? 'L' : 'M'}${x.toFixed(1)},${(h / 2).toFixed(1)} L${(x + schritt * .3).toFixed(1)},${(y - amp * .6).toFixed(1)} L${(x + schritt * .5).toFixed(1)},${(y + amp * .5).toFixed(1)} L${(x + schritt * .7).toFixed(1)},${(h / 2).toFixed(1)} `; }
      else p += `${i++ ? 'L' : 'M'}${x.toFixed(1)},${(h / 2 + ((w - lo) / sp - .5) * 10).toFixed(1)} `;
    }
    return p;
  };
  svg.innerHTML = `<path class="zieh" pathLength="1" stroke="${farbe('herz')}" d="${pfad(rhr, 90, 1)}"/><path class="zieh" pathLength="1" stroke="${farbe('schlaf')}" opacity=".7" d="${pfad(hrv, 60, 2)}" style="animation-delay:.5s"/>`;
}

/* ── Bereiche ordnen ───────────────────────────────────── */
const BEREICH_TITEL = { aufbau: 'Aufbau', training: 'Training', ernaehrung: 'Ernährung', schlaf: 'Schlaf', herz: 'Herz', aktivitaet: 'Aktivität' };
function ordnen(e){
  const wrap = $('#bereiche'), nav = $('.sprung');
  const an = e.bereiche;
  wrap.querySelectorAll('[data-bereich]').forEach(sec => { sec.hidden = !an.includes(sec.dataset.bereich); });
  an.forEach((id, i) => { const sec = wrap.querySelector(`[data-bereich="${id}"]`); if(sec){ wrap.appendChild(sec); sec.querySelector('.nr').textContent = String(i + 1).padStart(2, '0'); } });
  nav.innerHTML = an.map(id => `<a href="#${id}">${BEREICH_TITEL[id]}</a>`).join('');
}

/* ── Kennzahl-Kacheln ──────────────────────────────────── */
const vorz = (v, nk = 0) => v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + zahl(Math.abs(v), nk);
const ffmiText = f => f == null ? '' : f < 18 ? 'unter Schnitt' : f < 20 ? 'durchschnittlich' : f < 22 ? 'überdurchschnittlich' : f < 23.5 ? 'sehr gut' : 'herausragend';

function kachelDef(id, d){
  const bb = d.bodybuilding, r = bb.reihen, z = d.einstellungen.ziele;
  const w = (v, e, nk = 0) => v == null ? '–' : `${zahl(v, nk)}${e ? `<small>${e}</small>` : ''}`;
  switch(id){
    case 'gewicht': return { name: 'Trendgewicht', f: 'koerper', wert: w(bb.gewicht.aktuell_trend_kg, 'kg', 1), werte: r.trend_kg, unter: `<span class="sub">Waage ${zahl(bb.gewicht.letzte_messung_kg, 1)}</span>` };
    case 'rate': { const g = bb.gewicht; return { name: 'Pro Woche', f: 'koerper', wert: g.rate_kg_woche == null ? '–' : `${vorz(g.rate_kg_woche, 2)}<small>kg</small>`, werte: r.trend_kg,
      unter: g.rate_prozent_woche == null ? '' : `<span class="delta ${g.im_plan ? 'gut' : 'schlecht'}">${vorz(g.rate_prozent_woche, 2)} % · Ziel ${vorz(g.ziel_rate_prozent_woche, 2)}</span>` }; }
    case 'protein_gkg': { const e = bb.eiweiss; return { name: 'Eiweiß / kg', f: 'mk-eiweiss', wert: w(e.mittel_g_pro_kg, 'g/kg', 2), werte: r.eiweiss_g_pro_kg,
      unter: e.mittel_g_pro_kg == null ? '' : `<span class="delta ${e.mittel_g_pro_kg >= e.ziel_g_pro_kg * .95 ? 'gut' : 'schlecht'}">Ziel ${zahl(e.ziel_g_pro_kg, 1)} · ${e.tage_ziel_erreicht}/${e.tage_geloggt} T</span>` }; }
    case 'bilanz': return { name: 'Energiebilanz Ø', f: 'plus', wert: bb.energie.bilanz_mittel_kcal == null ? '–' : `${vorz(bb.energie.bilanz_mittel_kcal)}<small>kcal</small>`, werte: r.bilanz_kcal, unter: `<span class="sub">${bb.energie.bilanz_mittel_kcal >= 0 ? 'Überschuss' : 'Defizit'}</span>` };
    case 'tdee': return { name: 'Verbrauch (TDEE)', f: 'ernaehrung', wert: w(bb.energie.tdee_kcal, 'kcal'), werte: r.verbrauch_kcal, unter: `<span class="sub">${bb.energie.tdee_methode?.startsWith('adaptiv') ? 'adaptiv' : 'Apple Health'}</span>` };
    case 'koerperfett': return { name: 'Körperfett', f: 'koerper', wert: w(bb.koerper.koerperfett_prozent, '%', 1), werte: reihe('body_fat_percentage'), unter: delta(reihe('body_fat_percentage'), false, v => zahl(v, 1)) };
    case 'magermasse': return { name: 'Magermasse', f: 'koerper', wert: w(bb.koerper.magermasse_kg, 'kg', 1), werte: r.magermasse_kg, unter: bb.koerper.magermasse_veraenderung_kg == null ? '' : `<span class="delta ${bb.koerper.magermasse_veraenderung_kg >= 0 ? 'gut' : 'schlecht'}">${vorz(bb.koerper.magermasse_veraenderung_kg, 1)} kg</span>` };
    case 'ffmi': return { name: 'FFMI', f: 'koerper', wert: w(bb.koerper.ffmi, '', 1), werte: [], unter: `<span class="sub">${bb.koerper.groesse_cm ? ffmiText(bb.koerper.ffmi) : 'Größe eintragen'}</span>` };
    case 'taille': return { name: 'Taille', f: 'koerper', wert: w(bb.koerper.taille_cm, 'cm', 1), werte: r.taille_cm, unter: bb.koerper.taille_veraenderung_cm == null ? '' : `<span class="sub">${vorz(bb.koerper.taille_veraenderung_cm, 1)} cm</span>` };
    case 'kraft': { const k = bb.kraft; return { name: 'Kraft / Woche', f: 'aktiv', wert: w(k.pro_woche_mittel, `/ ${k.ziel_pro_woche}`, 1), werte: k.wochen.map(x => x.einheiten),
      unter: `<span class="delta ${k.pro_woche_mittel >= k.ziel_pro_woche ? 'gut' : ''}">${k.einheiten} Einheiten</span>` }; }
    case 'gegessen': return { name: 'Gegessen', f: 'ernaehrung', wert: w(letzter(reihe('dietary_energy')), 'kcal'), werte: reihe('dietary_energy'), unter: bb.energie.empfohlene_kcal ? `<span class="sub">Ziel ${zahl(bb.energie.empfohlene_kcal)}</span>` : delta(reihe('dietary_energy'), null) };
    case 'schlaf': { const v = schlafReihe('gesamt_min'), l = letzter(v); return { name: 'Schlaf', f: 'schlaf', wert: l == null ? '–' : `${Math.floor(l / 60)}<small>h</small> ${String(Math.round(l % 60)).padStart(2, '0')}<small>min</small>`, werte: v, unter: delta(v, true, dauer) }; }
    case 'ruhepuls': { const v = reihe('resting_heart_rate'); return { name: 'Ruhepuls', f: 'herz', wert: w(letzter(v), 'bpm'), werte: v, unter: delta(v, false) }; }
    case 'hrv': { const v = reihe('heart_rate_variability'); return { name: 'HRV', f: 'schlaf', wert: w(letzter(v), 'ms'), werte: v, unter: delta(v, true) }; }
    case 'schritte': { const v = reihe('step_count'); return { name: 'Schritte', f: 'aktiv', wert: w(letzter(v)), werte: v, unter: delta(v, true) }; }
    case 'aktivkalorien': { const v = reihe('active_energy'); return { name: 'Aktivkalorien', f: 'ernaehrung', wert: w(letzter(v), 'kcal'), werte: v, unter: delta(v, true) }; }
    case 'vo2max': { const v = reihe('vo2_max'); return { name: 'VO₂max', f: 'herz', wert: w(letzter(v), '', 1), werte: v, unter: delta(v, true, x => zahl(x, 1)) }; }
    case 'wasser': { const v = reihe('dietary_water'); return { name: 'Wasser', f: 'minus', wert: w(letzter(v), 'ml'), werte: v, unter: delta(v, true) }; }
  }
  return null;
}

function kacheln(d){
  const liste = d.einstellungen.kacheln.map(id => [id, kachelDef(id, d)]).filter(([, k]) => k);
  const n = liste.length, spalten = n <= 5 ? n : Math.ceil(n / Math.ceil(n / 5));
  const box = $('#kacheln'); box.style.setProperty('--spalten', Math.max(1, spalten));
  const ziel = { gewicht: 'aufbau', rate: 'aufbau', protein_gkg: 'ernaehrung', bilanz: 'aufbau', tdee: 'aufbau', koerperfett: 'aufbau', magermasse: 'aufbau', ffmi: 'aufbau', taille: 'aufbau', kraft: 'training', gegessen: 'ernaehrung', schlaf: 'schlaf', ruhepuls: 'herz', hrv: 'herz', schritte: 'aktivitaet', aktivkalorien: 'aktivitaet', vo2max: 'herz', wasser: 'ernaehrung' };
  const fueller = (spalten - n % spalten) % spalten;
  box.innerHTML = liste.map(([id, k], i) => `<a class="kachel${n % 2 && i === n - 1 ? ' voll' : ''}" href="#${ziel[id]}" style="--k:${farbe(k.f)}"><span class="t"><i></i>${k.name}</span><span class="w">${k.wert}</span><span class="u">${k.unter || '<span></span>'}${spark(k.werte, farbe(k.f))}</span></a>`).join('')
    + '<div class="kachel fueller" aria-hidden="true"></div>'.repeat(fueller);
  box.hidden = !n;
}

/* ── Körper & Aufbau ───────────────────────────────────── */
function aufbau(d){
  const bb = d.bodybuilding, g = bb.gewicht, e = bb.energie, k = bb.koerper, r = bb.reihen;
  const pfeil = g.im_plan == null ? '' : g.im_plan ? 'gut' : 'schlecht';
  $('#phase').innerHTML = `
    <div><span class="etikett">${esc(bb.phase.titel)}</span><b>${zahl(g.aktuell_trend_kg, 1)}<small>kg Trend</small></b><em>${g.zielgewicht_kg ? `Ziel ${zahl(g.zielgewicht_kg, 1)} kg${g.wochen_bis_ziel ? ` · ~${zahl(g.wochen_bis_ziel)} Wochen` : ''}` : 'Waage ' + zahl(g.letzte_messung_kg, 1) + ' kg'}</em></div>
    <div><span>Tempo pro Woche</span><b>${vorz(g.rate_kg_woche, 2)}<small>kg</small></b><em class="${pfeil}">${vorz(g.rate_prozent_woche, 2)} % · Ziel ${vorz(g.ziel_rate_prozent_woche, 2)} %</em></div>
    <div><span>Verbrauch (TDEE)</span><b>${zahl(e.tdee_kcal)}<small>kcal</small></b><em>${e.tdee_methode?.startsWith('adaptiv') ? 'adaptiv aus Gewicht + Zufuhr' : 'laut Apple Health'}</em></div>
    <div><span>Empfohlen pro Tag</span><b>${zahl(e.empfohlene_kcal)}<small>kcal</small></b><em>Eiweiß ${zahl(bb.eiweiss.ziel_g)} g · Ø gegessen ${zahl(e.zufuhr_mittel_kcal)}</em></div>`;
  linie($('#d-gewicht'), { tage: r.tage, werte: r.trend_kg, punkte: r.gewicht_kg, farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Trend', einheit: 'kg', label: 'Gewicht: Trend und Messungen' });
  divergierend($('#d-bilanz'), { tage: r.tage, werte: r.bilanz_kcal, farbePlus: farbe('plus'), farbeMinus: farbe('minus'), format: v => zahl(Math.abs(v)), einheit: 'kcal', label: 'Energiebilanz pro Tag' });
  balken($('#d-gkg'), { tage: r.tage, werte: r.eiweiss_g_pro_kg, farbe: farbe('mk-eiweiss'), ziel: bb.eiweiss.ziel_g_pro_kg, format: v => zahl(v, 2), name: 'Eiweiß', einheit: 'g/kg', label: 'Eiweiß pro kg Körpergewicht' });
  $('#gkg-k').textContent = bb.eiweiss.mittel_g_pro_kg ? `Ø ${zahl(bb.eiweiss.mittel_g_pro_kg, 2)} g/kg · Ziel ${zahl(bb.eiweiss.ziel_g_pro_kg, 1)}` : '';
  linie($('#d-lbm'), { tage: r.tage, werte: r.magermasse_kg, farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Magermasse', einheit: 'kg', label: 'Magermasse' });
  linie($('#d-fett'), { tage: r.tage, werte: reihe('body_fat_percentage'), farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Körperfett', einheit: '%', label: 'Körperfettanteil' });
  const mini = [['Körperfett', zahl(k.koerperfett_prozent, 1), '%'], ['Magermasse', zahl(k.magermasse_kg, 1), 'kg', k.magermasse_veraenderung_kg != null ? vorz(k.magermasse_veraenderung_kg, 1) + ' kg' : ''],
    ['FFMI', zahl(k.ffmi, 1), '', k.groesse_cm ? ffmiText(k.ffmi) : 'Größe fehlt'], ['Taille', zahl(k.taille_cm, 1), 'cm', k.taille_veraenderung_cm != null ? vorz(k.taille_veraenderung_cm, 1) + ' cm' : '']];
  $('#aufbau-mini').innerHTML = mini.map(([t, v, e, x]) => `<div><span>${t}</span><b>${v}<small>${e}</small></b>${x ? `<em class="mini-x">${esc(x)}</em>` : ''}</div>`).join('');
  $('#aufbau-k').innerHTML = g.rate_kg_woche == null ? 'Noch zu wenig Gewichtsmessungen für einen Trend.' :
    `Du ${g.rate_kg_woche > 0.02 ? 'nimmst' : g.rate_kg_woche < -0.02 ? 'nimmst' : 'hältst'} ${Math.abs(g.rate_kg_woche) > 0.02 ? `<b>${zahl(Math.abs(g.rate_kg_woche), 2)} kg</b> pro Woche ${g.rate_kg_woche > 0 ? 'zu' : 'ab'}` : 'dein Gewicht'} – ${g.im_plan ? '<b>im Plan</b>' : `Ziel: <b>${vorz(g.ziel_rate_kg_woche, 2)} kg</b>`}.`;
}

/* ── Krafttraining ─────────────────────────────────────── */
function training(d){
  const k = d.bodybuilding.kraft, r = d.bodybuilding.reihen;
  const kw = k.wochen.map(w => 'KW ' + +w.woche.split('-W')[1]);
  balken($('#d-kraft'), { tage: kw, werte: k.wochen.map(w => w.einheiten), farbe: farbe('aktiv'), ziel: k.ziel_pro_woche, format: v => zahl(v), name: 'Einheiten', label: 'Krafttrainings pro Woche' });
  $('#kw-k').textContent = `Ø ${zahl(k.pro_woche_mittel, 1)} · Ziel ${k.ziel_pro_woche}`;
  // Kalender: Spalten = Wochen, Zeilen = Mo–So
  const erster = (new Date(r.tage[0] + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const heute = r.tage.at(-1);
  const zellen = Array(erster).fill('<span class="t leer"></span>').concat(r.tage.map((t, i) => {
    const e = r.kraft_tage[i]; const titel = `${tagKurz(t, true)}: ${e.length ? e.map(x => x.art).join(', ') : 'kein Krafttraining'}`;
    return `<span class="t${e.length ? ' an' : ''}${t === heute ? ' heute' : ''}" title="${esc(titel)}" aria-label="${esc(titel)}"></span>`;
  }));
  $('#kalender').innerHTML = zellen.join('');
  $('#kalender').setAttribute('role', 'img');
  $('#kalender').setAttribute('aria-label', `Krafttraining an ${r.kraft_tage.filter(e => e.length).length} von ${r.tage.length} Tagen`);
  const liste = d.workouts.filter(w => KRAFT.test(w.art));
  $('#kraft-liste').innerHTML = liste.length ? liste.slice(0, matchMedia('(max-width: 620px)').matches ? 6 : 12).map(w => `<li><span class="ic" aria-hidden="true">▲</span><span class="a">${esc(w.art)}</span>
    <span class="d">${new Date(w.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} · ${zahl(w.dauer_min)} min${w.energie_kcal ? ' · ' + zahl(w.energie_kcal) + ' kcal' : ''}${w.hf_mittel ? ' · Ø ' + zahl(w.hf_mittel) + ' bpm' : ''}</span></li>`).join('')
    : '<li class="leer">Keine Krafttrainings in diesem Zeitraum. Zeichne sie auf der Apple Watch als „Krafttraining“ auf – oder mit Apps wie Hevy oder Strong, die nach Apple Health schreiben.</li>';
  $('#kraft-k').textContent = liste.length ? `${liste.length} Einheiten · ${dauer(liste.reduce((s, w) => s + (w.dauer_min || 0), 0))}` : '';
  $('#training-k').innerHTML = k.einheiten ? `<b>${k.einheiten}</b> Einheiten, <b>${dauer(k.minuten)}</b> unter der Hantel · Ø <b>${zahl(k.pro_woche_mittel, 1)}</b> pro Woche.` : '';
}
const KRAFT = /kraft|strength|functional|bodybuilding|gewicht|weight|hiit|core|crossfit|calisthenics/i;

const tabelle = (kopf, zeilen) => `<table><thead><tr>${kopf.map(k => `<th scope="col">${esc(k)}</th>`).join('')}</tr></thead><tbody>${zeilen.map(z => `<tr>${z.map((c, i) => i ? `<td>${esc(c)}</td>` : `<th scope="row">${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table>`;

function schlaf(d){
  const phasen = [
    { name: 'Tief', feld: 'tief_min', farbe: farbe('ph-tief') },
    { name: 'Kern', feld: 'kern_min', farbe: farbe('ph-kern') },
    { name: 'REM', feld: 'rem_min', farbe: farbe('ph-rem') },
    { name: 'Wach', feld: 'wach_min', farbe: farbe('ph-wach') },
  ].map(p => ({ ...p, werte: schlafReihe(p.feld) }));
  const ohnePhasen = d.schlaf.length && d.schlaf.every(n => n.tief_min == null);
  const teile = (ohnePhasen ? [{ name: 'Schlaf', farbe: farbe('schlaf'), werte: schlafReihe('gesamt_min') }] : phasen)
    .map(t => ({ ...t, werte: t.werte.map(v => v == null ? null : v / 60) })); // Stunden → runde Achse
  const fmt = { wert: h => dauer(h * 60), achse: v => zahl(v, 1) + ' h' };
  if(!d.schlaf.length){ leer($('#d-schlaf'), 'Schlafphasen'); leer($('#d-fenster'), 'Schlaffenster'); $('#schlaf-k').textContent = ''; $('#schlaf-leg').innerHTML = ''; return; }
  stapel($('#d-schlaf'), { tage: d.tage, teile, format: fmt, ziel: d.einstellungen.ziele.schlaf_ziel_h, label: 'Schlafphasen pro Nacht, gestapelt in Stunden' });
  $('#schlaf-leg').innerHTML = [...teile].reverse().map(t => `<li><i style="background:${t.farbe}"></i>${t.name} <b>${dauer(mittel(t.werte) * 60)}</b></li>`).join('');
  fenster($('#d-fenster'), { tage: d.tage, naechte: d.schlaf, farbe: farbe('schlaf'), zone: d.zeitzone, label: 'Einschlaf- und Aufwachzeiten' });
  const zielMin = d.einstellungen.ziele.schlaf_ziel_h * 60, g = mittel(d.schlaf.map(n => n.gesamt_min)), unter7 = d.schlaf.filter(n => n.gesamt_min < zielMin - 30).length;
  const uhr = (iso, plus) => { const t = new Date(iso); let m = t.getHours() * 60 + t.getMinutes(); if(plus && m < 720) m += 1440; return m; };
  const ein = mittel(d.schlaf.filter(n => n.start).map(n => uhr(n.start, true))), auf = mittel(d.schlaf.filter(n => n.ende).map(n => uhr(n.ende)));
  const hm = m => m == null ? '–' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const streu = (() => { const v = d.schlaf.filter(n => n.start).map(n => uhr(n.start, true)); if(v.length < 3) return null; const m = mittel(v); return Math.sqrt(mittel(v.map(x => (x - m) ** 2))); })();
  $('#schlaf-k').innerHTML = `Im Schnitt <b>${dauer(g)}</b> pro Nacht · <b>${unter7}</b> von ${d.schlaf.length} Nächten mehr als 30 min unter deinem Ziel.`;
  $('#fenster-k').innerHTML = `Ø ${hm(ein)} → ${hm(auf)}${streu != null ? ` · ± ${zahl(streu)} min` : ''}`;
  $('#t-schlaf').innerHTML = tabelle(['Nacht', 'Gesamt', 'Tief', 'Kern', 'REM', 'Wach', 'Eingeschlafen', 'Aufgewacht'],
    [...d.schlaf].reverse().map(n => [tagKurz(n.nacht, true), dauer(n.gesamt_min), dauer(n.tief_min), dauer(n.kern_min), dauer(n.rem_min), n.wach_min == null ? '–' : zahl(n.wach_min) + ' min',
      n.start ? new Date(n.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–', n.ende ? new Date(n.ende).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–']));
}

function herz(d){
  const rhr = reihe('resting_heart_rate'), hrv = reihe('heart_rate_variability');
  linie($('#d-rhr'), { tage: d.tage, werte: rhr, farbe: farbe('herz'), format: v => zahl(v), name: 'Ruhepuls', einheit: 'bpm', label: 'Ruhepuls pro Tag' });
  linie($('#d-hrv'), { tage: d.tage, werte: hrv, farbe: farbe('schlaf'), format: v => zahl(v), name: 'HRV', einheit: 'ms', label: 'Herzfrequenzvariabilität pro Tag' });
  const hf = spanne('heart_rate');
  linie($('#d-hf'), { tage: d.tage, werte: hf.map(p => p?.wert ?? null), spanne: hf.map(p => p && p.min != null ? { min: p.min, max: p.max } : null), farbe: farbe('herz'), format: v => zahl(v), name: 'Mittel', einheit: 'bpm', label: 'Herzfrequenz mit Tagesspanne' });
  const mini = [['VO₂max', 'vo2_max', 'ml/kg·min', 1], ['Blutsauerstoff', 'blood_oxygen_saturation', '%', 1], ['Atemfrequenz', 'respiratory_rate', '/min', 1], ['Gehpuls', 'walking_heart_rate_average', 'bpm', 0]];
  $('#herz-mini').innerHTML = mini.map(([t, m, e, nk]) => `<div><span>${t}</span><b>${zahl(letzter(reihe(m)), nk)}<small>${e}</small></b></div>`).join('');
  const r = mittel(rhr), h = mittel(hrv);
  $('#herz-k').innerHTML = r ? `Ruhepuls Ø <b>${zahl(r)} bpm</b>${h ? ` · HRV Ø <b>${zahl(h)} ms</b>` : ''}.` : '';
}

const SYMBOL = { lauf: '↗', run: '↗', rad: '◎', cycl: '◎', kraft: '▲', strength: '▲', yoga: '◡', schwimm: '≈', swim: '≈', geh: '·', walk: '·', hiit: '✦' };
const symbol = art => { const a = art.toLowerCase(); for(const [k, v] of Object.entries(SYMBOL)) if(a.includes(k)) return v; return '●'; };

function aktivitaet(d){
  const schritte = reihe('step_count');
  balken($('#d-schritte'), { tage: d.tage, werte: schritte, farbe: farbe('aktiv'), ziel: d.einstellungen.ziele.schritte_ziel, format: v => zahl(v), name: 'Schritte', label: 'Schritte pro Tag' });
  balken($('#d-energie'), { tage: d.tage, werte: reihe('active_energy'), farbe: farbe('ernaehrung'), format: v => zahl(v), name: 'Aktivkalorien', einheit: 'kcal', label: 'Aktivkalorien pro Tag' });
  const wo = d.workouts;
  $('#wo-k').textContent = wo.length ? `${wo.length} Einheiten · ${dauer(wo.reduce((s, w) => s + (w.dauer_min || 0), 0))}` : '';
  $('#workouts').innerHTML = wo.length ? wo.slice(0, matchMedia('(max-width: 620px)').matches ? 6 : 12).map(w => `<li><span class="ic" aria-hidden="true">${symbol(w.art)}</span><span class="a">${esc(w.art)}</span>
    <span class="d">${new Date(w.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} · ${zahl(w.dauer_min)} min${w.distanz_km ? ' · ' + zahl(w.distanz_km, 1) + ' km' : ''}${w.energie_kcal ? ' · ' + zahl(w.energie_kcal) + ' kcal' : ''}</span></li>`).join('')
    : '<li class="leer">Keine Trainings in diesem Zeitraum.</li>';
  const s = mittel(schritte), ziel = schritte.filter(v => v >= d.einstellungen.ziele.schritte_ziel).length;
  $('#akt-k').innerHTML = s ? `Ø <b>${zahl(s)}</b> Schritte · Ziel an <b>${ziel}</b> von ${schritte.filter(v => v != null).length} Tagen erreicht.` : '';
}

function ernaehrung(d){
  const ew = reihe('protein'), kh = reihe('carbohydrates'), fe = reihe('total_fat'), kcal = reihe('dietary_energy');
  const teile = [
    { name: 'Eiweiß', farbe: farbe('mk-eiweiss'), werte: ew.map(v => v == null ? null : v * 4) },
    { name: 'Kohlenhydrate', farbe: farbe('mk-kh'), werte: kh.map(v => v == null ? null : v * 4) },
    { name: 'Fett', farbe: farbe('mk-fett'), werte: fe.map(v => v == null ? null : v * 9) },
  ];
  if(!kcal.some(v => v != null)){ leer($('#d-makro'), 'Makronährstoffe'); $('#ern-schnitt').innerHTML = '<p class="klein">Noch keine Ernährungsdaten. Apps wie Yazio, MyFitnessPal oder Lifesum schreiben sie in Apple Health.</p>'; $('#ern-k').textContent = ''; $('#makro-leg').innerHTML = ''; return; }
  stapel($('#d-makro'), { tage: d.tage, teile, ziel: d.bodybuilding.energie.empfohlene_kcal, format: { wert: v => zahl(v) + ' kcal', achse: v => zahl(v) }, label: 'Kalorien aus Makronährstoffen pro Tag' });
  const g = [mittel(ew), mittel(kh), mittel(fe)], k = g[0] * 4 + g[1] * 4 + g[2] * 9;
  $('#makro-leg').innerHTML = teile.map((t, i) => `<li><i style="background:${t.farbe}"></i>${t.name} <b>${zahl(g[i] * (i === 2 ? 9 : 4) / k * 100)} %</b></li>`).join('');
  const zeile = (n, w, e, f) => `<div class="z"><span>${f ? `<i style="background:${f}"></i>` : ''}${n}</span><b>${w == null ? '–' : zahl(w) + ' ' + e}</b></div>`;
  $('#ern-schnitt').innerHTML = `<div class="gross">${zahl(mittel(kcal))}<small>kcal</small></div>
    <div class="aufteilung" aria-hidden="true">${teile.map((t, i) => `<span style="flex:${g[i] * (i === 2 ? 9 : 4)};background:${t.farbe}"></span>`).join('')}</div>
    ${zeile('Eiweiß', g[0], 'g', teile[0].farbe)}${d.bodybuilding.eiweiss.mittel_g_pro_kg ? `<div class="z"><span>&nbsp;&nbsp;&nbsp;&nbsp;pro kg Körpergewicht</span><b>${zahl(d.bodybuilding.eiweiss.mittel_g_pro_kg, 2)} g</b></div>` : ''}${zeile('Kohlenhydrate', g[1], 'g', teile[1].farbe)}${zeile('Fett', g[2], 'g', teile[2].farbe)}
    ${zeile('Ballaststoffe', mittel(reihe('fiber')), 'g')}${zeile('Zucker', mittel(reihe('dietary_sugar')), 'g')}${zeile('Wasser', mittel(reihe('dietary_water')), 'ml')}${zeile('Koffein', mittel(reihe('dietary_caffeine')), 'mg')}`;
  const tageMit = kcal.filter(v => v != null).length;
  const emp = d.bodybuilding.energie.empfohlene_kcal;
  $('#ern-k').innerHTML = `An <b>${tageMit}</b> von ${d.tage.length} Tagen erfasst · Ø <b>${zahl(mittel(kcal))}</b>${emp ? ` von <b>${zahl(emp)}</b>` : ''} kcal · <b>${zahl(g[0])} g</b> Eiweiß.`;
}

/* ── Bedienung ─────────────────────────────────────────── */
$('#zeitraum').addEventListener('click', async e => {
  const b = e.target.closest('button'); if(!b) return;
  zustand.tage = +b.dataset.tage; SPEICHER.set('puls.tage', zustand.tage);
  document.querySelectorAll('#zeitraum button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
  const d = await laden(); if(d){ zustand.daten = d; zeichnen(); }
});
$('#zeitraum').addEventListener('keydown', e => {
  if(!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const bs = [...document.querySelectorAll('#zeitraum button')], i = bs.findIndex(b => b.getAttribute('aria-checked') === 'true');
  const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click();
});

async function verbinden(){
  const dlg = $('#verbinden'); dlg.showModal();
  const d = await laden({ verbindung: true });
  if(d?.verbindung){ $('#v-mcp').textContent = d.verbindung.mcp; $('#v-sync').textContent = d.verbindung.sync; $('#v-warn').hidden = d.verbindung.tokenGesetzt; }
}
$('#claude-knopf').addEventListener('click', verbinden);
$('#claude-knopf-2').addEventListener('click', verbinden);
$('#verbinden').addEventListener('click', async e => {
  if(e.target === e.currentTarget) return e.currentTarget.close();
  const b = e.target.closest('[data-kopie]'); if(!b) return;
  try { await navigator.clipboard.writeText($('#' + b.dataset.kopie).textContent); b.textContent = 'Kopiert ✓'; setTimeout(() => b.textContent = 'Kopieren', 1600); } catch {}
});

/* ── Ansicht & Ziele anpassen ─────────────────────────── */
const anpassen = { meta: null, entwurf: null };
async function api(methode, koerper){
  const r = await fetch('/api/einstellungen', { method: methode, headers: { 'x-puls-code': zustand.code, 'Content-Type': 'application/json' }, body: koerper ? JSON.stringify(koerper) : undefined });
  if(!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'Fehler');
  return r.json();
}

function anpassenZeichnen(){
  const { meta, entwurf: e } = anpassen;
  $('#a-vorlagen').innerHTML = Object.entries(meta.vorlagen).map(([id, v]) => `<label><input type="radio" name="vorlage" value="${id}"${e.vorlage === id ? ' checked' : ''}><b>${esc(v.titel)}</b><span>${esc(v.text)}</span></label>`).join('')
    + `<label><input type="radio" name="vorlage" value="eigene"${e.vorlage === 'eigene' ? ' checked' : ''}><b>Eigene</b><span>Deine eigene Auswahl unten.</span></label>`;
  $('#a-kacheln').innerHTML = Object.entries(meta.kacheln).map(([id, t]) => `<label><input type="checkbox" value="${id}"${e.kacheln.includes(id) ? ' checked' : ''}>${esc(t)}</label>`).join('');
  $('#a-kachel-n').textContent = `· ${e.kacheln.length} gewählt, Reihenfolge wie angeklickt`;
  const alle = [...e.bereiche, ...Object.keys(meta.bereiche).filter(b => !e.bereiche.includes(b))];
  $('#a-bereiche').innerHTML = alle.map((id, i) => { const an = e.bereiche.includes(id); return `<li class="${an ? '' : 'aus'}" data-id="${id}"><label><input type="checkbox"${an ? ' checked' : ''}>${esc(meta.bereiche[id])}</label>
    <button type="button" data-hoch aria-label="${esc(meta.bereiche[id])} nach oben"${i === 0 || !an ? ' disabled' : ''}>↑</button><button type="button" data-runter aria-label="${esc(meta.bereiche[id])} nach unten"${!an || i >= e.bereiche.length - 1 ? ' disabled' : ''}>↓</button></li>`; }).join('');
  const f = $('#anpassen-form');
  $('#a-phase').innerHTML = Object.entries(meta.phasen).map(([id, t]) => `<option value="${id}"${e.ziele.phase === id ? ' selected' : ''}>${esc(t)}</option>`).join('');
  for(const [k, v] of Object.entries(e.ziele)) if(f.elements[k] && k !== 'phase') f.elements[k].value = v ?? '';
}

function eigene(){ anpassen.entwurf.vorlage = 'eigene'; }

$('#a-vorlagen').addEventListener('change', e => {
  const id = e.target.value, v = anpassen.meta.vorlagen[id];
  anpassen.entwurf.vorlage = id;
  if(v){ anpassen.entwurf.kacheln = [...v.kacheln]; anpassen.entwurf.bereiche = [...v.bereiche]; }
  if(id === 'bodybuilding' && anpassen.entwurf.ziele.phase === 'diaet') anpassen.entwurf.ziele.phase = 'aufbau';
  if(id === 'diaet') anpassen.entwurf.ziele.phase = 'diaet';
  anpassenZeichnen();
});
$('#a-kacheln').addEventListener('change', e => {
  const k = anpassen.entwurf.kacheln, id = e.target.value;
  anpassen.entwurf.kacheln = e.target.checked ? [...k, id] : k.filter(x => x !== id);
  eigene(); anpassenZeichnen();
});
$('#a-bereiche').addEventListener('click', e => {
  const li = e.target.closest('li'); if(!li) return;
  const b = anpassen.entwurf.bereiche, id = li.dataset.id, i = b.indexOf(id);
  if(e.target.matches('input')){ anpassen.entwurf.bereiche = e.target.checked ? [...b, id] : b.filter(x => x !== id); }
  else if(e.target.closest('[data-hoch]') && i > 0){ [b[i - 1], b[i]] = [b[i], b[i - 1]]; }
  else if(e.target.closest('[data-runter]') && i < b.length - 1){ [b[i + 1], b[i]] = [b[i], b[i + 1]]; }
  else return;
  eigene(); anpassenZeichnen();
  const fokus = $(`#a-bereiche li[data-id="${id}"] ${e.target.closest('[data-hoch]') ? '[data-hoch]' : e.target.closest('[data-runter]') ? '[data-runter]' : 'input'}`);
  if(fokus && !fokus.disabled) fokus.focus();
});
$('#anpassen-form').addEventListener('input', e => {
  if(!e.target.closest('.felder')) return;
  const f = e.target.form, z = anpassen.entwurf.ziele;
  for(const k of Object.keys(z)) if(f.elements[k]) z[k] = k === 'phase' ? f.elements[k].value : f.elements[k].value === '' ? null : Number(f.elements[k].value);
});
$('#anpassen-form').addEventListener('submit', async e => {
  e.preventDefault();
  const st = $('#a-status'); st.textContent = 'Speichere …';
  try {
    const j = await api('PUT', anpassen.entwurf);
    zustand.daten = await laden() || zustand.daten;
    st.textContent = ''; $('#anpassen').close(); zeichnen();
    void j;
  } catch(err){ st.textContent = err.message; }
});
$('#anpassen').addEventListener('click', e => { if(e.target === e.currentTarget || e.target.closest('[data-zu]')) e.currentTarget.close(); });
$('#anpassen-knopf').addEventListener('click', async () => {
  $('#anpassen').showModal(); $('#a-status').textContent = 'Lade …';
  try { anpassen.meta = await api('GET'); anpassen.entwurf = structuredClone(anpassen.meta.einstellungen); anpassenZeichnen(); $('#a-status').textContent = ''; }
  catch(err){ $('#a-status').textContent = err.message; }
});

let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(zeichnen, 150); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', zeichnen);
addEventListener('scroll', () => $('#kopf').classList.toggle('fest', scrollY > 8), { passive: true });
document.addEventListener('visibilitychange', async () => { if(document.visibilityState === 'visible' && zustand.daten){ const d = await laden(); if(d){ zustand.daten = d; zeichnen(); } } });

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => { const d = await laden(); if(d){ zustand.daten = d; zeichnen(); } })();
