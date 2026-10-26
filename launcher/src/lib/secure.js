'use strict';
const fs = require('fs');
const { readJson, writeJson } = require('./util');

// Gemmer login-tokenet krypteret med operativsystemets nøglering (macOS Keychain, Windows DPAPI, libsecret på Linux).
// Findes der ingen nøglering (nogle Linux-opsætninger), gemmes det i en fil kun brugeren kan læse.
// Nyere Electron har asynkrone udgaver af kald til nøgleringen; de bruges hvis de findes.
function createSecureStore(file, safeStorage) {
  let available = false;
  const asyncApi = !!(safeStorage && safeStorage.encryptStringAsync && safeStorage.decryptStringAsync);
  const load = () => readJson(file, {});

  async function init() {
    try {
      if (!safeStorage) available = false;
      else if (safeStorage.isAsyncEncryptionAvailable) available = !!(await safeStorage.isAsyncEncryptionAvailable());
      else available = !!safeStorage.isEncryptionAvailable();
    } catch (e) { available = false; }
    return available;
  }
  const encrypt = async s => asyncApi ? Buffer.from(await safeStorage.encryptStringAsync(s)) : safeStorage.encryptString(s);
  const decrypt = async b => {
    if (!asyncApi) return safeStorage.decryptString(b);
    const r = await safeStorage.decryptStringAsync(b);
    return typeof r === 'string' ? r : r.result;
  };

  return {
    init,
    encrypted: () => available,
    async get(key) {
      const e = load()[key]; if (!e) return null;
      try {
        if (e.enc) return available ? JSON.parse(await decrypt(Buffer.from(e.enc, 'base64'))) : null;
        return e.plain || null;
      } catch (err) { return null; }
    },
    async set(key, value) {
      const all = load();
      all[key] = available ? { enc: (await encrypt(JSON.stringify(value))).toString('base64') } : { plain: value };
      writeJson(file, all);
      if (process.platform !== 'win32') try { fs.chmodSync(file, 0o600); } catch (e) {}
    },
    async delete(key) { const all = load(); delete all[key]; writeJson(file, all); }
  };
}

module.exports = { createSecureStore };
