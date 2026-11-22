/* POST /api/import – Altdaten aus dem Apple-Health-Export oder einer CSV, in Paketen vom Dashboard.
   Gleiches Format wie /api/sync, Zugang per Zugangscode (x-puls-code). Doppelte Daten werden überschrieben, nicht verdoppelt. */
import { passcodeOk } from '../lib/guard.mjs';
import { annehmen } from './sync.mjs';

export default function handler(req, res){ return annehmen(req, res, { pruefen: passcodeOk, schluessel: 'import', max: 2000 }); }
