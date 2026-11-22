/* Welche Apple-Health-Werte Puls kennt, wie sie heißen und wie ein Tag daraus wird.
   Schlüssel = Namen aus „Health Auto Export“. Aliase erlauben deutsche Namen aus Kurzbefehlen.
   agg: 'summe' (Schritte, kcal …), 'mittel' (Puls, HRV …), 'letzter' (Gewicht …). */

export const BEREICHE = {
  schlaf:     { titel: 'Schlaf' },
  herz:       { titel: 'Herz' },
  aktivitaet: { titel: 'Aktivität' },
  ernaehrung: { titel: 'Ernährung' },
  koerper:    { titel: 'Körper' },
  geist:      { titel: 'Achtsamkeit' },
};

const m = (bereich, titel, einheit, agg, aliase = [], nk = 0) => ({ bereich, titel, einheit, agg, aliase, nk });

export const KATALOG = {
  step_count:                 m('aktivitaet', 'Schritte', 'Schritte', 'summe', ['schritte', 'steps']),
  active_energy:              m('aktivitaet', 'Aktivkalorien', 'kcal', 'summe', ['aktivenergie', 'aktive energie', 'active energy']),
  basal_energy_burned:        m('aktivitaet', 'Ruheenergie', 'kcal', 'summe', ['ruheenergie', 'resting energy']),
  apple_exercise_time:        m('aktivitaet', 'Trainingsminuten', 'min', 'summe', ['trainingsminuten', 'exercise minutes']),
  apple_stand_hour:           m('aktivitaet', 'Stehstunden', 'h', 'summe', ['stehstunden']),
  walking_running_distance:   m('aktivitaet', 'Gehen + Laufen', 'km', 'summe', ['distanz', 'gehen + laufen', 'walking + running distance'], 2),
  flights_climbed:            m('aktivitaet', 'Etagen', 'Etagen', 'summe', ['etagen', 'flights climbed']),

  resting_heart_rate:         m('herz', 'Ruhepuls', 'bpm', 'mittel', ['ruhepuls', 'resting heart rate']),
  heart_rate:                 m('herz', 'Herzfrequenz', 'bpm', 'mittel', ['herzfrequenz', 'puls', 'heart rate']),
  heart_rate_variability:     m('herz', 'HRV', 'ms', 'mittel', ['hrv', 'herzfrequenzvariabilität', 'heart rate variability']),
  walking_heart_rate_average: m('herz', 'Gehpuls', 'bpm', 'mittel', ['gehpuls', 'walking heart rate average']),
  vo2_max:                    m('herz', 'VO₂max', 'ml/kg·min', 'mittel', ['vo2max', 'vo2 max', 'cardiofitness'], 1),
  blood_oxygen_saturation:    m('herz', 'Blutsauerstoff', '%', 'mittel', ['blutsauerstoff', 'sauerstoffsättigung', 'blood oxygen'], 1),
  respiratory_rate:           m('herz', 'Atemfrequenz', '/min', 'mittel', ['atemfrequenz', 'respiratory rate'], 1),
  blood_pressure_systolic:    m('herz', 'Blutdruck systolisch', 'mmHg', 'mittel', ['systolisch']),
  blood_pressure_diastolic:   m('herz', 'Blutdruck diastolisch', 'mmHg', 'mittel', ['diastolisch']),

  apple_sleeping_wrist_temperature: m('schlaf', 'Handgelenktemperatur', '°C', 'mittel', ['handgelenktemperatur'], 2),

  dietary_energy:             m('ernaehrung', 'Energie', 'kcal', 'summe', ['nahrungsenergie', 'kalorien', 'energie', 'dietary energy']),
  protein:                    m('ernaehrung', 'Eiweiß', 'g', 'summe', ['eiweiß', 'eiweiss', 'protein']),
  carbohydrates:              m('ernaehrung', 'Kohlenhydrate', 'g', 'summe', ['kohlenhydrate', 'carbohydrates']),
  total_fat:                  m('ernaehrung', 'Fett', 'g', 'summe', ['fett', 'fett gesamt', 'total fat']),
  dietary_sugar:              m('ernaehrung', 'Zucker', 'g', 'summe', ['zucker', 'sugar']),
  fiber:                      m('ernaehrung', 'Ballaststoffe', 'g', 'summe', ['ballaststoffe', 'fiber']),
  dietary_water:              m('ernaehrung', 'Wasser', 'ml', 'summe', ['wasser', 'water']),
  dietary_caffeine:           m('ernaehrung', 'Koffein', 'mg', 'summe', ['koffein', 'caffeine']),
  sodium:                     m('ernaehrung', 'Natrium', 'mg', 'summe', ['natrium', 'sodium']),

  weight_body_mass:           m('koerper', 'Gewicht', 'kg', 'letzter', ['gewicht', 'körpergewicht', 'weight', 'body mass'], 1),
  body_fat_percentage:        m('koerper', 'Körperfett', '%', 'letzter', ['körperfett', 'körperfettanteil', 'body fat'], 1),
  body_mass_index:            m('koerper', 'BMI', '', 'letzter', ['bmi'], 1),
  lean_body_mass:             m('koerper', 'Magermasse', 'kg', 'letzter', ['magermasse', 'fettfreie körpermasse'], 1),

  mindful_minutes:            m('geist', 'Achtsamkeit', 'min', 'summe', ['achtsamkeitsminuten', 'achtsamkeit', 'mindful minutes']),
};

export const SCHLAF = 'sleep_analysis';
const SCHLAF_ALIASE = new Set(['sleep_analysis', 'schlaf', 'schlafanalyse', 'sleep', 'sleep analysis']);

const ALIAS = new Map();
for(const [k, v] of Object.entries(KATALOG)){ ALIAS.set(k, k); for(const a of v.aliase) ALIAS.set(a, k); }

/** Rohname (HAE, englisch, deutsch) → interner Schlüssel. Unbekanntes wird zu snake_case. */
export function metrikName(roh){
  const s = String(roh || '').trim().toLowerCase();
  if(SCHLAF_ALIASE.has(s)) return SCHLAF;
  if(ALIAS.has(s)) return ALIAS.get(s);
  const snake = s.replace(/ß/g, 'ss').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return ALIAS.get(snake) || snake.slice(0, 80);
}

export const info = name => KATALOG[name] || { bereich: 'sonstiges', titel: name, einheit: '', agg: 'mittel', aliase: [], nk: 1 };

/** Einheiten auf die Katalogeinheit bringen. */
export function umrechnen(name, wert, einheit){
  if(wert == null || !Number.isFinite(wert)) return null;
  const e = String(einheit || '').toLowerCase().trim();
  const ziel = info(name).einheit;
  if(ziel === 'kcal' && e === 'kj') return wert / 4.184;
  if(ziel === 'kg' && (e === 'lb' || e === 'lbs')) return wert * 0.45359237;
  if(ziel === 'km' && e === 'mi') return wert * 1.609344;
  if(ziel === 'km' && e === 'm') return wert / 1000;
  if(ziel === 'ml' && (e === 'l' || e === 'liter')) return wert * 1000;
  if(ziel === 'ml' && (e === 'fl_oz_us' || e === 'fl oz')) return wert * 29.5735;
  if(ziel === '%' && wert > 0 && wert <= 1) return wert * 100;
  if(ziel === 'min' && (e === 'hr' || e === 'h')) return wert * 60;
  return wert;
}
