// ============================================================
//  api/soleaspay.js — Proxy Vercel pour SoleasPay
//  Placer dans : /api/soleaspay.js
// ============================================================

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

// URLs à essayer dans l'ordre (la doc est sur developper.mysoleas.com)
const SP_COLLECT_URLS = [
  'https://soleaspay.com/api/v1/payment/collect',
  'https://api.soleaspay.com/v1/payment/collect',
  'https://soleaspay.com/api/payment/collect',
  'https://app.soleaspay.com/api/v1/payment/collect',
];

const SP_STATUS_URLS = [
  (id) => `https://soleaspay.com/api/v1/payment/${id}`,
  (id) => `https://api.soleaspay.com/v1/payment/${id}`,
  (id) => `https://soleaspay.com/api/payment/${id}`,
];

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
      let lastErr = null;

      for (const url of SP_COLLECT_URLS) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SP_KEY}`,
              'Accept': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          });

          const data = await response.json().catch(() => ({}));
          
          // Si ce n'est pas un 404 "route not found", c'est la bonne URL
          const msg = (data.message || '').toLowerCase();
          if (response.status !== 404 && !msg.includes('no route found')) {
            console.log('SoleasPay URL OK:', url, response.status);
            return res.status(response.status).json({ ...data, _url_used: url });
          }
        } catch (e) {
          lastErr = e.message;
          console.warn('URL failed:', url, e.message);
        }
      }

      return res.status(502).json({
        error: 'Aucune URL SoleasPay ne répond correctement',
        detail: lastErr,
        hint: 'Vérifiez la doc sur developper.mysoleas.com'
      });
    }

    // ── VÉRIFIER STATUT ──
    if (req.method === 'GET' && action === 'status' && txId) {
      for (const urlFn of SP_STATUS_URLS) {
        try {
          const response = await fetch(urlFn(txId), {
            headers: {
              'Authorization': `Bearer ${SP_KEY}`,
              'Accept': 'application/json',
            },
            signal: AbortSignal.timeout(10000),
          });
          const data = await response.json().catch(() => ({}));
          const msg = (data.message || '').toLowerCase();
          if (response.status !== 404 && !msg.includes('no route found')) {
            return res.status(response.status).json(data);
          }
        } catch (e) {
          console.warn('Status URL failed:', e.message);
        }
      }
      return res.status(504).json({ error: 'Impossible de vérifier le statut' });
    }

    return res.status(400).json({ error: 'Action invalide' });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
