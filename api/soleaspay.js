// ============================================================
//  Vercel Serverless Function — Proxy SoleasPay
//  Fichier : /api/soleaspay.js
//  Déployer ce fichier dans le dossier /api/ de ton projet Vercel
// ============================================================

export default async function handler(req, res) {
  // CORS — autoriser le frontend VGN
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Préflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SP_API_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';
  const action = req.query?.action || req.body?.action || 'pay';

  try {
    // ── ACTION : PAIEMENT ──────────────────────────────────
    if (action === 'pay') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { service, wallet, amount, currency, order_id } = req.body;

      if (!service || !wallet || !amount) {
        return res.status(400).json({ error: 'Paramètres manquants: service, wallet, amount' });
      }

      // Appel SoleasPay depuis le serveur (pas de CORS côté serveur)
      const spResp = await fetch('https://app.soleaspay.com/api/collect', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-api-key':     SP_API_KEY,
          'Authorization': 'Bearer ' + SP_API_KEY,
        },
        body: JSON.stringify({
          service:  service,
          wallet:   wallet,
          amount:   Number(amount),
          currency: currency || 'XAF',
          order_id: order_id || ('VGN-' + Date.now()),
        }),
      });

      const spData = await spResp.json().catch(() => ({}));
      console.log('[SoleasPay pay]', spResp.status, JSON.stringify(spData));

      return res.status(spResp.status).json(spData);
    }

    // ── ACTION : STATUT ────────────────────────────────────
    if (action === 'status') {
      const token = req.query?.token || req.body?.token;
      if (!token) {
        return res.status(400).json({ error: 'token manquant' });
      }

      const spResp = await fetch('https://app.soleaspay.com/api/status/' + encodeURIComponent(token), {
        method: 'GET',
        headers: {
          'x-api-key':     SP_API_KEY,
          'Authorization': 'Bearer ' + SP_API_KEY,
        },
      });

      const spData = await spResp.json().catch(() => ({}));
      console.log('[SoleasPay status]', spResp.status, JSON.stringify(spData));

      return res.status(spResp.status).json(spData);
    }

    return res.status(400).json({ error: 'Action inconnue: ' + action });

  } catch (err) {
    console.error('[SoleasPay proxy error]', err.message);
    return res.status(500).json({
      error: 'Erreur proxy: ' + err.message,
      detail: 'Vérifiez que app.soleaspay.com est accessible depuis Vercel'
    });
  }
}
