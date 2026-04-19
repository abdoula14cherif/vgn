// Vercel Serverless Function — Proxy SoleasPay
// Endpoint OFFICIEL trouvé: https://soleaspay.com/api/agent/bills/v3
// Source: code Python du développeur sur l'autre site

const SP_KEY = 'SP_DQnD9bXH0-vd5R-jxtc0EXUsa_f0wUxBzCkW0AhCu6Q_AP';

// Operator IDs SoleasPay (service ID dans le header)
// Orange Money CM = à récupérer depuis SoleasPay dashboard
// MTN MoMo CM = à récupérer depuis SoleasPay dashboard
// On va d'abord récupérer la liste des services disponibles
const SERVICE_IDS = {
  orange_money_CM:    2,  // à confirmer
  mtn_mobile_money_CM: 1, // à confirmer
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query?.action || (req.body && req.body.action) || 'pay';

  try {

    // ── ACTION TEST ──
    if (action === 'test') {
      return res.status(200).json({ ok: true, message: 'Proxy SoleasPay opérationnel', ts: new Date().toISOString() });
    }

    // ── ACTION SERVICES — récupérer la liste des services/opérateurs ──
    if (action === 'services') {
      const r = await fetch('https://soleaspay.com/api/agent/services', {
        method: 'GET',
        headers: {
          'x-api-key': SP_KEY,
          'Content-Type': 'application/json',
        }
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      console.log('[SP services] HTTP='+r.status, text.slice(0,500));
      return res.status(200).json({ _http: r.status, ...json });
    }

    // ── ACTION PAY ──
    if (action === 'pay') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'POST requis' });

      const { service, wallet, amount, currency, order_id, payer, payerEmail } = req.body || {};
      if (!service || !wallet || !amount)
        return res.status(400).json({ error: 'Champs requis: service, wallet, amount' });

      // Récupérer le service ID (numérique) selon l'opérateur
      const serviceId = SERVICE_IDS[service] || service;

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

      // Headers EXACTS selon le code Python du dev
      const headers = {
        'x-api-key':    SP_KEY,
        'operation':    '2',           // opération de collecte
        'service':      String(serviceId),
        'Content-Type': 'application/json',
      };

      console.log('[SP pay] URL: https://soleaspay.com/api/agent/bills/v3');
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
      console.log('[SP pay] Response HTTP='+r.status, text.slice(0,500));

      // Le dev vérifie result.get("succès") en Python
      const ok = json?.succès === true || json?.success === true || json?.statut === true || r.ok;

      return res.status(200).json({
        ...json,
        status: ok ? 'success' : 'failed',
        token:  json?.payId || json?.pay_id || json?.token || json?.id || null,
        url:    json?.url   || json?.payment_url || null,
        _http:  r.status,
      });
    }

    // ── ACTION STATUS ──
    if (action === 'status') {
      const token    = req.query?.token    || (req.body && req.body.token);
      const order_id = req.query?.order_id || (req.body && req.body.order_id);
      if (!token && !order_id) return res.status(400).json({ error: 'token ou order_id requis' });

      // URL de vérification EXACTE selon le code Python
      const url = `https://soleaspay.com/api/agent/verif-pay?orderId=${encodeURIComponent(order_id||token)}&payId=${encodeURIComponent(token||'')}`;
      console.log('[SP status] URL:', url);

      const r = await fetch(url, {
        method:  'GET',
        headers: { 'x-api-key': SP_KEY },
      });

      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      console.log('[SP status] Response HTTP='+r.status, text.slice(0,400));

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

    // ── ACTION SCAN SERVICES ── pour trouver les vrais IDs opérateurs
    if (action === 'scan') {
      const results = {};
      // Essayer de récupérer la liste des services
      for (const url of [
        'https://soleaspay.com/api/agent/services',
        'https://soleaspay.com/api/agent/operators',
        'https://soleaspay.com/api/services',
        'https://app.soleaspay.com/api/agent/services',
      ]) {
        try {
          const r = await fetch(url, { headers: { 'x-api-key': SP_KEY, 'Content-Type': 'application/json' } });
          const text = await r.text();
          if (!text.trim().startsWith('<')) {
            results[url] = `HTTP ${r.status}: ${text.slice(0,200)}`;
            break;
          } else {
            results[url] = 'HTML (mauvais endpoint)';
          }
        } catch(e) { results[url] = 'Erreur: ' + e.message; }
      }
      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'action inconnue: ' + action });

  } catch (err) {
    console.error('[SP error]', err.message);
    return res.status(500).json({ error: err.message, status: 'failed' });
  }
};
