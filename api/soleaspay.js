// Vercel Serverless Function — Proxy SoleasPay
// Endpoint officiel: https://soleaspay.com/api/agent/bills/v3

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

// IDs confirmés depuis /api/agent/services
const SERVICE_IDS = {
  // Cameroun
  orange_money_CM:    2,
  mtn_mobile_money_CM: 1,
  // Côte d'Ivoire
  orange_money_CI:   29,
  mtn_mobile_money_CI:30,
  wave_CI:           32,
  moov_CI:           31,
  // Burkina Faso
  moov_BF:           33,
  orange_money_BF:   34,
  // Bénin
  mtn_mobile_money_BJ:35,
  moov_BJ:           36,
  // Togo
  tmoney_TG:         37,
  moov_TG:           38,
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || 'pay';

  // ── PARSE BODY manuellement si req.body est undefined ──
  let body = req.body;
  if (!body && req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch(e) {
      body = {};
    }
  }
  body = body || {};

  try {
    // ── TEST ──
    if (action === 'test') {
      return res.status(200).json({ ok: true, message: 'Proxy SoleasPay opérationnel', ts: new Date().toISOString() });
    }

    // ── SERVICES ──
    if (action === 'services') {
      const r = await fetch('https://soleaspay.com/api/agent/services', {
        headers: { 'x-api-key': SP_KEY, 'Content-Type': 'application/json' }
      });
      const d = await r.json().catch(() => ({}));
      return res.status(200).json({ _http: r.status, ...d });
    }

    // ── PAY ──
    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

      const { service, serviceId, wallet, amount, currency, order_id, payer, payerEmail } = body;

      console.log('[SP pay] body reçu:', JSON.stringify(body));

      if (!wallet || !amount) {
        return res.status(400).json({ error: 'Champs requis: wallet, amount', body_received: body });
      }

      // Résoudre le service ID numérique
      const numServiceId = serviceId || SERVICE_IDS[service] || 1;

      const payload = {
        wallet:      String(wallet),
        amount:      Number(amount),
        currency:    currency || 'XAF',
        order_id:    order_id || ('VGN-' + Date.now()),
        description: `Recharge VGN - ${order_id || 'depot'}`,
        payer:       payer || 'Client VGN',
        payerEmail:  payerEmail || '',
        successUrl:  'https://vgn-two.vercel.app/recharge.html?status=success',
        failureUrl:  'https://vgn-two.vercel.app/recharge.html?status=failed',
      };

      const headers = {
        'x-api-key':    SP_KEY,
        'operation':    '2',
        'service':      String(numServiceId),
        'Content-Type': 'application/json',
      };

      console.log('[SP pay] Headers:', JSON.stringify(headers));
      console.log('[SP pay] Payload:', JSON.stringify(payload));

      const r = await fetch('https://soleaspay.com/api/agent/bills/v3', {
        method:  'POST',
        headers: headers,
        body:    JSON.stringify(payload),
      });

      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      console.log('[SP pay] Réponse HTTP=' + r.status, text.slice(0, 500));

      // SoleasPay retourne { "succès": true/false, ... } selon le dev Python
      const ok = json?.succès === true || json?.success === true
              || json?.statut === true || r.ok;

      return res.status(200).json({
        ...json,
        status:  ok ? 'success' : 'failed',
        token:   json?.payId || json?.pay_id || json?.token || json?.id || null,
        url:     json?.url   || json?.payment_url || null,
        _http:   r.status,
      });
    }

    // ── STATUS ──
    if (action === 'status') {
      const token    = req.query?.token    || body.token;
      const order_id = req.query?.order_id || body.order_id;
      if (!token && !order_id) return res.status(400).json({ error: 'token ou order_id requis' });

      const url = `https://soleaspay.com/api/agent/verif-pay?orderId=${encodeURIComponent(order_id || token)}&payId=${encodeURIComponent(token || '')}`;
      console.log('[SP status] URL:', url);

      const r = await fetch(url, {
        headers: { 'x-api-key': SP_KEY },
      });

      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      console.log('[SP status] HTTP=' + r.status, text.slice(0, 400));

      const raw = (json?.status || json?.statut || json?.etat || '').toLowerCase();
      let normalized = 'pending';
      if (['success','successful','paid','completed','approved','paye','succes'].includes(raw)) normalized = 'success';
      if (['failed','failure','cancelled','rejected','declined','echec','annule'].includes(raw)) normalized = 'failed';

      return res.status(200).json({
        ...json,
        status:      normalized,
        _raw_status: raw,
        _http:       r.status,
      });
    }

    return res.status(400).json({ error: 'action inconnue: ' + action });

  } catch (err) {
    console.error('[SP error]', err.message, err.stack);
    return res.status(500).json({ error: err.message, status: 'failed' });
  }
};
