'use strict';
// Sender nulstillingskoder. 'resend' kræver RESEND_API_KEY og en verificeret afsenderadresse (MAIL_FROM).
// 'console' skriver koden i loggen (kun til udvikling). 'off' sender intet, og funktionen slås fra i klienterne.

function createMailer(cfg, log) {
  const outbox = [];     // bruges af testene
  async function send({ to, subject, text }) {
    if (cfg.mode === 'off') return false;
    if (cfg.mode === 'console') { outbox.push({ to, subject, text }); log('mail', { to, subject, text }); return true; }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('mail ' + r.status);
    return true;
  }
  return {
    enabled: cfg.mode !== 'off',
    outbox,
    sendResetCode(to, name, code) {
      return send({
        to,
        subject: 'Din kode til Worldwide: ' + code,
        text: `Hej ${name}\n\nDin kode til at vælge en ny adgangskode er ${code}.\nDen virker i 15 minutter.\n\nHar du ikke bedt om den, kan du bare lade den ligge. Din adgangskode er ikke ændret.\n\nWorldwide (Studios)`
      });
    }
  };
}

module.exports = { createMailer };
