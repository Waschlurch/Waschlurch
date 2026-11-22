import { balken, stapel, linie, fenster, spark, leer, tagKurz } from './diagramme.js';

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
  held(d); kacheln(d); schlaf(d); herz(d); aktivitaet(d); ernaehrung(d); koerper(d);
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

function kacheln(d){
  const k = [
    { id: 'schlaf', name: 'Schlaf', f: 'schlaf', werte: schlafReihe('gesamt_min'), roh: v => dauer(v), gut: true },
    { id: 'herz', name: 'Ruhepuls', f: 'herz', werte: reihe('resting_heart_rate'), einheit: 'bpm', gut: false },
    { id: 'herz', name: 'HRV', f: 'schlaf', werte: reihe('heart_rate_variability'), einheit: 'ms', gut: true },
    { id: 'aktivitaet', name: 'Schritte', f: 'aktiv', werte: reihe('step_count'), gut: true },
    { id: 'ernaehrung', name: 'Gegessen', f: 'ernaehrung', werte: reihe('dietary_energy'), einheit: 'kcal', gut: null },
  ];
  $('#kacheln').innerHTML = k.map(x => {
    const l = letzter(x.werte);
    const wert = l == null ? '–' : x.id === 'schlaf' ? `${Math.floor(l / 60)}<small>h</small> ${String(Math.round(l % 60)).padStart(2, '0')}<small>min</small>` : `${zahl(l)}${x.einheit ? `<small>${x.einheit}</small>` : ''}`;
    return `<a class="kachel" href="#${x.id}" style="--k:${farbe(x.f)}"><span class="t"><i></i>${x.name}</span><span class="w">${wert}</span><span class="u">${delta(x.werte, x.gut, x.roh)}${spark(x.werte, farbe(x.f))}</span></a>`;
  }).join('');
}

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
  stapel($('#d-schlaf'), { tage: d.tage, teile, format: fmt, ziel: 8, label: 'Schlafphasen pro Nacht, gestapelt in Stunden' });
  $('#schlaf-leg').innerHTML = [...teile].reverse().map(t => `<li><i style="background:${t.farbe}"></i>${t.name} <b>${dauer(mittel(t.werte) * 60)}</b></li>`).join('');
  fenster($('#d-fenster'), { tage: d.tage, naechte: d.schlaf, farbe: farbe('schlaf'), zone: d.zeitzone, label: 'Einschlaf- und Aufwachzeiten' });
  const g = mittel(d.schlaf.map(n => n.gesamt_min)), unter7 = d.schlaf.filter(n => n.gesamt_min < 420).length;
  const uhr = (iso, plus) => { const t = new Date(iso); let m = t.getHours() * 60 + t.getMinutes(); if(plus && m < 720) m += 1440; return m; };
  const ein = mittel(d.schlaf.filter(n => n.start).map(n => uhr(n.start, true))), auf = mittel(d.schlaf.filter(n => n.ende).map(n => uhr(n.ende)));
  const hm = m => m == null ? '–' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
  const streu = (() => { const v = d.schlaf.filter(n => n.start).map(n => uhr(n.start, true)); if(v.length < 3) return null; const m = mittel(v); return Math.sqrt(mittel(v.map(x => (x - m) ** 2))); })();
  $('#schlaf-k').innerHTML = `Im Schnitt <b>${dauer(g)}</b> pro Nacht · <b>${unter7}</b> von ${d.schlaf.length} Nächten unter 7 Stunden.`;
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
  balken($('#d-schritte'), { tage: d.tage, werte: schritte, farbe: farbe('aktiv'), ziel: 10000, format: v => zahl(v), name: 'Schritte', label: 'Schritte pro Tag' });
  balken($('#d-energie'), { tage: d.tage, werte: reihe('active_energy'), farbe: farbe('ernaehrung'), format: v => zahl(v), name: 'Aktivkalorien', einheit: 'kcal', label: 'Aktivkalorien pro Tag' });
  const wo = d.workouts;
  $('#wo-k').textContent = wo.length ? `${wo.length} Einheiten · ${dauer(wo.reduce((s, w) => s + (w.dauer_min || 0), 0))}` : '';
  $('#workouts').innerHTML = wo.length ? wo.slice(0, matchMedia('(max-width: 620px)').matches ? 6 : 12).map(w => `<li><span class="ic" aria-hidden="true">${symbol(w.art)}</span><span class="a">${esc(w.art)}</span>
    <span class="d">${new Date(w.start).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} · ${zahl(w.dauer_min)} min${w.distanz_km ? ' · ' + zahl(w.distanz_km, 1) + ' km' : ''}${w.energie_kcal ? ' · ' + zahl(w.energie_kcal) + ' kcal' : ''}</span></li>`).join('')
    : '<li class="leer">Keine Trainings in diesem Zeitraum.</li>';
  const s = mittel(schritte), ziel = schritte.filter(v => v >= 10000).length;
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
  stapel($('#d-makro'), { tage: d.tage, teile, format: { wert: v => zahl(v) + ' kcal', achse: v => zahl(v) }, label: 'Kalorien aus Makronährstoffen pro Tag' });
  const g = [mittel(ew), mittel(kh), mittel(fe)], k = g[0] * 4 + g[1] * 4 + g[2] * 9;
  $('#makro-leg').innerHTML = teile.map((t, i) => `<li><i style="background:${t.farbe}"></i>${t.name} <b>${zahl(g[i] * (i === 2 ? 9 : 4) / k * 100)} %</b></li>`).join('');
  const zeile = (n, w, e, f) => `<div class="z"><span>${f ? `<i style="background:${f}"></i>` : ''}${n}</span><b>${w == null ? '–' : zahl(w) + ' ' + e}</b></div>`;
  $('#ern-schnitt').innerHTML = `<div class="gross">${zahl(mittel(kcal))}<small>kcal</small></div>
    <div class="aufteilung" aria-hidden="true">${teile.map((t, i) => `<span style="flex:${g[i] * (i === 2 ? 9 : 4)};background:${t.farbe}"></span>`).join('')}</div>
    ${zeile('Eiweiß', g[0], 'g', teile[0].farbe)}${zeile('Kohlenhydrate', g[1], 'g', teile[1].farbe)}${zeile('Fett', g[2], 'g', teile[2].farbe)}
    ${zeile('Ballaststoffe', mittel(reihe('fiber')), 'g')}${zeile('Zucker', mittel(reihe('dietary_sugar')), 'g')}${zeile('Wasser', mittel(reihe('dietary_water')), 'ml')}${zeile('Koffein', mittel(reihe('dietary_caffeine')), 'mg')}`;
  const tageMit = kcal.filter(v => v != null).length;
  $('#ern-k').innerHTML = `An <b>${tageMit}</b> von ${d.tage.length} Tagen erfasst · Ø <b>${zahl(g[0])} g</b> Eiweiß.`;
}

