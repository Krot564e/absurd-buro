'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------- CSRF

// Synchronizer token: токен живёт в подписанной сессии, в форму попадает
// скрытым полем. Сравнение — constant time, чтобы нельзя было подбирать побайтово.
function csrf(req, res, next) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString('base64url');
  }
  res.locals.csrfToken = req.session.csrf;
  next();
}

function verifyCsrf(req, res, next) {
  const sent = req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '';
  const real = (req.session && req.session.csrf) || '';

  const a = Buffer.from(sent);
  const b = Buffer.from(real);
  const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return res.status(403).render('error', {
      title: 'Подделка запроса',
      message: 'CSRF-токен не совпал. Возможно, форма устарела или запрос пришёл со стороннего сайта.',
    });
  }
  next();
}

// ---------------------------------------------------------------- Пароли

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'pass1234', '123456', '12345678',
  '123456789', '1234567890', 'qwerty', 'qwerty123', 'qwertyuiop', '111111',
  '1234567', 'abc123', 'admin', 'admin123', 'administrator', 'root', 'toor',
  'letmein', 'welcome', 'monkey', 'dragon', 'iloveyou', 'sunshine', 'princess',
  'football', 'baseball', 'master', 'shadow', 'superman', 'trustno1',
  'login', 'pass', 'test', 'test123', 'guest', 'hello', 'freedom', 'whatever',
  'qazwsx', 'zxcvbnm', 'asdfgh', '1q2w3e4r', '1qaz2wsx', 'пароль', 'пароль123',
  'йцукен', 'йцукенг', 'набалмалебаба', 'любовь', 'секс', 'секса',
]);

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function validatePassword(password, { email = '', username = '' } = {}) {
  const errors = [];

  if (typeof password !== 'string' || password.length === 0) {
    return ['Пароль пустой.'];
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Пароль короче ${MIN_PASSWORD_LENGTH} символов.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Пароль длиннее ${MAX_PASSWORD_LENGTH} символов.`);
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Этот пароль есть в списке самых частых — боты его проверяют первым.');
  }

  const lower = password.toLowerCase();
  const localEmail = email.split('@')[0];
  if (localEmail && localEmail.length >= 4 && lower.includes(localEmail.toLowerCase())) {
    errors.push('Пароль не должен содержать часть твоего email.');
  }
  if (username && username.length >= 4 && lower.includes(username.toLowerCase())) {
    errors.push('Пароль не должен содержать твой никнейм.');
  }
  if (/^(.)\1+$/.test(password)) {
    errors.push('Пароль из одного повторяющегося символа.');
  }

  return errors;
}

// ---------------------------------------------------------------- Honeypot + тайминг

// Скрытое поле, которое человек не видит, а бот заполняет. Плюс минимальное
// время жизни формы: живой человек тратит на заполнение больше N секунд.
function botTrap(req, res, next) {
  const hp = req.body && req.body.website ? String(req.body.website).trim() : '';
  const ts = Number(req.body && req.body._ts);

  if (hp) {
    return next(new Error('honeypot'));
  }
  if (!Number.isFinite(ts) || Date.now() - ts < 1500) {
    return next(new Error('too-fast'));
  }
  next();
}

// ---------------------------------------------------------------- Капча

// Капча выглядит как настоящая Google, но подтвердиться нельзя: сервер
// считает попытки, и пропускает только после трёх честных попыток.
// Задания рисует клиент, серверу нужен только счётчик и вердикт.
const CAPTCHA_TRIES_TO_PASS = 3;

function captchaState(req) {
  if (!req.session.captcha) req.session.captcha = { tries: 0, id: crypto.randomBytes(6).toString('hex') };
  return req.session.captcha;
}

function newCaptcha(req) {
  const st = captchaState(req);
  st.tries = 0;
  st.id = crypto.randomBytes(6).toString('hex');
  return st.id;
}

// Попытка клиента: при первой она же даёт id задания.
function captchaTry(req) {
  const st = captchaState(req);
  st.tries += 1;
  return { tries: st.tries, done: st.tries >= CAPTCHA_TRIES_TO_PASS, id: st.id };
}

// Проверка при отправке формы: нужно собрать нужное число попыток.
function checkCaptcha(req) {
  const st = req.session && req.session.captcha;
  return Boolean(st && st.tries >= CAPTCHA_TRIES_TO_PASS);
}

function captchaNeeded(req) {
  return Boolean(req.session && req.session.captchaNeeded);
}

function markCaptchaNeeded(req) {
  req.session.captchaNeeded = true;
}

function clearCaptchaNeed(req) {
  if (req.session) req.session.captchaNeeded = false;
}

// ---------------------------------------------------------------- Блокировка по IP

// Сами блокировки живут в базе (db.blockIp и др.): память процесса обнуляется
// при каждом перезапуске сервера, а боты как раз и рассчитывают на сброс.
const db = require('./db');

function blockIp(ip, minutes) {
  db.blockIp(ip, minutes);
}

function isBlocked(ip) {
  return db.isBlocked(ip);
}

function clearBlock(ip) {
  db.clearBlock(ip);
}

module.exports = {
  csrf,
  verifyCsrf,
  validatePassword,
  botTrap,
  captchaTry,
  newCaptcha,
  checkCaptcha,
  captchaNeeded,
  markCaptchaNeeded,
  clearCaptchaNeed,
  blockIp,
  isBlocked,
  clearBlock,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
};