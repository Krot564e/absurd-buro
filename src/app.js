'use strict';

require('dotenv').config({ quiet: true });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const db = require('./db');
const sec = require('./security');

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET;

// Лимиты вынесены в переменные окружения: на бесплатном хостинге за одним IP сидит
// куча юзеров, дефолты приходится крутить.
const LIMIT = {
  global: Number(process.env.LIMIT_GLOBAL ?? 300),
  login: Number(process.env.LIMIT_LOGIN ?? 5),
  register: Number(process.env.LIMIT_REGISTER ?? 3),
  post: Number(process.env.LIMIT_POST ?? 10),
};

// После скольких неудачных попыток входа включается капча.
const CAPTCHA_AFTER = Number(process.env.CAPTCHA_AFTER ?? 3);
// Пароль на журнал /security-log. Если не задан — страницы не существует.
const LOG_PASSWORD = process.env.LOG_PASSWORD || '';

if (!SECRET || SECRET.length < 32) {
  console.error('\n  СТОП: нужен SESSION_SECRET длиной от 32 символов.');
  console.error('  Скопируй .env.example в .env и сгенерируй ключ:\n');
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"\n');
  process.exit(1);
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    hsts: IS_PROD ? undefined : false,
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));
app.use('/public', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

app.use(
  cookieSession({
    name: 'absurd.sid',
    keys: [SECRET],
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
  })
);

app.use(sec.csrf);
app.use((req, res, next) => {
  res.locals.user = req.session && req.session.userId ? db.getUserById.get(req.session.userId) : null;
  res.locals.now = new Date().toISOString();
  next();
});

// ------------------------------------------------------------------ Лимиты

const deny = (req, res) => {
  db.logEvent({ ip: req.ip, kind: 'rate-limited', detail: req.path });
  return res.status(429).render('error', {
    title: 'Слишком много запросов',
    message: 'Ты слишком часто ходишь на этот адрес. Зачем? Отдохни и попробуй позже.',
  });
};

const globalLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: LIMIT.global,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: deny,
});

const loginLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: LIMIT.login,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    sec.blockIp(req.ip, 30);
    deny(req, res);
  },
});

const registerLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: LIMIT.register,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: deny,
});

const blockGuard = (req, res, next) => {
  const entry = sec.isBlocked(req.ip);
  if (entry) {
    const minutes = Math.ceil((entry.until - Date.now()) / 60_000);
    return res.status(429).render('error', {
      title: 'Доступ временно ограничен',
      message: `Твой адрес заблокирован на ${minutes} мин из-за подбора паролей. Это защита от ботов.`,
    });
  }
  next();
};

app.use('/', globalLimit);
app.use(['/login', '/register'], blockGuard);

// ------------------------------------------------------------------ Публичные

app.get('/', (req, res) => {
  const stats = db.countRequests.get();
  res.render('index', {
    title: 'Абсурдбюро',
    stats,
    examples: [
      'Разрешить мне дышать вверх ногами',
      'Узаконить мой гулкий зонт',
      'Признать мою корову соседом по этажу',
      'Выдать мне лицензию на ленивое воскресенье',
      'Разрешить пить воду только вверх ногами',
      'Объявить мою тень отдельным гражданином',
      'Разрешить мне говорить только гласными',
      'Утвердить мой нос как орган власти',
    ],
    values: { category: '', title: '', justification: '' },
    error: null,
  });
});

app.get('/feed', (req, res) => {
  res.render('feed', { title: 'Лента абсурда', requests: db.listAllRequests.all() });
});

app.get('/r/:id', (req, res) => {
  const request = db.getRequestById.get(Number(req.params.id));
  if (!request) {
    return res.status(404).render('error', { title: 'Такой заявки нет', message: 'Заявка не найдена. Возможно, её рассмотрели и завернули.' });
  }
  res.render('request', { title: `Заявка ${request.ticket}`, request });
});

app.get('/login', (req, res) => {
  const need = sec.captchaNeeded(req);
  res.render('login', {
    title: 'Вход',
    values: { login: '' },
    error: null,
    needCaptcha: need,
    captchaQuestion: need ? sec.makeCaptcha(req) : null,
  });
});

app.get('/register', (req, res) => {
  const need = sec.captchaNeeded(req);
  res.render('register', {
    title: 'Регистрация',
    values: { email: '', username: '' },
    error: null,
    minLength: sec.MIN_PASSWORD_LENGTH,
    needCaptcha: need,
    captchaQuestion: need ? sec.makeCaptcha(req) : null,
  });
});

