// ============================================================
//  api/soleaspay.js — Proxy Vercel pour SoleasPay
//  ✅ URL : https://app.soleaspay.com/api/v1
// ============================================================

const SP_KEY  = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';
const SP_BASE = 'https://app.soleaspay.com/api/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, txId } = req.query;

  try {
    // ── COLLECTER ──
    if (req.method === 'POST' && action === 'collect') {
      const body = req.body;

      const response = await fetch(`${SP_BASE}/payment/collect`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SP_KEY}`,
          'Accept':        'application/json',
        },
        body: JSON.stringify(body),
      });

      // Lire comme texte brut d'abord
      const rawText = await response.text();
      console.log('SP raw response:', response.status, rawText.slice(0, 500));

      // Essayer de parser en JSON
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch(e) {
        // La réponse n'est pas du JSON
        data = { raw: rawText, _parse_error: e.message };
      }

      return res.status(response.status).json({
        ...data,
        _status:   response.status,
        _raw:      rawText.slice(0, 500),
        _headers:  Object.fromEntries(response.headers.entries()),
      });
    }

    // ── STATUT ──
    if (req.method === 'GET' && action === 'status' && txId) {
      const response = await fetch(`${SP_BASE}/payment/${encodeURIComponent(txId)}`, {
        headers: {
          'Authorization': `Bearer ${SP_KEY}`,
          'Accept':        'application/json',
        },
      });

      const rawText = await response.text();
      let data = {};
      try { data = JSON.parse(rawText); } catch(e) { data = { raw: rawText }; }

      return res.status(response.status).json({ ...data, _raw: rawText.slice(0, 300) });
    }

    return res.status(400).json({ error: 'Action invalide' });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack?.slice(0,300) });
  }
}
