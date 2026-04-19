// Vercel Serverless Function — Proxy SoleasPay
// Endpoint officiel: https://app.soleaspay.com/api/v1/payment/collect
// Source: github.com/MYSOLEAS/laravel-payment-package (PackageSopay.php)

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

// ── Tous les endpoints possibles à essayer dans l'ordre ──
const ENDPOINTS_PAY = [
  'https://app.soleaspay.com/api/v1/payment/collect',
  'https://app.soleaspay.com/api/payment/collect',
  'https://app.soleaspay.com/api/v1/collect',
  'https://api.soleaspay.com/api/v1/payment/collect',
  'https://api.mysoleas.com/api/v1/payment/collect',
];

const ENDPOINTS_STATUS = [
  'https://app.soleaspay.com/api/v1/payment/status/',
  'https://app.soleaspay.com/api/payment/status/',
  'https://app.soleaspay.com/api/v1/status/',
  'https://api.soleaspay.com/api/v1/payment/status/',
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || (req.body && req.body.action) || 'pay';

  // Helper: essaie plusieurs URLs jusqu'à en trouver une qui répond en JSON
  async function tryEndpoints(urls, method, bodyObj) {
    for (const url of urls) {
      try {
        const opts = {
          method,
          headers: {
            'Content-Type':  'application/json',
            'x-api-key':     SP_KEY,
            'Authorization': 'Bearer ' + SP_KEY,
            'Accept':        'application/json',
          },
        };
        if (bodyObj) opts.body = JSON.stringify(bodyObj);

        const r = await fetch(url, opts);
        const text = await r.text();

        // Si la réponse est du HTML → mauvais endpoint, essayer le suivant
        if (text.trim().startsWith('<') || text.trim().startsWith('<!')) {
          console.log(`[SP] HTML reçu sur ${url} → essai suivant`);
          continue;
        }

        let json;
        try { json = JSON.parse(text); }
        catch { json = { raw: text }; }

        console.log(`[SP ${action}] ✅ Endpoint valide: ${url} HTTP=${r.status} body=${text.slice(0,400)}`);
        return { status: r.status, ok: r.ok, json, url };
      } catch(e) {
        console.log(`[SP] Erreur sur ${url}:`, e.message);
      }
    }
    return null; // Aucun endpoint n'a fonctionné
  }

  try {
    // ── ACTION TEST ──
    if (action === 'test') {
      return res.status(200).json({
        ok: true,
        message: 'Proxy SoleasPay opérationnel',
        timestamp: new Date().toISOString(),
      });
    }

    // ── ACTION PAY ──
    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

      const { service, wallet, amount, currency, order_id } = req.body || {};
      if (!service || !wallet || !amount)
        return res.status(400).json({ error: 'Champs requis: service, wallet, amount' });

      const payload = {
        service:  service,
        wallet:   String(wallet),
        amount:   Number(amount),
        currency: currency || 'XAF',
        order_id: order_id || ('VGN-' + Date.now()),
      };

      console.log('[SP pay] Payload:', JSON.stringify(payload));

      const result = await tryEndpoints(ENDPOINTS_PAY, 'POST', payload);

      if (!result) {
        return res.status(502).json({
          error: 'SoleasPay injoignable — tous les endpoints ont échoué',
          status: 'failed',
          _endpoints_tried: ENDPOINTS_PAY,
        });
      }

      const d = result.json;
      return res.status(200).json({
        ...d,
        status: d.status || (result.ok ? 'success' : 'failed'),
        token:  d.token || d.transaction_id || d.id || d.order_id || null,
        url:    d.url   || d.payment_url    || d.redirect_url    || null,
        _endpoint_used: result.url,
        _http: result.status,
      });
    }

    // ── ACTION STATUS ──
    if (action === 'status') {
      const token = req.query?.token || (req.body && req.body.token);
      if (!token) return res.status(400).json({ error: 'token requis' });

      const urls = ENDPOINTS_STATUS.map(base => base + encodeURIComponent(token));
      const result = await tryEndpoints(urls, 'GET', null);

      if (!result) {
        // Si on ne peut pas vérifier → retourner pending (ne pas marquer failed)
        return res.status(200).json({ status: 'pending', _error: 'SoleasPay injoignable' });
      }

      const d = result.json;
      const raw = (d?.status || d?.statut || d?.data?.status || d?.transaction_status || '').toLowerCase();
      let normalized = 'pending';
      if (['success','successful','paid','completed','approved','successfull'].includes(raw)) normalized = 'success';
      if (['failed','failure','cancelled','rejected','declined','no_paid','error'].includes(raw)) normalized = 'failed';

      return res.status(200).json({
        ...d,
        status:          normalized,
        _raw_status:     raw,
        _endpoint_used:  result.url,
        _http:           result.status,
      });
    }

    return res.status(400).json({ error: 'action inconnue: ' + action });

  } catch (err) {
    console.error('[SP error]', err.message);
    return res.status(500).json({ error: err.message, status: 'failed' });
  }
};
