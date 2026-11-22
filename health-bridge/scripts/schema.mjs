/* Tabellen anlegen: DATABASE_URL=… node scripts/schema.mjs   (ohne DATABASE_URL: SQL ausgeben, z. B. für den Supabase-SQL-Editor) */
import { SCHEMA, db } from '../lib/db.mjs';
if(!process.env.DATABASE_URL){ console.log(SCHEMA); process.exit(0); }
await db(); console.log('Tabellen sind angelegt.'); process.exit(0);