// ------------------------------------------------------------------ Регистрация

app.post('/register', registerLimit, sec.botTrap, sec.verifyCsrf, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  const rerender = (error) => {
    const need = sec.captchaNeeded(req);
    res.status(400).render('register', {
      title: 'Регистрация',
      values: { email, username },
      error,
      minLength: sec.MIN_PASSWORD_LENGTH,
      needCaptcha: need,
      captchaQuestion: need ? sec.makeCaptcha(req) : null,
    });
  };

  if (sec.captchaNeeded(req) && !sec.checkCaptcha(req)) {
    db.logEvent({ ip: req.ip, kind: 'captcha-failed', detail: 'register' });
    return rerender('Ответь на пример, иначе регистрация закрывается.');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
    return rerender('Некорректный email.');
  }
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return rerender('Никнейм: 3–24 символа, только латиница, цифры и подчёркивание.');
  }

  const passErrors = sec.validatePassword(password, { email, username });
  if (passErrors.length) {
    return rerender(passErrors.join(' '));
  }

  if (db.getUserByEmail.get(email) || db.getUserByUsername.get(username)) {
    return rerender('Не получилось зарегистрироваться: этот email или никнейм уже занят.');
  }

  try {
    const user = db.createUser({ email, username, password });
    req.session.userId = user.id;
    sec.clearCaptchaNeed(req);
    db.logLogin({ email, ip: req.ip, ok: true, reason: 'registered' });
    db.logEvent({ ip: req.ip, kind: 'registered', detail: username });
    res.redirect('/my');
  } catch (err) {
    console.error('register failed:', err);
    rerender('Не получилось зарегистрироваться: этот email или никнейм уже занят.');
  }
});

// ------------------------------------------------------------------ Вход

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.post('/login', loginLimit, sec.botTrap, sec.verifyCsrf, async (req, res) => {
  const login = String(req.body.login || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  const user = db.getUserByEmail.get(login) || db.getUserByUsername.get(login);

  // Считаем провалы и по email, и по IP: бот, меняющий логины, ловится по IP.
  const fails = Math.max(
    user ? db.countRecentFailures('email', user.email, 15) : 0,
    db.countRecentFailures('ip', req.ip, 15)
  );

  let ok = false;

  // Капча нужна, если её просит сессия (после неудачи) ИЛИ счётчик неудач в БД велик.
// Оба условия обязательны: иначе форма рисует капчу, а сервер её не проверяет.
const needCaptcha = sec.captchaNeeded(req) || fails >= CAPTCHA_AFTER;

if (needCaptcha && !sec.checkCaptcha(req)) {
    sec.markCaptchaNeeded(req);
    db.logEvent({ ip: req.ip, kind: 'captcha-failed', detail: login });
    db.logLogin({ email: login, ip: req.ip, ok: false, reason: 'captcha' });
    return res.status(400).render('login', {
      title: 'Вход',
      values: { login },
      error: 'Ответь на пример, иначе вход закрывается.',
      needCaptcha: true,
      captchaQuestion: sec.makeCaptcha(req),
    });
  }

  if (user && password.length <= sec.MAX_PASSWORD_LENGTH) {
    ok = db.verifyPassword(password, user.password_hash);
  } else {
    // Холостая работа, чтобы по времени ответа нельзя было понять,
    // существует ли такой email.
    await sleep(220 + Math.random() * 60);
  }

  if (!ok) {
    db.logLogin({ email: login, ip: req.ip, ok: false, reason: 'bad-password' });
    db.logEvent({ ip: req.ip, kind: 'login-failed', detail: login });
    const penalty = Math.min(2500, 300 * (fails + 1));
    await sleep(penalty);

    if (fails + 1 >= 2) sec.markCaptchaNeeded(req);

    const tooMany = fails + 1 >= LIMIT.login;
    if (tooMany) sec.blockIp(req.ip, 30);

    return res.status(401).render('login', {
      title: 'Вход',
      values: { login: String(req.body.login || '') },
      error: tooMany
        ? 'Слишком много попыток. Адрес заблокирован на 30 минут.'
        : 'Неверный логин или пароль.',
      needCaptcha: sec.captchaNeeded(req),
      captchaQuestion: sec.captchaNeeded(req) ? sec.makeCaptcha(req) : null,
    });
  }

  sec.clearBlock(req.ip);
  sec.clearCaptchaNeed(req);
  req.session.userId = user.id;
  db.touchLogin.run(user.id);
  db.logLogin({ email: user.email, ip: req.ip, ok: true, reason: 'login' });
  db.logEvent({ ip: req.ip, kind: 'login-ok', detail: user.username });
  res.redirect('/my');
});

app.post('/logout', sec.verifyCsrf, (req, res) => {
  req.session = null;
  res.redirect('/');
});

// ------------------------------------------------------------------ Заявки

app.get('/my', (req, res) => {
  if (!res.locals.user) return res.redirect('/login');
  res.render('my', { title: 'Мои заявки', requests: db.listRequestsByUser.all(res.locals.user.id) });
});

const CATEGORIES = ['Бытовое абсурдство', 'Физиология', 'Право', 'Эстетика', 'Прочее'];

const postRequestLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: LIMIT.post,
  keyGenerator: (req) => (req.session && req.session.userId ? `u:${req.session.userId}` : ipKeyGenerator(req.ip)),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: deny,
});

