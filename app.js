(function () {
  'use strict';

  var QUESTIONS_PER_GAME = 12;
  var SECONDS_PER_QUESTION = 20;
  var MAX_TF_PER_GAME = 3;       // pocas de verdadero/falso por partida
  var MAX_PER_TOPIC = 2;         // variedad de temas
  var ADMIN_NAME = 'lorenzo olocco';
  var LS = { name: 'dat_name', unit: 'dat_unit', seen: 'dat_seen_v3', history: 'dat_history_v3', mute: 'dat_mute' };

  var BANK = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];

  /* ── Utilidades ── */
  function $(id) { return document.getElementById(id); }
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('es-AR'); }
  function cleanName(s) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function isAdmin(name) { return cleanName(name).toLowerCase() === ADMIN_NAME; }
  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  /* Confirmación propia con promesa */
  function confirmBox(title, text, okLabel) {
    return new Promise(function (resolve) {
      var m = $('modal');
      $('modal-title').textContent = title;
      $('modal-text').textContent = text;
      $('modal-ok').textContent = okLabel || 'Aceptar';
      m.hidden = false;
      function close(v) {
        m.hidden = true;
        $('modal-ok').onclick = null; $('modal-cancel').onclick = null; m.onclick = null;
        resolve(v);
      }
      $('modal-ok').onclick = function () { close(true); };
      $('modal-cancel').onclick = function () { close(false); };
      m.onclick = function (ev) { if (ev.target === m) close(false); };
      $('modal-cancel').focus();
    });
  }

  /* ── Sonido corto generado (sin archivos) ── */
  var audioCtx = null;
  function beep(kind) {
    if (lsGet(LS.mute, false)) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var notes = kind === 'ok' ? [660, 880] : kind === 'bad' ? [220, 165] : [520];
      notes.forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        var t0 = audioCtx.currentTime + i * 0.09;
        o.type = kind === 'bad' ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0); o.stop(t0 + 0.18);
      });
    } catch (e) {}
  }

  /* ── Pantallas ── */
  var currentScreen = 'screen-home';
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(id).classList.add('active');
    currentScreen = id;
    window.scrollTo(0, 0);
  }

  /* ── Armado de la partida ── */
  function pickQuestions(unit) {
    var pool = BANK.filter(function (q) { return unit === 'all' || String(q.u) === String(unit); });
    var seen = lsGet(LS.seen, []);
    if (!Array.isArray(seen)) seen = [];

    // Primero las que todavía no salieron; cuando no alcanzan, se vuelve a empezar.
    var unseen = pool.filter(function (q) { return seen.indexOf(q.id) === -1; });
    if (unseen.length < QUESTIONS_PER_GAME) {
      var poolIds = pool.map(function (q) { return q.id; });
      seen = seen.filter(function (id) { return poolIds.indexOf(id) === -1; });
      unseen = pool.slice();
    }

    var quota = null;
    if (unit === 'all') {
      var n4 = unseen.filter(function (q) { return q.u === 4; }).length;
      var n5 = unseen.length - n4;
      var q4 = Math.round(QUESTIONS_PER_GAME * 0.55);
      q4 = Math.min(q4, n4);
      var q5 = Math.min(QUESTIONS_PER_GAME - q4, n5);
      q4 = Math.min(n4, QUESTIONS_PER_GAME - q5);
      quota = { 4: q4, 5: q5 };
    }

    var shuffled = shuffle(unseen);
    var chosen = [], tf = 0, topics = {}, perUnit = { 4: 0, 5: 0 };
    shuffled.forEach(function (q) {
      if (chosen.length >= QUESTIONS_PER_GAME) return;
      if (quota && perUnit[q.u] >= quota[q.u]) return;
      if (q.tf && tf >= MAX_TF_PER_GAME) return;
      if ((topics[q.t] || 0) >= MAX_PER_TOPIC) return;
      chosen.push(q);
      if (q.tf) tf++;
      topics[q.t] = (topics[q.t] || 0) + 1;
      perUnit[q.u]++;
    });
    if (chosen.length < QUESTIONS_PER_GAME) {
      // Si las reglas de variedad no alcanzan, completar con cualquiera.
      var ids = chosen.map(function (q) { return q.id; });
      shuffled.forEach(function (q) {
        if (chosen.length < QUESTIONS_PER_GAME && ids.indexOf(q.id) === -1) chosen.push(q);
      });
    }

    lsSet(LS.seen, seen.concat(chosen.map(function (q) { return q.id; })));

    return shuffle(chosen).map(function (q) {
      var opts = q.tf ? ['Verdadero', 'Falso'] : shuffle([q.a].concat(q.w));
      return { src: q, options: opts, correct: opts.indexOf(q.a) };
    });
  }

  /* ── Estado de la partida ── */
  var game = null;
  var tick = null;

  function newGame(name, unit) {
    return {
      name: name, unit: unit,
      questions: pickQuestions(unit),
      index: 0, score: 0, correct: 0, streak: 0, bestStreak: 0,
      results: [],             // por pregunta: 'ok' | 'bad'
      mistakes: [],
      phase: 'question',       // question | answered | done
      deadline: 0, startedAt: Date.now(), id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    };
  }

  function startGame() {
    var nameInput = $('player-name');
    var name = cleanName(nameInput.value);
    if (name.length < 2) {
      nameInput.classList.add('invalid');
      $('name-error').textContent = 'Escribí tu nombre para entrar al ranking.';
      nameInput.focus();
      return;
    }
    nameInput.classList.remove('invalid');
    $('name-error').textContent = '';
    nameInput.blur();
    lsSet(LS.name, name);

    var unit = document.querySelector('.seg-btn.active').getAttribute('data-unit');
    lsSet(LS.unit, unit);

    if (!BANK.length) { toast('No se pudieron cargar las preguntas. Recargá la página.'); return; }

    game = newGame(name, unit);
    if (game.questions.length === 0) { toast('No hay preguntas para esa unidad.'); return; }
    buildSegments();
    show('screen-quiz');
    renderQuestion();
  }

  function buildSegments() {
    var s = $('segments');
    s.innerHTML = '';
    s.style.gridTemplateColumns = 'repeat(' + game.questions.length + ', 1fr)';
    game.questions.forEach(function () { s.appendChild(el('i')); });
  }
  function paintSegments() {
    var items = $('segments').children;
    for (var i = 0; i < items.length; i++) {
      items[i].className = game.results[i] || (i === game.index ? 'now' : '');
    }
  }

  function renderQuestion() {
    var item = game.questions[game.index];
    var q = item.src;
    game.phase = 'question';

    $('quiz-count').textContent = (game.index + 1) + ' / ' + game.questions.length;
    $('quiz-score').textContent = fmtNum(game.score);
    $('q-topic').textContent = 'Unidad ' + q.u + ' · ' + q.t;
    var st = $('q-streak');
    if (game.streak >= 2) { st.hidden = false; st.textContent = 'Racha x' + game.streak; } else { st.hidden = true; }
    $('q-text').textContent = q.q;
    paintSegments();

    var box = $('options');
    box.innerHTML = '';
    box.classList.toggle('tf', !!q.tf);
    var keys = ['A', 'B', 'C', 'D', 'E'];
    item.options.forEach(function (text, i) {
      var b = el('button', 'opt');
      b.type = 'button';
      b.setAttribute('data-i', String(i));
      b.appendChild(el('span', 'key', keys[i]));
      b.appendChild(el('span', 'lbl', text));
      box.appendChild(b);
    });

    $('feedback').hidden = true;
    $('quiz-bottom').hidden = true;
    window.scrollTo(0, 0);
    startTimer();
  }

  /* El tiempo se calcula contra el reloj real: no se atrasa si el celular
     baja la frecuencia de los intervalos o si la pestaña pasa a segundo plano. */
  function startTimer() {
    stopTimer();
    $('timer').classList.remove('paused');
    game.deadline = Date.now() + SECONDS_PER_QUESTION * 1000;
    updateTimer();
    tick = setInterval(updateTimer, 100);
  }
  function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }
  function remainingMs() { return Math.max(0, game.deadline - Date.now()); }
  function updateTimer() {
    if (!game || game.phase !== 'question') return;
    var ms = remainingMs();
    var frac = ms / (SECONDS_PER_QUESTION * 1000);
    var fill = $('timer-fill');
    fill.style.transform = 'scaleX(' + frac.toFixed(4) + ')';
    fill.classList.toggle('warn', frac <= 0.5 && frac > 0.25);
    fill.classList.toggle('danger', frac <= 0.25);
    var secs = Math.ceil(ms / 1000);
    var num = $('timer-num');
    if (num.textContent !== String(secs)) {
      num.textContent = String(secs);
      if (secs <= 5 && secs > 0) beep('tick');
    }
    num.classList.toggle('danger', secs <= 5);
    if (ms <= 0) answer(-1);
  }

  function answer(choice) {
    if (!game || game.phase !== 'question') return;
    game.phase = 'answered';
    stopTimer();
    $('timer').classList.add('paused');

    var item = game.questions[game.index];
    var ok = choice === item.correct;
    var ms = remainingMs();
    var gained = 0;

    if (ok) {
      game.streak++;
      game.bestStreak = Math.max(game.bestStreak, game.streak);
      game.correct++;
      var speed = Math.round((ms / (SECONDS_PER_QUESTION * 1000)) * 100);
      var streakBonus = Math.min(100, (game.streak - 1) * 25);
      gained = 100 + speed + streakBonus;
      game.score += gained;
      beep('ok'); vibrate(30);
    } else {
      game.streak = 0;
      game.mistakes.push({ q: item.src, chosen: choice >= 0 ? item.options[choice] : null });
      beep('bad'); vibrate([60, 40, 60]);
    }
    game.results[game.index] = ok ? 'ok' : 'bad';

    var buttons = $('options').querySelectorAll('.opt');
    buttons.forEach(function (b, i) {
      b.disabled = true;
      if (i === item.correct) b.classList.add('correct');
      else if (i === choice) b.classList.add('wrong');
      else b.classList.add('dim');
    });

    var fb = $('feedback');
    fb.className = 'feedback ' + (ok ? 'ok' : 'bad');
    $('fb-title').textContent = ok ? '¡Correcto!' : (choice < 0 ? 'Se acabó el tiempo' : 'Incorrecto');
    $('fb-points').textContent = ok ? '+' + gained : '';
    $('fb-answer').textContent = ok ? '' : 'Respuesta correcta: ' + item.src.a;
    $('fb-text').textContent = item.src.e;
    fb.hidden = false;

    var scoreBox = document.querySelector('.quiz-score');
    $('quiz-score').textContent = fmtNum(game.score);
    if (ok) { scoreBox.classList.remove('bump'); void scoreBox.offsetWidth; scoreBox.classList.add('bump'); }
    paintSegments();

    var isLast = game.index >= game.questions.length - 1;
    $('btn-next').textContent = isLast ? 'Ver resultado' : 'Siguiente';
    $('quiz-bottom').hidden = false;
    // Dejar a la vista la explicación sin tapar las opciones.
    setTimeout(function () {
      try { fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
    }, 60);
  }

  var nextLock = false;
  function next() {
    if (!game || game.phase !== 'answered' || nextLock) return;
    nextLock = true;
    setTimeout(function () { nextLock = false; }, 350); // evita saltear dos preguntas con doble toque
    if (game.index < game.questions.length - 1) {
      game.index++;
      renderQuestion();
    } else {
      finish();
    }
  }

  async function quit() {
    if (!game || game.phase === 'done') { show('screen-home'); return; }
    var ok = await confirmBox('¿Salir de la partida?', 'Vas a perder el progreso de esta partida y no va a entrar al ranking.', 'Salir');
    if (!ok) return;
    stopTimer();
    game.phase = 'done';
    show('screen-home');
  }

  /* ── Resultado ── */
  function verdict(pct) {
    if (pct === 100) return '¡Perfecto!';
    if (pct >= 80) return 'Excelente';
    if (pct >= 60) return 'Aprobado';
    if (pct >= 40) return 'Casi, falta repasar';
    return 'A repasar';
  }

  function finish() {
    stopTimer();
    game.phase = 'done';
    var total = game.questions.length;
    var pct = Math.round((game.correct / total) * 100);
    var seconds = Math.round((Date.now() - game.startedAt) / 1000);

    $('res-name').textContent = game.name;
    $('res-title').textContent = verdict(pct);
    $('res-score').textContent = fmtNum(game.score);
    $('res-correct').textContent = game.correct + '/' + total;
    $('res-streak').textContent = String(game.bestStreak);
    $('res-time').textContent = seconds >= 60 ? Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's' : seconds + 's';

    var list = $('review-list');
    list.innerHTML = '';
    $('res-err-count').textContent = game.mistakes.length ? game.mistakes.length + (game.mistakes.length === 1 ? ' pregunta' : ' preguntas') : '';
    if (!game.mistakes.length) {
      list.appendChild(el('p', 'review-empty', 'No tuviste errores. ¡Muy bien!'));
    } else {
      game.mistakes.forEach(function (m) {
        var box = el('div', 'review-item');
        box.appendChild(el('p', 'rq', m.q.q));
        box.appendChild(el('p', 'ry', m.chosen ? 'Elegiste: ' + m.chosen : 'Sin responder (tiempo agotado)'));
        box.appendChild(el('p', 'rc', 'Correcta: ' + m.q.a));
        box.appendChild(el('p', 're', m.q.e));
        list.appendChild(box);
      });
    }

    var entry = {
      id: game.id, name: game.name, correctCount: game.correct, totalQuestions: total,
      score: game.score, timeTaken: seconds, unit: game.unit, date: new Date().toISOString().slice(0, 10)
    };
    var history = lsGet(LS.history, []);
    if (!Array.isArray(history)) history = [];
    history.push(entry);
    history.sort(sortScores);
    lsSet(LS.history, history.slice(0, 20));

    $('admin-bar-res').hidden = !isAdmin(game.name);
    show('screen-results');
    vibrate(pct >= 60 ? [40, 60, 40] : 80);
    submitScore(entry);
  }

  function sortScores(a, b) {
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    if (b.score !== a.score) return b.score - a.score;
    return (a.timeTaken || 0) - (b.timeTaken || 0);
  }

  /* ── Ranking ── */
  var lastRanking = [];
  var myEntryId = null;

  async function api(method, body) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    try {
      var res = await fetch('/api/scores', {
        method: method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ('Error ' + res.status));
      return data;
    } finally { clearTimeout(to); }
  }

  async function submitScore(entry) {
    setStatus('rank-status-res', 'Guardando…');
    renderRanking('ranking-res', null, 'Cargando…');
    try {
      var data = await api('POST', entry);
      myEntryId = data.entry ? data.entry.id : null;
      lastRanking = data.topScores || [];
      setStatus('rank-status-res', data.rank ? 'Puesto ' + data.rank : 'En línea');
      renderRanking('ranking-res', lastRanking, null, isAdmin(entry.name));
    } catch (e) {
      myEntryId = entry.id;
      setStatus('rank-status-res', 'Sin conexión');
      renderRanking('ranking-res', lsGet(LS.history, []), 'Todavía no hay partidas.', false, true);
    }
  }

  async function openRanking() {
    show('screen-ranking');
    setStatus('rank-status', 'Cargando…');
    renderRanking('ranking-main', null, 'Cargando…');
    renderRanking('ranking-local', lsGet(LS.history, []).slice(0, 10), 'Todavía no jugaste en este celular.', false, true);
    try {
      var data = await api('GET');
      lastRanking = data.topScores || [];
      setStatus('rank-status', 'En línea');
      renderRanking('ranking-main', lastRanking, 'Nadie jugó todavía. ¡Estrenalo!');
    } catch (e) {
      setStatus('rank-status', 'Sin conexión');
      renderRanking('ranking-main', [], 'No se pudo cargar el ranking. Revisá la conexión.');
    }
  }

  function setStatus(id, text) { $(id).textContent = text; }

  function renderRanking(id, list, emptyText, adminMode, localOnly) {
    var ol = $(id);
    ol.innerHTML = '';
    if (!list || !list.length) {
      var li = el('li', 'empty', emptyText || 'Sin datos.');
      ol.appendChild(li);
      return;
    }
    list.slice(0, 15).forEach(function (item, i) {
      var li = el('li');
      if (item.id && item.id === myEntryId && !localOnly) li.classList.add('me');
      li.appendChild(el('span', 'pos', String(i + 1)));
      var who = el('div', 'who');
      var nm = el('div', 'nm', item.name);
      if (li.classList.contains('me')) nm.appendChild(el('span', 'you', 'VOS'));
      who.appendChild(nm);
      var unitTxt = item.unit === '4' ? ' · Unidad 4' : item.unit === '5' ? ' · Unidad 5' : '';
      who.appendChild(el('div', 'sub', (item.correctCount || 0) + '/' + (item.totalQuestions || 12) + ' aciertos' + unitTxt));
      li.appendChild(who);
      li.appendChild(el('span', 'pts', fmtNum(item.score)));
      if (adminMode) {
        var del = el('button', 'btn-mini danger', 'Borrar');
        del.type = 'button';
        del.setAttribute('aria-label', 'Borrar el resultado de ' + item.name);
        del.onclick = function () { adminDelete(item); };
        li.appendChild(del);
      }
      ol.appendChild(li);
    });
  }

  async function adminDelete(item) {
    if (!game || !isAdmin(game.name)) return;
    var ok = await confirmBox('Borrar resultado', '¿Borrar el resultado de ' + item.name + '?', 'Borrar');
    if (!ok) return;
    try {
      var data = await api('DELETE', { id: item.id, adminName: game.name });
      lastRanking = data.topScores || [];
      renderRanking('ranking-res', lastRanking, 'El ranking quedó vacío.', true);
      toast('Resultado borrado');
    } catch (e) { toast('No se pudo borrar: ' + e.message); }
  }

  async function adminClear() {
    if (!game || !isAdmin(game.name)) return;
    var ok = await confirmBox('Vaciar ranking', 'Se van a borrar todos los resultados del ranking. No se puede deshacer.', 'Borrar todo');
    if (!ok) return;
    try {
      await api('DELETE', { clearAll: true, adminName: game.name });
      lastRanking = [];
      renderRanking('ranking-res', [], 'El ranking quedó vacío.', true);
      toast('Ranking vaciado');
    } catch (e) { toast('No se pudo vaciar: ' + e.message); }
  }

  async function share() {
    if (!game) return;
    var text = 'Hice ' + fmtNum(game.score) + ' puntos en Derecho al Toque (' + game.correct + '/' + game.questions.length + ' aciertos). ¿Me superás?';
    var url = location.origin + location.pathname;
    try {
      if (navigator.share) { await navigator.share({ title: 'Derecho al Toque', text: text, url: url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      await navigator.clipboard.writeText(text + ' ' + url);
      toast('Resultado copiado');
    } catch (e) { toast(text); }
  }

  /* ── Eventos ── */
  function init() {
    $('player-name').value = lsGet(LS.name, '') || '';
    var unit = lsGet(LS.unit, 'all');
    selectUnit(['all', '4', '5'].indexOf(unit) >= 0 ? unit : 'all');

    var n4 = BANK.filter(function (q) { return q.u === 4; }).length;
    var n5 = BANK.length - n4;
    $('bank-info').textContent = BANK.length + ' preguntas en total · ' + n4 + ' de la Unidad 4 y ' + n5 + ' de la Unidad 5';

    $('unit-picker').addEventListener('click', function (ev) {
      var b = ev.target.closest('.seg-btn');
      if (b) selectUnit(b.getAttribute('data-unit'));
    });
    $('player-name').addEventListener('input', function () {
      this.classList.remove('invalid'); $('name-error').textContent = '';
    });
    $('player-name').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') startGame(); });
    $('btn-play').addEventListener('click', startGame);
    $('btn-open-ranking').addEventListener('click', openRanking);
    $('btn-rank-back').addEventListener('click', function () { show('screen-home'); });

    // Un solo manejador para las opciones: no se acumulan eventos entre preguntas.
    $('options').addEventListener('click', function (ev) {
      var b = ev.target.closest('.opt');
      if (!b || b.disabled) return;
      answer(parseInt(b.getAttribute('data-i'), 10));
    });
    $('btn-next').addEventListener('click', next);
    $('btn-quit').addEventListener('click', quit);

    $('btn-again').addEventListener('click', function () { show('screen-home'); startGame(); });
    $('btn-home').addEventListener('click', function () { show('screen-home'); });
    $('btn-share').addEventListener('click', share);
    document.querySelectorAll('[data-admin-clear]').forEach(function (b) { b.addEventListener('click', adminClear); });

    // Al volver a la app, revisar si el tiempo venció mientras estaba en segundo plano.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && game && game.phase === 'question') updateTimer();
    });

    // Evitar perder la partida por un "atrás" accidental del celular.
    window.addEventListener('beforeunload', function (ev) {
      if (game && game.phase !== 'done' && currentScreen === 'screen-quiz') { ev.preventDefault(); ev.returnValue = ''; }
    });

    // Limpiar el service worker viejo (versión de GitHub Pages) si quedó instalado.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
      if (window.caches && caches.keys) {
        caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); }).catch(function () {});
      }
    }
  }

  function selectUnit(unit) {
    document.querySelectorAll('.seg-btn').forEach(function (b) {
      var on = b.getAttribute('data-unit') === unit;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  // Expuesto sólo para las pruebas automáticas.
  window.__trivia = { pickQuestions: pickQuestions, getGame: function () { return game; } };

  init();
})();
