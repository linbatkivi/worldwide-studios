'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Skemaet vokser kun fremad: hver post i MIGRATIONS køres én gang, og nummeret gemmes i PRAGMA user_version.
const MIGRATIONS = [
  `CREATE TABLE users (
     id            TEXT PRIMARY KEY,
     email         TEXT NOT NULL UNIQUE,
     pw_hash       TEXT NOT NULL,
     display_name  TEXT NOT NULL,
     created_at    INTEGER NOT NULL,
     updated_at    INTEGER NOT NULL,
     last_login_at INTEGER
   );
   CREATE TABLE sessions (
     id           TEXT PRIMARY KEY,                 -- sha256 af tokenet
     user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     kind         TEXT NOT NULL,                    -- 'session' (launcher/web) eller 'game'
     game         TEXT,                             -- kun for kind = 'game'
     created_at   INTEGER NOT NULL,
     expires_at   INTEGER NOT NULL,
     last_used_at INTEGER NOT NULL,
     label        TEXT
   );
   CREATE INDEX sessions_user ON sessions(user_id, kind);
   CREATE TABLE saves (
     user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     game       TEXT NOT NULL,
     rev        INTEGER NOT NULL,
     data       TEXT NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, game)
   );
   CREATE TABLE resets (
     user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     code_hash  TEXT NOT NULL,
     expires_at INTEGER NOT NULL,
     attempts   INTEGER NOT NULL DEFAULT 0
   );`,
  // rangliste: én post pr. spiller og spil, den længste tid (best_ms) tæller
  `CREATE TABLE scores (
     user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     game       TEXT NOT NULL,
     best_ms    INTEGER NOT NULL,
     runs       INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (user_id, game)
   );
   CREATE INDEX scores_rank ON scores(game, best_ms DESC, updated_at ASC);`
];

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const v = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}

// Små hjælpere, så resten af koden slipper for at tænke på transaktioner.
function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { open, tx };
