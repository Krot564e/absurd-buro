'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const PORT = Number(process.env.PORT || 3000);
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';
const PUBLIC = path.join(__dirname, '..', 'public');
const DATA = path.join(__dirname, '..', 'data');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        mediaSrc: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: SECURE_COOKIES ? undefined : false,
    referrerPolicy: { policy: 'no-referrer' },
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: Number(process.env.LIMIT_GLOBAL ?? 400),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  })
);

app.use(express.urlencoded({ extended: false, limit: '10kb' }));

app.use('/public', express.static(PUBLIC, { maxAge: '1h' }));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC, 'favicon.ico')));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// ------------------------------------------------------------------ Гео по IP

const geoCache = { data: null, at: 0 };

app.get('/api/geo', async (req, res) => {
  const fresh = geoCache.data && Date.now() - geoCache.at < 10 * 60_000;
  if (fresh) return res.json(geoCache.data);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch('https://ipwho.is/', { signal: ctrl.signal });
    const j = await r.json();
    if (!j.success) throw new Error('geo fail');
    const data = {
      ip: j.ip || '?',
      country: [j.country, j.country_code].filter(Boolean).join(' · ') || 'неизвестно',
      city: j.city || 'неизвестно',
      provider: (j.connection && j.connection.isp) || 'неизвестный провайдер',
      tz: (j.timezone && j.timezone.id) || 'неизвестный часовой пояс',
    };
    geoCache.data = data;
    geoCache.at = Date.now();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'провайдер гео молчит' });
  } finally {
    clearTimeout(timer);
  }
});

// ------------------------------------------------------------------ Рассылка

const newsletterLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

app.post('/newsletter', newsletterLimit, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const consent = String(req.body.consent || '');

  const fail = (msg) => res.status(400).json({ ok: false, error: msg });

  if (req.body.website) return fail('нет');
  if (consent !== 'yes') return fail('без согласия не подпишем');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return fail('плохой email');

  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(path.join(DATA, 'newsletter.txt'), `${new Date().toISOString()} ${email}\n`);
  } catch {}

  res.json({ ok: true });
});

// ------------------------------------------------------------------ Невозможная капча

const captchaTries = new Map();

app.post('/captcha-try', (req, res) => {
  const key = req.ip;
  const tries = (captchaTries.get(key) || 0) + 1;
  if (captchaTries.size > 5000) captchaTries.clear();
  captchaTries.set(key, tries);
  res.json({ done: false, tries });
});

app.use((req, res) => res.status(404).type('text/plain').send('404'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type('text/plain').send('500');
});

app.listen(PORT, () => {
  console.log(`  MAX+ работает:  http://localhost:${PORT}`);
});
