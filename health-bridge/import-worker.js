/* Import-Worker: liest den Apple-Health-Export (export.zip oder export.xml) oder eine CSV direkt im Browser,
   ohne die Datei komplett in den Speicher zu laden, und erzeugt Pakete im Health-Auto-Export-Format für /api/import.
   Nachricht rein: { datei: File, ab?: 'YYYY-MM-DD' }  ·  raus: { typ: 'fortschritt' | 'fertig' | 'fehler', … } */

const ROH = { BodyMass: 'weight_body_mass', BodyFatPercentage: 'body_fat_percentage', LeanBodyMass: 'lean_body_mass', BodyMassIndex: 'body_mass_index',
  Height: 'height', WaistCircumference: 'waist_circumference', BloodPressureSystolic: 'blood_pressure_systolic', BloodPressureDiastolic: 'blood_pressure_diastolic',
  VO2Max: 'vo2_max', AppleSleepingWristTemperature: 'apple_sleeping_wrist_temperature',
  DietaryEnergyConsumed: 'dietary_energy', DietaryProtein: 'protein', DietaryCarbohydrates: 'carbohydrates', DietaryFatTotal: 'total_fat', DietarySugar: 'dietary_sugar',
  DietaryFiber: 'fiber', DietaryWater: 'dietary_water', DietaryCaffeine: 'dietary_caffeine', DietarySodium: 'sodium', DietaryPotassium: 'potassium',
  DietaryMagnesium: 'magnesium', DietaryCalcium: 'calcium', DietaryIron: 'iron', DietaryFatSaturated: 'saturated_fat', DietaryCholesterol: 'dietary_cholesterol', DietaryVitaminD: 'vitamin_d' };
const SUMME = { StepCount: 'step_count', ActiveEnergyBurned: 'active_energy', BasalEnergyBurned: 'basal_energy_burned', AppleExerciseTime: 'apple_exercise_time',
  DistanceWalkingRunning: 'walking_running_distance', FlightsClimbed: 'flights_climbed' };
const MITTEL = { RestingHeartRate: 'resting_heart_rate', HeartRateVariabilitySDNN: 'heart_rate_variability', WalkingHeartRateAverage: 'walking_heart_rate_average',
  OxygenSaturation: 'blood_oxygen_saturation', RespiratoryRate: 'respiratory_rate' };
const TITEL = { weight_body_mass: 'Gewicht', body_fat_percentage: 'Körperfett', dietary_energy: 'Kalorien (z. B. YAZIO)', protein: 'Eiweiß', step_count: 'Schritte',
  heart_rate: 'Herzfrequenz', resting_heart_rate: 'Ruhepuls', heart_rate_variability: 'HRV', sleep_analysis: 'Schlafphasen', workouts: 'Trainings', active_energy: 'Aktivkalorien' };
const PAKET = 3500; // Datenpunkte pro Paket

const zustand = () => ({ roh: new Map(), summen: new Map(), mittel: new Map(), hf: new Map(), schlaf: [], workouts: [], achtsam: new Map(), quellen: new Map(), zaehler: new Map(), von: null, bis: null });
let Z;

const entity = s => s.indexOf('&') < 0 ? s : s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
function attribute(zeile){ const a = {}; const re = /(\w+)="([^"]*)"/g; let m; while((m = re.exec(zeile))) a[m[1]] = entity(m[2]); return a; }
const zaehle = (k, tag) => { Z.zaehler.set(k, (Z.zaehler.get(k) || 0) + 1); if(tag){ if(!Z.von || tag < Z.von) Z.von = tag; if(!Z.bis || tag > Z.bis) Z.bis = tag; } };

