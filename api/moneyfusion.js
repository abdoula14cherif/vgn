// ============================================================
//  api/moneyfusion.js — Proxy Vercel pour MoneyFusion
//  Placer dans : /api/moneyfusion.js
// ============================================================

const MF_KEY = 'moneyfusion_v1_69907181efbbdc4f34449d6d_3E16FB374B1D41D5C7242ADC252D1002D314A2F0C372197E6A56F4FE25C7B1D2';
// L'URL API se trouve dans ton dashboard MoneyFusion → "API de paiement"
// Format : https://www.pay.moneyfusion.net/YOUR_APP_ID/

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, token } = req.query;

  try {
    // ── INITIER LE PAIEMENT ──
    if (req.method === 'POST' && action === 'pay') {
      const { montant, phone, nom, plan, userId, orderId } = req.body;

      // L'URL API est celle générée dans ton dashboard MoneyFusion
      // Elle ressemble à: https://www.pay.moneyfusion.net/xxxxxxxx/
      const apiUrl = `https://www.pay.moneyfusion.net/${MF_KEY}/`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalPrice:    montant,
          numeroSend:    phone,
          nomclient:     nom || 'Client VGN',
          article:       [{ plan: montant }],
          personal_Info: [{ userId: userId || 'unknown', orderId: orderId || Date.now() }],
          return_url:    'https://vgn-two.vercel.app/recharge.html?status=success',
          webhook_url:   'https://vgn-two.vercel.app/api/mf-webhook',
        }),
      });

      const raw  = await response.text();
      let   data = {};
      try { data = JSON.parse(raw); } catch(e) { data = { raw }; }

      console.log('MoneyFusion pay:', response.status, raw.slice(0,300));
      return res.status(response.status).json(data);
    }

    // ── VÉRIFIER STATUT ──
    if (req.method === 'GET' && action === 'status' && token) {
      const response = await fetch(
        `https://www.pay.moneyfusion.net/paiementNotif/${encodeURIComponent(token)}`
      );
      const raw  = await response.text();
      let   data = {};
      try { data = JSON.parse(raw); } catch(e) { data = { raw }; }

      return res.status(response.status).json(data);
    }

    return res.status(400).json({ error: 'Action invalide' });

  } catch (error) {
    console.error('MoneyFusion error:', error);
    return res.status(500).json({ error: error.message });
  }
}
