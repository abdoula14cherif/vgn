// Vercel Serverless Function — Proxy SoleasPay
const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

// Tous les endpoints possibles — scan exhaustif
const ENDPOINTS_PAY = [
  // Format v3 (doc officielle soleaspay-v3)
  'https://app.soleaspay.com/api/v3/payment/collect',
  'https://app.soleaspay.com/api/v3/collect',
  // Format standard
  'https://app.soleaspay.com/api/v2/payment/collect',
  'https://app.soleaspay.com/api/v2/collect',
  'https://app.soleaspay.com/api/v1/payment/collect',
  'https://app.soleaspay.com/api/payment',
  'https://app.soleaspay.com/api/pay',
  // Domaine api
  'https://api.soleaspay.com/v3/payment/collect',
  'https://api.soleaspay.com/v2/payment/collect',
  'https://api.soleaspay.com/v1/payment/collect',
  'https://api.soleaspay.com/payment/collect',
  // Domaine mysoleas
  'https://api.mysoleas.com/v3/payment/collect',
  'https://api.mysoleas.com/v1/payment/collect',
  'https://api.mysoleas.com/payment/collect',
  // Endpoint avec merchant
  'https://app.soleaspay.com/api/merchant/collect',
  'https://app.soleaspay.com/api/merchant/payment',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || (req.body && req.body.action) || 'pay';

  async function spCall(url, method, bodyObj) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': SP_KEY,
        'Authorization': 'Bearer ' + SP_KEY,
        'Accept': 'application/json',
      },
    };
    if (bodyObj) opts.body = JSON.stringify(bodyObj);
    const r = await fetch(url, opts);
    const text = await r.text();
    // HTML = mauvais endpoint
    if (text.trim().startsWith('<')) return null;
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: r.status, ok: r.ok, json, url };
  }

  try {
    if (action === 'test') {
      return res.status(200).json({ ok: true, message: 'Proxy SoleasPay opérationnel', ts: new Date().toISOString() });
    }

    // ── SCAN ENDPOINTS ──
    if (action === 'scan') {
      const results = {};
      const payload = { service: 'orange_money_CM', wallet: '600000000', amount: 1, currency: 'XAF', order_id: 'TEST-SCAN' };
      for (const url of ENDPOINTS_PAY) {
        try {
          const r = await spCall(url, 'POST', payload);
          results[url] = r ? `HTTP ${r.status}: ${JSON.stringify(r.json).slice(0,100)}` : 'HTML (mauvais endpoint)';
          if (r && r.status !== 404 && r.status !== 405) break; // Arrêt dès qu'on trouve
        } catch(e) { results[url] = 'Erreur: ' + e.message; }
      }
      return res.status(200).json({ results });
    }

    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
      const { service, wallet, amount, currency, order_id } = req.body || {};
      if (!service || !wallet || !amount)
        return res.status(400).json({ error: 'Champs requis: service, wallet, amount' });

      const payload = { service, wallet: String(wallet), amount: Number(amount), currency: currency || 'XAF', order_id: order_id || ('VGN-' + Date.now()) };
      console.log('[SP pay] Payload:', JSON.stringify(payload));

      for (const url of ENDPOINTS_PAY) {
        try {
          const r = await spCall(url, 'POST', payload);
          if (!r) continue;
          console.log(`[SP pay] ${url} → HTTP ${r.status} ${JSON.stringify(r.json).slice(0,200)}`);
          if (r.status === 404 || r.status === 405) continue;
          // Endpoint trouvé !
          const d = r.json;
          return res.status(200).json({
            ...d,
            status: d.status || (r.ok ? 'success' : 'failed'),
            token: d.token || d.transaction_id || d.id || null,
            url: d.url || d.payment_url || null,
            _endpoint: url,
            _http: r.status,
          });
        } catch(e) { console.log(`[SP] ${url} erreur:`, e.message); }
      }

      return res.status(502).json({
        error: 'SoleasPay: aucun endpoint valide trouvé',
        status: 'failed',
        conseil: 'Contactez SoleasPay sur support@mysoleas.com pour obtenir le bon endpoint API',
        _tried: ENDPOINTS_PAY.length + ' endpoints',
      });
    }

    if (action === 'status') {
      const token = req.query?.token || (req.body && req.body.token);
      if (!token) return res.status(400).json({ error: 'token requis' });
      const STATUS_BASES = [
        'https://app.soleaspay.com/api/v3/payment/status/',
        'https://app.soleaspay.com/api/v1/payment/status/',
        'https://app.soleaspay.com/api/payment/status/',
        'https://api.soleaspay.com/v1/payment/status/',
        'https://api.mysoleas.com/v1/payment/status/',
      ];
      for (const base of STATUS_BASES) {
        try {
          const r = await spCall(base + encodeURIComponent(token), 'GET', null);
          if (!r || r.status === 404) continue;
          const d = r.json;
          const raw = (d?.status || d?.statut || '').toLowerCase();
          let st = 'pending';
          if (['success','paid','completed','approved'].includes(raw)) st = 'success';
          if (['failed','failure','cancelled','declined'].includes(raw)) st = 'failed';
          return res.status(200).json({ ...d, status: st, _raw: raw, _endpoint: base });
        } catch(e) {}
      }
      return res.status(200).json({ status: 'pending', _note: 'Status endpoint introuvable' });
    }

    return res.status(400).json({ error: 'action inconnue' });
  } catch (err) {
    return res.status(500).json({ error: err.message, status: 'failed' });
  }
};
