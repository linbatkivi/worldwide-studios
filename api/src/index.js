'use strict';
const http = require('http');
const { load } = require('./config');
const { open } = require('./db');
const { createApp } = require('./app');

function createServer(config = load(), { quiet = false } = {}) {
  const log = quiet ? () => {} : (event, f) => console.log(JSON.stringify({ t: new Date().toISOString(), event, ...f }));
  const db = open(config.dbPath);
  const app = createApp({ config, db, log });
  const server = http.createServer((req, res) => { app.handler(req, res); });
  server.requestTimeout = 20e3;
  server.headersTimeout = 10e3;
  server.keepAliveTimeout = 65e3;                 // lidt længere end en typisk proxy
  const close = () => new Promise(r => { app.close(); server.close(() => { try { db.close(); } catch (e) {} r(); }); server.closeIdleConnections && server.closeIdleConnections(); });
  return { server, app, db, config, close };
}

module.exports = { createServer };

if (require.main === module) {
  const s = createServer();
  s.server.listen(s.config.port, s.config.host, () => {
    console.log(JSON.stringify({ t: new Date().toISOString(), event: 'listening', port: s.config.port, mail: s.config.mail.mode, users: s.app.stats().users }));
  });
  const stop = () => { s.close().then(() => process.exit(0)); setTimeout(() => process.exit(1), 8000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
