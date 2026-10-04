(function () {
  'use strict';

  // ---------------------------------------------------------------- фон:
  // вечная загрузка — полоска доходит почти до конца, откатывается, снова
  var bar = document.getElementById('bar');
  var p = 0;
  var forward = true;

  setInterval(function () {
    if (forward) {
      p += Math.random() * 8;
      if (p >= 97) { p = 97; forward = false; }
    } else {
      p -= Math.random() * 14 + 4;
      if (p <= 42) { p = 42; forward = true; }
    }
    bar.style.width = p + '%';
  }, 340);

  // ---------------------------------------------------------------- 1.
  // полный экран: каждый тап/клик возвращает в fullscreen
  var wanted = false;
  var retried = false;

  function goFull() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) return;
    try {
      var r = fn.call(el);
      if (r && r.catch) r.catch(function () {});
    } catch (e) {}
  }

  function poke() {
    wanted = true;
    retried = false;
    goFull();
    var ac = window.audioCtx;
    if (ac && ac.state === 'suspended') ac.resume();
  }

  document.addEventListener('mousedown', poke, true);
  document.addEventListener('touchend', poke, true);

  document.addEventListener('fullscreenchange', function () {
    if (document.fullscreenElement || !wanted || retried) return;
    retried = true;
    setTimeout(goFull, 250);
  });

  // ---------------------------------------------------------------- 2.
  // кнопка выхода убегает от мыши и от пальца
  var exit = document.getElementById('exit');
  var dodges = 0;

  function flee() {
    dodges += 1;
    exit.style.top = Math.round(6 + Math.random() * 84) + '%';
    exit.style.left = Math.round(6 + Math.random() * 84) + '%';
    exit.style.right = 'auto';
  }

  exit.addEventListener('mouseenter', flee);
  exit.addEventListener('touchstart', function (e) {
    e.preventDefault();
    flee();
  }, { passive: false });

  exit.addEventListener('click', function () {
    if (dodges < 8) flee();
  });

  // ---------------------------------------------------------------- 3.
  // кнопка «назад» возвращает на эту же страницу
  try {
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', function () {
      history.pushState(null, '', location.href);
    });
  } catch (e) {}

  // ---------------------------------------------------------------- 4.
  // вибрация
  if (navigator.vibrate) {
    setInterval(function () {
      try { navigator.vibrate(70); } catch (e) {}
    }, 12000);
  }

  // ---------------------------------------------------------------- 5.
  // тихий писк
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      window.audioCtx = new Ctx();
      setInterval(function () {
        var ac = window.audioCtx;
        if (!ac || ac.state !== 'running') return;
        var osc = ac.createOscillator();
        var gain = ac.createGain();
        osc.type = 'sine';
        osc.frequency.value = 920;
        gain.gain.value = 0.015;
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + 0.07);
      }, 15000);
    }
  } catch (e) {}

  // ---------------------------------------------------------------- 6.
  // ложная загрузка в точке клика
  document.addEventListener('pointerdown', function (e) {
    var s = document.createElement('div');
    s.className = 'mini';
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';
    document.body.appendChild(s);
    setTimeout(function () { s.remove(); }, 1400);
  });

  // ---------------------------------------------------------------- 7.
  // случайный глюк: экран моргает инверсией
  setInterval(function () {
    document.documentElement.style.filter = 'invert(1)';
    setTimeout(function () {
      document.documentElement.style.filter = '';
    }, 120);
  }, 17000);

  // ---------------------------------------------------------------- служебное
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  // страницу загрузили не для просмотра — фиксируем одну запись в истории
  window.addEventListener('load', function () {
    try { history.replaceState(null, '', location.href); } catch (e) {}
  });
})();
