/* Realistische Beispieldaten im Health-Auto-Export-Format (für lokale Vorschau und Tests). */
import { lokalerTag, tagPlus, ausLokal } from '../lib/zeit.mjs';

export function demoNutzlast(tage = 120, seed = 7){
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = (m, sd) => m + sd * (r() + r() + r() - 1.5) * 1.15;
  const heute = lokalerTag(new Date());
  const f = d => { const p = x => String(x).padStart(2, '0'); const o = -d.getTimezoneOffset(); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00 +0000`; };
  const M = {}; const add = (name, units, p) => (M[name] ||= { name, units, data: [] }).data.push(p);
  const workouts = []; let gewicht = 82.4, splitZeiger = 0, koffeinGestern = 200, gesternTraining = false, spaetGestern = false, natriumGestern = 3000;
  for(let i = tage - 1; i >= 0; i--){
    const tag = tagPlus(heute, -i); const [j, mo, t] = tag.split('-').map(Number);
    const mitt = ausLokal(j, mo, t, 0, 0); const d = f(mitt);
    const wochenende = [0, 6].includes(new Date(tag + 'T12:00:00Z').getUTCDay());
    const zyklus = ((i % 3) + 3) % 3, training = zyklus !== 0, cheat = i % 11 === 4;
    const gesamt = Math.max(4.6, n(wochenende ? 7.9 : 7.2, 0.6) - Math.max(0, koffeinGestern - 180) / 100 - (spaetGestern ? 0.45 : 0));
    const koffeinHeute = Math.max(0, Math.round(n(210, 110)));
    const trend = (tage - i) / tage;
    const schritte = Math.max(1800, Math.round(n(wochenende ? 10500 : 8200, 2600)));
    if(i > 0 || true){
      add('step_count', 'count', { date: d, qty: i === 0 ? Math.round(schritte * 0.6) : schritte, source: 'iPhone|Apple Watch' });
      add('active_energy', 'kcal', { date: d, qty: Math.round(schritte * 0.045 + n(180, 60)), source: 'Apple Watch' });
      add('basal_energy_burned', 'kcal', { date: d, qty: Math.round(n(1780, 25)), source: 'Apple Watch' });
      add('apple_exercise_time', 'min', { date: d, qty: Math.max(4, Math.round(n(wochenende ? 48 : 31, 16))), source: 'Apple Watch' });
      add('walking_running_distance', 'km', { date: d, qty: +(schritte * 0.00074).toFixed(2), source: 'iPhone|Apple Watch' });
      add('flights_climbed', 'count', { date: d, qty: Math.max(0, Math.round(n(9, 5))), source: 'iPhone' });
      add('resting_heart_rate', 'count/min', { date: d, qty: Math.round(n(58 - trend * 3 - (gesamt - 7.2) * 1.6 + (gesternTraining ? 0.8 : 0), 1.4)), source: 'Apple Watch' });
      add('heart_rate', 'count/min', { date: d, Min: Math.round(n(49, 3)), Avg: Math.round(n(72, 4)), Max: Math.round(n(148, 14)), source: 'Apple Watch' });
      add('heart_rate_variability', 'ms', { date: d, qty: +n(48 + trend * 6 + (gesamt - 7.2) * 7 - (gesternTraining ? 3 : 0) - (spaetGestern ? 4 : 0), 4.5).toFixed(1), source: 'Apple Watch' });
      add('respiratory_rate', 'count/min', { date: d, qty: +n(14.6, 0.5).toFixed(1), source: 'Apple Watch' });
      add('blood_oxygen_saturation', '%', { date: d, qty: +n(96.8, 0.7).toFixed(1), source: 'Apple Watch' });
      if(i % 7 === 3) add('vo2_max', 'ml/(kg·min)', { date: d, qty: +n(44 + trend * 1.5, 0.4).toFixed(1), source: 'Apple Watch' });
      add('mindful_minutes', 'min', { date: d, qty: r() < 0.45 ? Math.round(n(10, 4)) : 0, source: 'Apple Watch' });
      // Waage morgens nüchtern (07:00–07:30), manchmal zusätzlich abends; Natrium vom Vortag hält Wasser
      gewicht += n(0.018, 0.05);
      const wasserKg = (natriumGestern - 3000) / 1000 * 0.35;
      if(r() < 0.85){ const um = ausLokal(j, mo, t, 7, Math.round(r() * 30)); add('weight_body_mass', 'kg', { date: f(um), qty: +(gewicht + wasserKg + n(0, 0.18)).toFixed(1), source: 'Waage' }); add('body_fat_percentage', '%', { date: f(um), qty: +n(15.5 + trend * 0.4, 0.4).toFixed(1), source: 'Waage' }); }
      if(r() < 0.2) add('weight_body_mass', 'kg', { date: f(ausLokal(j, mo, t, 21, 10)), qty: +(gewicht + wasserKg + 1.1 + n(0, 0.2)).toFixed(1), source: 'Waage' });
      if(i % 7 === 0) add('waist_circumference', 'cm', { date: d, qty: +n(82 + trend * 0.5, 0.3).toFixed(1), source: 'Manuell' });
      if(i === tage - 1) add('height', 'cm', { date: d, qty: 182, source: 'Manuell' });
      spaetGestern = false; natriumGestern = 3000;
      if(r() < 0.88){
        // Mahlzeiten wie aus YAZIO: einzelne Einträge mit Uhrzeit
        const kcal = Math.round(cheat ? n(4400, 300) : training ? n(3150, 160) : n(2850, 230));
        const spaet = r() < 0.32, preSkip = r() < 0.22;
        const plan = [[7, 30, 0.22, 42, 0.45], [12, 45, 0.28, 45, 0.45]];
        if(training && !preSkip) plan.push([16, 0, 0.14, 30, 0.65]);
        plan.push([19, 45, training && !preSkip ? 0.24 : 0.32, 50, 0.42]);
        if(cheat) plan.push([21, 15, 0.35, 35, 0.4]);
        if(spaet) plan.push([22, 25, 0.1, 30, 0.25]);
        const summe = plan.reduce((x, p) => x + p[2], 0);
        let natrium = 0;
        for(const [h, mi, anteil, eiw, khAnteil] of plan){
          const mk = Math.round(kcal * anteil / summe), um = f(ausLokal(j, mo, t, h, Math.max(0, mi + Math.round(n(0, 12)))));
          const p = Math.round(n(eiw, 6)), kh = Math.round(mk * khAnteil / 4), fe = Math.max(3, Math.round((mk - p * 4 - kh * 4) / 9));
          const na = Math.round(mk * n(1.05, 0.25) * (cheat && h >= 21 ? 2.4 : 1));
          natrium += na;
          add('dietary_energy', 'kcal', { date: um, qty: mk, source: 'YAZIO' }); add('protein', 'g', { date: um, qty: p, source: 'YAZIO' });
          add('carbohydrates', 'g', { date: um, qty: kh, source: 'YAZIO' }); add('total_fat', 'g', { date: um, qty: fe, source: 'YAZIO' });
          add('sodium', 'mg', { date: um, qty: na, source: 'YAZIO' });
        }
        add('dietary_sugar', 'g', { date: d, qty: Math.round(n(58, 15)), source: 'YAZIO' });
        add('fiber', 'g', { date: d, qty: Math.round(n(27, 6)), source: 'YAZIO' });
        add('saturated_fat', 'g', { date: d, qty: Math.round(n(30, 8)), source: 'YAZIO' });
        add('potassium', 'mg', { date: d, qty: Math.round(n(3300, 400)), source: 'YAZIO' });
        add('magnesium', 'mg', { date: d, qty: Math.round(n(390, 60)), source: 'YAZIO' });
        add('calcium', 'mg', { date: d, qty: Math.round(n(1150, 200)), source: 'YAZIO' });
        add('iron', 'mg', { date: d, qty: +n(15, 3).toFixed(1), source: 'YAZIO' });
        add('vitamin_d', 'µg', { date: d, qty: +n(6, 2).toFixed(1), source: 'YAZIO' });
        add('dietary_water', 'mL', { date: d, qty: Math.round(n(2900, 450)), source: 'YAZIO' });
        add('dietary_caffeine', 'mg', { date: d, qty: koffeinHeute, source: 'YAZIO' });
        spaetGestern = spaet; natriumGestern = natrium;
      }
    }
    // Schlaf: Nacht endet an diesem Tag
    const bett = ausLokal(j, mo, t, 0, 0).getTime() - (wochenende ? 40 : 75) * 60000 + n(0, 30) * 60000;
    const tief = gesamt * n(0.15, 0.025), rem = gesamt * n(0.23, 0.03), wach = n(0.45, 0.2);
    const start = new Date(bett + n(14, 6) * 60000); const ende = new Date(start.getTime() + (gesamt + Math.max(0.05, wach)) * 3600e3);
    add('sleep_analysis', 'hr', { date: d, totalSleep: +gesamt.toFixed(3), asleep: 0, deep: +tief.toFixed(3), rem: +rem.toFixed(3), core: +(gesamt - tief - rem).toFixed(3), awake: +Math.max(0.05, wach).toFixed(3), inBed: +(gesamt + wach + 0.25).toFixed(3), sleepStart: f(start), sleepEnd: f(ende), inBedStart: f(new Date(bett)), inBedEnd: f(ende), source: 'Apple Watch' });
    // Trainings
    const split = [['Push', 68, null, 118], ['Pull', 64, null, 115], ['Leg Day', 74, null, 124]];
    const cardio = [['Stair Climbing', 30, null, 132], ['Pool Swim', 35, 1.2, 126], ['Indoor Cycling', 40, 15.5, 128]];
    let einheiten = [];
    if(training && r() < 0.9){ einheiten = [split[splitZeiger % 3]]; splitZeiger++; }
    else if(!training && r() < 0.8) einheiten = [cardio[(i / 3 | 0) % 3]];
    koffeinGestern = koffeinHeute; gesternTraining = training && einheiten.length > 0;
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
