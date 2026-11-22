/* /api/mcp (auch /mcp/<PULS_TOKEN>) – MCP-Endpunkt für Claude, Streamable HTTP ohne Sitzungen. */

import { antworte, tokenOk, koerperLesen, ratenGrenze, absender } from '../lib/guard.mjs';
import { verarbeite } from '../lib/mcp.mjs';

export default async function handler(req, res){
  if(req.method === 'GET' || req.method === 'DELETE') return antworte(res, 405, { code: 'methode', message: 'Dieser Server sendet keine Ereignisströme.' }, { Allow: 'POST' });
  if(req.method !== 'POST') return antworte(res, 405, { code: 'methode', message: 'Nur POST.' }, { Allow: 'POST' });
  if(!ratenGrenze('mcp:' + absender(req), 240)) return antworte(res, 429, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Zu viele Anfragen.' } });
  if(!tokenOk(req)) return antworte(res, 401, { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Nicht berechtigt: Token in der Connector-Adresse prüfen.' } });
  let koerper;
  try { koerper = await koerperLesen(req, 1_000_000); }
  catch { return antworte(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Kein gültiges JSON.' } }); }
  const antwort = await verarbeite(koerper);
  if(antwort === null) return antworte(res, 202, undefined);
  return antworte(res, 200, antwort);
}
