/* GET /api/konfig – öffentliche Einstellungen für den Browser.
   Enthält keine Geheimnisse: Eine Google-Client-ID ist dafür gedacht,
   im Browser zu stehen. Der API-Schlüssel bleibt auf dem Server. */

export default function handler(req, res){
  res.statusCode = req.method === 'GET' ? 200 : 405;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(req.method === 'GET'
    ? { googleClientId: process.env.GOOGLE_CLIENT_ID || '' }
    : { code: 'methode', message: 'Nur GET.' }));
}
