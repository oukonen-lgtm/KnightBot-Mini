// commands/media/pair.js
const fetch = require('node-fetch'); // npm i node-fetch@2 if needed
const config = require('../../config');

module.exports = {
  name: 'pair',
  aliases: ['clonebot'],
  description: 'Obtenir le code de pairing (via service externe)',
  usage: '.pair <number>',
  category: 'media',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const reply = extra.reply;
      const number = (args && args[0]) ? args[0].toString().trim() : '';

      if (!number || !/^\d{8,15}$/.test(number)) {
        return await reply('NUMÉRO INCORRECT. Exemple : .pair 509XXXXXXXX (8–15 chiffres).');
      }

      await reply('⏳ Génération du pairing code, merci de patienter...');

      const BASE = process.env.PAIR_SERVICE_URL || 'https://knight-bot-paircode.onrender.com/pair';
      const url = `${BASE}?number=${encodeURIComponent(number)}`;
      console.log('[pair] requesting', url);

      const res = await fetch(url, { timeout: 20000 });
      if (!res.ok) {
        console.warn('[pair] service status', res.status);
        return await reply(`Erreur du service de pairing (status ${res.status}).`);
      }

      const text = await res.text();
      let body = null;
      try { body = JSON.parse(text); } catch (e) { body = null; }

      // heuristiques d'extraction
      let code = null;
      if (body) {
        code = body.code || body.pairing || (body.data && (body.data.code || body.data.pairing)) || null;
        if (!code) {
          for (const k of Object.keys(body)) {
            if (typeof body[k] === 'string') {
              const m = body[k].match(/([A-Z0-9]{3,4}[-]?[A-Z0-9]{2,6})/i);
              if (m) { code = m[1]; break; }
            }
          }
        }
      }
      if (!code) {
        const m = text.match(/([A-Z0-9]{3,4}[-]?[A-Z0-9]{2,6})/i);
        if (m) code = m[1];
      }

      if (!code) {
        console.log('[pair] no code found, service returned (truncated):', text.slice(0,1200));
        return await reply("Le service a répondu mais aucun code exploitable n'a été trouvé. Vérifie l'URL du service.");
      }

      await reply(
        `*PAIRING CODE*: ${code}\n\n` +
        `1) Ouvre WhatsApp → Appareils connectés → Connecter avec un numéro de téléphone → Saisir le code\n` +
        `2) Entre ce code sur l'appareil à lier.\n\n` +
        `Le code est temporaire — agis vite.`
      );

    } catch (err) {
      console.error('pair command error:', err && err.stack || err);
      await extra.reply('Erreur lors de la requête au service de pairing : ' + (err && err.message || String(err)));
    }
  }
};
