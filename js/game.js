/* ============================================================
   Суздаль-квиз — логика игры
   10 лотов за раунд, бегунок цены, баллы за точность,
   финальный титул: Охотник за скидками / Суздальский инсайдер / Романтик с размахом.
   ============================================================ */
(function () {
  "use strict";

  var ROUNDS = 10;
  var SLIDER_MIN = 1000;
  var SLIDER_MAX = 20000;
  var SLIDER_STEP = 100;
  var SLIDER_DEFAULT = 7000;
  var BEST_KEY = "suzdal-quiz-stays-v1-best";

  var fmt = new Intl.NumberFormat("ru-RU");
  function money(n) { return fmt.format(Math.round(n)) + " ₽"; }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  /* ---------- балльная система: до 100 за лот ---------- */
  function pointsFor(dev) { // dev — относительная ошибка |угадал − реально| / реально
    if (dev <= 0.01) return 100;
    if (dev <= 0.03) return 90;
    if (dev <= 0.05) return 80;
    if (dev <= 0.10) return 65;
    if (dev <= 0.15) return 50;
    if (dev <= 0.25) return 35;
    if (dev <= 0.40) return 15;
    return 0;
  }

  function verdictFor(dev, diff) {
    if (dev <= 0.01) return "+100 к навыку выбора жилья! Цена за сутки";
    if (dev <= 0.05) return "Сохранение почти идеальное. Цена за сутки";
    if (dev <= 0.10) return "Чутьё есть, можно собирать чемодан. Цена за сутки";
    if (dev <= 0.25) return diff < 0 ? "Режим «а если поторговаться?». Цена за сутки" : "За уют немного доплатили. Цена за сутки";
    return diff < 0 ? "Без motherlode бюджет не сошёлся. Цена за сутки" : "Кажется, мысленно уже заселились. Цена за сутки";
  }

  /* ---------- грейды за общий счёт ---------- */
  function gradeFor(score) {
    if (score >= 900) return "Можешь вести семейный чат о недвижимости";
    if (score >= 750) return "Сохранённые объявления были не зря";
    if (score >= 600) return "Внутренний риелтор одобряет";
    if (score >= 400) return "Маршрут есть. Сверим бюджет.";
    if (score >= 200) return "Пока присматриваемся";
    return "Мудлет «Предвкушение отпуска»";
  }

  /* ---------- титулы ---------- */
  var PERSONAS = {
    zhmot: {
      emoji: "🪙",
      title: "Охотник за скидками",
      text: "Ты ищешь уютный Суздаль по цене поездки из студенческих времён. Ставки чаще ниже цен из подборки. Скидки любим, но хорошие выходные тоже чего-то стоят."
    },
    boss: {
      emoji: "👑",
      title: "Суздальский инсайдер",
      text: "Ты чаще угадываешь цену ночи из подборки. Друзья уже могут доверить тебе поиск квартиры в Суздале. Только не забудь уточнить время заезда."
    },
    transzhira: {
      emoji: "💸",
      title: "Романтик с размахом",
      text: "Ты чаще ставишь выше цены из подборки. Просто уже представил воскресное утро в Суздале, кофе и никаких созвонов. Мечта отличная. Остаток бюджета оставим на завтрак."
    }
  };

  function personaFor(rounds) {
    var hit = 0, below = 0, above = 0;
    rounds.forEach(function (r) {
      if (r.dev <= 0.10) hit++;
      else if (r.diff < 0) below++;
      else above++;
    });
    if (hit >= below && hit >= above) return PERSONAS.boss;
    return below > above ? PERSONAS.zhmot : PERSONAS.transzhira;
  }

  /* ---------- экраны и элементы ---------- */
  var screens = {
    start: document.getElementById("screenStart"),
    round: document.getElementById("screenRound"),
    final: document.getElementById("screenFinal")
  };

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("hidden", k !== name);
    });
  }

  var el = {
    progress: document.getElementById("progress"),
    progressCells: document.getElementById("progressCells"),
    progressLabel: document.getElementById("progressLabel"),
    bestLine: document.getElementById("bestLine"),
    bestValue: document.getElementById("bestValue"),
    btnStart: document.getElementById("btnStart"),
    gallery: document.getElementById("gallery"),
    galPrev: document.getElementById("galPrev"),
    galNext: document.getElementById("galNext"),
    galCounter: document.getElementById("galCounter"),
    galDots: document.getElementById("galDots"),
    lotTitle: document.getElementById("lotTitle"),
    lotStreet: document.getElementById("lotStreet"),
    guessBlock: document.getElementById("guessBlock"),
    guessValue: document.getElementById("guessValue"),
    slider: document.getElementById("priceSlider"),
    btnGuess: document.getElementById("btnGuess"),
    feedbackBlock: document.getElementById("feedbackBlock"),
    fbVerdict: document.getElementById("fbVerdict"),
    fbReal: document.getElementById("fbReal"),
    fbGuess: document.getElementById("fbGuess"),
    fbDiff: document.getElementById("fbDiff"),
    fbPoints: document.getElementById("fbPoints"),
    fbLink: document.getElementById("fbLink"),
    btnNext: document.getElementById("btnNext"),
    finalScore: document.getElementById("finalScore"),
    finalBarFill: document.getElementById("finalBarFill"),
    finalGrade: document.getElementById("finalGrade"),
    personaEmoji: document.getElementById("personaEmoji"),
    personaTitle: document.getElementById("personaTitle"),
    personaText: document.getElementById("personaText"),
    finalStats: document.getElementById("finalStats"),
    roundsList: document.getElementById("roundsList"),
    btnRestart: document.getElementById("btnRestart"),
    btnShare: document.getElementById("btnShare")
  };

  /* ---------- состояние ---------- */
  var state = { order: [], idx: 0, score: 0, rounds: [] };

  /* ---------- игровые лоты с иллюстрациями и ценой ---------- */
  function activeApartments() {
    return (window.APARTMENTS || []).filter(function (a) {
      return a.price > 0 && a.photos && a.photos.length > 0;
    });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------- прогресс-бар ---------- */
  function buildProgress() {
    el.progressCells.innerHTML = "";
    for (var i = 0; i < ROUNDS; i++) el.progressCells.appendChild(document.createElement("i"));
    updateProgress();
  }

  function updateProgress() {
    var cells = el.progressCells.children;
    for (var i = 0; i < cells.length; i++) {
      cells[i].className = i < state.idx ? "done" : i === state.idx ? "now" : "";
    }
    el.progressLabel.textContent = "Лот " + Math.min(state.idx + 1, ROUNDS) + " из " + ROUNDS;
  }

  /* ---------- старт ---------- */
  function startGame() {
    var pool = activeApartments();
    if (pool.length < ROUNDS) {
      alert("Для игры нужно не меньше десяти лотов.");
      return;
    }
    state.order = shuffle(pool).slice(0, ROUNDS);
    state.idx = 0;
    state.score = 0;
    state.rounds = [];

    el.progress.classList.remove("hidden");
    buildProgress();
    show("round");
    renderRound();
    window.scrollTo(0, 0);
  }

  /* ---------- галерея ---------- */
  function renderGallery(apt) {
    el.gallery.innerHTML = "";
    el.galDots.innerHTML = "";

    apt.photos.forEach(function (src, i) {
      var img = document.createElement("img");
      img.onerror = function () { this.onerror = null; this.src = "img/photo-unavailable.svg"; };
      img.src = src;
      img.alt = "Фото " + (i + 1) + " — " + apt.desc;
      img.loading = i === 0 ? "eager" : "lazy";
      img.decoding = "async";
      el.gallery.appendChild(img);

      var dot = document.createElement("i");
      if (i === 0) dot.classList.add("active");
      dot.addEventListener("click", function () {
        el.gallery.scrollTo({ left: i * el.gallery.clientWidth, behavior: "smooth" });
      });
      el.galDots.appendChild(dot);
    });

    el.galCounter.textContent = "1/" + apt.photos.length;
  }

  function galleryIndex() {
    return Math.round(el.gallery.scrollLeft / Math.max(el.gallery.clientWidth, 1));
  }

  function syncGalleryUI() {
    var i = galleryIndex();
    var dots = el.galDots.children;
    for (var k = 0; k < dots.length; k++) dots[k].classList.toggle("active", k === i);
    el.galCounter.textContent = Math.min(i + 1, dots.length) + "/" + dots.length;
  }

  function galleryStep(dir) {
    var i = Math.min(Math.max(galleryIndex() + dir, 0), el.gallery.children.length - 1);
    el.gallery.scrollTo({ left: i * el.gallery.clientWidth, behavior: "smooth" });
  }

  /* ---------- бегунок ---------- */
  function updateSliderUI() {
    var v = Number(el.slider.value);
    el.guessValue.textContent = money(v);
    var pct = ((v - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
    el.slider.style.setProperty("--fill", pct + "%");
  }

  /* ---------- экран лота ---------- */
  function renderRound() {
    var apt = state.order[state.idx];
    updateProgress();

    renderGallery(apt);
    el.lotTitle.textContent = apt.desc;
    el.lotStreet.textContent = (apt.street ? apt.street + ", " : "") + "Суздаль";

    el.slider.min = SLIDER_MIN;
    el.slider.max = SLIDER_MAX;
    el.slider.step = SLIDER_STEP;
    el.slider.value = SLIDER_DEFAULT;
    updateSliderUI();

    el.guessBlock.classList.remove("hidden");
    el.feedbackBlock.classList.add("hidden");
    el.btnNext.textContent = state.idx === ROUNDS - 1 ? "Узнать свой жизненный навык" : "Посмотрим ещё вариант →";
  }

  /* ---------- оценка ---------- */
  function onGuess() {
    if (el.guessBlock.classList.contains("hidden")) return;
    var apt = state.order[state.idx];
    var guess = Number(el.slider.value);
    var real = apt.price;
    var diff = guess - real;           // + переплата, − экономия
    var dev = Math.abs(diff) / real;   // относительная ошибка
    var pts = pointsFor(dev);

    state.rounds.push({ apt: apt, guess: guess, real: real, diff: diff, dev: dev, pts: pts });
    state.score += pts;

    el.fbVerdict.textContent = verdictFor(dev, diff);
    el.fbReal.textContent = money(real);
    el.fbGuess.textContent = money(guess);

    var pct = Math.round(dev * 100);
    el.fbDiff.textContent = (diff > 0 ? "+" : diff < 0 ? "−" : "") + fmt.format(Math.abs(diff)) + " ₽ · " + pct + "%";
    el.fbDiff.className = diff > 0 ? "up" : diff < 0 ? "down" : "";

    el.fbPoints.textContent = "+" + pts;
    el.fbPoints.className = "pts";
    el.fbLink.href = apt.url;

    el.guessBlock.classList.add("hidden");
    el.feedbackBlock.classList.remove("hidden");

    state.idx++; // лот сыгран
    updateProgress();
    el.btnNext.scrollIntoView({ block: "nearest", behavior: "smooth" });

    if (navigator.vibrate) navigator.vibrate(12);
  }

  function onNext() {
    if (state.idx >= ROUNDS) renderFinal();
    else { renderRound(); window.scrollTo(0, 0); }
  }

  /* ---------- итоги ---------- */
  function renderFinal() {
    show("final");
    el.progress.classList.add("hidden");
    window.scrollTo(0, 0);

    var max = ROUNDS * 100;
    el.finalScore.innerHTML = state.score + '<span class="of"> / ' + max + "</span>";
    setTimeout(function () {
      el.finalBarFill.style.width = (state.score / max * 100) + "%";
    }, 80);
    el.finalGrade.textContent = gradeFor(state.score);

    var p = personaFor(state.rounds);
    el.personaEmoji.textContent = p.emoji;
    el.personaTitle.textContent = p.title;
    el.personaText.textContent = p.text;

    /* переплата / занижение / средняя ошибка / рекорд */
    var overpay = 0, underpay = 0, devSum = 0;
    state.rounds.forEach(function (r) {
      if (r.diff > 0) overpay += r.diff;
      else underpay += -r.diff;
      devSum += r.dev;
    });
    var avgDev = Math.round(devSum / state.rounds.length * 100);

    var best = Number(localStorage.getItem(BEST_KEY) || 0);
    var isNewRecord = state.score > best;
    if (isNewRecord) {
      best = state.score;
      localStorage.setItem(BEST_KEY, String(best));
    }

    el.finalStats.innerHTML =
      stat("Сумма переплаты", money(overpay)) +
      stat("Сумма занижения", money(underpay)) +
      stat("Средняя ошибка", avgDev + "%") +
      stat(isNewRecord ? "Новый рекорд!" : "Рекорд", best + " " + plural(best, "балл", "балла", "баллов"));

    /* список лотов */
    el.roundsList.innerHTML = "";
    state.rounds.forEach(function (r, i) {
      var row = document.createElement("div");
      row.className = "round-item";

      var img = document.createElement("img");
      img.onerror = function () { this.onerror = null; this.src = "img/photo-unavailable.svg"; };
      img.src = r.apt.photos[0];
      img.alt = "";
      img.loading = "lazy";

      var info = document.createElement("div");
      info.className = "round-info";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = (i + 1) + ". " + r.apt.desc;
      var prices = document.createElement("div");
      prices.className = "prices";
      prices.textContent = "ты: " + fmt.format(r.guess) + " ₽ → в подборке: " + fmt.format(r.real) + " ₽";

      info.appendChild(name);
      info.appendChild(prices);

      var pts = document.createElement("span");
      pts.className = "round-pts";
      pts.textContent = "+" + r.pts;

      row.appendChild(img);
      row.appendChild(info);
      row.appendChild(pts);
      el.roundsList.appendChild(row);
    });
  }

  function stat(cap, value) {
    return '<div class="stat"><span class="cap">' + cap + "</span><b>" + value + "</b></div>";
  }

  /* ---------- шеринг ---------- */
  function onShare() {
    var p = personaFor(state.rounds);
    var text = "Суздаль-квиз: " + state.score + " из 1000 баллов, титул — «" + p.title + "». Угадываю цену ночи в Суздале по подборке объявлений. А ты во сколько оценишь выходные без созвонов?";
    if (navigator.share) {
      navigator.share({ title: "Суздаль-квиз", text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var old = el.btnShare.textContent;
        el.btnShare.textContent = "Скопировано ✓";
        setTimeout(function () { el.btnShare.textContent = old; }, 1600);
      }).catch(function () {});
    }
  }

  /* ---------- рекорд на старте ---------- */
  function showBest() {
    var best = Number(localStorage.getItem(BEST_KEY) || 0);
    if (best > 0) {
      el.bestLine.classList.remove("hidden");
      el.bestValue.textContent = best;
    }
  }

  /* ---------- события ---------- */
  el.btnStart.addEventListener("click", startGame);
  el.btnGuess.addEventListener("click", onGuess);
  el.btnNext.addEventListener("click", onNext);
  el.btnRestart.addEventListener("click", startGame);
  el.btnShare.addEventListener("click", onShare);
  el.slider.addEventListener("input", updateSliderUI);
  el.gallery.addEventListener("scroll", syncGalleryUI, { passive: true });
  el.galPrev.addEventListener("click", function () { galleryStep(-1); });
  el.galNext.addEventListener("click", function () { galleryStep(1); });

  updateSliderUI();
  showBest();
})();
