// ============================================================
//  api/soleaspay.js — Proxy Vercel pour SoleasPay
//  Placer dans : /api/soleaspay.js à la racine du projet
// ============================================================

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';
const SP_URL = 'https://soleaspay.com/api/v1';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action, txId } = req.query;

  try {
    // ── COLLECTER (POST) ──
    if (req.method === 'POST' && action === 'collect') {
      const body = req.body;
      const response = await fetch(`${SP_URL}/payment/collect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SP_KEY}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    }

    // ── VÉRIFIER STATUT (GET) ──
    if (req.method === 'GET' && action === 'status' && txId) {
      const response = await fetch(`${SP_URL}/payment/${txId}`, {
        headers: {
          'Authorization': `Bearer ${SP_KEY}`,
          'Accept': 'application/json'
        }
      });

      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    }

    return res.status(400).json({ error: 'Action invalide' });

  } catch (error) {
    console.error('SoleasPay proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
