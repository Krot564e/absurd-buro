'use strict';

// Дымовой тест: сервер отвечает, отдаёт чёрный экран и все семь приколов живы.

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3111;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function ok(cond, name, extra) {
  if (cond) {
    passed += 1;
    console.log(`  [ok]   ${name}`);
  } else {
    failed += 1;
    console.log(`  [FAIL] ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function req(url, opts) {
  const res = await fetch(BASE + url, opts);
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(BASE + '/');
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('сервер не поднялся');
}

async function main() {
  console.log('\n=== MAX+: дымовой тест ===\n');

  const server = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'app.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });

  try {
    await waitForServer();

    const home = await req('/');
    ok(home.status === 200, 'главная отвечает 200');
    ok(home.text.includes('id="loader"'), 'на главной вечная загрузка');
    ok(!/<h1|<p[ >]/.test(home.text), 'на экране нет текста');
    ok(home.headers.get('content-security-policy')?.includes("default-src 'self'"), 'CSP включён');

    const traps = await req('/public/traps.js');
    ok(traps.status === 200 && traps.headers.get('content-type')?.includes('javascript'), 'traps.js отдаётся');
    const seven = (traps.text.match(/\/\/ -+ \d+\./g) || []).length;
    ok(seven >= 7, `в traps.js семь приколов (${seven} найдено)`);

    const css = await req('/public/style.css');
    ok(css.status === 200 && css.text.includes('background: #000'), 'экран чёрный');

    const favicon = await req('/favicon.ico');
    ok(favicon.status === 200, 'фавикон отдаётся');

    ok(home.headers.get('ratelimit-limit') || home.headers.get('ratelimit'), 'rate limit работает');

    const oldPage = await req('/login');
    ok(oldPage.status === 404, 'старых страниц больше нет (/login = 404)');
    const feed = await req('/feed');
    ok(feed.status === 404, 'лента удалена (/feed = 404)');
    const post = await req('/newsletter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a@b.co',
    });
    ok(post.status === 404, 'форм больше нет (POST = 404)');
    const junk = await req('/definitely-not-here');
    ok(junk.status === 404, 'неизвестный путь = 404');
  } finally {
    server.kill();
  }

  console.log(`\n=== Итог: ${passed} ок, ${failed} провалено ===\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
