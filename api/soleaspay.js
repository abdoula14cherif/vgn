// Vercel Serverless Function — Proxy SoleasPay
// Endpoint officiel: https://soleaspay.com/api/agent/bills/v3
// Clé: header x-api-key + operation=2 + service=ID_NUMERIQUE

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

// IDs confirmés depuis /api/agent/services
const SERVICE_IDS = {
  mtn_mobile_money_CM:  1,
  orange_money_CM:      2,
  orange_money_CI:     29,
  mtn_mobile_money_CI: 30,
  moov_CI:             31,
  wave_CI:             32,
  moov_BF:             33,
  orange_money_BF:     34,
  mtn_mobile_money_BJ: 35,
  moov_BJ:             36,
  tmoney_TG:           37,
  moov_TG:             38,
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || 'pay';

  // Parser le body manuellement (Vercel ne parse pas automatiquement)
  let body = req.body;
  if (!body && req.method === 'POST') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    } catch(e) { body = {}; }
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
        headers: { 'x-api-key': SP_KEY }
      });
      const d = await r.json().catch(() => ({}));
      return res.status(200).json({ _http: r.status, ...d });
    }

    // ── PAY ──
    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

      const { service, serviceId, wallet, amount, currency, order_id, payer, payerEmail } = body;

      if (!wallet || !amount) {
        return res.status(400).json({ error: 'Champs requis: wallet, amount' });
      }

      // ID numérique de l'opérateur (obligatoire dans le header "service")
      const numServiceId = Number(serviceId) || SERVICE_IDS[service] || 1;

      const payload = {
        wallet:      String(wallet),
        amount:      Number(amount),
        currency:    currency || 'XAF',
        order_id:    order_id || ('VGN-' + Date.now()),
        description: 'Recharge VGN - ' + (order_id || ''),
        payer:       payer || 'Client VGN',
        payerEmail:  payerEmail || '',
        successUrl:  'https://vgn-two.vercel.app/recharge.html?status=success',
        failureUrl:  'https://vgn-two.vercel.app/recharge.html?status=failed',
      };

      // Headers EXACTS confirmés par le développeur Python
      const headers = {
        'x-api-key':    SP_KEY,
        'operation':    '2',
        'service':      String(numServiceId),
        'Content-Type': 'application/json',
      };

      console.log('[PAY] service='+numServiceId+' wallet='+wallet+' amount='+amount);

      const r = await fetch('https://soleaspay.com/api/agent/bills/v3', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });

      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      console.log('[PAY] HTTP='+r.status+' response='+text.slice(0, 600));

      // SoleasPay retourne { "succès": true, "payId": "xxx" } quand ça marche
      // NE PAS utiliser r.ok car SoleasPay retourne HTTP 200 même en cas d'erreur
      const succes = json?.succès === true || json?.success === true;
      const echec  = json?.succès === false || json?.success === false || !!json?.error;

      // Si ni succès ni échec explicite → on considère succès (STK envoyé)
      const ok = succes || (!echec && r.status === 200);

      // Récupérer le payId retourné par SoleasPay
      const payId = json?.payId || json?.pay_id || json?.payid
                 || json?.transaction_id || json?.transactionId
                 || json?.token || json?.id || null;

      console.log('[PAY] succès='+succes+' payId='+payId+' champs='+JSON.stringify(Object.keys(json)));

      return res.status(200).json({
        ...json,
        status:      ok ? 'success' : 'failed',
        token:       payId,
        payId:       payId,
        url:         json?.url || json?.payment_url || null,
        _http:       r.status,
        _all_fields: Object.keys(json),
      });
    }

    // ── STATUS ──
    if (action === 'status') {
      const token    = req.query?.token    || body.token    || '';
      const order_id = req.query?.order_id || body.order_id || '';

      if (!token && !order_id) {
        return res.status(400).json({ error: 'token ou order_id requis' });
      }

      const orderId = order_id || token;
      const payId   = token || '';

      // Si payId == orderId → pas de vrai payId, appeler sans payId
      const isSameId = !payId || payId === orderId;
      const url = isSameId
        ? `https://soleaspay.com/api/agent/verif-pay?orderId=${encodeURIComponent(orderId)}`
        : `https://soleaspay.com/api/agent/verif-pay?orderId=${encodeURIComponent(orderId)}&payId=${encodeURIComponent(payId)}`;

      console.log('[STATUS] URL='+url);

      const r = await fetch(url, {
        method: 'GET',
        headers: { 'x-api-key': SP_KEY },
      });

      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      console.log('[STATUS] HTTP='+r.status+' response='+text.slice(0, 500));

      // Détection succès — vérifier "succès" avec accent (clé SoleasPay)
      const estSucces = json?.succès === true
                     || json?.success === true
                     || json?.paid    === true;

      const rawStatus = (json?.status || json?.statut || json?.etat || '').toLowerCase();
      const estSuccesStatus = ['success','paid','completed','approved','paye'].includes(rawStatus);
      const estEchecStatus  = ['failed','failure','cancelled','rejected','declined','annule'].includes(rawStatus);

      let normalized = 'pending';
      if (estSucces || estSuccesStatus) normalized = 'success';
      if (!estSucces && !estSuccesStatus && estEchecStatus) normalized = 'failed';

      return res.status(200).json({
        ...json,
        status:      normalized,
        _raw_status: rawStatus,
        _succes_raw: json?.succès,
        _http:       r.status,
      });
    }

    return res.status(400).json({ error: 'action inconnue: ' + action });

  } catch (err) {
    console.error('[ERROR]', err.message);
    return res.status(500).json({ error: err.message, status: 'failed' });
  }
};
