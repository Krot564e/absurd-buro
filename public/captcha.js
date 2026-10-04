(function () {
  'use strict';

  var TASKS = [
    { type: 'grid', title: 'Выберите все квадратные круги' },
    { type: 'grid', title: 'Выберите все картинки, на которых понедельник' },
    { type: 'grid', title: 'Нажмите на зелёный красный квадрат' },
    { type: 'spin', title: 'Поверните кубик так, чтобы он стоял ровно' },
    { type: 'draw', title: 'Нарисуйте квадратный круг' },
    { type: 'connect', title: 'Соедините точки в порядке их отсутствия' },
    { type: 'grid', title: 'Подтвердите, что вы не робот. Роботы тоже подтверждают' },
    { type: 'spin', title: 'Установите шкалу в положение «среднее»' }
  ];

  var GLYPHS = ['🦆', '🪑', '🍋', '⚙️', '🎩', '🧦', '🪵', '🧿', '🍟', '🧲', '🎲', '🫧', '🐚', '🪁', '🌽'];

  var slots = document.querySelectorAll('[data-abs-captcha]');
  if (!slots.length) return;

  var csrf = (document.body.getAttribute('data-csrf') || '');

  function tryServer() {
    var body = new URLSearchParams();
    body.set('_csrf', csrf);
    return fetch('/captcha-try', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body
    }).then(function (r) { return r.json(); });
  }

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function buildGrid(grid) {
    grid.innerHTML = '';
    var glyphs = shuffle(GLYPHS.slice()).slice(0, 9);
    glyphs.forEach(function (g) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'abs-rc-cell';
      c.textContent = g;
      c.addEventListener('click', function () { c.classList.toggle('on'); });
      grid.appendChild(c);
    });
  }

  function buildSpin(stage) {
    stage.innerHTML =
      '<div class="abs-rc-spin-wrap"><div class="abs-rc-spin">⬜</div></div>' +
      '<input type="range" min="0" max="360" value="0" class="abs-rc-range">';
    var range = stage.querySelector('.abs-rc-range');
    var spin = stage.querySelector('.abs-rc-spin');
    range.addEventListener('input', function () {
      spin.style.transform = 'rotate(' + range.value + 'deg)';
    });
  }

  function buildDraw(stage) {
    stage.innerHTML = '<canvas class="abs-rc-canvas" width="260" height="260"></canvas>';
    var canvas = stage.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var drawing = false;
    ctx.strokeStyle = '#1f1b16';
    ctx.lineWidth = 3;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    }
    function down(e) {
      e.preventDefault();
      drawing = true;
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    function up() { drawing = false; }
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', up);
  }

  function buildConnect(stage) {
    stage.innerHTML = '<div class="abs-rc-points"></div>';
    var box = stage.querySelector('.abs-rc-points');
    var n = 0;
    for (var i = 0; i < 9; i++) {
      (function (i) {
        var d = document.createElement('button');
        d.type = 'button';
        d.className = 'abs-rc-point';
        d.textContent = i + 1;
        d.addEventListener('click', function () {
          n++;
          d.classList.add('on');
          d.textContent = n;
        });
        box.appendChild(d);
      })(i);
    }
  }

  function makeWidget(slot) {
    var hidden = slot.querySelector('input[type="hidden"]');
    var widget = document.createElement('div');
    widget.className = 'abs-rc';
    widget.innerHTML =
      '<span class="abs-rc-box"></span>' +
      '<span class="abs-rc-label">Я не робот</span>' +
      '<span class="abs-rc-brand"><b>re</b>CAPTCHA<div>Privacy — Terms</div></span>';
    slot.appendChild(widget);

    var modal = null;
    var task = null;
    var tries = 0;

    function close() {
      if (modal) { modal.remove(); modal = null; }
    }

    function open() {
      task = rand(TASKS);
      tries = 0;
      render();
    }

    function render(failMsg) {
      if (!modal) {
        modal = document.createElement('div');
        modal.className = 'abs-rc-modal';
        document.body.appendChild(modal);
      }
      var title = task.type === 'grid' ? task.title : task.title;
      modal.innerHTML =
        '<div class="abs-rc-card">' +
        '<div class="abs-rc-head">' +
        '<div class="abs-rc-head-title">' + title + '</div>' +
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
        var grid = document.createElement('div');
        grid.className = 'abs-rc-grid';
        body.appendChild(grid);
        buildGrid(grid);
      } else if (task.type === 'spin') {
        buildSpin(body);
      } else if (task.type === 'draw') {
        buildDraw(body);
      } else {
        buildConnect(body);
      }

      modal.querySelector('.abs-rc-reload').addEventListener('click', function () {
        task = rand(TASKS);
        render();
      });
      modal.querySelector('.abs-rc-next').addEventListener('click', next);
    }

    function next() {
      var btn = modal && modal.querySelector('.abs-rc-next');
      if (btn) { btn.disabled = true; btn.textContent = 'Проверка…'; }
      tryServer().then(function (res) {
        tries = res.tries || tries + 1;
        if (res.done) {
          hidden.value = 'ok';
          widget.classList.add('abs-rc-done');
          widget.querySelector('.abs-rc-box').textContent = '✓';
          close();
          return;
        }
        task = rand(TASKS);
        render('Не удалось подтвердить. Попробуйте снова.');
      }).catch(function () {
        render('Сервер молчит. Попробуйте снова.');
      });
    }

    widget.addEventListener('click', open);
  }

  for (var i = 0; i < slots.length; i++) makeWidget(slots[i]);
})();