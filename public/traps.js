(function () {
  'use strict';

  var root = document.getElementById('abs-overlays');
  var busy = false;

  window.absClaim = function () { busy = true; };
  window.absRelease = function () { busy = false; };

  function offer(show, delay) {
    function attempt() {
      if (busy) { setTimeout(attempt, 700); return; }
      busy = true;
      show(function () { busy = false; });
    }
    setTimeout(attempt, delay);
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html) n.innerHTML = html;
    return n;
  }

  function dismiss(box, done) {
    box.classList.add('abs-out');
    setTimeout(function () {
      box.remove();
      if (done) done();
    }, 380);
  }

  function post(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data)
    }).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  // ================================================================ ФОН

  // вечная загрузка: до 97% и обратно по кругу
  var bar = document.getElementById('bar');
  var pct = 0;
  setInterval(function () {
    pct += Math.random() * 5 + 1;
    if (pct >= 97) pct = 40 + Math.random() * 8;
    if (bar) bar.style.width = pct.toFixed(1) + '%';
  }, 420);

  // ================================================================ 7. НЕВОЗМОЖНО ВЫЙТИ

  // заполняем историю, чтобы «назад» вёл внутрь сайта, а не наружу
  for (var h = 0; h < 6; h++) {
    try { history.pushState({ lock: h }, '', location.href); } catch (e) {}
  }
  window.addEventListener('popstate', function () {
    try { history.pushState({ lock: 'x' }, '', location.href); } catch (e) {}
  });

  // свайп от правого края (назад на телефоне) перехватываем
  document.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    if (t && t.clientX > window.innerWidth - 28) e.preventDefault();
  }, { passive: false });

  // полный экран при любом жесте
  function fs() {
    var d = document.documentElement;
    var req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
    try { req.call(d); } catch (e) {}
  }
  document.addEventListener('mousedown', fs);
  document.addEventListener('touchend', fs);

  // если выкинуло из полного экрана — возвращаем (каждый раз, но без цикла)
  var retried = false;
  function onFsChange() {
    if (document.fullscreenElement || document.webkitFullscreenElement) { retried = false; return; }
    if (retried) return;
    retried = true;
    setTimeout(fs, 150);
  }
  document.addEventListener('fullscreenchange', onFsChange);
  document.addEventListener('webkitfullscreenchange', onFsChange);

  // последний рубеж: подтверждение закрытия вкладки (десктоп)
  window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
  });

  // ================================================================ ФОНОВЫЕ РАЗДРАЖИТЕЛИ

  // вибрация
  setInterval(function () {
    if (navigator.vibrate) { try { navigator.vibrate(70); } catch (e) {} }
  }, 12000);

  // тихий писк после первого касания
  var audioCtx = null;
  function poke() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.frequency.value = 920;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(audioCtx.destination);
      o.start();
      window.beepGain = g;
      window.beepOsc = o;
    } catch (e) {}
  }
  document.addEventListener('touchstart', poke, { once: true });
  document.addEventListener('mousedown', poke, { once: true });
  setInterval(function () {
    if (!window.beepGain || !audioCtx) return;
    var t = audioCtx.currentTime;
    window.beepGain.gain.setValueAtTime(0.0001, t);
    window.beepGain.gain.exponentialRampToValueAtTime(0.02, t + 0.05);
    window.beepGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  }, 15000);

  // глюк-инверсия
  setInterval(function () {
    document.documentElement.style.filter = 'invert(1)';
    setTimeout(function () { document.documentElement.style.filter = ''; }, 120);
  }, 17000);

  // спиннер в точке касания
  document.addEventListener('pointerdown', function (e) {
    var s = el('div', 'mini');
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';
    document.body.appendChild(s);
    setTimeout(function () { s.remove(); }, 1400);
  });

  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // убегающая кнопка ✕
  var exitBtn = document.getElementById('exit');
  if (exitBtn) {
    function dodge() {
      exitBtn.style.top = (10 + Math.random() * 70) + '%';
      exitBtn.style.left = (10 + Math.random() * 75) + '%';
      exitBtn.style.right = 'auto';
    }
    exitBtn.addEventListener('mouseenter', dodge);
    exitBtn.addEventListener('touchstart', function (e) { e.preventDefault(); dodge(); }, { passive: false });
    exitBtn.addEventListener('click', dodge);
  }

  // ================================================================ 1. COOKIE

  function cookieBanner(done) {
    if (localStorage.getItem('abs-cookie')) { done(); return; }
    var box = el('div', 'abs-cookie');
    box.innerHTML =
      '<div class="abs-stamp">Обновлено по закону</div>' +
      '<h3>Согласие на обработку cookie</h3>' +
      '<p>Мы собираем, храним, дублируем и продаем твои данные на чёрный рынок. ' +
      'А ещё следим за тем, куда ты курсором ведёшь, и считаем сколько раз ты дышишь.</p>' +
      '<div class="abs-btns">' +
      '<button class="abs-yes">Продолжить</button>' +
      '<button class="abs-yes">Согласен</button>' +
      '<button class="abs-yes">ОК</button>' +
      '<button class="abs-yes">Подтвердить</button>' +
      '<button class="abs-yes">Не хочу, но даю</button>' +
      '</div>' +
      '<a class="abs-refuse" href="#">Отклонить</a>';
    root.appendChild(box);

    function close(value) {
      localStorage.setItem('abs-cookie', value);
      dismiss(box, done);
    }
    Array.prototype.forEach.call(box.querySelectorAll('.abs-yes'), function (b) {
      b.addEventListener('click', function () { close('yes'); });
    });
    box.querySelector('.abs-refuse').addEventListener('click', function (e) {
      e.preventDefault();
      close('no');
    });
  }

  // ================================================================ 2. ГЕО ПО IP

  function geoBox(done) {
    if (sessionStorage.getItem('abs-geo')) { done(); return; }
    var box = el('div', 'abs-geo');
    box.innerHTML =
      '<div class="abs-stamp">По твоему IP</div>' +
      '<h3>Давай знакомиться</h3>' +
      '<ul class="abs-geo-list">' +
      '<li><span>Твой IP</span><b data-f="ip">…</b></li>' +
      '<li><span>Твоя страна</span><b data-f="country">…</b></li>' +
      '<li><span>Твой город</span><b data-f="city">…</b></li>' +
      '<li><span>Твой провайдер</span><b data-f="provider">…</b></li>' +
      '<li><span>Часовой пояс</span><b data-f="tz">…</b></li>' +
      '</ul>' +
      '<div class="abs-btns"><button class="abs-yes">Ой, спасибо, не знал</button></div>';
    root.appendChild(box);

    fetch('/api/geo')
      .then(function (r) { return r.json(); })
      .then(function (g) {
        if (g.error) {
          box.querySelector('h3').textContent = 'Что-то не так: ' + g.error;
          return;
        }
        ['ip', 'country', 'city', 'provider', 'tz'].forEach(function (k) {
          var n = box.querySelector('[data-f="' + k + '"]');
          if (n) n.textContent = g[k];
        });
      })
      .catch(function () {
        box.querySelector('h3').textContent = 'Не смогли тебя вычислить.';
      });

    box.querySelector('.abs-yes').addEventListener('click', function () {
      sessionStorage.setItem('abs-geo', '1');
      dismiss(box, done);
    });
  }

  // ================================================================ 3. ПУШ КАЖДЫЕ 20 СЕК

  var AD_TEXTS = [
    'Скидка 99% на вечную загрузку — только сегодня и завтра',
    'Наш сайт снова не работает. Заходи посмотреть',
    'Ты уже 3 минуты на сайте. Поздравляем, ты один из нас',
    'Купи себе ничего — доставка не нужна, ты уже здесь'
  ];

  function spamNotification() {
    var text = AD_TEXTS[Math.floor(Math.random() * AD_TEXTS.length)];
    try {
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('MAX+ · реклама', { body: text, tag: 'ad' });
        return;
      }
    } catch (e) {}
    // фолбэк: своё «уведомление» в углу
    var n = el('div', 'abs-adnote');
    n.innerHTML = '<b>MAX+ · реклама</b><div>' + text + '</div>';
    root.appendChild(n);
    setTimeout(function () { n.classList.add('abs-out'); }, 4600);
    setTimeout(function () { n.remove(); }, 5000);
  }

  function startPushSpam() {
    if (window.__pushTimer) return;
    window.__pushTimer = setInterval(spamNotification, 30000);
    spamNotification();
    if (typeof window.absShowAd === 'function') {
      setTimeout(window.absShowAd, 8000);
      setInterval(window.absShowAd, 120000);
    }
  }

  function pushNag(done) {
    if (localStorage.getItem('abs-push') === 'yes') { done(); return; }
    var box = el('div', 'abs-push');
    box.innerHTML =
      '<div class="abs-push-icon">🔔</div>' +
      '<div class="abs-push-text"><b>' + location.host + '</b> хочет присылать тебе уведомления</div>' +
      '<div class="abs-push-btns">' +
      '<button class="abs-push-no">Запретить</button>' +
      '<button class="abs-push-yes">Разрешить</button>' +
      '</div>';
    root.appendChild(box);

    box.querySelector('.abs-push-no').addEventListener('click', function () {
      // отказ — спросим снова через 20 секунд
      dismiss(box, function () {
        done();
        offer(pushNag, 20000);
      });
    });

    box.querySelector('.abs-push-yes').addEventListener('click', function () {
      localStorage.setItem('abs-push', 'yes');
      dismiss(box, function () {
        done();
        function go() { startPushSpam(); }
        if (window.Notification && Notification.requestPermission) {
          try {
            var p = Notification.requestPermission(function () { go(); });
            if (p && p.then) p.then(function () { go(); }).catch(function () { go(); });
          } catch (e) { go(); }
        } else {
          go();
        }
      });
    });
  }

  // ================================================================ 4. EMAIL НА ВЕСЬ ЭКРАН

  function emailBox(done) {
    if (localStorage.getItem('abs-mail')) { done(); return; }
    var box = el('div', 'abs-mail');
    box.innerHTML =
      '<div class="abs-mail-card">' +
      '<button class="abs-mail-close" type="button" aria-label="Закрыть">✕</button>' +
      '<div class="abs-stamp">Специальное предложение</div>' +
      '<h3>Скидка 99% на вечный доступ</h3>' +
      '<p>Оставь почту — пришлём письма. Все. Очень много.</p>' +
      '<form class="abs-mail-form">' +
      '<input type="email" name="email" placeholder="you@mail.ru" required>' +
      '<label class="abs-mail-consent"><input type="checkbox" name="consent" value="yes"> Хочу получать письма</label>' +
      '<input type="text" name="website" class="abs-hp" tabindex="-1" autocomplete="off">' +
      '<button type="submit" class="abs-yes">Подписаться</button>' +
      '</form>' +
      '<div class="abs-mail-msg" hidden></div>' +
      '</div>';
    root.appendChild(box);

    function close() {
      localStorage.setItem('abs-mail', 'closed');
      dismiss(box, done);
    }

    var closeBtn = box.querySelector('.abs-mail-close');
    var dodges = 0;
    function dodge() {
      dodges += 1;
      if (dodges > 6) return; // после шести попыток наконец ловится
      closeBtn.style.top = (14 + Math.random() * 55) + '%';
      closeBtn.style.left = (14 + Math.random() * 60) + '%';
      closeBtn.style.right = 'auto';
    }
    closeBtn.addEventListener('mouseenter', dodge);
    closeBtn.addEventListener('touchstart', function (e) {
      if (dodges > 6) return;
      e.preventDefault();
      dodge();
    }, { passive: false });
    closeBtn.addEventListener('click', close);

    box.querySelector('.abs-mail-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var msg = box.querySelector('.abs-mail-msg');
      post('/newsletter', {
        email: form.email.value,
        consent: form.consent.checked ? 'yes' : '',
        website: form.website.value
      }).then(function (res) {
        msg.hidden = false;
        if (res.ok) {
          msg.textContent = 'Готово. Ты в списке.';
          localStorage.setItem('abs-mail', 'subscribed');
          setTimeout(close, 2000);
        } else {
          msg.textContent = 'Не получилось: ' + (res.error || 'попробуй ещё');
        }
      });
    });
  }

  // ================================================================ 5. РЕКЛАМА, КОТОРУЮ НЕЛЬЗЯ ПРОПУСТИТЬ

  var adOpen = false;

  function showAd() {
    if (adOpen) return;
    adOpen = true;
    if (typeof window.absClaim === 'function') window.absClaim();

    var box = el('div', 'abs-ad');
    box.innerHTML =
      '<div class="abs-ad-bar">Реклама · пропустить невозможно</div>' +
      '<div class="abs-ad-video">' +
      '<video src="/public/ad-video.mp4" autoplay loop playsinline muted></video>' +
      '</div>' +
      '<div class="abs-ad-foot">' +
      '<span class="abs-ad-brand">Моёше средство БАРС · Грязь не пройдёт</span>' +
      '<button type="button" class="abs-ad-skip">Пропустить через 15</button>' +
      '</div>';
    root.appendChild(box);

    var video = box.querySelector('video');
    var play = video.play();
    if (play && play.catch) play.catch(function () {});

    var skip = box.querySelector('.abs-ad-skip');
    var left = 15;
    var dodges = 0;
    var tick = setInterval(function () {
      left -= 1;
      if (left > 0) {
        skip.textContent = 'Пропустить через ' + left;
        return;
      }
      clearInterval(tick);
      skip.classList.add('abs-ad-ready');
      skip.textContent = 'Пропустить';
    }, 1000);

    skip.addEventListener('mouseenter', function () {
      if (!skip.classList.contains('abs-ad-ready')) return;
      dodges += 1;
      if (dodges > 5) return; // после пяти убеганий сдаётся
      skip.style.right = (18 + Math.random() * 40) + '%';
      skip.style.transform = 'translateY(' + (-50 + Math.random() * 40 - 20) + '%)';
    });
    skip.addEventListener('touchstart', function (e) {
      if (!skip.classList.contains('abs-ad-ready')) return;
      if (dodges > 5) return;
      e.preventDefault();
      dodges += 1;
      skip.style.right = (18 + Math.random() * 40) + '%';
      skip.style.top = (18 + Math.random() * 60) + '%';
      skip.style.transform = 'none';
    }, { passive: false });

    skip.addEventListener('click', function () {
      clearInterval(tick);
      box.classList.add('abs-out');
      adOpen = false;
      if (typeof window.absRelease === 'function') window.absRelease();
      setTimeout(function () { box.remove(); }, 380);
    });
  }

  window.absShowAd = showAd;

  // ================================================================ 6. НЕВОЗМОЖНАЯ КАПЧА

  var TASKS = [
    { type: 'grid', title: 'Выбери все квадратные круги' },
    { type: 'grid', title: 'Выбери все картины, на которых понедельник' },
    { type: 'grid', title: 'Нажми на желтый красный квадрат' },
    { type: 'spin', title: 'Поверни кубик так, чтобы он стоял ровно' },
    { type: 'draw', title: 'Нарисуй квадратный круг' },
    { type: 'connect', title: 'Соедини точки по порядку' },
    { type: 'grid', title: 'Подтверди, что ты не робот' },
    { type: 'spin', title: 'Установи шкалу в положение «прежнее»' }
  ];

  var GLYPHS = ['🟨', '🟥', '🟦', '⬜', '🟧', '🟪', '🟫', '⬛', '🔵', '🟢', '🟡', '🟪', '🔶', '🔷', '🔳'];

  function rand(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function captchaBox(done) {
    var task = rand(TASKS);
    var tries = 0;
    var modal = null;
    var finished = false;
    var watchdog = setTimeout(function () { finish(); }, 30000);

    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      if (modal) { modal.remove(); modal = null; }
      if (wrapEl && document.body.contains(wrapEl)) {
        wrapEl.classList.add('abs-out');
        setTimeout(function () { wrapEl.remove(); }, 380);
      }
      done();
      offer(captchaBox, 60000);
    }

    function openModal() {
      clearTimeout(watchdog);
      if (modal) return;
      // если застрял в задаче — снимаем через 45 секунд, но вернёмся позже
      watchdog = setTimeout(function () { finish(); }, 45000);
      modal = el('div', 'abs-rc-modal');
      root.appendChild(modal);
      render();
    }

    function render(failMsg) {
      modal.innerHTML =
        '<div class="abs-rc-card">' +
        '<div class="abs-rc-head">' +
        '<div class="abs-rc-head-title">' + task.title + '</div>' +
        '<button type="button" class="abs-rc-reload" title="Обновить">🔄</button>' +
        '</div>' +
        '<div class="abs-rc-body"></div>' +
        (failMsg ? '<div class="abs-rc-fail">' + failMsg + '</div>' : '') +
        '<div class="abs-rc-foot">' +
        '<span class="abs-rc-tries">Попытка ' + (tries + 1) + ' из 3</span>' +
        '<button type="button" class="abs-rc-next">' + (tries >= 2 ? 'Подтвердить' : 'Далее') + '</button>' +
        '</div>' +
        '</div>';

      var body = modal.querySelector('.abs-rc-body');
      if (task.type === 'grid') {
        var grid = el('div', 'abs-rc-grid');
        shuffle(GLYPHS.slice()).slice(0, 9).forEach(function (g) {
          var c = el('button', 'abs-rc-cell', g);
          c.type = 'button';
          c.addEventListener('click', function () { c.classList.toggle('on'); });
          grid.appendChild(c);
        });
        body.appendChild(grid);
      } else if (task.type === 'spin') {
        var wrap = el('div', 'abs-rc-spin-wrap');
        var spin = el('div', 'abs-rc-spin', '🎲');
        wrap.appendChild(spin);
        var range = el('input', 'abs-rc-range');
        range.type = 'range'; range.min = '0'; range.max = '360'; range.value = '0';
        range.addEventListener('input', function () {
          spin.style.transform = 'rotate(' + range.value + 'deg)';
        });
        body.appendChild(wrap);
        body.appendChild(range);
      } else if (task.type === 'draw') {
        var canvas = document.createElement('canvas');
        canvas.className = 'abs-rc-canvas';
        canvas.width = 240; canvas.height = 240;
        var ctx = canvas.getContext('2d');
        var drawing = false;
        ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = 3;
        function pos(e) {
          var r = canvas.getBoundingClientRect();
          var p = e.touches ? e.touches[0] : e;
          return { x: p.clientX - r.left, y: p.clientY - r.top };
        }
        function down(e) {
          e.preventDefault(); drawing = true;
          var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
        }
        function move(e) {
          if (!drawing) return;
          e.preventDefault();
          var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        function up() { drawing = false; }
        canvas.addEventListener('mousedown', down);
        canvas.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        canvas.addEventListener('touchstart', down, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', up);
        body.appendChild(canvas);
      } else {
        var pts = el('div', 'abs-rc-points');
        var n = 0;
        for (var i = 0; i < 9; i++) {
          (function (i) {
            var d = el('button', 'abs-rc-point', String(i + 1));
            d.type = 'button';
            d.addEventListener('click', function () {
              n += 1;
              d.classList.add('on');
              d.textContent = String(n);
            });
            pts.appendChild(d);
          })(i);
        }
        body.appendChild(pts);
      }

      modal.querySelector('.abs-rc-reload').addEventListener('click', function () {
        task = rand(TASKS);
        render();
      });
      modal.querySelector('.abs-rc-next').addEventListener('click', next);
    }

    function next() {
      tries += 1;
      var btn = modal.querySelector('.abs-rc-next');
      btn.disabled = true;
      btn.textContent = 'Проверка…';

      post('/captcha-try', {}).then(function () {
        if (tries >= 3) {
          finish();
          return;
        }
        task = rand(TASKS);
        render('Не удалось подтвердить. Попробуй снова.');
      }).catch(function () {
        render('Сервер молчит. Попробуй снова.');
      });
    }

    // виджет
    var widget = el('div', 'abs-rc');
    widget.innerHTML =
      '<span class="abs-rc-box"></span>' +
      '<span class="abs-rc-label">Я не робот</span>' +
      '<span class="abs-rc-brand"><b>re</b>CAPTCHA<div>Privacy — Terms</div></span>';
    var wrapEl = el('div', 'abs-cookie abs-captcha');
    wrapEl.innerHTML = '<div class="abs-stamp">Проверка безопасности</div><h3>Подтверди, что ты человек</h3>';
    wrapEl.appendChild(widget);
    root.appendChild(wrapEl);

    widget.addEventListener('click', openModal);
  }

  // ================================================================ СТАРТ

  document.addEventListener('DOMContentLoaded', function () {
    offer(cookieBanner, 1000);
    offer(captchaBox, 4500);
    offer(geoBox, 9000);
    offer(emailBox, 15000);
    offer(pushNag, 21000);
  });
})();
