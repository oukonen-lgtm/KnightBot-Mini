// commands/media/setsticker.js
const fs = require('fs');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = {
  name: 'setsticker',
  aliases: ['savesticker'],
  description: 'Sauvegarder un sticker (reply) : .setsticker <name>',
  usage: '.setsticker <name> (reply to sticker)',
  category: 'media',
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      const reply = extra.reply;
      const name = (args && args[0]) ? args[0].trim() : 'default';
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      if (!ctx?.quotedMessage) return await reply('Réponds à un sticker avec .setsticker <name> pour le sauvegarder.');

      const quoted = {
        key: {
          remoteJid: extra.from,
          id: ctx.stanzaId,
          participant: ctx.participant
        },
        message: ctx.quotedMessage
      };

      const buf = await downloadMediaMessage(quoted, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
      if (!buf) return reply('Échec du téléchargement du sticker.');

      const stickersDir = path.join(__dirname, '../../stickers');
      if (!fs.existsSync(stickersDir)) fs.mkdirSync(stickersDir, { recursive: true });

      const filepath = path.join(stickersDir, `${name}.webp`);
      fs.writeFileSync(filepath, buf);

      await reply(`✅ Sticker sauvegardé sous: ${name}`);
    } catch (e) {
      console.error('setsticker error:', e && e.stack || e);
      await extra.reply('Erreur lors de la sauvegarde du sticker : ' + (e && e.message || e));
    }
  }
};
