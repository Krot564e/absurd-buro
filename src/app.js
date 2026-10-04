'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const PORT = Number(process.env.PORT || 3000);
const SECURE_COOKIES = process.env.SECURE_COOKIES === '1';
const PUBLIC = path.join(__dirname, '..', 'public');

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

app.use('/public', express.static(PUBLIC, { maxAge: '1h' }));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(PUBLIC, 'favicon.ico')));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((req, res) => res.status(404).type('text/plain').send('404'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).type('text/plain').send('500');
});

app.listen(PORT, () => {
  console.log(`  MAX+ работает:  http://localhost:${PORT}`);
});