function koerper(d){
  const gw = reihe('weight_body_mass'), kf = reihe('body_fat_percentage');
  linie($('#d-gewicht'), { tage: d.tage, werte: gw, farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Gewicht', einheit: 'kg', label: 'Gewicht' });
  linie($('#d-fett'), { tage: d.tage, werte: kf, farbe: farbe('koerper'), format: v => zahl(v, 1), name: 'Körperfett', einheit: '%', label: 'Körperfettanteil' });
  const v = gw.filter(x => x != null);
  $('#koe-k').innerHTML = v.length > 1 ? `Aktuell <b>${zahl(v.at(-1), 1)} kg</b> · <b>${v.at(-1) - v[0] > 0 ? '+' : '−'}${zahl(Math.abs(v.at(-1) - v[0]), 1)} kg</b> im Zeitraum.` : v.length ? `Aktuell <b>${zahl(v[0], 1)} kg</b>.` : '';
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

let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(zeichnen, 150); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', zeichnen);
addEventListener('scroll', () => $('#kopf').classList.toggle('fest', scrollY > 8), { passive: true });
document.addEventListener('visibilitychange', async () => { if(document.visibilityState === 'visible' && zustand.daten){ const d = await laden(); if(d){ zustand.daten = d; zeichnen(); } } });

if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => { const d = await laden(); if(d){ zustand.daten = d; zeichnen(); } })();
