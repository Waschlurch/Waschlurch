/* Realistische Beispieldaten im Health-Auto-Export-Format (für lokale Vorschau und Tests). */
import { lokalerTag, tagPlus, ausLokal } from '../lib/zeit.mjs';

export function demoNutzlast(tage = 120, seed = 7){
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = (m, sd) => m + sd * (r() + r() + r() - 1.5) * 1.15;
  const heute = lokalerTag(new Date());
  const f = d => { const p = x => String(x).padStart(2, '0'); const o = -d.getTimezoneOffset(); return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:00 +0000`; };
  const M = {}; const add = (name, units, p) => (M[name] ||= { name, units, data: [] }).data.push(p);
  const workouts = []; let gewicht = 82.4;
  for(let i = tage - 1; i >= 0; i--){
    const tag = tagPlus(heute, -i); const [j, mo, t] = tag.split('-').map(Number);
    const mitt = ausLokal(j, mo, t, 0, 0); const d = f(mitt);
    const wochenende = [0, 6].includes(new Date(tag + 'T12:00:00Z').getUTCDay());
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
        const kcal = Math.round(n(wochenende ? 3050 : 2850, 220));
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
    const plan = [['Krafttraining · Push', 1, 68, null, 118], ['Krafttraining · Pull', 2, 64, null, 115], ['Laufen', 3, 32, 5.8, 148], ['Krafttraining · Beine', 4, 72, null, 124], ['Krafttraining · Oberkörper', 5, 62, null, 116], ['Radfahren', 6, 55, 21.5, 132]];
    const wd = new Date(tag + 'T12:00:00Z').getUTCDay();
    for(const [art, w, min, km, hf] of plan) if(w === wd && r() < 0.85){
      const st = ausLokal(j, mo, t, 18, Math.round(r() * 50)); const dauer = n(min, 6);
      workouts.push({ id: `demo-${tag}-${art}`, name: art, start: f(st), end: f(new Date(st.getTime() + dauer * 60000)), duration: Math.round(dauer * 60),
        activeEnergyBurned: { qty: Math.round(dauer * n(9.5, 1.5)), units: 'kcal' }, ...(km ? { distance: { qty: +n(km, km * 0.1).toFixed(2), units: 'km' } } : {}),
        heartRate: { avg: { qty: Math.round(n(hf, 5)) }, max: { qty: Math.round(n(hf + 24, 6)) } } });
    }
  }
  return { data: { metrics: Object.values(M), workouts } };
}