function record(a, ab){
  const typ = a.type || '', datum = a.startDate || '', tag = datum.slice(0, 10);
  if(ab && tag < ab) return;
  const quelle = (a.sourceName || '').slice(0, 80);
  if(typ === 'HKCategoryTypeIdentifierSleepAnalysis'){ Z.schlaf.push({ startDate: a.startDate, endDate: a.endDate, value: a.value, source: quelle }); return zaehle('sleep_analysis', tag); }
  if(typ === 'HKCategoryTypeIdentifierMindfulSession'){ const min = (Date.parse(a.endDate.replace(' ', 'T').replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2')) - Date.parse(a.startDate.replace(' ', 'T').replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2'))) / 60000;
    if(min > 0){ const k = tag + '|' + quelle; Z.achtsam.set(k, (Z.achtsam.get(k) || 0) + min); zaehle('mindful_minutes', tag); } return; }
  if(!typ.startsWith('HKQuantityTypeIdentifier')) return;
  const kurz = typ.slice(24), wert = Number(a.value);
  if(!Number.isFinite(wert)) return;
  const einheit = a.unit || '';
  if(ROH[kurz]){ const m = ROH[kurz]; (Z.roh.get(m + '|' + einheit) || Z.roh.set(m + '|' + einheit, []).get(m + '|' + einheit)).push({ date: datum, qty: wert, source: quelle }); return zaehle(m, tag); }
  if(SUMME[kurz]){ const m = SUMME[kurz], k = `${m}|${einheit}|${tag}|${quelle}`; Z.summen.set(k, (Z.summen.get(k) || 0) + wert); return zaehle(m, tag); }
  if(MITTEL[kurz]){ const m = MITTEL[kurz], k = `${m}|${einheit}|${tag}|${quelle}`, s = Z.mittel.get(k) || { s: 0, n: 0 }; s.s += wert; s.n++; Z.mittel.set(k, s); return zaehle(m, tag); }
  if(kurz === 'HeartRate'){ const k = `${einheit}|${tag}|${quelle}`, s = Z.hf.get(k) || { min: Infinity, max: -Infinity, s: 0, n: 0 }; s.min = Math.min(s.min, wert); s.max = Math.max(s.max, wert); s.s += wert; s.n++; Z.hf.set(k, s); return zaehle('heart_rate', tag); }
}

