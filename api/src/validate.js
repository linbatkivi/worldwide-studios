'use strict';

class ApiError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; }
}
const bad = (code, message) => new ApiError(400, code, message);

function email(v) {
  if (typeof v !== 'string') throw bad('invalid_email', 'E-mail mangler');
  const e = v.trim().toLowerCase();
  // Bevidst enkel: noget@noget.noget. Den rigtige test er om mailen kan modtage en kode.
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw bad('invalid_email', 'E-mailen ser ikke rigtig ud');
  return e;
}

function password(v, mail) {
  if (typeof v !== 'string') throw bad('invalid_password', 'Adgangskode mangler');
  if (v.length < 8) throw bad('weak_password', 'Adgangskoden skal være mindst 8 tegn');
  if (v.length > 200) throw bad('invalid_password', 'Adgangskoden er for lang');
  if (mail && v.toLowerCase() === mail) throw bad('weak_password', 'Adgangskoden må ikke være din e-mail');
  if (/^(.)\1+$/.test(v)) throw bad('weak_password', 'Adgangskoden er for let at gætte');
  return v;
}

// 2–14 tegn (samme loft som navnefeltet i White Dust): bogstaver (også æøå), tal, mellemrum, _ - .
function displayName(v) {
  if (typeof v !== 'string') throw bad('invalid_name', 'Navn mangler');
  const n = v.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 14) throw bad('invalid_name', 'Navnet skal være 2–14 tegn');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u.test(n)) throw bad('invalid_name', 'Navnet må kun have bogstaver, tal, mellemrum, _ - og .');
  return n;
}

const code6 = v => { if (typeof v !== 'string' || !/^\d{6}$/.test(v.trim())) throw bad('invalid_code', 'Koden er 6 cifre'); return v.trim(); };

module.exports = { ApiError, bad, email, password, displayName, code6 };
