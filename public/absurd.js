(function () {
  'use strict';

  var BODY = document.body;
  var CSRF = BODY.getAttribute('data-csrf') || '';
  var root = document.createElement('div');
  root.id = 'abs-overlays';
  document.body.appendChild(root);

  // ---------------------------------------------------------------- очередь
  // Окна показываются строго по одному: пока открыто одно, другое ждёт.
  var busy = false;

  window.absClaim = function () { busy = true; };
  window.absRelease = function () { busy = false; };

  function offer(show, delay) {
    function attempt() {
      if (busy) {
        setTimeout(attempt, 700);
        return;
      }
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

  function post(url, data) {
    var body = new URLSearchParams(data);
    body.set('_csrf', CSRF);
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }

  function dismiss(box, done) {
    box.classList.add('abs-out');
    setTimeout(function () {
      box.remove();
      if (done) done();
    }, 380);
  }

  // ---------------------------------------------------------------- COOKIE

  function cookieBanner(done) {
    if (localStorage.getItem('abs-cookie')) { done(); return; }
    var box = el('div', 'abs-cookie');
    box.innerHTML =
      '<div class="abs-stamp">ОФИЦИАЛЬНО</div>' +
      '<h3>Согласие на обработку cookie</h3>' +
      '<p>Мы собираем, храним, копируем и продаём твои данные на чёрный рынок. ' +
      'А ещё следим за тем, куда ты трёшь курсором, и считаем сколько раз ты дышишь.</p>' +
      '<div class="abs-btns">' +
      '<button class="abs-yes">Продавай</button>' +
      '<button class="abs-yes">Согласен</button>' +
      '<button class="abs-yes">ОК</button>' +
      '<button class="abs-yes">Подтвердить</button>' +
      '<button class="abs-yes">не хочу но давай</button>' +
      '</div>' +
      '<a class="abs-refuse" href="#">Отклонить</a>';
    root.appendChild(box);

    function doneCookie(value) {
      localStorage.setItem('abs-cookie', value);
      dismiss(box, done);
    }
    Array.prototype.forEach.call(box.querySelectorAll('.abs-yes'), function (b) {
      b.addEventListener('click', function () { doneCookie('yes'); });
    });
    box.querySelector('.abs-refuse').addEventListener('click', function (e) {
      e.preventDefault();
      doneCookie('no');
    });
  }

  // ---------------------------------------------------------------- ГЕО

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
        ['ip', 'country', 'city', 'provider'].forEach(function (k) {
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

  // ---------------------------------------------------------------- ПУШ

  function pushNag(done) {
    if (localStorage.getItem('abs-push')) { done(); return; }
    var box = el('div', 'abs-push');
    box.innerHTML =
      '<div class="abs-push-icon">🔔</div>' +
      '<div class="abs-push-text"><b>' + location.host + '</b> хочет присылать вам уведомления</div>' +
      '<div class="abs-push-btns">' +
      '<button class="abs-push-no">Запретить</button>' +
      '<button class="abs-push-yes">Разрешить</button>' +
      '</div>';
    root.appendChild(box);

    box.querySelector('.abs-push-no').addEventListener('click', function () {
      dismiss(box, function () {
        done();
        offer(pushNag, 20000);
      });
    });
    box.querySelector('.abs-push-yes').addEventListener('click', function () {
      localStorage.setItem('abs-push', 'yes');
      dismiss(box, function () {
        done();
        if (typeof window.absShowAd === 'function') window.absShowAd();
      });
    });
  }

  // ---------------------------------------------------------------- EMAIL

  function emailBox(done) {
    if (localStorage.getItem('abs-mail')) { done(); return; }
    var box = el('div', 'abs-mail');
    box.innerHTML =
      '<div class="abs-mail-card">' +
      '<button class="abs-mail-close" type="button" aria-label="Закрыть">✕</button>' +
      '<div class="abs-stamp">Специальное предложение</div>' +
      '<h3>Скидка 99% на вечный доступ</h3>' +
      '<p>Оставь почту — пришлём письмо.</p>' +
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
    function dodge() {
      closeBtn.style.top = (14 + Math.random() * 55) + '%';
      closeBtn.style.left = (14 + Math.random() * 60) + '%';
      closeBtn.style.right = 'auto';
    }
    closeBtn.addEventListener('mouseenter', dodge);
    closeBtn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      dodge();
    }, { passive: false });
    closeBtn.addEventListener('click', close);

    box.querySelector('.abs-mail-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var data = {
        email: form.email.value,
        consent: form.consent.checked ? 'yes' : '',
        website: form.website.value
      };
      post('/newsletter', data).then(function (res) {
        var msg = box.querySelector('.abs-mail-msg');
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

  // ---------------------------------------------------------------- СТАРТ

  document.addEventListener('DOMContentLoaded', function () {
    offer(cookieBanner, 500);
    offer(geoBox, 7000);
    offer(emailBox, 16000);
    offer(pushNag, 22000);
  });
})();
