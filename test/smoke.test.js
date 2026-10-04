'use strict';

// Дымовой тест: сервер отвечает, отдаёт чёрный экран и все семь приколов на месте.

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
  return { status: res.status, text, headers: res.headers, json: () => res.json().catch(() => null) };
}

function form(data) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  };
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
    ok(home.text.includes('id="abs-overlays"'), 'контейнер оверлеев на месте');
    ok(!/<h1|<p[ >]/.test(home.text), 'на экране нет текста');
    ok(home.headers.get('content-security-policy')?.includes("default-src 'self'"), 'CSP включён');
    ok(home.headers.get('ratelimit-limit') || home.headers.get('ratelimit'), 'rate limit работает');

    const traps = await req('/public/traps.js');
    ok(traps.status === 200 && traps.headers.get('content-type')?.includes('javascript'), 'traps.js отдаётся');
    const marks = [];
    for (let n = 1; n <= 7; n++) {
      if (new RegExp(`=+ ${n}\\. `).test(traps.text)) marks.push(n);
    }
    ok(marks.length === 7, `семь приколов размечены (найдены: ${marks.join(',')})`);
    ok(traps.text.includes('cookieBanner'), '1. cookie-баннер');
    ok(traps.text.includes('geoBox'), '2. гео по IP');
    ok(traps.text.includes('pushNag') && traps.text.includes('20000'), '3. пуш каждые 20 сек');
    ok(traps.text.includes('emailBox'), '4. email-окно');
    ok(traps.text.includes('showAd') && traps.text.includes('ad-video.mp4'), '5. непропускаемая реклама');
    ok(traps.text.includes('captchaBox') && traps.text.includes('/captcha-try'), '6. невозможная капча');
    ok(traps.text.includes('popstate') && traps.text.includes('beforeunload'), '7. ловушка выхода');

    const video = await req('/public/ad-video.mp4');
    ok(video.status === 200, 'рекламное видео отдаётся');

    const css = await req('/public/style.css');
    ok(css.status === 200 && css.text.includes('background: #000'), 'экран чёрный');
    ok(css.text.includes('.abs-rc-modal'), 'стили капчи подключены');

    const favicon = await req('/favicon.ico');
    ok(favicon.status === 200, 'фавикон отдаётся');

    const geo = await req('/api/geo');
    ok(geo.status === 200 || geo.status === 502, `/api/geo отвечает (${geo.status})`);
    if (geo.status === 200) {
      const g = JSON.parse(geo.text);
      ok(Boolean(g.ip), 'гео отдаёт IP');
    }

    const nlOk = await req('/newsletter', form({ email: 'a@b.co', consent: 'yes', website: '' }));
    const nlJson = JSON.parse(nlOk.text);
    ok(nlOk.status === 200 && nlJson && nlJson.ok === true, 'newsletter принимает почту');
    const nlNo = await req('/newsletter', form({ email: 'a@b.co' }));
    ok(nlNo.status === 400, 'newsletter требует согласие');

    const cap = await req('/captcha-try', form({}));
    const capJson = JSON.parse(cap.text);
    ok(cap.status === 200 && capJson && capJson.done === false, 'капча никогда не пропускает');

    const oldPage = await req('/login');
    ok(oldPage.status === 404, 'старых страниц нет (/login = 404)');
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
