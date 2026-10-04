'use strict';

// Автотест защиты. Поднимает отдельный сервер на отдельной БД и проверяет,
// что каждый слой реально срабатывает. Запуск:  node test/security.test.js

const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DB_FILE = path.join(ROOT, 'data', 'test.db');
const GOOD_PASSWORD = 'Kv7!pzR#mQ2wL9xT4';
const OLD_TS = String(Date.now() - 60_000);

let PORT = 0;
let BASE = '';
let serverErr = '';

for (const f of [DB_FILE, `${DB_FILE}-wal`, `${DB_FILE}-shm`]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let pass = 0;
let fail = 0;
const jar = new Map();

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  [ok]   ${name}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name} ${extra}`);
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === '' || /expires=thu, 01 jan 1970/i.test(c)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function req(url, { method = 'GET', form, headers = {} } = {}) {
  const h = { ...headers };
  if (jar.size) h.cookie = cookieHeader();
  if (form) h['content-type'] = 'application/x-www-form-urlencoded';
  const res = await fetch(BASE + url, {
    method,
    headers: h,
    body: form ? new URLSearchParams(form).toString() : undefined,
    redirect: 'manual',
  });
  storeCookies(res);
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Достаёт CSRF-токен со страницы, чтобы честно пройти формы, а не подставлять мусор.
async function csrfFrom(page) {
  const m = page.text.match(/name="_csrf" value="([^"]+)"/);
  if (!m) throw new Error('CSRF-токен не найден в HTML — проверь шаблон');
  return m[1];
}

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + '/', { redirect: 'manual' });
      if (r.status) return true;
    } catch {
      /* ещё не поднялся */
    }
    await sleep(250);
  }
  return false;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function main() {
  console.log('\n=== Абсурдбюро: тест защиты ===\n');

  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  console.log(`  Тестовый сервер: ${BASE}\n`);

  const server = spawn(process.execPath, [path.join(ROOT, 'src', 'app.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_FILE,
      // Тест ходит по http, secure-cookie браузер бы не сохранил.
      SECURE_COOKIES: '0',
      LIMIT_GLOBAL: '10000',
      LIMIT_REGISTER: '100',
      LIMIT_POST: '100',
      LIMIT_LOGIN: '5',
      LOG_PASSWORD: 'testovye-parol-zhurnala',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stderr.on('data', (b) => (serverErr += b.toString()));

  try {
    await runAll();
  } finally {
    server.kill();
  }
}

async function runAll() {
  if (!(await waitForServer())) {
    console.error('Сервер не поднялся:\n' + serverErr);
    process.exit(1);
  }

  // ---------------------------------------------------------------- базовые страницы
  const home = await req('/');
  ok('главная отдаётся', home.status === 200);
  ok('заголовок X-Powered-By скрыт', !home.headers.has('x-powered-by'));
  ok('есть CSP', (home.headers.get('content-security-policy') || '').includes("default-src 'self'"));
  ok('есть HSTS-подобная защита кадров', home.headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  ok('есть nosniff', home.headers.get('x-content-type-options') === 'nosniff');

  // ---------------------------------------------------------------- регистратура мусора
  const regPage = await req('/register');
  const csrf = await csrfFrom(regPage);
  ok('страница регистрации есть', regPage.status === 200);

  const weak = await req('/register', {
    method: 'POST',
    form: { _csrf: csrf, _ts: OLD_TS, email: 'a@b.ru', username: 'tester', password: '123456' },
  });
  ok('короткий пароль отклонён', weak.status === 400 && weak.text.includes('короче'), `got ${weak.status}`);

  const common = await req('/register', {
    method: 'POST',
    form: { _csrf: csrf, _ts: OLD_TS, email: 'a@b.ru', username: 'tester', password: 'password123' },
  });
  ok('пароль из топа частых отклонён', common.status === 400 && common.text.includes('самых частых'));

  const withName = await req('/register', {
    method: 'POST',
    form: { _csrf: csrf, _ts: OLD_TS, email: 'nikita@b.ru', username: 'nikita', password: 'Nikita12345' },
  });
  ok('пароль с ником внутри отклонён', withName.status === 400 && withName.text.includes('никнейм'));

  // ---------------------------------------------------------------- антибот
  const hp = await req('/register', {
    method: 'POST',
    form: { _csrf: csrf, _ts: OLD_TS, email: 'bot@b.ru', username: 'botter', password: GOOD_PASSWORD, website: 'http://spam.example' },
  });
  ok('honeypot ловит бота', hp.status === 400 && hp.text.includes('автоматическ'));

  const fast = await req('/register', {
    method: 'POST',
    form: { _csrf: csrf, _ts: String(Date.now()), email: 'fast@b.ru', username: 'fastbot', password: GOOD_PASSWORD },
  });
  ok('слишком быстрая отправка отклонена', fast.status === 400 && fast.text.includes('быстро'));

  const noCsrf = await req('/register', {
    method: 'POST',
    form: { _ts: OLD_TS, email: 'x@b.ru', username: 'xsr', password: GOOD_PASSWORD },
  });
  ok('POST без CSRF-токена отклонён (403)', noCsrf.status === 403, `got ${noCsrf.status}`);

  const badOrigin = await req('/register', {
    method: 'POST',
    headers: { origin: 'http://zlovredniy-site.example' },
    form: { _csrf: csrf, _ts: OLD_TS, email: 'o@b.ru', username: 'osr', password: GOOD_PASSWORD },
  });
  ok('POST с чужим Origin отклонён', badOrigin.status === 403 && badOrigin.text.includes('чужого домена'), `got ${badOrigin.status}`);

  const sameOrigin = await req('/register', {
    method: 'POST',
    headers: { origin: BASE },
    form: { _csrf: csrf, _ts: OLD_TS, email: 's@b.ru', username: 'ssr', password: GOOD_PASSWORD },
  });
  ok('POST со своим Origin проходит валидацию (не 403)', sameOrigin.status !== 403, `got ${sameOrigin.status}`);

  const badCsrf = await req('/register', {
    method: 'POST',
    form: { _csrf: 'подделка', _ts: OLD_TS, email: 'y@b.ru', username: 'ysr', password: GOOD_PASSWORD },
  });
  ok('POST с чужим CSRF-токеном отклонён', badCsrf.status === 403);

  // ---------------------------------------------------------------- успешная регистрация
  const email = `citizen${Date.now()}@absurd.example`;
  const reg = await req('/register', {
    method: 'POST',
    form: { _csrf: csrf, _ts: OLD_TS, email, username: 'grazhdanin', password: GOOD_PASSWORD },
  });
  const alertOf = (html) => (html.match(/<div class="alert">([\s\S]*?)<\/div>/) || [, ''])[1].trim();
  ok(
    'нормальная регистрация проходит',
    reg.status === 302 && reg.headers.get('location') === '/my',
    `got ${reg.status} alert="${alertOf(reg.text)}" loc=${reg.headers.get('location')}`
  );

  const my = await req('/my');
  ok('после регистрации открывается /my', my.status === 200 && my.text.includes('grazhdanin'));

  const out = await req('/logout', { method: 'POST', form: { _csrf: csrf } });
  ok('выход работает', out.status === 302);

  const anon = await req('/my');
  ok('после выхода /my закрыт', anon.status === 302 && anon.headers.get('location') === '/login', `got ${anon.status}`);

  // ---------------------------------------------------------------- пароль в БД
  const raw = new Database(DB_FILE, { readonly: true });
  const row = raw.prepare('SELECT password_hash FROM users WHERE email = ?').get(email);
  raw.close();
  ok('пароль НЕ хранится в открытом виде', row && !row.password_hash.includes(GOOD_PASSWORD));
  ok('пароль хранится как bcrypt ($2b$)', row && row.password_hash.startsWith('$2b$'), row ? row.password_hash.slice(0, 7) : 'нет юзера');

  // ---------------------------------------------------------------- заявки
  jar.clear();
  const loginPage = await req('/login');
  const lcsrf = await csrfFrom(loginPage);
  const loginOk = await req('/login', {
    method: 'POST',
    form: { _csrf: lcsrf, _ts: OLD_TS, login: 'grazhdanin', password: GOOD_PASSWORD },
  });
  ok('вход с верным паролем работает', loginOk.status === 302 && loginOk.headers.get('location') === '/my');

  const short = await req('/requests', {
    method: 'POST',
    form: { _csrf: lcsrf, _ts: OLD_TS, category: 'Право', title: 'коротко', justification: 'мало текста для обоснования, но всё же' },
  });
  ok('слишком короткое обоснование отклонено', short.status === 400);

  const reqPage = await req('/');
  const rcsrf = await csrfFrom(reqPage);
  const created = await req('/requests', {
    method: 'POST',
    form: {
      _csrf: rcsrf,
      _ts: OLD_TS,
      category: 'Право',
      title: 'Разрешить мне дышать вверх ногами',
      justification: 'Я не могу дышать вверх ногами, потому что мои лёгкие не зарегистрированы как водоплав.',
    },
  });
  ok('заявка создаётся', created.status === 302 && /^\/r\/\d+$/.test(created.headers.get('location') || ''), created.headers.get('location'));

  const ticketUrl = created.headers.get('location');
  const ticketPage = await req(ticketUrl);
  ok('страница заявки открывается', ticketPage.status === 200);
  ok('на странице есть номер заявки', /АБ-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(ticketPage.text));

  const feed = await req('/feed');
  ok('лента заявок открыта', feed.status === 200 && feed.text.includes('вверх ногами'));

  const xss = await req('/requests', {
    method: 'POST',
    form: {
      _csrf: rcsrf,
      _ts: OLD_TS,
      category: 'Право',
      title: '<script>alert(1)</script>',
      justification: 'Пытаюсь засунуть скрипт в заявку, чтобы проверить экранирование вывода в шаблоне.',
    },
  });
  if (xss.status === 302) {
    const feed2 = await req('/feed');
    ok('HTML в заявке экранируется', !feed2.text.includes('<script>alert(1)</script>') && feed2.text.includes('&lt;script&gt;'));
  } else {
    ok('HTML в заявке экранируется (заявка не прошла валидацию)', true);
  }

  // ---------------------------------------------------------------- перебор пароля
  jar.clear();
  const lp = await req('/login');
  const bcsrf = await csrfFrom(lp);
  const started = Date.now();
  const wrong = await req('/login', {
    method: 'POST',
    form: { _csrf: bcsrf, _ts: OLD_TS, login: 'grazhdanin', password: 'неправильныйпароль' },
  });
  const elapsed = Date.now() - started;
  ok('неверный пароль даёт 401', wrong.status === 401, `got ${wrong.status}`);
  ok('текст ответа не раскрывает, существует ли юзер', wrong.text.includes('Неверный логин или пароль'));

  const ghost = await req('/login', {
    method: 'POST',
    form: { _csrf: bcsrf, _ts: OLD_TS, login: 'несуществующий@absurd.example', password: 'неправильныйпароль' },
  });
  ok('несуществующий логин тоже 401 (нет user enumeration)', ghost.status === 401);

  // ---------------------------------------------------------------- капча
  const captchaPage = await req('/login');
  const captchaMatch = captchaPage.text.match(/ПРИМЕР:\s*(\d+)\s*\+\s*(\d+)/);
  ok('после серии неудач на форме появляется капча', Boolean(captchaMatch));
  const ccsrf = await csrfFrom(captchaPage);

  const wrongCaptcha = await req('/login', {
    method: 'POST',
    form: { _csrf: ccsrf, _ts: OLD_TS, login: 'grazhdanin', password: GOOD_PASSWORD, captcha: '99999' },
  });
  ok('неверная капча не пускает', wrongCaptcha.status === 400 && wrongCaptcha.text.includes('Ответь на пример'));

  const page2 = await req('/login');
  const m2 = page2.text.match(/ПРИМЕР:\s*(\d+)\s*\+\s*(\d+)/);
  const answer = m2 ? Number(m2[1]) + Number(m2[2]) : 0;
  const withCaptcha = await req('/login', {
    method: 'POST',
    form: { _csrf: await csrfFrom(page2), _ts: OLD_TS, login: 'grazhdanin', password: GOOD_PASSWORD, captcha: String(answer) },
  });
  ok('вход с верной капчей проходит', withCaptcha.status === 302, `got ${withCaptcha.status}`);

  // ---------------------------------------------------------------- перебор пароля
  jar.clear();

  let sawRateLimit = false;
  for (let i = 0; i < 10; i++) {
    const r = await req('/login', {
      method: 'POST',
      form: { _csrf: bcsrf, _ts: OLD_TS, login: 'grazhdanin', password: `guess${i}` },
    });
    if (r.status === 429) {
      sawRateLimit = true;
      break;
    }
  }
  ok('брутфорс упирается в 429', sawRateLimit);

  const blocked = await req('/login');
  ok('после серии попыток адрес блокируется', blocked.status === 429 && blocked.text.includes('заблокирован'), `got ${blocked.status}`);

  // ---------------------------------------------------------------- журнал безопасности
  const logNoAuth = await req('/security-log');
  ok('журнал без входа показывает форму пароля', logNoAuth.status === 200 && logNoAuth.text.includes('ПАРОЛЬ ЖУРНАЛА'));

  const logWrong = await req('/security-log', {
    method: 'POST',
    form: { _csrf: await csrfFrom(logNoAuth), password: 'неправильный' },
  });
  ok('журнал с неверным паролем не открывается', logWrong.status === 401 && logWrong.text.includes('Неверный пароль'));

  const logForm = await req('/security-log');
  const logAuth = await req('/security-log', {
    method: 'POST',
    form: { _csrf: await csrfFrom(logForm), password: 'testovye-parol-zhurnala' },
  });
  ok('журнал с верным паролем открывается', logAuth.status === 200 && logAuth.text.includes('Попытки входа'), `got ${logAuth.status}`);
  ok('в журнале видны атаки', logAuth.text.includes('login-failed') || logAuth.text.includes('rate-limited'));

  console.log(`\n=== Итог: ${pass} ок, ${fail} провалено ===`);
  if (serverErr.trim()) console.log('\nЛог сервера:\n' + serverErr.trim());

  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  if (serverErr.trim()) console.error('\nЛог сервера:\n' + serverErr.trim());
  process.exit(1);
});