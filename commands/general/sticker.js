/**
 * Sticker Command
 * Uses ffmpeg + webpmux-style EXIF metadata to always embed packname
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crypto = require('crypto');
const webp = require('node-webpmux');
const ffmpegPath = require('ffmpeg-static');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../../config');
const { getTempDir, deleteTempFile } = require('../../utils/tempManager');

// Max file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

module.exports = {
  name: 'sticker',
  aliases: ['s', 'stiker', 'stc'],
  description: 'Convert image or video to sticker (auto compression)',
  usage: '.sticker (reply to media)',
  category: 'general',
  
  async execute(sock, msg, args, extra) {
    const chatId = extra.from;
    const messageToQuote = msg;
    let targetMessage = msg;
    
    const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (ctxInfo?.quotedMessage) {
      targetMessage = {
        key: {
          remoteJid: chatId,
          id: ctxInfo.stanzaId,
          participant: ctxInfo.participant,
        },
        message: ctxInfo.quotedMessage,
      };
    }
    
    const mediaMessage =
      targetMessage.message?.imageMessage ||
      targetMessage.message?.videoMessage ||
      targetMessage.message?.documentMessage;
    
    if (!mediaMessage) {
      return extra.reply('📎 Reply to an *image* / *video* with .sticker or send media with .sticker as caption.');
    }
    
    const tempDir = getTempDir();
    const timestamp = Date.now();
    const tempInput = path.join(tempDir, `in_${timestamp}`);
    const tempOutput = path.join(tempDir, `out_${timestamp}.webp`);
    let tempFiles = [tempInput, tempOutput];
    
    try {
      // DEBUG: log shape of incoming message (limited length)
      try {
        console.log('[sticker] invoked by:', extra.from);
        console.log('[sticker] targetMessage keys:', Object.keys(targetMessage || {}));
        console.log('[sticker] mediaMessage summary:', {
          mimetype: mediaMessage.mimetype,
          seconds: mediaMessage.seconds || 0,
          fileLength: mediaMessage.fileLength || mediaMessage.size || null
        });
      } catch (dlog) {
        console.warn('[sticker] debug log failed', dlog && dlog.message);
      }

      const mediaBuffer = await downloadMediaMessage(
        targetMessage,
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage },
      );
      
      if (!mediaBuffer) {
        console.log('[sticker] downloadMediaMessage returned empty buffer');
        await extra.reply('❌ Failed to download media. Please try again.');
        return;
      }
      
      console.log('[sticker] mediaBuffer length:', mediaBuffer.length);

      // Check file size
      if (mediaBuffer.length > MAX_FILE_SIZE) {
        await extra.reply(`❌ File too large: ${(mediaBuffer.length / 1024 / 1024).toFixed(2)}MB (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
        return;
      }
      
      fs.writeFileSync(tempInput, mediaBuffer);
      
      const isAnimated =
        mediaMessage.mimetype?.includes('gif') ||
        mediaMessage.mimetype?.includes('video') ||
        (mediaMessage.seconds || 0) > 0;
      
      const baseFfmpegCmd = isAnimated
        ? `"${ffmpegPath}" -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`
        : `"${ffmpegPath}" -i "${tempInput}" -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`;
      
      const execPromise = (cmd) =>
        new Promise((resolve, reject) => exec(cmd, (err) => (err ? reject(err) : resolve())));
      
      await execPromise(baseFfmpegCmd);
      
      let webpBuffer = fs.readFileSync(tempOutput);
      
      if (isAnimated && webpBuffer.length > 1000 * 1024) {
        const tempOutput2 = path.join(tempDir, `out_fallback_${Date.now()}.webp`);
        tempFiles.push(tempOutput2);
        const fileSizeKB = mediaBuffer.length / 1024;
        const isLargeFile = fileSizeKB > 5000;
        
        const fallbackCmd = isLargeFile
          ? `"${ffmpegPath}" -y -i "${tempInput}" -t 2 -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=8,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 60 -compression_level 6 "${tempOutput2}"`
          : `"${ffmpegPath}" -y -i "${tempInput}" -t 3 -vf "scale=512:512:force_original_aspect_ratio=decrease,fps=12,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 70 -compression_level 6 "${tempOutput2}"`;
        
        await execPromise(fallbackCmd);
        
        if (fs.existsSync(tempOutput2)) {
          webpBuffer = fs.readFileSync(tempOutput2);
        }
      }
      
      // Safely load webp and set metadata
      try {
        const img = new webp.Image();
        await img.load(webpBuffer);

        const json = {
          'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
          'sticker-pack-name': config.packname || 'Made by',
          emojis: ['🤖'],
        };
        
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exifAttr = Buffer.from([
          0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
          0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
        ]);
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);

        img.exif = exif;
        const finalBuffer = await img.save(null);
        
        await sock.sendMessage(extra.from, { sticker: finalBuffer }, { quoted: msg });
      } catch (we) {
        console.error('[sticker] webp processing error:', we && (we.stack || we.message));
        await extra.reply('❌ Erreur lors du traitement du sticker. Assure-toi que le média est valide.');
      }
      
    } catch (error) {
      console.error('Sticker command error:', error && (error.stack || error.message));
      await extra.reply('❌ Failed to create sticker. Make sure the media is valid.');
    } finally {
      // Always cleanup temp files
      tempFiles.forEach(file => deleteTempFile(file));
    }
  },
};