let offenesWorkout = null;
function workoutStart(a, ab){
  const tag = (a.startDate || '').slice(0, 10);
  if(ab && tag < ab){ offenesWorkout = { ueberspringen: true }; return; }
  const name = (a.workoutActivityType || 'Training').replace(/^HKWorkoutActivityType/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  const dauer = Number(a.duration), einheit = a.durationUnit || 'min';
  offenesWorkout = { id: `ah-${a.startDate}-${name}`.slice(0, 120), name, start: a.startDate, end: a.endDate, source: (a.sourceName || '').slice(0, 80),
    duration: Number.isFinite(dauer) ? Math.round(einheit === 'min' ? dauer * 60 : einheit === 'hr' ? dauer * 3600 : dauer) : undefined };
  if(a.totalEnergyBurned) offenesWorkout.activeEnergyBurned = { qty: Number(a.totalEnergyBurned), units: a.totalEnergyBurnedUnit || 'kcal' };
  if(a.totalDistance) offenesWorkout.distance = { qty: Number(a.totalDistance), units: a.totalDistanceUnit || 'km' };
  zaehle('workouts', tag);
}
function workoutStatistik(a){
  if(!offenesWorkout || offenesWorkout.ueberspringen) return;
  const t = (a.type || '').replace('HKQuantityTypeIdentifier', ''), sum = Number(a.sum);
  if(t === 'ActiveEnergyBurned' && Number.isFinite(sum)) offenesWorkout.activeEnergyBurned = { qty: sum, units: a.unit || 'kcal' };
  if(/^Distance/.test(t) && Number.isFinite(sum)) offenesWorkout.distance = { qty: sum, units: a.unit || 'km' };
  if(t === 'HeartRate' && a.average){ offenesWorkout.heartRate = { avg: { qty: Number(a.average) }, max: { qty: Number(a.maximum) } }; }
}
function workoutEnde(){ if(offenesWorkout && !offenesWorkout.ueberspringen) Z.workouts.push(offenesWorkout); offenesWorkout = null; }

function zeile(z, ab){
  const s = z.trimStart();
  if(s.startsWith('<Record ')) record(attribute(s), ab);
  else if(s.startsWith('<Workout ')){ workoutStart(attribute(s), ab); if(s.trimEnd().endsWith('/>')) workoutEnde(); }
  else if(s.startsWith('<WorkoutStatistics ')) workoutStatistik(attribute(s));
  else if(s.startsWith('</Workout>')) workoutEnde();
}

/* ── ZIP lesen (inkl. ZIP64), nur den Eintrag export.xml ── */
async function zipEintrag(datei){
  const ende = await datei.slice(Math.max(0, datei.size - 70000)).arrayBuffer(), dv = new DataView(ende);
  let eocd = -1; for(let i = ende.byteLength - 22; i >= 0; i--) if(dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if(eocd < 0) throw new Error('Keine gültige ZIP-Datei.');
  let cdGroesse = dv.getUint32(eocd + 12, true), cdOffset = dv.getUint32(eocd + 16, true);
  if(cdOffset === 0xFFFFFFFF || cdGroesse === 0xFFFFFFFF){
    const loc = eocd - 20; if(loc < 0 || dv.getUint32(loc, true) !== 0x07064b50) throw new Error('ZIP64-Verzeichnis nicht gefunden.');
    const z64 = Number(dv.getBigUint64(loc + 8, true)), b = new DataView(await datei.slice(z64, z64 + 56).arrayBuffer());
    cdGroesse = Number(b.getBigUint64(40, true)); cdOffset = Number(b.getBigUint64(48, true));
  }
  const cd = new DataView(await datei.slice(cdOffset, cdOffset + cdGroesse).arrayBuffer()), dek = new TextDecoder();
  for(let p = 0; p + 46 <= cd.byteLength && cd.getUint32(p, true) === 0x02014b50;){
    const methode = cd.getUint16(p + 10, true), nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), kl = cd.getUint16(p + 32, true);
    let komp = cd.getUint32(p + 20, true), roh = cd.getUint32(p + 24, true), lokal = cd.getUint32(p + 42, true);
    const name = dek.decode(new Uint8Array(cd.buffer, p + 46, nl));
    for(let e = p + 46 + nl; e < p + 46 + nl + el;){ const id = cd.getUint16(e, true), gr = cd.getUint16(e + 2, true); if(id === 1){ let q = e + 4;
      if(roh === 0xFFFFFFFF){ roh = Number(cd.getBigUint64(q, true)); q += 8; } if(komp === 0xFFFFFFFF){ komp = Number(cd.getBigUint64(q, true)); q += 8; } if(lokal === 0xFFFFFFFF){ lokal = Number(cd.getBigUint64(q, true)); } } e += 4 + gr; }
    if(/(^|\/)export\.xml$/.test(name)){
      const lh = new DataView(await datei.slice(lokal, lokal + 30).arrayBuffer());
      const start = lokal + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      return { teil: datei.slice(start, start + komp), methode, gesamt: roh || komp };
    }
    p += 46 + nl + el + kl;
  }
  throw new Error('In der ZIP-Datei wurde keine export.xml gefunden. Ist es der Export aus der Health-App?');
}

async function xmlLesen(strom, gesamt, ab){
  const leser = strom.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '', gelesen = 0, gemeldet = 0;
  for(;;){
    const { value, done } = await leser.read();
    if(done) break;
    gelesen += value.length;
    const teile = (rest + value).split('\n'); rest = teile.pop();
    for(const z of teile) zeile(z, ab);
    if(gelesen - gemeldet > 4e6){ gemeldet = gelesen; postMessage({ typ: 'fortschritt', phase: 'lesen', anteil: gesamt ? Math.min(0.99, gelesen / gesamt) : null, zeichen: gelesen }); }
  }
  if(rest) zeile(rest, ab);
}

/* ── CSV: Spalte Datum (+ optional Uhrzeit), übrige Spalten = Messgrößen (z. B. „Kalorien“, „Eiweiß“, „Gewicht“) ── */
function csvLesen(text){
  const zeilen = text.replace(/^﻿/, '').split(/\r?\n/).filter(z => z.trim());
  if(zeilen.length < 2) throw new Error('Die CSV ist leer.');
  const trenner = (zeilen[0].match(/;/g) || []).length >= (zeilen[0].match(/,/g) || []).length ? ';' : zeilen[0].includes('\t') ? '\t' : ',';
  const spalten = z => { const aus = []; let f = '', q = false; for(const c of z){ if(c === '"') q = !q; else if(c === trenner && !q){ aus.push(f); f = ''; } else f += c; } aus.push(f); return aus.map(x => x.trim()); };
  const kopf = spalten(zeilen[0]), klein = kopf.map(k => k.toLowerCase());
  const iD = klein.findIndex(k => /^(datum|date|tag|day)\b/.test(k)), iZ = klein.findIndex(k => /^(uhrzeit|zeit|time)\b/.test(k));
  if(iD < 0) throw new Error('Keine Datumsspalte gefunden (z. B. „Datum“ oder „Date“).');
  const metriken = kopf.map((k, i) => i === iD || i === iZ ? null : { name: k.replace(/\s*\(.*\)\s*$/, '').trim(), einheit: (k.match(/\(([^)]+)\)/) || [])[1] || '' });
  const daten = metriken.map(() => []);
  for(const z of zeilen.slice(1)){
    const w = spalten(z), d = w[iD]; if(!d) continue;
    const datum = iZ >= 0 && w[iZ] ? `${d} ${w[iZ]}` : d;
    metriken.forEach((m, i) => { if(m && w[i] !== '' && w[i] != null){ daten[i].push({ date: datum, qty: w[i], source: 'CSV-Import' }); zaehle(m.name, null); } });
  }
  const metrics = metriken.map((m, i) => m && daten[i].length ? { name: m.name, units: m.einheit, data: daten[i] } : null).filter(Boolean);
  return { metrics };
}

