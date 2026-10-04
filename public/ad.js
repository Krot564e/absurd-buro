(function () {
  'use strict';

  var root = document.getElementById('abs-overlays');
  if (!root) return;

  var SKIP_AFTER = 15;
  var DODGES = 5;
  var open = false;
  var dodges = 0;

  function show() {
    if (open) return;
    open = true;
    dodges = 0;
    if (typeof window.absClaim === 'function') window.absClaim();

    var box = document.createElement('div');
    box.className = 'abs-ad';
    box.innerHTML =
      '<div class="abs-ad-bar">Реклама · Пропустить невозможно</div>' +
      '<div class="abs-ad-video">' +
      '<video src="/public/ad-video.mp4" autoplay loop playsinline muted></video>' +
      '</div>' +
      '<div class="abs-ad-foot">' +
      '<span class="abs-ad-brand">Моющее средство БАРС · Грязь не пройдёт</span>' +
      '<button type="button" class="abs-ad-skip">Пропустить через ' + SKIP_AFTER + '</button>' +
      '</div>';
    root.appendChild(box);

    var video = box.querySelector('video');
    var play = video.play();
    if (play && play.catch) play.catch(function () {});

    var skip = box.querySelector('.abs-ad-skip');
    var left = SKIP_AFTER;
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
      if (dodges > DODGES) return;
      skip.style.right = (18 + Math.random() * 52) + '%';
      skip.style.transform = 'translateY(' + (-50 + Math.random() * 30 - 15) + '%)';
    });

    skip.addEventListener('click', function () {
      clearInterval(tick);
      box.classList.add('abs-out');
      open = false;
      if (typeof window.absRelease === 'function') window.absRelease();
      setTimeout(function () { box.remove(); }, 380);
    });
  }

  window.absShowAd = show;

  document.addEventListener('DOMContentLoaded', function () {
    if (localStorage.getItem('abs-push') !== 'yes') return;
    setTimeout(function () {
      show();
      setInterval(show, 120000);
    }, 8000);
  });
})();