app.post('/requests', postRequestLimit, sec.botTrap, sec.verifyCsrf, (req, res) => {
  if (!res.locals.user) return res.redirect('/login');

  const category = String(req.body.category || '');
  const title = String(req.body.title || '').trim();
  const justification = String(req.body.justification || '').trim();

  const rerender = (error) =>
    res.status(400).render('index', {
      title: 'Абсурдбюро',
      stats: db.countRequests.get(),
      examples: [],
      values: { category, title, justification },
      error,
    });

  if (!CATEGORIES.includes(category)) return rerender('Такой категории у нас нет.');
  if (title.length < 8 || title.length > 140) return rerender('Суть заявки: от 8 до 140 символов.');
  if (justification.length < 20 || justification.length > 2000) {
    return rerender('Обоснование: от 20 до 2000 символов. Без обоснования заявка не рассматривается.');
  }

  const info = db.createRequest.run({
    ticket: db.generateTicket(),
    userId: res.locals.user.id,
    category,
    title,
    justification,
  });
  res.redirect(`/r/${info.lastInsertRowid}`);
});

// ------------------------------------------------------------------ Журнал безопасности

// Закрыт паролем из переменной LOG_PASSWORD. Показывает, кто и откуда лезет.
// Своя форма вместо Basic Auth: Basic не умеет нормально передавать пароль с
// кириллицей, а журнал мы хотим читать по-человечески.
const logLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: deny,
});

function secretEquals(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function logDisabled(res) {
  return res.status(404).render('error', {
    title: 'Страница не найдена',
    message: 'Журнал выключен: в окружении нет LOG_PASSWORD.',
  });
}

app.get('/security-log', (req, res) => {
  if (!LOG_PASSWORD) return logDisabled(res);
  res.render('security-log', {
    title: 'Журнал безопасности',
    authorized: Boolean(req.session && req.session.logAuth),
    error: null,
    events: [],
    summary: [],
    logins: [],
  });
});

app.post('/security-log', logLimit, sec.verifyCsrf, (req, res) => {
  if (!LOG_PASSWORD) return logDisabled(res);

  if (!secretEquals(req.body.password || '', LOG_PASSWORD)) {
    db.logEvent({ ip: req.ip, kind: 'log-password-failed', detail: String(req.body.password || '').slice(0, 12) });
    return res.status(401).render('security-log', {
      title: 'Журнал безопасности',
      authorized: false,
      error: 'Неверный пароль журнала.',
      events: [],
      summary: [],
      logins: [],
    });
  }

  req.session.logAuth = true;
  res.render('security-log', {
    title: 'Журнал безопасности',
    authorized: true,
    error: null,
    events: db.listEvents.all(),
    summary: db.countEventsSince.all('-24 hours'),
    logins: db.listLoginLog.all(),
  });
});

// ------------------------------------------------------------------ Ошибки

app.use((err, req, res, next) => {
  if (err && err.message === 'honeypot') {
    db.logEvent({ ip: req.ip, kind: 'bot-honeypot', detail: req.path });
    return res.status(400).render('error', { title: 'Заявка отклонена', message: 'Похоже на автоматическую отправку.' });
  }
  if (err && err.message === 'too-fast') {
    db.logEvent({ ip: req.ip, kind: 'bot-too-fast', detail: req.path });
    return res.status(400).render('error', { title: 'Слишком быстро', message: 'Форма была отправлена раньше, чем человек успевает её заполнить.' });
  }
  console.error(err);
  res.status(500).render('error', { title: 'Абсурд сломался', message: 'Внутренняя ошибка. Мы её уже заметили и смеёмся.' });
});

app.listen(PORT, () => {
  console.log(`  Абсурдбюро работает:  http://localhost:${PORT}`);
});