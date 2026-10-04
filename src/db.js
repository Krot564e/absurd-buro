'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_FILE || path.join(DATA_DIR, 'absurd.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT,
    role          TEXT    NOT NULL DEFAULT 'citizen'
  );

  CREATE TABLE IF NOT EXISTS requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket       TEXT    NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category     TEXT    NOT NULL,
    title        TEXT    NOT NULL,
    justification TEXT   NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'На рассмотрении',
    verdict      TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS login_log (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    email     TEXT,
    ip        TEXT,
    ok        INTEGER NOT NULL,
    reason    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT,
    kind       TEXT NOT NULL,
    detail     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS newsletter (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ip_blocks (
    ip      TEXT PRIMARY KEY,
    until   INTEGER NOT NULL,
    strikes INTEGER NOT NULL DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_login_log_ip ON login_log(ip, created_at);
  CREATE INDEX IF NOT EXISTS idx_login_log_email ON login_log(email, created_at);
  CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip, created_at);
`);

const BCRYPT_ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

// Возвращает true, если пароль совпал. Любая ошибка БД тоже трактуется как «не совпал».
function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

function createUser({ email, username, password }) {
  const hash = hashPassword(password);
  const info = db
    .prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)')
    .run(email, username, hash);
  return getUserById.get(info.lastInsertRowid);
}

const getUserById = db.prepare('SELECT id, email, username, role, created_at, last_login_at FROM users WHERE id = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const touchLogin = db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?");

const createRequest = db.prepare(`
  INSERT INTO requests (ticket, user_id, category, title, justification)
  VALUES (@ticket, @userId, @category, @title, @justification)
`);

const listRequestsByUser = db.prepare(
  'SELECT * FROM requests WHERE user_id = ? ORDER BY id DESC'
);
const listEvents = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 300');
const listLoginLog = db.prepare('SELECT * FROM login_log ORDER BY id DESC LIMIT 100');
const countEventsSince = db.prepare(
  "SELECT kind, COUNT(*) AS n FROM events WHERE created_at > datetime('now', ?) GROUP BY kind"
);
const listAllRequests = db.prepare(
  'SELECT r.*, u.username FROM requests r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 200'
);
const getRequestById = db.prepare('SELECT * FROM requests WHERE id = ?');
const countRequests = db.prepare('SELECT COUNT(*) AS n FROM requests');

function logLogin({ email, ip, ok, reason }) {
  db.prepare('INSERT INTO login_log (email, ip, ok, reason) VALUES (?, ?, ?, ?)')
    .run(email || null, ip || null, ok ? 1 : 0, reason || null);
}

function countRecentFailures(column, value, sinceMinutes) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM login_log
       WHERE ok = 0 AND reason = 'bad-password' AND created_at > datetime('now', ?)
       AND ${column} = ?`
    )
    .get(`-${sinceMinutes} minutes`, value);
  return row.n;
}

function logEvent({ ip, kind, detail }) {
  db.prepare('INSERT INTO events (ip, kind, detail) VALUES (?, ?, ?)')
    .run(ip || null, kind, detail || null);
}

// Подписка на рассылку: писать могут все, повторная почта просто игнорируется.
function addNewsletter(email) {
  const info = db
    .prepare('INSERT INTO newsletter (email) VALUES (?) ON CONFLICT(email) DO NOTHING')
    .run(email);
  return info.changes > 0;
}

function generateTicket() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `MX-${out.slice(0, 4)}-${out.slice(4)}`;
}

// ---------------------------------------------------------------- Блокировки IP

// Живут в базе, а не в памяти процесса: иначе перезапуск сервера
// обнулял бы все накопленные блокировки, и бот получал «чистый» счётчик.
function blockIp(ip, minutes) {
  const until = Date.now() + minutes * 60_000;
  db.prepare(
    `INSERT INTO ip_blocks (ip, until, strikes) VALUES (?, ?, 1)
     ON CONFLICT(ip) DO UPDATE SET until = excluded.until, strikes = strikes + 1`
  ).run(ip, until);
  if (Math.random() < 0.05) {
    db.prepare('DELETE FROM ip_blocks WHERE until <= ?').run(Date.now());
  }
  return until;
}

const getBlock = db.prepare('SELECT ip, until, strikes FROM ip_blocks WHERE ip = ?');

function isBlocked(ip) {
  const row = getBlock.get(ip);
  if (!row) return false;
  if (row.until <= Date.now()) {
    db.prepare('DELETE FROM ip_blocks WHERE ip = ?').run(ip);
    return false;
  }
  return { ip: row.ip, until: row.until, strikes: row.strikes };
}

function clearBlock(ip) {
  db.prepare('DELETE FROM ip_blocks WHERE ip = ?').run(ip);
}

module.exports = {
  db,
  createUser,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  touchLogin,
  verifyPassword,
  createRequest,
  listRequestsByUser,
  listAllRequests,
  getRequestById,
  countRequests,
  countRecentFailures,
  generateTicket,
  logLogin,
  logEvent,
  addNewsletter,
  blockIp,
  isBlocked,
  clearBlock,
  listEvents,
  listLoginLog,
  countEventsSince,
};