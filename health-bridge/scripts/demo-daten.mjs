/* Realistische Beispieldaten im Health-Auto-Export-Format (für lokale Vorschau und Tests). */
import { lokalerTag, tagPlus, ausLokal } from '../lib/zeit.mjs';

export function demoNutzlast(tage = 120, seed = 7){
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = (m, sd) => m + sd * (r() + r() + r() - 1.5) * 1.15;
  const heute = lokalerTag(new Date());
  const f = d => { const p = x => String(x).padStart(2, '0'); const o = -d.getTimezoneOffset(); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00 +0000`; };
  const M = {}; const add = (name, units, p) => (M[name] ||= { name, units, data: [] }).data.push(p);
  const workouts = []; let gewicht = 82.4, splitZeiger = 0;
  for(let i = tage - 1; i >= 0; i--){
    const tag = tagPlus(heute, -i); const [j, mo, t] = tag.split('-').map(Number);
    const mitt = ausLokal(j, mo, t, 0, 0); const d = f(mitt);
    const wochenende = [0, 6].includes(new Date(tag + 'T12:00:00Z').getUTCDay());
    const zyklus = ((i % 3) + 3) % 3, training = zyklus !== 0, cheat = i % 11 === 4;
    const trend = (tage - i) / tage;
    const schritte = Math.max(1800, Math.round(n(wochenende ? 10500 : 8200, 2600)));
    if(i > 0 || true){
      add('step_count', 'count', { date: d, qty: i === 0 ? Math.round(schritte * 0.6) : schritte, source: 'iPhone|Apple Watch' });
      add('active_energy', 'kcal', { date: d, qty: Math.round(schritte * 0.045 + n(180, 60)), source: 'Apple Watch' });
      add('basal_energy_burned', 'kcal', { date: d, qty: Math.round(n(1780, 25)), source: 'Apple Watch' });
      add('apple_exercise_time', 'min', { date: d, qty: Math.max(4, Math.round(n(wochenende ? 48 : 31, 16))), source: 'Apple Watch' });
      add('walking_running_distance', 'km', { date: d, qty: +(schritte * 0.00074).toFixed(2), source: 'iPhone|Apple Watch' });
      add('flights_climbed', 'count', { date: d, qty: Math.max(0, Math.round(n(9, 5))), source: 'iPhone' });
      add('resting_heart_rate', 'count/min', { date: d, qty: Math.round(n(58 - trend * 3, 2.2)), source: 'Apple Watch' });
      add('heart_rate', 'count/min', { date: d, Min: Math.round(n(49, 3)), Avg: Math.round(n(72, 4)), Max: Math.round(n(148, 14)), source: 'Apple Watch' });
      add('heart_rate_variability', 'ms', { date: d, qty: +n(46 + trend * 8, 7).toFixed(1), source: 'Apple Watch' });
      add('respiratory_rate', 'count/min', { date: d, qty: +n(14.6, 0.5).toFixed(1), source: 'Apple Watch' });
      add('blood_oxygen_saturation', '%', { date: d, qty: +n(96.8, 0.7).toFixed(1), source: 'Apple Watch' });
      if(i % 7 === 3) add('vo2_max', 'ml/(kg·min)', { date: d, qty: +n(44 + trend * 1.5, 0.4).toFixed(1), source: 'Apple Watch' });
      add('mindful_minutes', 'min', { date: d, qty: r() < 0.45 ? Math.round(n(10, 4)) : 0, source: 'Apple Watch' });
      if(i % 2 === 0){ gewicht += n(0.035, 0.22); add('weight_body_mass', 'kg', { date: d, qty: +gewicht.toFixed(1), source: 'Waage' }); add('body_fat_percentage', '%', { date: d, qty: +n(15.5 + trend * 0.4, 0.4).toFixed(1), source: 'Waage' }); }
      if(i % 7 === 0) add('waist_circumference', 'cm', { date: d, qty: +n(82 + trend * 0.5, 0.3).toFixed(1), source: 'Manuell' });
      if(i === tage - 1) add('height', 'cm', { date: d, qty: 182, source: 'Manuell' });
      if(r() < 0.85){
        const kcal = Math.round(cheat ? n(4400, 300) : training ? n(3150, 160) : n(2850, 230));
        add('dietary_energy', 'kcal', { date: d, qty: kcal, source: 'Yazio' });
        add('protein', 'g', { date: d, qty: Math.round(kcal * n(0.24, 0.03) / 4), source: 'Yazio' });
        add('carbohydrates', 'g', { date: d, qty: Math.round(kcal * n(0.45, 0.05) / 4), source: 'Yazio' });
        add('total_fat', 'g', { date: d, qty: Math.round(kcal * n(0.28, 0.04) / 9), source: 'Yazio' });
        add('dietary_sugar', 'g', { date: d, qty: Math.round(n(52, 15)), source: 'Yazio' });
        add('fiber', 'g', { date: d, qty: Math.round(n(27, 6)), source: 'Yazio' });
        add('dietary_water', 'mL', { date: d, qty: Math.round(n(2100, 400)), source: 'WaterMinder' });
        add('dietary_caffeine', 'mg', { date: d, qty: Math.round(n(190, 70)), source: 'Yazio' });
      }
    }
    // Schlaf: Nacht endet an diesem Tag
    const bett = ausLokal(j, mo, t, 0, 0).getTime() - (wochenende ? 40 : 75) * 60000 + n(0, 30) * 60000;
    const gesamt = Math.max(4.6, n(wochenende ? 7.9 : 7.0, 0.65));
    const tief = gesamt * n(0.15, 0.025), rem = gesamt * n(0.23, 0.03), wach = n(0.45, 0.2);
    const start = new Date(bett + n(14, 6) * 60000); const ende = new Date(start.getTime() + (gesamt + Math.max(0.05, wach)) * 3600e3);
    add('sleep_analysis', 'hr', { date: d, totalSleep: +gesamt.toFixed(3), asleep: 0, deep: +tief.toFixed(3), rem: +rem.toFixed(3), core: +(gesamt - tief - rem).toFixed(3), awake: +Math.max(0.05, wach).toFixed(3), inBed: +(gesamt + wach + 0.25).toFixed(3), sleepStart: f(start), sleepEnd: f(ende), inBedStart: f(new Date(bett)), inBedEnd: f(ende), source: 'Apple Watch' });
    // Trainings
    const split = [['Push', 68, null, 118], ['Pull', 64, null, 115], ['Leg Day', 74, null, 124]];
    const cardio = [['Stair Climbing', 30, null, 132], ['Pool Swim', 35, 1.2, 126], ['Indoor Cycling', 40, 15.5, 128]];
    let einheiten = [];
    if(training && r() < 0.9){ einheiten = [split[splitZeiger % 3]]; splitZeiger++; }
    else if(!training && r() < 0.8) einheiten = [cardio[(i / 3 | 0) % 3]];
    for(const [art, min, km, hf] of einheiten){
      const st = ausLokal(j, mo, t, 18, Math.round(r() * 50)); const dauer = n(min, 6);
      workouts.push({ id: `demo-${tag}-${art}`, name: art, start: f(st), end: f(new Date(st.getTime() + dauer * 60000)), duration: Math.round(dauer * 60),
        activeEnergyBurned: { qty: Math.round(dauer * n(9.5, 1.5)), units: 'kcal' }, ...(km ? { distance: { qty: +n(km, km * 0.1).toFixed(2), units: 'km' } } : {}),
        heartRate: { avg: { qty: Math.round(n(hf, 5)) }, max: { qty: Math.round(n(hf + 24, 6)) } } });
    }
  }
  return { data: { metrics: Object.values(M), workouts } };
}

/** Passende Einstellungen und Protokoll zur Demo: Rhythmus T,T,R, Diät → Aufbau, Cheat Days. */
export function demoEinstellungen(tage = 120){
  const heute = lokalerTag(new Date());
  // Index i = 0 ist heute; Rest-Day, wenn i % 3 === 0 → Plan-Start auf einen Tag mit i % 3 === 2 legen (T,T,R)
  const startI = 2 + 3 * Math.floor((tage - 3) / 3);
  return {
    vorlage: 'bodybuilding',
    ziele: { phase: 'aufbau', protein_g_pro_kg: 2.2, groesse_cm: 182, schritte_ziel: 10000, cardio_min_ziel: 20, cardio_min_rest: 35, schlaf_ziel_h: 8, kraft_pro_woche: 5, ueberschuss_kcal: 300 },
    phasen: [{ phase: 'diaet', start: tagPlus(heute, -tage + 1), notiz: 'Diät bis Herbst' }, { phase: 'aufbau', start: tagPlus(heute, -70), notiz: 'Off-Season-Aufbau' }],
    plan: { muster: ['T', 'T', 'R'], start: tagPlus(heute, -startI) },
    split: { vorlage: 'ppl', tage: [{ name: 'Push', muskeln: ['Brust', 'Schultern', 'Trizeps'] }, { name: 'Pull', muskeln: ['Rücken', 'Bizeps', 'Unterarme', 'Nacken'] }, { name: 'Beine', muskeln: ['Quadrizeps', 'Beinbeuger', 'Gesäß', 'Waden', 'Bauch'] }] },
  };
}
export function demoProtokoll(tage = 120){
  const heute = lokalerTag(new Date()), aus = [];
  for(let i = tage - 1; i >= 0; i--) if(i % 11 === 4) aus.push({ tag: tagPlus(heute, -i), cheat: true, tagtyp: null, notiz: i < 20 ? 'Pizza-Abend' : '' });
  aus.push({ tag: tagPlus(heute, -9), cheat: false, tagtyp: 'rest', notiz: 'Krank – Training ausgefallen' });
  for(const i of [2, 5, 13, 20]) aus.push({ tag: tagPlus(heute, -i), cheat: false, tagtyp: null, notiz: '', einheiten: [{ art: 'Posing', dauer_min: 20 }] });
  return aus;
}
