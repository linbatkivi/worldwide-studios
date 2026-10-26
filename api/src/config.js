'use strict';
// Al konfiguration kommer fra miljøvariabler, så den samme kode kører lokalt, i test og i produktion.

const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

function load(env = process.env) {
  return {
    port: int(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    dbPath: env.DB_PATH || './data/worldwide.db',
    // Bag en proxy (fx Fly) står klientens adresse i en header. Tom = brug forbindelsens egen adresse.
    ipHeader: (env.IP_HEADER || '').toLowerCase(),
    // Pepper lægges til adgangskoden før hashing. Skift den aldrig efter lancering, ellers kan ingen logge ind.
    pepper: env.PASSWORD_PEPPER || '',
    sessionDays: int(env.SESSION_DAYS, 60),
    gameTokenHours: int(env.GAME_TOKEN_HOURS, 24),
    mail: {
      mode: env.RESEND_API_KEY ? 'resend' : (env.MAIL_MODE || 'off'),   // 'resend' | 'console' | 'off'
      key: env.RESEND_API_KEY || '',
      from: env.MAIL_FROM || 'Worldwide (Studios) <konto@worldwide.example>'
    },
    limits: {
      registerPerHour: int(env.LIMIT_REGISTER, 6),
      loginPer15Min: int(env.LIMIT_LOGIN, 40),
      loginFailsPer15Min: int(env.LIMIT_LOGIN_FAILS, 8),
      forgotPerHour: int(env.LIMIT_FORGOT, 4)
    },
    scryptCost: int(env.SCRYPT_COST, 15)       // 2^15 = 32 MB pr. hash
  };
}

module.exports = { load };
