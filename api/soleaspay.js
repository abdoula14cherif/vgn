// ============================================================
//  Vercel Serverless Function — Proxy SoleasPay
//  IMPORTANT: CommonJS (module.exports) pour compatibilité Vercel
// ============================================================

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || (req.body && req.body.action) || 'pay';

  async function spFetch(url, method, bodyObj) {
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
    let json;
    try { json = JSON.parse(text); } 
    catch { json = { raw: text }; }
    console.log(`[SP ${action}] HTTP=${r.status}`, text.slice(0, 400));
    return { status: r.status, ok: r.ok, json };
  }

  try {
    // ── PAY ──
    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });
      const body = req.body || {};
      const { service, wallet, amount, currency, order_id } = body;
      if (!service || !wallet || !amount)
        return res.status(400).json({ error: 'Champs requis: service, wallet, amount' });

      const payload = {
        service:  service,
        wallet:   String(wallet),
        amount:   Number(amount),
        currency: currency || 'XAF',
        order_id: order_id || ('VGN-' + Date.now()),
      };

      let r = await spFetch('https://app.soleaspay.com/api/collect', 'POST', payload);
      if (r.status === 404 || r.status === 405) {
        r = await spFetch('https://app.soleaspay.com/api/v1/collect', 'POST', payload);
      }

      const d = r.json;
      return res.status(r.status < 500 ? r.status : 200).json({
        ...d,
        status: d.status || (r.ok ? 'success' : 'failed'),
        token:  d.token  || d.transaction_id || d.id || d.order_id || null,
        url:    d.url    || d.payment_url    || d.redirect_url    || null,
        _http:  r.status,
      });
    }

    // ── STATUS ──
    if (action === 'status') {
      const token = req.query?.token || (req.body && req.body.token);
      if (!token) return res.status(400).json({ error: 'token requis' });

      let r = await spFetch(
        'https://app.soleaspay.com/api/status/' + encodeURIComponent(token), 'GET', null
      );
      if (r.status === 404) {
        r = await spFetch(
          'https://app.soleaspay.com/api/v1/status/' + encodeURIComponent(token), 'GET', null
        );
      }

      const d = r.json;
      const raw = (d?.status || d?.statut || d?.data?.status || '').toLowerCase();
      let normalized = 'pending';
      if (['success','successful','paid','completed','approved'].includes(raw)) normalized = 'success';
      if (['failed','failure','cancelled','rejected','declined','no_paid','error'].includes(raw)) normalized = 'failed';

      return res.status(200).json({
        ...d,
        status:      normalized,
        _raw_status: raw,
        _http:       r.status,
      });
    }

    return res.status(400).json({ error: 'action inconnue: ' + action });

  } catch (err) {
    console.error('[SP error]', err.message);
    return res.status(500).json({ error: err.message, status: 'failed' });
  }
};
