// ============================================================
//  Vercel Serverless Function — Proxy SoleasPay
//  /api/soleaspay.js
// ============================================================

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';
  const action = req.query?.action || req.body?.action || 'pay';

  // Helper fetch SoleasPay avec les 2 formats d'auth possibles
  async function spFetch(url, opts = {}) {
    const r = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type':  'application/json',
        'x-api-key':     SP_KEY,
        'Authorization': 'Bearer ' + SP_KEY,
        'Accept':        'application/json',
        ...(opts.headers || {}),
      },
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    console.log(`[SP ${action}] HTTP=${r.status} body=${text.slice(0,300)}`);
    return { status: r.status, ok: r.ok, json };
  }

  try {
    // ── PAY ──────────────────────────────────────────────────
    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      const { service, wallet, amount, currency, order_id } = req.body || {};
      if (!service || !wallet || !amount)
        return res.status(400).json({ error: 'Champs requis: service, wallet, amount' });

      // Essai endpoint v1 (laravel package officiel)
      const body = JSON.stringify({
        service:  service,
        wallet:   String(wallet),
        amount:   Number(amount),
        currency: currency || 'XAF',
        order_id: order_id || ('VGN-' + Date.now()),
      });

      // Essayer les 2 endpoints possibles SoleasPay
      let result = await spFetch('https://app.soleaspay.com/api/collect', {
        method: 'POST',
        body,
      });

      // Si 404 ou erreur, essayer l'autre endpoint
      if (!result.ok && (result.status === 404 || result.status === 405)) {
        console.log('[SP] Essai endpoint alternatif...');
        result = await spFetch('https://app.soleaspay.com/api/v1/collect', {
          method: 'POST',
          body,
        });
      }

      // Normaliser la réponse pour que le frontend comprenne facilement
      const d = result.json;
      const normalized = {
        ...d,
        _http_status: result.status,
        // Ajouter status normalisé si absent
        status: d.status || (result.ok ? 'success' : 'failed'),
        token: d.token || d.order_id || d.transaction_id || d.id || null,
        url:   d.url   || d.payment_url || d.redirect_url || null,
      };

      return res.status(result.status < 500 ? result.status : 200).json(normalized);
    }

    // ── STATUS ────────────────────────────────────────────────
    if (action === 'status') {
      const token = req.query?.token || req.body?.token;
      if (!token) return res.status(400).json({ error: 'token requis' });

      // Essayer les 2 endpoints de status
      let result = await spFetch(
        'https://app.soleaspay.com/api/status/' + encodeURIComponent(token),
        { method: 'GET' }
      );

      if (!result.ok && result.status === 404) {
        result = await spFetch(
          'https://app.soleaspay.com/api/v1/status/' + encodeURIComponent(token),
          { method: 'GET' }
        );
      }

      const d = result.json;
      // Normaliser le statut
      const rawStatus = (d?.status || d?.statut || d?.data?.status || '').toLowerCase();
      let normalizedStatus = 'pending';
      if (['success','successful','paid','completed','approved','successfull'].includes(rawStatus))
        normalizedStatus = 'success';
      else if (['failed','failure','cancelled','rejected','declined','no_paid','no paid','error'].includes(rawStatus))
        normalizedStatus = 'failed';

      return res.status(200).json({
        ...d,
        status: normalizedStatus,
        _raw_status: rawStatus,
        _http_status: result.status,
      });
    }

    return res.status(400).json({ error: 'action inconnue: ' + action });

  } catch (err) {
    console.error('[SP proxy error]', err.message);
    return res.status(500).json({
      error:  err.message,
      status: 'failed',
    });
  }
}
