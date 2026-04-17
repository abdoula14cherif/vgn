// ============================================================
//  api/soleaspay.js — Proxy Vercel pour SoleasPay
//  ✅ URL confirmée : https://app.soleaspay.com/api/v1
//  Placer dans : /api/soleaspay.js à la racine du projet
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
    // ── COLLECTER (débiter le numéro) ──
    if (req.method === 'POST' && action === 'collect') {
      const response = await fetch(`${SP_BASE}/payment/collect`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SP_KEY}`,
          'Accept':        'application/json',
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(20000),
      });

      const data = await response.json().catch(() => ({}));
      console.log('SP collect:', response.status, JSON.stringify(data).slice(0, 200));
      return res.status(response.status).json(data);
    }

    // ── VÉRIFIER STATUT ──
    if (req.method === 'GET' && action === 'status' && txId) {
      const response = await fetch(`${SP_BASE}/payment/${encodeURIComponent(txId)}`, {
        headers: {
          'Authorization': `Bearer ${SP_KEY}`,
          'Accept':        'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));
      return res.status(response.status).json(data);
    }

    return res.status(400).json({ error: 'Action invalide. Utilisez ?action=collect ou ?action=status&txId=...' });

  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