/* ── Pakete bauen ── */
function pakete(){
  const metrics = [];
  for(const [k, l] of Z.roh){ const [name, units] = k.split('|'); metrics.push({ name, units, data: l }); }
  const gruppe = (map, bauen) => { const g = new Map(); for(const [k, v] of map){ const t = k.split('|'); const key = t[0] + '|' + t[1]; (g.get(key) || g.set(key, []).get(key)).push(bauen(t, v)); } return g; };
  for(const [k, l] of gruppe(Z.summen, ([, , tag, src], v) => ({ date: tag, qty: Math.round(v * 100) / 100, source: src }))) metrics.push({ name: k.split('|')[0], units: k.split('|')[1], data: l });
  for(const [k, l] of gruppe(Z.mittel, ([, , tag, src], v) => ({ date: tag, qty: Math.round(v.s / v.n * 100) / 100, source: src }))) metrics.push({ name: k.split('|')[0], units: k.split('|')[1], data: l });
  const hf = new Map(); for(const [k, v] of Z.hf){ const [u, tag, src] = k.split('|'); (hf.get(u) || hf.set(u, []).get(u)).push({ date: tag, Min: v.min, Avg: Math.round(v.s / v.n), Max: v.max, source: src }); }
  for(const [u, l] of hf) metrics.push({ name: 'heart_rate', units: u, data: l });
  if(Z.achtsam.size) metrics.push({ name: 'mindful_minutes', units: 'min', data: [...Z.achtsam].map(([k, v]) => ({ date: k.split('|')[0], qty: Math.round(v), source: k.split('|')[1] })) });
  // in Pakete schneiden
  const aus = []; let aktuell = { data: { metrics: [], workouts: [] } }, punkte = 0;
  const schieben = () => { if(punkte){ aus.push(aktuell); aktuell = { data: { metrics: [], workouts: [] } }; punkte = 0; } };
  for(const m of metrics) for(let i = 0; i < m.data.length;){
    const platz = PAKET - punkte, teil = m.data.slice(i, i + platz);
    aktuell.data.metrics.push({ name: m.name, units: m.units, data: teil }); punkte += teil.length; i += teil.length;
    if(punkte >= PAKET) schieben();
  }
  schieben();
  // Schlaf: ganze Nächte zusammenhalten (Nacht = Aufwachtag ≈ Start + 12 h)
  const naechte = new Map();
  for(const s of Z.schlaf){ const t = new Date(Date.parse(s.startDate.replace(' ', 'T').replace(/ ([+-]\d\d)(\d\d)$/, '$1:$2')) + 12 * 3600e3).toISOString().slice(0, 10); (naechte.get(t) || naechte.set(t, []).get(t)).push(s); }
  let sp = []; for(const l of naechte.values()){ if(sp.length + l.length > PAKET && sp.length){ aus.push({ data: { metrics: [{ name: 'sleep_analysis', units: 'hr', data: sp }] } }); sp = []; } sp.push(...l); }
  if(sp.length) aus.push({ data: { metrics: [{ name: 'sleep_analysis', units: 'hr', data: sp }] } });
  for(let i = 0; i < Z.workouts.length; i += 1500) aus.push({ data: { metrics: [], workouts: Z.workouts.slice(i, i + 1500) } });
  return aus;
}

onmessage = async ({ data: { datei, ab } }) => {
  Z = zustand();
  try {
    const name = datei.name.toLowerCase();
    let liste;
    if(name.endsWith('.csv') || name.endsWith('.txt')){ liste = [csvLesen(await datei.text())]; liste = [{ data: liste[0] }]; }
    else {
      if(name.endsWith('.zip')){
        if(typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser kann ZIP-Dateien nicht entpacken. Bitte export.zip in der Dateien-App antippen (entpackt sie) und export.xml auswählen.');
        const { teil, methode, gesamt } = await zipEintrag(datei);
        const strom = methode === 8 ? teil.stream().pipeThrough(new DecompressionStream('deflate-raw')) : teil.stream();
        await xmlLesen(strom, gesamt, ab);
      } else await xmlLesen(datei.stream(), datei.size, ab);
      liste = pakete();
    }
    const uebersicht = [...Z.zaehler].map(([k, n]) => ({ metrik: k, titel: TITEL[k] || k, n })).sort((a, b) => b.n - a.n);
    postMessage({ typ: 'fertig', pakete: liste, uebersicht, von: Z.von, bis: Z.bis, punkte: liste.reduce((s, p) => s + (p.data.metrics || []).reduce((t, m) => t + m.data.length, 0) + (p.data.workouts || []).length, 0) });
  } catch(e){ postMessage({ typ: 'fehler', text: e.message || String(e) }); }
};
