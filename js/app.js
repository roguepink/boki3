/* まなぼき 簿記3級 — 画面 */
(function () {
  'use strict';
  var B = window.BOKI, S, esc = B.esc, F = B.f;
  var $app, $nav, $sheet, $sheetBack, $toast;
  var screen = null, params = {}, stack = [];
  var W = {};          // 仕訳の入力欄の状態(key → {q, u, chips, exam})
  var Q = null;        // 今の問題の状態
  var SES = null;      // 今のセッション
  var EXAM = null;     // 模擬試験
  var LS = null;       // レッスンの状態
  var sheetCtx = null;

  /* ---------- 小さな道具 ---------- */
  function h(s) { return s; }
  function topicName(id) { var t = B.topicById(id); return t ? t.name : id; }
  function topicIcon(id) { var t = B.topicById(id); return t ? t.icon : '📘'; }
  function lvTag(lv) { return '<span class="lvTag l' + lv + '">' + (lv ? B.lvName[lv] : 'まだ') + '</span>'; }
  function qLvTag(lv) { return '<span class="lvTag l' + lv + '">' + ['', '★ 初級', '★★ 中級', '★★★ 上級'][lv] + '</span>'; }
  function toast(msg) { $toast.textContent = msg; $toast.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.classList.remove('on'); }, 1800); }
  function vib(ms) { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
  var AC = null;
  function sfx(kind) {
    if (!S.set.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var notes = { ok: [[660, 0], [880, .09]], ng: [[220, 0], [180, .12]], lv: [[523, 0], [659, .1], [784, .2], [1047, .3]], tap: [[1200, 0]] }[kind] || [];
      notes.forEach(function (n) {
        var o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + n[1];
        o.type = kind === 'ng' ? 'triangle' : 'sine'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.03 : 0.16, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'tap' ? 0.05 : 0.22));
        o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 0.25);
      });
    } catch (e) { }
  }
  function confetti() {
    var c = document.createElement('div'); c.className = 'confetti';
    var cols = ['#14b8a6', '#6366f1', '#f59e0b', '#f43f5e', '#22c55e', '#3b82f6'];
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%'; p.style.background = cols[i % cols.length];
      p.style.animationDelay = (Math.random() * 0.5) + 's'; p.style.animationDuration = (1.3 + Math.random()) + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      c.appendChild(p);
    }
    document.body.appendChild(c); setTimeout(function () { c.remove(); }, 2600);
  }
  function modal(em, title, text, btn, cb) {
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="mb"><div class="em">' + em + '</div><h2>' + esc(title) + '</h2><p>' + B.rich(text, { acc: false }) + '</p><button class="btn">' + esc(btn || 'OK') + '</button></div>';
    m.querySelector('.btn').onclick = function () { m.remove(); if (cb) cb(); };
    document.body.appendChild(m);
  }
  function confirmBox(title, text, yes, no, cb) {
    var m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="mb"><h2>' + esc(title) + '</h2><p>' + esc(text) + '</p><div class="btns2"><button class="btn sub" data-n>' + esc(no || 'やめる') + '</button><button class="btn" data-y>' + esc(yes || 'はい') + '</button></div></div>';
    m.querySelector('[data-n]').onclick = function () { m.remove(); };
    m.querySelector('[data-y]').onclick = function () { m.remove(); cb(); };
    document.body.appendChild(m);
  }
  function greet() { var hr = new Date().getHours(); return hr < 5 ? 'おつかれさまです 🌙' : hr < 11 ? 'おはようございます ☀️' : hr < 17 ? 'こんにちは' : 'おつかれさまです 🌙'; }
  function lessonsOf(id) { return B.lessons.filter(function (l) { return l.topic === id && B.inRange(l.range); }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }
  function allLessonsOrdered() {
    var out = []; B.topics.forEach(function (t) { out = out.concat(lessonsOf(t.id)); }); return out;
  }
  function nextLesson() { var l = allLessonsOrdered(); for (var i = 0; i < l.length; i++) if (!S.lessons[l[i].id]) return l[i]; return null; }
  function topicTplCount(id) { return B.templates.filter(function (t) { return t.topic === id && B.inRange(t.range); }).length; }

  /* ---------- 画面の切りかえ ---------- */
  var TABS = { home: 1, learn: 1, practice: 1, dict: 1, stats: 1 };
  function go(name, p, opt) {
    opt = opt || {};
    if (!opt.replace && screen && !TABS[name]) stack.push([screen, params]);
    if (TABS[name]) stack = [];
    screen = name; params = p || {};
    closeSheet();
    render();
    if (!opt.keepScroll) window.scrollTo(0, 0);
    try { history.pushState({ s: name }, ''); } catch (e) { }
  }
  function back() {
    if (screen === 'quiz' && Q && SES && SES.qs.length && SES.i < SES.qs.length) { quitSession(); return; }
    if (screen === 'exam' && EXAM && !EXAM.done) { confirmBox('試験をやめますか?', '答えは保存されません。', 'やめる', 'つづける', function () { EXAM = null; goHome(); }); return; }
    var p = stack.pop();
    if (p) { screen = p[0]; params = p[1]; closeSheet(); render(); window.scrollTo(0, 0); }
    else goHome();
  }
  function goHome() { stack = []; go('home'); }
  window.addEventListener('popstate', function () {
    if ($sheet.classList.contains('on')) { closeSheet(); try { history.pushState({}, ''); } catch (e) { } return; }
    if (screen === 'home') return;
    back(); try { history.pushState({}, ''); } catch (e) { }
  });

  function render() {
    var fn = VIEWS[screen] || VIEWS.home;
    var html;
    try { html = fn(params); } catch (e) { html = '<div class="scr"><div class="card">表示でエラーが出ました: ' + esc(e.message) + '</div><button class="btn" data-act="home">ホームへ</button></div>'; if (window.console) console.error(e); }
    $app.innerHTML = html;
    var showNav = !!TABS[screen];
    $nav.classList.toggle('hide', !showNav);
    if (showNav) $nav.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === screen); });
    // 帯グラフをアニメーション
    requestAnimationFrame(function () { $app.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; }); });
    if (AFTER[screen]) AFTER[screen]();
  }
  var AFTER = {};

  /* ---------- 共通の部品 ---------- */
  function topBar(title, sub, right) {
    return '<div class="top"><button class="iconBtn back" data-act="back" aria-label="もどる">‹</button><div class="grow"><h1>' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' + (right || '') + '</div>';
  }
  function tabTop(title, right) { return '<div class="top"><h1>' + esc(title) + '</h1>' + (right || '') + '</div>'; }
  function exSeg(cur, act) {
    act = act || 'exLvl';
    return '<div class="seg full lvl">' + [['s', '🧒 やさしく'], ['m', '📘 ふつう'], ['l', '🎓 くわしく']].map(function (x) { return '<button class="' + (cur === x[0] ? 'on' : '') + '" data-act="' + act + '" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
  }

  /* =========================================================
     画面たち
     ========================================================= */
  var VIEWS = {};

  /* ---------- ようこそ(はじめて) ---------- */
  VIEWS.welcome = function (p) {
    var st = p.step || 0, dots = '<div class="stepDots">' + [0, 1, 2, 3].map(function (i) { return '<i class="' + (i === st ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    if (st === 0) return '<div class="welcome">' + dots +
      '<img class="logo" src="icon-192.png" alt="">' +
      '<h1>簿記3級を、<br>スキマ時間で。</h1><p>仕事のあとの5分から。あなたのレベルに合わせて出題して、分からないところは3段階でやさしく説明します。</p>' +
      '<div class="feat"><div><span class="fi">🎯</span><span><b>レベルに合わせて出題</b><br>解くほど、少しずつ難しく</span></div>' +
      '<div><span class="fi">🧒</span><span><b>説明は3段階</b><br>「小学生でもわかる」から「試験・実務のくわしい話」まで</span></div>' +
      '<div><span class="fi">🔁</span><span><b>まちがえた所が また出る</b><br>忘れたころに復習して、しっかり定着</span></div>' +
      '<div><span class="fi">💼</span><span><b>会社の経理でも使える</b><br>請求書・給料・交通費など実務の取引も</span></div></div>' +
      '<div style="flex:1"></div><button class="btn" data-act="wStep" data-v="1">はじめる</button></div>';
    if (st === 1) return '<div class="welcome">' + dots + '<h1>いつごろ受けますか?</h1><p>2027年4月から試験の範囲が少し変わります。合わせて出題します(あとで変えられます)。</p>' +
      '<div class="choice">' +
      chooseBtn('range', 'old', '📅', '2027年3月までに受ける', '今の範囲(手形もふくむ)') +
      chooseBtn('range', 'new', '🆕', '2027年4月以降に受ける', '新しい範囲(手形なし。定率法・除却などが増える)') +
      chooseBtn('range', 'all', '💼', 'まだ決めていない・実務のため', '両方の範囲を全部学ぶ') +
      '</div><div style="flex:1"></div><button class="btn mt16" data-act="wStep" data-v="2">つぎへ</button></div>';
    if (st === 2) return '<div class="welcome">' + dots + '<h1>説明の くわしさは?</h1><p>答えのあとの説明の、最初に出す くわしさです。説明を読みながら、いつでも切りかえられます。</p>' +
      '<div class="choice">' +
      chooseBtn('exp', 's', '🧒', 'やさしく', '小学生でも分かるように、たとえ話で') +
      chooseBtn('exp', 'm', '📘', 'ふつう', '教科書のように、なぜそうなるかを') +
      chooseBtn('exp', 'l', '🎓', 'くわしく', '試験のひっかけ・実務の話まで') +
      '</div><div class="sec">1日の目標</div><div class="seg full">' + [3, 10, 20].map(function (n) { return '<button class="' + (S.set.goal === n ? 'on' : '') + '" data-act="setGoal" data-v="' + n + '">' + n + '問' + (n === 3 ? '(5分)' : n === 10 ? '(15分)' : '(30分)') + '</button>'; }).join('') + '</div>' +
      '<div style="flex:1"></div><button class="btn mt16" data-act="wStep" data-v="3">つぎへ</button></div>';
    return '<div class="welcome">' + dots + '<h1>今のレベルを<br>はかりますか?</h1><p>14問のかんたんな診断(5分くらい)で、あなたに合ったところから始められます。分からない問題は「わからない」を押してOK。</p>' +
      '<div class="feat"><div><span class="fi">🧪</span><span>分野ごとに1問ずつ出ます。結果から、分野ごとのレベルを決めます。</span></div></div>' +
      '<div style="flex:1"></div><button class="btn" data-act="startPlacement">診断する(おすすめ)</button><button class="btn ghost mt8" data-act="skipPlacement">はじめから学ぶ(診断しない)</button></div>';
  };
  function chooseBtn(key, v, ic, t, d) {
    return '<button class="' + (S.set[key] === v ? 'on' : '') + '" data-act="setOpt" data-k="' + key + '" data-v="' + v + '"><span class="ic">' + ic + '</span><span><b>' + esc(t) + '</b><span>' + esc(d) + '</span></span></button>';
  }

  /* ---------- ホーム ---------- */
  VIEWS.home = function () {
    var d = B.dayStat(), goal = S.set.goal, pct = Math.min(1, d.n / goal), ul = B.userLevel(), streak = B.streakNow();
    var due = B.dueList().length, ps = B.passScore(), nl = nextLesson();
    var left = Math.max(0, goal - d.n);
    var h = '<div class="scr">';
    h += '<div class="top"><div class="grow"><div class="sub">' + greet() + '</div><h1>まなぼき <span style="color:var(--pri)">3級</span></h1></div>' +
      '<button class="iconBtn" data-act="go" data-v="settings" aria-label="設定">⚙️</button></div>';
    h += '<div class="hero"><div class="hi">今日の目標 ' + goal + '問</div>' +
      '<div class="big">' + (left ? (d.n ? 'あと ' + left + '問 で達成!' : '今日も少しだけ、やってみよう') : '今日の目標 達成!🎉 すばらしい') + '</div>' +
      '<div class="goal">' + B.ring(pct, 76, 9, '#5eead4', 'rgba(255,255,255,.16)', '<span style="font-size:20px">' + d.n + '</span><small>/ ' + goal + '問</small>') +
      '<div class="txt"><div>🔥 連続 <b>' + streak + '</b> 日</div><div>⭐ Lv.' + ul.lv + ' ・ ' + esc(B.rankName()) + '</div></div></div>' +
      '<div class="mt16">' + (left ? '<button class="btn white" data-act="startAuto">▶ ' + (d.n ? 'つづける' : 'スタート') + '(' + Math.min(left, 10) + '問)</button>' : '<button class="btn white" data-act="startAuto">▶ もう少しやる(5問)</button>') + '</div>' +
      '<div class="chips mt12"><button class="pill glass" data-act="startQuick">⚡ 3問だけ</button>' + (due ? '<button class="pill glass" data-act="startReview">🔁 復習 ' + due + '問</button>' : '') + '<button class="pill glass" data-act="go" data-v="examTop">📝 模擬試験</button></div></div>';

    if (!S.placed && !d.n) h += '<button class="tile wide" data-act="startPlacement" style="width:100%;margin-bottom:14px"><span class="ic">🧪</span><span class="grow"><span class="t">レベル診断(14問・5分)</span><span class="d">今の自分の力をはかって、合ったところから</span></span><span>›</span></button>';

    h += '<div class="card"><h2>合格予想スコア</h2>' + (ps == null ? '<div class="muted">あと少し問題を解くと、合格の見こみを表示します(8問から)。</div><div class="gline"><div class="pass"></div></div>' :
      '<div class="gauge"><div class="gv">' + ps + '<small> 点</small></div><div class="grow small">' + (ps >= 70 ? '合格ライン(70点)を こえています!この調子で。' : '合格ラインまで あと <b>' + (70 - ps) + '点</b>。苦手な分野から少しずつ。') + '</div></div><div class="gline"><i data-w="' + ps + '" style="width:0"></i><div class="pass"></div></div>') + '</div>';

    if (nl) h += '<div class="sec">つぎのレッスン<button class="more" data-act="go" data-v="learn">ぜんぶ見る ›</button></div>' +
      '<button class="topic" data-act="openLesson" data-v="' + nl.id + '"><span class="ic">' + esc(nl.icon || topicIcon(nl.topic)) + '</span><span class="grow"><span class="t">' + esc(nl.title) + '</span><span class="d">' + esc(topicName(nl.topic)) + ' ・ ' + (nl.mins || 3) + '分</span></span><span class="pill pri">読む</span></button>';

    var weak = B.topics.filter(function (t) { return t.w > 0 && B.topicStat(t.id).n >= 3 && !(t.id === 'tegata' && S.set.range === 'new'); }).sort(function (a, b) { return B.topicStat(a.id).m - B.topicStat(b.id).m; }).slice(0, 3);
    if (weak.length) {
      h += '<div class="sec">にがてかも?</div><div class="chips">' + weak.map(function (t) { return '<button class="pill ng" data-act="startTopic" data-v="' + t.id + '">' + t.icon + ' ' + esc(t.name) + ' ' + Math.round(B.topicStat(t.id).m) + '%</button>'; }).join('') + '</div>';
    }
    if (B.tips.length) {
      var day = Math.floor(Date.now() / 86400000), tip = B.tips[day % B.tips.length];
      h += '<div class="sec">今日のひとこと</div><div class="note tip"><span class="ni">💼</span><span><b>' + esc(tip.t) + '</b><br>' + B.rich(tip.b) + '</span></div>';
    }
    if (!B.canSave()) h += '<div class="note memo"><span class="ni">⚠️</span><span>この画面(プライベートブラウズなど)では、記録が保存されません。ふつうの画面か、ホーム画面に入れて使ってください。</span></div>';
    return h + '</div>';
  };

  /* ---------- 学ぶ(分野の一覧) ---------- */
  VIEWS.learn = function () {
    var h = '<div class="scr">' + tabTop('学ぶ', '<span class="pill">📖 ' + Object.keys(S.lessons).length + ' / ' + allLessonsOrdered().length + '</span>');
    h += '<div class="muted" style="margin:-4px 4px 12px">上から順がおすすめ。どこからでも始められます。</div>';
    B.topics.forEach(function (t) {
      if (t.id === 'tegata' && S.set.range === 'new') return;
      var ls = lessonsOf(t.id), done = ls.filter(function (l) { return S.lessons[l.id]; }).length, st = B.topicStat(t.id);
      h += '<button class="topic" data-act="openTopic" data-v="' + t.id + '"><span class="ic">' + t.icon + '</span><span class="grow"><span class="row"><span class="t grow">' + esc(t.name) + '</span>' + lvTag(B.lvLabel(t.id)) + '</span>' +
        '<span class="d">' + esc(t.desc) + '</span><div class="bar"><i data-w="' + Math.round(st.m) + '"></i></div>' +
        '<span class="d">📖 ' + done + '/' + ls.length + ' ・ 習熟度 ' + Math.round(st.m) + '%</span></span></button>';
    });
    return h + '</div>';
  };

  /* ---------- 分野のページ ---------- */
  VIEWS.topic = function (p) {
    var t = B.topicById(p.id), st = B.topicStat(p.id), ls = lessonsOf(p.id), lv = B.topicLv(p.id);
    var h = '<div class="scr noNav">' + topBar(t.icon + ' ' + t.name, t.desc);
    h += '<div class="card"><div class="row"><div class="grow"><div class="muted">習熟度</div><div style="font-size:30px;font-weight:900">' + Math.round(st.m) + '<small style="font-size:14px">%</small></div></div>' +
      '<div style="text-align:right"><div class="muted">今の出題レベル</div>' + qLvTag(lv) + '</div></div><div class="bar"><i data-w="' + Math.round(st.m) + '"></i></div>' +
      '<div class="muted mt8">解いた問題 ' + st.n + '問 ・ 正解率 ' + (st.n ? Math.round(st.ok / st.n * 100) : 0) + '% ・ 35%で中級、70%で上級の問題が出ます</div></div>';
    if (topicTplCount(p.id)) h += '<button class="btn" data-act="startTopic" data-v="' + p.id + '">✏️ この分野の問題を解く(10問)</button>';
    h += '<div class="sec">レッスン</div>';
    if (!ls.length) h += '<div class="muted">準備中です。</div>';
    ls.forEach(function (l, i) {
      var done = S.lessons[l.id];
      h += '<button class="topic" data-act="openLesson" data-v="' + l.id + '"><span class="ic">' + (done ? '✅' : esc(l.icon || (i + 1))) + '</span><span class="grow"><span class="t">' + esc(l.title) + '</span><span class="d">' + (l.mins || 3) + '分 ・ カード' + l.cards.length + '枚' + (l.range === 'new' ? ' ・ 🆕 2027年4月〜' : l.range === 'old' ? ' ・ 2027年3月まで' : '') + '</span></span><span>›</span></button>';
    });
    var gl = B.glossary.filter(function (g) { return g.topic === p.id; });
    var accs = Object.keys(B.accounts).filter(function (n) { return false; });
    if (gl.length) {
      h += '<div class="sec">この分野の用語</div><div class="chips">' + gl.map(function (g) { return '<button class="pill" data-act="glossInfo" data-v="' + esc(g.w) + '">' + esc(g.w) + '</button>'; }).join('') + '</div>';
    }
    return h + '</div>';
  };

  /* ---------- レッスン ---------- */
  VIEWS.lesson = function (p) {
    var l = null; B.lessons.forEach(function (x) { if (x.id === p.id) l = x; });
    if (!l) return '<div class="scr">' + topBar('レッスン') + '<div class="card">見つかりません</div></div>';
    if (!LS || LS.id !== l.id) LS = { id: l.id, i: 0, lvl: S.set.exp, qa: {} };
    var n = l.cards.length, total = n + 1, i = LS.i;
    var h = '<div class="scr noNav"><div class="top"><button class="iconBtn back" data-act="back" aria-label="もどる">✕</button><div class="lsDots">' +
      Array.apply(null, Array(total)).map(function (_, k) { return '<i class="' + (k <= i ? 'on' : '') + '"></i>'; }).join('') + '</div></div>';
    if (i < n) {
      var c = l.cards[i];
      h += '<div class="lsCard" id="lsCard"><div class="muted">' + esc(l.title) + ' ・ ' + (i + 1) + '/' + n + '</div><h2>' + esc(c.h) + '</h2>' +
        exSeg(LS.lvl, 'lsLvl') + '<div class="body mt12">' + B.rich(c[LS.lvl] || c.m) + '</div>' + B.fig(c.fig) + '</div>';
      h += '<div class="lsNav"><button class="btn sub" data-act="lsPrev"' + (i ? '' : ' disabled') + '>‹ もどる</button><button class="btn" data-act="lsNext">' + (i === n - 1 ? 'まとめへ ›' : 'つぎへ ›') + '</button></div>';
      h += '<div class="lvlHelp">むずかしいと感じたら「🧒 やさしく」に切りかえてみてください</div>';
    } else {
      h += '<div class="lsCard"><h2>🎉 まとめ</h2>';
      if (l.tips && l.tips.length) h += l.tips.map(function (t) { return '<div class="note memo"><span class="ni">🧠</span><span><b class="h">覚え方</b>' + B.rich(t) + '</span></div>'; }).join('');
      if (l.work) h += '<div class="note work"><span class="ni">💼</span><span><b class="h">会社の経理では</b>' + B.rich(l.work) + '</span></div>';
      (l.quiz || []).forEach(function (q, qi) {
        var a = LS.qa[qi];
        h += '<div class="part"><div class="pl"><span>確認 ' + (qi + 1) + '</span>' + (a != null ? (a === q.ans ? '<span class="mark ok">○ 正解</span>' : '<span class="mark ng">✕</span>') : '') + '</div><div class="pq">' + B.rich(q.q, { acc: false }) + '</div><div class="opts">';
        q.choices.forEach(function (ch, ci) {
          var cls = a == null ? '' : ci === q.ans ? ' right' : ci === a ? ' wrong' : '';
          h += '<button class="opt' + cls + '" data-act="lsQuiz" data-q="' + qi + '" data-v="' + ci + '"' + (a != null ? ' disabled' : '') + '><span class="k">' + 'ABCD'[ci] + '</span><span>' + B.rich(ch, { acc: false }) + '</span></button>';
        });
        h += '</div>' + (a != null && q.why ? '<div class="note tip mt8"><span class="ni">💡</span><span>' + B.rich(q.why) + '</span></div>' : '') + '</div>';
      });
      h += '</div><div class="mt16"><button class="btn" data-act="lsDone">' + (topicTplCount(l.topic) ? '✅ 完了して、問題を解く' : '✅ 完了') + '</button><button class="btn ghost mt8" data-act="lsFinish">完了して もどる</button></div>';
    }
    return h + '</div>';
  };
  AFTER.lesson = function () {
    var el = document.getElementById('lsCard'); if (!el) return;
    var x0 = null, y0 = null;
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) act(dx < 0 ? 'lsNext' : 'lsPrev', {});
    }, { passive: true });
  };

  /* ---------- 練習 ---------- */
  VIEWS.practice = function () {
    var due = B.dueList().length, weak = B.weakList().length;
    var h = '<div class="scr">' + tabTop('練習', '<button class="iconBtn" data-act="go" data-v="settings">⚙️</button>');
    h += '<div class="tiles">' +
      '<button class="tile wide accent" data-act="startAuto"><span class="ic">🎯</span><span class="grow"><span class="t">おまかせ 10問</span><span class="d">あなたのレベルと苦手に合わせて自動で出題</span></span></button>' +
      '<button class="tile" data-act="startQuick"><span class="ic">⚡</span><span class="t">3問だけ</span><span class="d">現場のあとの1〜2分に</span></button>' +
      '<button class="tile" data-act="startReview"><span class="ic">🔁</span><span class="t">復習</span><span class="d">' + (due ? '今日の復習 ' + due + '問' : weak ? 'まちがえた問題 ' + weak + '問' : 'まちがえた問題がここに') + '</span>' + (due ? '<span class="badge pill ng">' + due + '</span>' : '') + '</button>' +
      '<button class="tile" data-act="startShiwake"><span class="ic">✍️</span><span class="t">仕訳トレーニング</span><span class="d">本番の第1問と同じ形で15問</span></button>' +
      '<button class="tile" data-act="startType"><span class="ic">⌨️</span><span class="t">入力で答える</span><span class="d">科目を自分で書く・音声もOK。覚えるのに効く</span></button>' +
      '<button class="tile" data-act="startWeak"><span class="ic">💪</span><span class="t">苦手克服</span><span class="d">習熟度の低い分野を集中して</span></button>' +
      '<button class="tile" data-act="startUp"><span class="ic">🚀</span><span class="t">チャレンジ</span><span class="d">中級・上級の問題だけ</span></button>' +
      '<button class="tile wide" data-act="go" data-v="examTop"><span class="ic">📝</span><span class="grow"><span class="t">模擬試験(60分・100点)</span><span class="d">本番と同じ 第1問〜第3問。70点で合格</span></span><span>›</span></button>' +
      '</div>';
    h += '<div class="sec">分野をえらんで解く</div>';
    B.topics.forEach(function (t) {
      if (!topicTplCount(t.id) || (t.id === 'tegata' && S.set.range === 'new')) return;
      var st = B.topicStat(t.id);
      h += '<button class="topic" data-act="startTopic" data-v="' + t.id + '"><span class="ic">' + t.icon + '</span><span class="grow"><span class="row"><span class="t grow">' + esc(t.name) + '</span>' + lvTag(B.lvLabel(t.id)) + '</span><div class="bar"><i data-w="' + Math.round(st.m) + '"></i></div></span></button>';
    });
    return h + '</div>';
  };

  /* ---------- セッション(問題を続けて解く) ---------- */
  function startSession(qs, title, opt) {
    opt = opt || {};
    if (!qs.length) { toast('いま出せる問題がありません'); return; }
    SES = { qs: qs, i: 0, title: title, res: [], xp: 0, type: opt.type || 'practice', mode: opt.mode || S.set.mode, t0: Date.now(), lvUps: [] };
    startQ();
    go('quiz', {}, { replace: screen === 'quiz' || screen === 'result' });
  }
  function startQ() {
    var q = SES.qs[SES.i];
    Q = { q: q, phase: 'ask', hint: false, sel: null, num: '', mode: SES.mode, order: null };
    if (q.kind === 'shiwake') {
      var pre = q.lv === 1;
      var u = { dr: [], cr: [] };
      var nd = pre ? q.dr.length : 1, nc = pre ? q.cr.length : 1;
      for (var i = 0; i < nd; i++) u.dr.push(['', 0]);
      for (var j = 0; j < nc; j++) u.cr.push(['', 0]);
      W.cur = { q: q, u: u, chips: B.chipsFor(q), pre: pre, exam: false };
    }
    if (q.kind === 'choice') { var o = q.choices.map(function (_, k) { return k; }); for (var k = o.length - 1; k > 0; k--) { var m = Math.floor(Math.random() * (k + 1)); var t = o[k]; o[k] = o[m]; o[m] = t; } Q.order = o; }
  }
  function quitSession() {
    if (!SES || SES.res.length === 0) { SES = null; Q = null; goHome(); return; }
    confirmBox('ここでやめますか?', 'ここまでの ' + SES.res.length + '問の記録は残ります。', 'やめる', 'つづける', function () { finishSession(); });
  }
  function finishSession() {
    if (SES.type === 'placement') {
      var ratio = B.applyPlacement(SES.res.map(function (r) { return { topic: r.q.topic, ok: r.ok }; }));
      S.set.onboarded = true; B.save();
    }
    go('result', {}, { replace: true });
  }

  VIEWS.quiz = function () {
    if (!SES || !Q) return VIEWS.home();
    var q = Q.q, n = SES.qs.length, i = SES.i;
    var h = '<div class="scr noNav"><div class="qhead"><button class="iconBtn back" data-act="back" aria-label="やめる">✕</button><div class="qprog"><i style="width:' + Math.round((i + (Q.phase === 'fb' ? 1 : 0)) / n * 100) + '%"></i></div><span class="muted" style="font-weight:800">' + (i + 1) + '/' + n + '</span></div>';
    h += '<div class="qmeta"><span class="pill">' + topicIcon(q.topic) + ' ' + esc(topicName(q.topic)) + '</span>' + qLvTag(q.lv) + (q.range === 'new' ? '<span class="pill pri">🆕 2027〜</span>' : '') +
      (q.kind === 'shiwake' && Q.phase === 'ask' ? '<span class="grow"></span><div class="seg"><button class="' + (Q.mode === 'tap' ? 'on' : '') + '" data-act="qMode" data-v="tap">👆 タップ</button><button class="' + (Q.mode === 'type' ? 'on' : '') + '" data-act="qMode" data-v="type">⌨️ 入力</button></div>' : '') + '</div>';
    h += '<div class="qcard"><div class="muted small" style="font-weight:800;margin-bottom:4px">' + { shiwake: '仕訳をしてください', choice: '正しいものを えらんでください', tf: '正しければ ○、まちがいなら ✕', num: '数字で答えてください' }[q.kind] + '</div><div class="qtext">' + B.rich(q.q, { acc: false }) + '</div>' + B.docFig(q.doc) + '</div>';
    if (Q.phase === 'ask') {
      if (Q.hint) h += '<div class="note tip"><span class="ni">💡</span><span><b class="h">ヒント</b>' + B.rich(B.hintFor(q), { acc: false }) + '</span></div>';
      h += answerArea(q);
      h += '<div class="row mt16"><button class="btn ghost" style="width:auto;flex:1" data-act="qHint"' + (Q.hint ? ' disabled' : '') + '>💡 ヒント</button><button class="btn ghost" style="width:auto;flex:1" data-act="qGiveup">🤔 わからない</button></div>';
      if (q.kind !== 'num' && q.kind !== 'tf') h += '<button class="btn mt8" data-act="qCheck" id="qCheck"' + (canCheck() ? '' : ' disabled') + '>答え合わせ</button>';
      else if (q.kind === 'num') h += '';
    } else h += feedback(q);
    return h + '</div>';
  };

  function answerArea(q) {
    if (q.kind === 'shiwake') return jwHtml('cur');
    if (q.kind === 'choice') {
      return '<div class="opts">' + Q.order.map(function (ci, k) {
        return '<button class="opt' + (Q.sel === ci ? ' sel' : '') + '" data-act="qSel" data-v="' + ci + '"><span class="k">' + 'ABCDEF'[k] + '</span><span>' + B.rich(q.choices[ci], { acc: false }) + '</span></button>';
      }).join('') + '</div>';
    }
    if (q.kind === 'tf') return '<div class="tf"><button class="opt o" data-act="qTF" data-v="1">○</button><button class="opt x" data-act="qTF" data-v="0">✕</button></div>';
    if (q.kind === 'num') return '<div class="numShow" id="numShow">' + (Q.num ? F(Number(Q.num)) : '<span class="muted" style="font-size:16px">ここに数字</span>') + '<span class="u">' + esc(q.unit || '円') + '</span></div>' + padHtml('qNum', true);
    return '';
  }
  function padHtml(act, withGo) {
    var k = ['7', '8', '9', 'del', '4', '5', '6', 'C', '1', '2', '3', 'go', '0', '00', '000'];
    return '<div class="pad">' + k.map(function (x) {
      if (x === 'go') return withGo ? '<button class="go" data-act="' + act + '" data-v="go">答え合わせ</button>' : '<button class="go" data-act="' + act + '" data-v="go">決定</button>';
      return '<button class="' + (x.length > 1 ? 'k2' : '') + '" data-act="' + act + '" data-v="' + x + '">' + (x === 'del' ? '⌫' : x === 'C' ? 'クリア' : x) + '</button>';
    }).join('') + '</div>';
  }
  function canCheck() {
    var q = Q.q;
    if (q.kind === 'shiwake') { var u = W.cur.u; return u.dr.some(function (l) { return l[0] && l[1]; }) && u.cr.some(function (l) { return l[0] && l[1]; }); }
    if (q.kind === 'choice') return Q.sel != null;
    return true;
  }

  /* 仕訳の入力欄 */
  function jwHtml(key) {
    var w = W[key], u = w.u;
    function col(side) {
      var h = '<div class="jcol ' + side + '"><div class="jh">' + (side === 'dr' ? '借方(左)' : '貸方(右)') + '</div>';
      u[side].forEach(function (l, i) {
        var a = l[0] ? B.accounts[l[0]] : null;
        h += '<div class="jrow' + (l[0] && l[1] ? ' filled' : '') + '">' +
          '<button class="acc" data-act="jwAcc" data-k="' + key + '" data-s="' + side + '" data-i="' + i + '">' + (l[0] ? esc(l[0]) : '<span class="ph">科目をえらぶ</span>') + '</button>' +
          '<button class="amt" data-act="jwAmt" data-k="' + key + '" data-s="' + side + '" data-i="' + i + '">' + (l[1] ? F(l[1]) : '<span class="ph">金額</span>') + '</button>' +
          (u[side].length > 1 && !w.pre ? '<button class="x" data-act="jwDel" data-k="' + key + '" data-s="' + side + '" data-i="' + i + '" aria-label="この行を消す">✕</button>' : '') + '</div>';
      });
      if (!w.pre && u[side].length < 5) h += '<button class="addRow" data-act="jwAdd" data-k="' + key + '" data-s="' + side + '">＋ 行を追加</button>';
      return h + '</div>';
    }
    var sd = 0, sc = 0; u.dr.forEach(function (l) { sd += l[1] || 0; }); u.cr.forEach(function (l) { sc += l[1] || 0; });
    var note = w.pre ? '<div class="muted small mt8">借方 ' + u.dr.length + '行・貸方 ' + u.cr.length + '行 です</div>' : (!w.exam ? '<div class="muted small mt8">2つ以上の科目がいるときは「＋ 行を追加」</div>' : '');
    return '<div class="jw" id="jw-' + key + '">' + col('dr') + col('cr') + '</div><div class="jsum"><span>合計 ' + F(sd) + '</span><span class="' + (sd && sc && sd !== sc ? 'bad' : '') + '">' + (sd && sc && sd !== sc ? '左右の合計が合っていません' : '') + '</span><span>合計 ' + F(sc) + '</span></div>' + note;
  }
  function refreshJw(key) {
    var el = document.getElementById('jw-' + key);
    if (!el) { render(); return; }
    var wrap = document.createElement('div'); wrap.innerHTML = jwHtml(key);
    var parent = el.parentNode, next = el.nextSibling;
    // jw と その後ろの jsum・note を入れかえる
    while (next && (next.classList && (next.classList.contains('jsum') || (next.classList.contains('muted') && next.classList.contains('small'))))) { var nn = next.nextSibling; parent.removeChild(next); next = nn; }
    var frag = document.createDocumentFragment(); while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    parent.replaceChild(frag, el);
    var btn = document.getElementById('qCheck'); if (btn && Q) btn.disabled = !canCheck();
    if (EXAM) updateExamGrid();
  }

  /* 科目えらびの板 */
  function openAccSheet(key, side, i) {
    var w = W[key]; sheetCtx = { type: 'acc', key: key, side: side, i: i };
    var mode = w.exam ? 'tap' : (Q && key === 'cur' ? Q.mode : S.set.mode);
    var cur = w.u[side][i][0];
    var h = '<div class="grab"></div><h3>' + (side === 'dr' ? '借方(左)' : '貸方(右)') + 'の科目</h3>';
    if (mode === 'type') {
      var hasMic = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      h += '<div class="typeBox"><input id="accIn" type="text" inputmode="text" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="例: げんきん / 売掛金" value="' + esc(cur || '') + '" enterkeyhint="done">' + (hasMic ? '<button class="mic" id="micBtn" data-act="mic" aria-label="声で入力">🎤</button>' : '') + '</div>' +
        '<div class="muted small mt8">ひらがなでもOK。' + (hasMic ? '🎤 で声でも入れられます。' : 'キーボードのマイクで声でも入れられます。') + '</div><div class="sug" id="sug"></div>' +
        '<button class="btn sub mt12" data-act="sheetTapMode">👆 えらぶ方式にする</button>';
    } else {
      h += '<div class="accChips">' + w.chips.map(function (n) { return '<button class="accChip' + (n === cur ? ' cur' : '') + '" data-act="pickAcc" data-v="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>';
      if (cur) h += '<button class="btn ghost mt8" data-act="pickAcc" data-v="">この行を空にする</button>';
      if (!w.exam) h += '<button class="btn ghost" data-act="sheetTypeMode">⌨️ 自分で入力する</button>';
    }
    openSheet(h);
    if (mode === 'type') {
      var inp = document.getElementById('accIn');
      var upd = function () {
        var list = B.suggestAccounts(inp.value, 6);
        document.getElementById('sug').innerHTML = list.map(function (n) { var a = B.accounts[n]; return '<button data-act="pickAcc" data-v="' + esc(n) + '"><span class="gdot acc-' + a.g + '"></span>' + esc(n) + ' <small>' + esc(a.y) + '</small></button>'; }).join('') || (inp.value ? '<div class="muted small">見つかりません。ちがう言い方で入れてみてください。</div>' : '');
      };
      inp.addEventListener('input', upd);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var m = B.matchAccount(inp.value) || B.suggestAccounts(inp.value, 1)[0]; if (m) pickAcc(m); else toast('科目が見つかりません'); } });
      upd();
      setTimeout(function () { try { inp.focus(); } catch (e) { } }, 280);
    }
  }
  function pickAcc(name) {
    var c = sheetCtx; if (!c) return;
    var w = W[c.key]; w.u[c.side][c.i][0] = name;
    sfx('tap');
    closeSheet();
    refreshJw(c.key);
    // 金額がまだなら、そのまま金額へ
    if (name && !w.u[c.side][c.i][1]) setTimeout(function () { openPadSheet(c.key, c.side, c.i); }, 220);
  }
  var rec = null;
  function startMic() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    var btn = document.getElementById('micBtn'), inp = document.getElementById('accIn');
    if (rec) { try { rec.stop(); } catch (e) { } rec = null; if (btn) btn.classList.remove('on'); return; }
    try {
      rec = new SR(); rec.lang = 'ja-JP'; rec.interimResults = true; rec.maxAlternatives = 3;
      rec.onresult = function (e) {
        var r = e.results[e.results.length - 1], txt = r[0].transcript;
        if (inp) { inp.value = txt; inp.dispatchEvent(new Event('input')); }
        if (r.isFinal) {
          var m = null; for (var k = 0; k < r.length && !m; k++) m = B.matchAccount(r[k].transcript) || B.suggestAccounts(r[k].transcript, 1)[0];
          if (m && B.cleanWord(m) && B.matchAccount(r[0].transcript)) pickAcc(m);
        }
      };
      rec.onend = function () { rec = null; var b = document.getElementById('micBtn'); if (b) b.classList.remove('on'); };
      rec.onerror = function () { toast('声がうまく聞きとれませんでした'); };
      rec.start(); if (btn) btn.classList.add('on');
    } catch (e) { toast('この画面では声の入力が使えません'); rec = null; }
  }

  /* 金額の板 */
  var padVal = '';
  function amountsInText(q) {
    var out = [], seen = {}, re = /[¥￥]\s?([\d,]+)/g, m, txt = (q.q || '') + ' ' + (q.doc ? JSON.stringify(q.doc) : '');
    while ((m = re.exec(txt))) { var v = Number(m[1].replace(/,/g, '')); if (v && !seen[v]) { seen[v] = 1; out.push(v); } }
    return out.slice(0, 6);
  }
  function openPadSheet(key, side, i) {
    var w = W[key]; sheetCtx = { type: 'amt', key: key, side: side, i: i };
    padVal = w.u[side][i][1] ? String(w.u[side][i][1]) : '';
    var other = side === 'dr' ? 'cr' : 'dr', so = 0, ss = 0;
    w.u[other].forEach(function (l) { so += l[1] || 0; }); w.u[side].forEach(function (l, k) { if (k !== i) ss += l[1] || 0; });
    var diff = so - ss;
    var quick = amountsInText(w.q);
    var h = '<div class="grab"></div><h3>' + (w.u[side][i][0] ? esc(w.u[side][i][0]) + ' の金額' : '金額') + '</h3>' +
      '<div class="numShow" id="padShow"></div>' +
      '<div class="chips mt8">' + (diff > 0 ? '<button class="pill pri" data-act="padQuick" data-v="' + diff + '">差額 ' + F(diff) + '</button>' : '') + (w.exam ? '' : quick.map(function (v) { return '<button class="pill" data-act="padQuick" data-v="' + v + '">' + F(v) + '</button>'; }).join('')) + '</div>' +
      padHtml('pad', false);
    openSheet(h); showPad();
  }
  function showPad() { var el = document.getElementById('padShow'); if (el) el.innerHTML = (padVal ? F(Number(padVal)) : '<span class="muted" style="font-size:16px">0</span>') + '<span class="u">円</span>'; }
  function padKey(v, target) {
    var cur = target === 'q' ? Q.num : padVal;
    if (v === 'del') cur = cur.slice(0, -1);
    else if (v === 'C') cur = '';
    else if (v !== 'go') { if (cur.length < 11) cur = (cur + v).replace(/^0+/, ''); }
    if (target === 'q') { Q.num = cur; var el = document.getElementById('numShow'); if (el) el.innerHTML = (cur ? F(Number(cur)) : '<span class="muted" style="font-size:16px">ここに数字</span>') + '<span class="u">' + esc(Q.q.unit || '円') + '</span>'; }
    else { padVal = cur; showPad(); }
    sfx('tap');
  }
  function padCommit() {
    var c = sheetCtx; if (!c) return; var w = W[c.key];
    w.u[c.side][c.i][1] = Number(padVal) || 0;
    closeSheet(); refreshJw(c.key);
  }

  function openSheet(html) { $sheet.querySelector('.in').innerHTML = html; $sheet.classList.add('on'); $sheetBack.classList.add('on'); }
  function closeSheet() { if (!$sheet) return; $sheet.classList.remove('on'); $sheetBack.classList.remove('on'); if (rec) { try { rec.stop(); } catch (e) { } rec = null; } if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  /* 答え合わせ */
  function doCheck(giveup) {
    var q = Q.q, ok = false, res = { notes: [], mark: null };
    if (giveup) ok = false;
    else if (q.kind === 'shiwake') { res = B.checkShiwake(q, W.cur.u.dr, W.cur.u.cr); ok = res.ok; }
    else if (q.kind === 'choice') ok = Q.sel === q.ans;
    else if (q.kind === 'tf') ok = Q.sel === q.ans;
    else if (q.kind === 'num') ok = Number(Q.num) === q.ans;
    Q.phase = 'fb'; Q.ok = ok; Q.res = res; Q.giveup = giveup; Q.exLvl = ok ? S.set.exp : (S.set.exp === 'l' ? 'm' : S.set.exp);
    var r = B.record(q, ok, { hint: Q.hint });
    Q.xp = r.xp; SES.xp += r.xp;
    SES.res.push({ q: q, ok: ok, u: q.kind === 'shiwake' ? JSON.parse(JSON.stringify(W.cur.u)) : (q.kind === 'num' ? Q.num : Q.sel) });
    if (r.lvUp) SES.lvUps.push(r.lvUp);
    sfx(ok ? 'ok' : 'ng'); vib(ok ? 15 : [30, 40, 30]);
    render();
    if (!ok) { var c = document.querySelector('.qcard'); if (c) c.classList.add('shake'); }
    var fb = document.querySelector('.fb'); if (fb) setTimeout(function () { fb.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    if (r.lvUp && SES.type !== 'placement') setTimeout(function () { sfx('lv'); confetti(); modal('🚀', 'レベルアップ!', '「' + topicName(r.lvUp) + '」が **' + B.lvName[B.topicLv(r.lvUp)] + '** になりました。これから少し難しい問題も出ます。', 'やったね'); }, 500);
    var d = B.dayStat(); if (d.n === S.set.goal) setTimeout(function () { confetti(); toast('🎉 今日の目標 ' + S.set.goal + '問 達成!'); }, 900);
  }

  function feedback(q) {
    var ok = Q.ok, h = '';
    h += '<div class="fb ' + (ok ? 'ok' : 'ng') + '"><div class="ttl"><span class="em">' + (ok ? '🎉' : Q.giveup ? '📖' : '😣') + '</span><span class="grow">' + (ok ? (Q.hint ? '正解!(ヒントあり)' : ['正解!', 'すばらしい!', 'その調子!', 'ばっちり!'][Math.floor(Math.random() * 4)]) : Q.giveup ? '答えを見てみよう' : 'おしい!') + '</span><span class="pill ' + (ok ? 'ok' : '') + '">+' + Q.xp + ' XP</span></div>';
    if (q.kind === 'shiwake') {
      h += '<div class="jlbl">正しい仕訳</div>' + B.fig({ type: 'shiwake', dr: q.dr, cr: q.cr });
      if (!ok && !Q.giveup) {
        var u = W.cur.u, fl = function (s) { return u[s].filter(function (l) { return l[0]; }); };
        h += '<div class="jlbl">あなたの答え</div>' + B.fig({ type: 'shiwake', dr: fl('dr'), cr: fl('cr'), mark: Q.res.mark });
      }
    } else if (q.kind === 'choice') {
      h += '<div class="jlbl">正解</div><div style="font-weight:800">' + B.rich(q.choices[q.ans], { acc: false }) + '</div>';
      if (!ok && Q.sel != null && q.why && q.why[Q.sel]) h += '<div class="miss"><div>あなたの答え「' + B.rich(q.choices[Q.sel], { acc: false }) + '」→ ' + B.rich(q.why[Q.sel]) + '</div></div>';
    } else if (q.kind === 'tf') {
      h += '<div class="jlbl">正解</div><div style="font-weight:900;font-size:24px">' + (q.ans ? '○ 正しい' : '✕ まちがい') + '</div>';
    } else if (q.kind === 'num') {
      h += '<div class="jlbl">正解</div><div style="font-weight:900;font-size:24px">' + F(q.ans) + ' ' + esc(q.unit || '円') + '</div>' + (!ok && Q.num ? '<div class="muted">あなたの答え ' + F(Number(Q.num)) + '</div>' : '');
    }
    if (Q.res && Q.res.notes && Q.res.notes.length && (!ok || Q.res.alias)) h += '<div class="miss">' + Q.res.notes.map(function (n) { return '<div class="' + (n.info ? 'info' : '') + '">' + B.rich(n.t) + '</div>'; }).join('') + '</div>';
    h += '</div>';
    h += exBlock(q.ex, Q.exLvl, 'qEx');
    if (q.pt) h += '<div class="note memo"><span class="ni">🧠</span><span><b class="h">覚え方</b>' + B.rich(q.pt) + '</span></div>';
    if (q.work) h += '<div class="note work"><span class="ni">💼</span><span><b class="h">会社の経理では</b>' + B.rich(q.work) + '</span></div>';
    var ls = lessonsOf(q.topic);
    h += '<div class="chips mb0" style="margin-bottom:14px">' + (ls.length ? '<button class="pill pri" data-act="openLesson" data-v="' + ls[0].id + '">📖 「' + esc(topicName(q.topic)) + '」のレッスン</button>' : '') + '<button class="pill" data-act="askMore">🙋 まだ分からない</button></div>';
    h += '<div style="position:sticky;bottom:calc(10px + var(--safe-b));z-index:5"><button class="btn" data-act="qNext">' + (SES.i + 1 < SES.qs.length ? 'つぎの問題 ›' : '結果を見る ›') + '</button></div>';
    return h;
  }
  function exBlock(ex, lvl, act) {
    if (!ex) return '';
    return '<div class="exBox"><div class="row" style="margin-bottom:8px"><b class="grow">📝 解説</b>' + (lvl !== 's' ? '<button class="pill" data-act="' + act + '" data-v="s">🧒 もっとやさしく</button>' : '') + '</div>' + exSeg(lvl, act) + '<div class="exText mt12">' + B.rich(ex[lvl] || ex.m) + '</div></div>';
  }

  /* ---------- 結果 ---------- */
  VIEWS.result = function () {
    if (!SES) return VIEWS.home();
    var n = SES.res.length, ok = SES.res.filter(function (r) { return r.ok; }).length, pct = n ? ok / n : 0;
    var plc = SES.type === 'placement';
    var em = pct >= 0.9 ? '🏆' : pct >= 0.7 ? '🎉' : pct >= 0.4 ? '💪' : '🌱';
    var msg = plc ? '診断おわり!' : pct >= 0.9 ? 'かんぺき!' : pct >= 0.7 ? 'よくできました!' : pct >= 0.4 ? 'いい調子。復習で伸びます' : 'ここから伸びます!';
    var h = '<div class="scr noNav"><div class="result"><div class="em">' + em + '</div><h2>' + msg + '</h2><div class="muted">' + esc(SES.title) + '</div></div>';
    h += '<div class="stat3"><div><b>' + ok + '/' + n + '</b><span>正解</span></div><div><b>' + Math.round(pct * 100) + '%</b><span>正解率</span></div><div><b>+' + SES.xp + '</b><span>XP</span></div></div>';
    if (plc) {
      var ps = B.passScore();
      var lvT = pct >= 0.75 ? ['中級', '基本はしっかり。中級の問題から始めます。'] : pct >= 0.4 ? ['初級〜中級', '思い出しながら、基本から少しずつ上げていきます。'] : ['初級', 'まずは基本から。レッスンを読みながら進めましょう。'];
      h += '<div class="card"><h2>あなたのレベル</h2><div style="font-size:24px;font-weight:900">' + lvT[0] + '</div><div class="muted">' + lvT[1] + '</div>' + (ps != null ? '<div class="mt8">合格予想: <b>' + ps + '点</b></div>' : '') + '</div>';
    }
    // 分野ごと
    var by = {}; SES.res.forEach(function (r) { by[r.q.topic] = by[r.q.topic] || [0, 0]; by[r.q.topic][0]++; if (r.ok) by[r.q.topic][1]++; });
    h += '<div class="card"><h2>分野ごとの習熟度</h2>' + Object.keys(by).map(function (id) { var m = Math.round(B.topicStat(id).m); return '<div class="mt8"><div class="row small"><span class="grow">' + topicIcon(id) + ' ' + esc(topicName(id)) + ' <span class="muted">(' + by[id][1] + '/' + by[id][0] + ')</span></span>' + lvTag(B.lvLabel(id)) + '<b>' + m + '%</b></div><div class="bar"><i data-w="' + m + '"></i></div></div>'; }).join('') + '</div>';
    h += '<div class="sec">ふりかえり(タップで解説)</div><div class="qlist">' + SES.res.map(function (r, i) { return '<button data-act="reviewItem" data-v="' + i + '"><span class="mk">' + (r.ok ? '⭕' : '❌') + '</span><span class="tx">' + esc(r.q.q.replace(/\n/g, ' ')) + '</span><span>›</span></button>'; }).join('') + '</div>';
    var wrong = SES.res.filter(function (r) { return !r.ok; }).length;
    h += '<div class="mt16">' + (wrong && !plc ? '<button class="btn" data-act="retryWrong">🔁 まちがえた ' + wrong + '問を もう一度</button><div class="mt8"></div>' : '') + (plc ? '<button class="btn" data-act="afterPlacement">学習を始める</button>' : '<button class="btn ' + (wrong ? 'sub' : '') + '" data-act="startAuto">▶ つづけて10問</button>') + '<button class="btn ghost mt8" data-act="home">ホームへ</button></div>';
    return h + '</div>';
  };
  AFTER.result = function () { if (SES && SES.res.length && SES.res.filter(function (r) { return r.ok; }).length / SES.res.length >= 0.8) setTimeout(confetti, 200); };

  /* ふりかえりの1問 */
  VIEWS.reviewOne = function (p) {
    var r = (p.list || SES.res)[p.i], q = r.q;
    var lvl = p.lvl || S.set.exp;
    var h = '<div class="scr noNav">' + topBar('ふりかえり', topicName(q.topic));
    h += '<div class="qcard"><div class="qmeta">' + qLvTag(q.lv) + (r.ok != null ? '<span class="pill ' + (r.ok ? 'ok' : 'ng') + '">' + (r.ok ? '⭕ 正解' : '❌ まちがい') + '</span>' : '') + '</div><div class="qtext">' + B.rich(q.q, { acc: false }) + '</div>' + B.docFig(q.doc) + '</div>';
    h += answerView(q, r);
    h += exBlock(q.ex, lvl, 'rvEx');
    if (q.pt) h += '<div class="note memo"><span class="ni">🧠</span><span><b class="h">覚え方</b>' + B.rich(q.pt) + '</span></div>';
    if (q.work) h += '<div class="note work"><span class="ni">💼</span><span><b class="h">会社の経理では</b>' + B.rich(q.work) + '</span></div>';
    return h + '</div>';
  };
  function answerView(q, r) {
    var h = '<div class="card">';
    if (q.kind === 'shiwake') {
      h += '<div class="jlbl" style="margin-top:0">正しい仕訳</div>' + B.fig({ type: 'shiwake', dr: q.dr, cr: q.cr });
      if (r && r.u && !r.ok && r.u.dr) {
        var fl = function (s) { return r.u[s].filter(function (l) { return l[0]; }); };
        var chk = B.checkShiwake(q, r.u.dr, r.u.cr);
        if (fl('dr').length || fl('cr').length) h += '<div class="jlbl">あなたの答え</div>' + B.fig({ type: 'shiwake', dr: fl('dr'), cr: fl('cr'), mark: chk.mark }) + (chk.notes.length ? '<div class="miss">' + chk.notes.map(function (n) { return '<div class="' + (n.info ? 'info' : '') + '">' + B.rich(n.t) + '</div>'; }).join('') + '</div>' : '');
      }
    } else if (q.kind === 'choice') h += '<div class="jlbl" style="margin-top:0">正解</div><b>' + B.rich(q.choices[q.ans], { acc: false }) + '</b>' + (r && r.u != null && !r.ok && q.choices[r.u] != null ? '<div class="muted mt8">あなたの答え: ' + esc(q.choices[r.u]) + '</div>' : '');
    else if (q.kind === 'tf') h += '<div class="jlbl" style="margin-top:0">正解</div><b style="font-size:22px">' + (q.ans ? '○ 正しい' : '✕ まちがい') + '</b>';
    else if (q.kind === 'num') h += '<div class="jlbl" style="margin-top:0">正解</div><b style="font-size:22px">' + F(q.ans) + ' ' + esc(q.unit || '円') + '</b>' + (r && r.u ? '<div class="muted">あなたの答え ' + F(Number(r.u)) + '</div>' : '');
    return h + '</div>';
  }

  /* ---------- 模擬試験 ---------- */
  VIEWS.examTop = function () {
    var hist = S.exams.slice(-5).reverse();
    var h = '<div class="scr noNav">' + topBar('模擬試験', '本番と同じ形・60分・100点満点');
    h += '<div class="card"><div class="table">' + B.fig({ type: 'table', head: ['', '内容', '点数'], rows: [['第1問', '仕訳 15問', '45点'], ['第2問', '勘定記入・補助簿など', '20点'], ['第3問', '決算(精算表・財務諸表)', '35点']] }) + '</div><div class="muted mt8">70点以上で合格。とちゅうで問題を行き来できます。電卓・メモ用紙を用意すると本番に近くなります。' + (B.exam2.length ? '' : '(第2問・第3問は準備中)') + '</div></div>';
    h += '<button class="btn" data-act="examStart" data-v="full">📝 本番モード(60分)で始める</button>';
    h += '<div class="btns2 mt12"><button class="btn sub" data-act="examStart" data-v="q1">第1問だけ(15分)</button><button class="btn sub" data-act="examStart" data-v="q23"' + (B.exam2.length && B.exam3.length ? '' : ' disabled') + '>第2・3問だけ(40分)</button></div>';
    if (hist.length) h += '<div class="sec">これまでの結果</div>' + hist.map(function (e) { var dt = new Date(e.at); return '<div class="card tight row"><span class="grow">' + (dt.getMonth() + 1) + '/' + dt.getDate() + ' ' + esc(e.kind === 'full' ? '本番モード' : e.kind === 'q1' ? '第1問' : '第2・3問') + '</span><b style="font-size:20px;color:' + (e.pass ? 'var(--ok)' : 'var(--ng)') + '">' + e.score + '<small style="font-size:12px">/' + e.max + '</small></b></div>'; }).join('');
    return h + '</div>';
  };
  function pickExam(list) { var c = list.filter(function (x) { return B.inRange(x.range); }); if (!c.length) return null; var done = S.exams.map(function (e) { return e.ids || []; }).reduce(function (a, b) { return a.concat(b); }, []); var nd = c.filter(function (x) { return done.indexOf(x.id) < 0; }); var pool = nd.length ? nd : c; return pool[Math.floor(Math.random() * pool.length)]; }
  function examStart(kind) {
    var q1 = [], e2 = null, e3 = null;
    if (kind !== 'q23') {
      // 分野がかたよらないように15問
      var topics = ['genkin', 'yokin', 'shohin', 'shohin', 'saiken', 'tegata', 'sonota', 'sonota', 'kotei', 'kotei', 'zei', 'kabu', 'hiyo', 'kashi', 'denpyo', 'jitsumu', 'hiyo', 'shohin'];
      var used = {};
      topics.forEach(function (t) {
        if (q1.length >= 15) return;
        var c = B.templates.filter(function (tp) { return tp.topic === t && tp.kind === 'shiwake' && B.inRange(tp.range) && !used[tp.id] && tp.lv >= 2; });
        if (!c.length) c = B.templates.filter(function (tp) { return tp.topic === t && tp.kind === 'shiwake' && B.inRange(tp.range) && !used[tp.id]; });
        if (!c.length) return;
        var tp = c[Math.floor(Math.random() * c.length)]; used[tp.id] = 1; q1.push(B.make(tp, Math.floor(Math.random() * 1e9) + 1));
      });
      var more = B.pickSet({ kinds: ['shiwake'], n: 15, mode: 'exam', fill: true });
      for (var k = 0; q1.length < 15 && k < more.length; k++) if (!used[more[k].id]) { used[more[k].id] = 1; q1.push(more[k]); }
      for (var j = q1.length - 1; j > 0; j--) { var m = Math.floor(Math.random() * (j + 1)); var t = q1[j]; q1[j] = q1[m]; q1[m] = t; }
    }
    if (kind !== 'q1') { e2 = shuffleSet(pickExam(B.exam2)); e3 = shuffleSet(pickExam(B.exam3)); }
    var mins = kind === 'full' ? 60 : kind === 'q1' ? 15 : 40;
    EXAM = { kind: kind, q1: q1, e2: e2, e3: e3, tab: q1.length ? 1 : 2, cur: 0, a2: {}, a3: {}, end: Date.now() + mins * 60000, done: false, t0: Date.now() };
    q1.forEach(function (q, i) { W['x' + i] = { q: q, u: { dr: [['', 0]], cr: [['', 0]] }, chips: B.chipsFor(Object.assign({}, q, { lv: 3 })), pre: false, exam: true }; });
    [['e2', e2], ['e3', e3]].forEach(function (x) { if (!x[1]) return; x[1].parts.forEach(function (p, i) { if (p.kind === 'shiwake') W[x[0] + '-' + i] = { q: p, u: { dr: [['', 0]], cr: [['', 0]] }, chips: B.chipsFor(Object.assign({ lv: 3 }, p)), pre: false, exam: true }; }); });
    go('exam', {}, { replace: true });
  }
  /* 小問の選択肢を並べ替えた写しを作る(正解がいつも同じ位置にならないように) */
  function shuffleSet(x) {
    if (!x) return x;
    var c = JSON.parse(JSON.stringify(x));
    c.parts.forEach(function (p) {
      if (p.kind !== 'choice' || p.noShuffle) return;
      var idx = p.choices.map(function (_, i) { return i; });
      for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      p.choices = idx.map(function (i) { return p.choices[i]; });
      p.ans = idx.indexOf(p.ans);
    });
    return c;
  }
  function examLeft() { return Math.max(0, EXAM.end - Date.now()); }
  function fmtT(ms) { var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  var exTimer = null;
  VIEWS.exam = function () {
    if (!EXAM) return VIEWS.examTop();
    var E = EXAM, h = '<div class="scr noNav"><div class="top"><button class="iconBtn back" data-act="back">✕</button><div class="grow"><div class="seg">' +
      (E.q1.length ? '<button class="' + (E.tab === 1 ? 'on' : '') + '" data-act="exTab" data-v="1">第1問</button>' : '') +
      (E.e2 ? '<button class="' + (E.tab === 2 ? 'on' : '') + '" data-act="exTab" data-v="2">第2問</button>' : '') +
      (E.e3 ? '<button class="' + (E.tab === 3 ? 'on' : '') + '" data-act="exTab" data-v="3">第3問</button>' : '') +
      '</div></div><span class="timer" id="exTimer">' + fmtT(examLeft()) + '</span></div>';
    if (E.tab === 1) {
      var q = E.q1[E.cur];
      h += '<div class="exGrid mb0" id="exGrid">' + gridBtns() + '</div>';
      h += '<div class="qcard mt12"><div class="muted small" style="font-weight:800">第1問 (' + (E.cur + 1) + ') ・ 3点</div><div class="qtext">' + B.rich(q.q, { acc: false }) + '</div>' + B.docFig(q.doc) + '</div>';
      h += jwHtml('x' + E.cur);
      h += '<div class="btns2 mt16"><button class="btn sub" data-act="exMove" data-v="-1"' + (E.cur ? '' : ' disabled') + '>‹ 前へ</button><button class="btn sub" data-act="exMove" data-v="1">' + (E.cur < E.q1.length - 1 ? 'つぎへ ›' : (E.e2 ? '第2問へ ›' : '見直す')) + '</button></div>';
    } else {
      var X = E.tab === 2 ? E.e2 : E.e3, key = E.tab === 2 ? 'e2' : 'e3', ans = E.tab === 2 ? E.a2 : E.a3;
      h += '<div class="qcard"><div class="muted small" style="font-weight:800">第' + E.tab + '問 ・ ' + (E.tab === 2 ? 20 : 35) + '点 ・ ' + esc(X.title) + '</div><div class="qtext" style="font-size:15.5px">' + B.rich(X.intro, { acc: false }) + '</div>' + (X.figs || []).map(B.fig).join('');
      X.parts.forEach(function (p, i) { h += partHtml(p, i, key, ans, false); });
      h += '</div>';
      h += '<button class="fab" data-act="exDocs">📋 資料を見る</button>';
      if (E.tab === 2 && E.e3) h += '<button class="btn sub" data-act="exTab" data-v="3">第3問へ ›</button>';
    }
    h += '<button class="btn mt12" data-act="exSubmit">📮 提出して採点する</button>';
    return h + '</div>';
  };
  AFTER.exam = function () {
    clearInterval(exTimer);
    exTimer = setInterval(function () {
      if (!EXAM || screen !== 'exam') { clearInterval(exTimer); return; }
      var el = document.getElementById('exTimer'), l = examLeft();
      if (el) { el.textContent = fmtT(l); el.classList.toggle('low', l < 5 * 60000); }
      if (l <= 0) { clearInterval(exTimer); toast('時間です!採点します'); examSubmit(); }
    }, 1000);
    // 数字の入力欄
    $app.querySelectorAll('input.numIn').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var raw = inp.value.replace(/[^\d]/g, ''); var ans = inp.getAttribute('data-k') === 'e2' ? EXAM.a2 : EXAM.a3;
        ans[inp.getAttribute('data-i')] = raw;
      });
      inp.addEventListener('blur', function () { if (inp.value) inp.value = F(Number(inp.value.replace(/[^\d]/g, ''))); });
    });
  };
  function gridBtns() {
    return EXAM.q1.map(function (q, i) { var u = W['x' + i].u, done = u.dr.some(function (l) { return l[0] && l[1]; }) && u.cr.some(function (l) { return l[0] && l[1]; }); return '<button class="' + (done ? 'done' : '') + (i === EXAM.cur ? ' cur' : '') + '" data-act="exGo" data-v="' + i + '">' + (i + 1) + '</button>'; }).join('');
  }
  function updateExamGrid() { var g = document.getElementById('exGrid'); if (g) g.innerHTML = gridBtns(); }
  function partHtml(p, i, key, ans, review) {
    var h = '<div class="part"><div class="pl"><span>' + esc(p.label || ('問' + (i + 1))) + '</span><span>' + (review ? (review[i] ? '<span class="mark ok">○ ' + p.pts + '点</span>' : '<span class="mark ng">✕ 0点</span>') : p.pts + '点') + '</span></div><div class="pq">' + B.rich(p.q, { acc: false }) + '</div>';
    if (review) {
      h += answerView(p, { u: p.kind === 'shiwake' ? W[key + '-' + i].u : ans[i], ok: review[i] });
    } else if (p.kind === 'shiwake') h += jwHtml(key + '-' + i);
    else if (p.kind === 'choice') h += '<div class="opts">' + p.choices.map(function (c, ci) { return '<button class="opt' + (String(ans[i]) === String(ci) ? ' sel' : '') + '" data-act="exChoice" data-k="' + key + '" data-i="' + i + '" data-v="' + ci + '"><span class="k">' + 'ABCDEFGH'[ci] + '</span><span>' + B.rich(c, { acc: false }) + '</span></button>'; }).join('') + '</div>';
    else if (p.kind === 'tf') h += '<div class="tf"><button class="opt o' + (ans[i] === true ? ' sel' : '') + '" data-act="exTF" data-k="' + key + '" data-i="' + i + '" data-v="1">○</button><button class="opt x' + (ans[i] === false ? ' sel' : '') + '" data-act="exTF" data-k="' + key + '" data-i="' + i + '" data-v="0">✕</button></div>';
    else if (p.kind === 'num') h += '<input class="numIn" inputmode="numeric" pattern="[0-9]*" data-k="' + key + '" data-i="' + i + '" placeholder="金額(円)" value="' + (ans[i] ? F(Number(ans[i])) : '') + '">';
    return h + '</div>';
  }
  function gradePart(p, i, key, ans) {
    if (p.kind === 'shiwake') { var u = W[key + '-' + i].u; return B.checkShiwake(p, u.dr, u.cr).ok; }
    if (p.kind === 'choice') return String(ans[i]) === String(p.ans);
    if (p.kind === 'tf') return ans[i] === p.ans;
    if (p.kind === 'num') return Number(ans[i]) === p.ans;
    return false;
  }
  function examSubmit() {
    var E = EXAM; if (!E || E.done) return;
    clearInterval(exTimer);
    var s1 = 0, r1 = E.q1.map(function (q, i) { var u = W['x' + i].u, ok = B.checkShiwake(q, u.dr, u.cr).ok; if (ok) s1 += 3; return ok; });
    var s2 = 0, r2 = E.e2 ? E.e2.parts.map(function (p, i) { var ok = gradePart(p, i, 'e2', E.a2); if (ok) s2 += p.pts; return ok; }) : [];
    var s3 = 0, r3 = E.e3 ? E.e3.parts.map(function (p, i) { var ok = gradePart(p, i, 'e3', E.a3); if (ok) s3 += p.pts; return ok; }) : [];
    var max = (E.q1.length ? 45 : 0) + (E.e2 ? 20 : 0) + (E.e3 ? 35 : 0), score = s1 + s2 + s3;
    E.done = true; E.r = { r1: r1, r2: r2, r3: r3, s1: s1, s2: s2, s3: s3, score: score, max: max, pass: score >= max * 0.7, mins: Math.round((Date.now() - E.t0) / 60000) };
    // 第1問は習熟度にも反映(記録だけ・XPは控えめ)
    E.q1.forEach(function (q, i) { B.record(q, r1[i]); });
    S.exams.push({ at: Date.now(), kind: E.kind, score: score, max: max, pass: E.r.pass, ids: [E.e2 && E.e2.id, E.e3 && E.e3.id].filter(Boolean), s: [s1, s2, s3] });
    B.addXp(Math.round(score / 2)); B.save();
    go('examResult', {}, { replace: true });
    if (E.r.pass) setTimeout(function () { sfx('lv'); confetti(); }, 300);
  }
  VIEWS.examResult = function (p) {
    var E = EXAM; if (!E || !E.r) return VIEWS.examTop();
    var R = E.r, tab = p.tab || 0;
    var h = '<div class="scr noNav">' + topBar('採点結果', R.mins + '分で提出');
    h += '<div class="result"><div class="em">' + (R.pass ? '🎊' : '📈') + '</div><h2>' + R.score + ' / ' + R.max + ' 点</h2><div style="font-weight:900;font-size:18px;color:' + (R.pass ? 'var(--ok)' : 'var(--ng)') + '">' + (R.pass ? '合格ライン こえ!' : '合格まで あと ' + (Math.ceil(R.max * 0.7) - R.score) + '点') + '</div></div>';
    h += '<div class="stat3">' + (E.q1.length ? '<div><b>' + R.s1 + '</b><span>第1問 /45</span></div>' : '') + (E.e2 ? '<div><b>' + R.s2 + '</b><span>第2問 /20</span></div>' : '') + (E.e3 ? '<div><b>' + R.s3 + '</b><span>第3問 /35</span></div>' : '') + '</div>';
    h += '<div class="seg full" style="margin-bottom:12px">' + (E.q1.length ? '<button class="' + (tab === 0 ? 'on' : '') + '" data-act="exrTab" data-v="0">第1問</button>' : '') + (E.e2 ? '<button class="' + (tab === 2 ? 'on' : '') + '" data-act="exrTab" data-v="2">第2問</button>' : '') + (E.e3 ? '<button class="' + (tab === 3 ? 'on' : '') + '" data-act="exrTab" data-v="3">第3問</button>' : '') + '</div>';
    if (tab === 0 && E.q1.length) {
      h += '<div class="qlist">' + E.q1.map(function (q, i) { return '<button data-act="exrItem" data-v="' + i + '"><span class="mk">' + (R.r1[i] ? '⭕' : '❌') + '</span><span class="tx">(' + (i + 1) + ') ' + esc(q.q) + '</span><span>›</span></button>'; }).join('') + '</div>';
    } else {
      var X = tab === 2 ? E.e2 : E.e3, key = tab === 2 ? 'e2' : 'e3', ans = tab === 2 ? E.a2 : E.a3, rr = tab === 2 ? R.r2 : R.r3;
      if (X) {
        h += '<div class="qcard"><div class="qtext" style="font-size:15px">' + B.rich(X.intro, { acc: false }) + '</div>' + (X.figs || []).map(B.fig).join('') + X.parts.map(function (pp, i) { return partHtml(pp, i, key, ans, rr); }).join('') + '</div>';
        h += exBlock(X.ex, p.lvl || S.set.exp, 'exrEx');
      }
    }
    h += '<button class="btn mt12" data-act="go" data-v="examTop">もう一度 挑戦する</button><button class="btn ghost mt8" data-act="home">ホームへ</button>';
    return h + '</div>';
  };

  /* ---------- 辞典 ---------- */
  var dictQ = '', dictTab = 'all';
  VIEWS.dict = function () {
    var h = '<div class="scr">' + tabTop('用語・科目じてん');
    h += '<div class="search"><span>🔎</span><input id="dictIn" type="search" placeholder="例: うりかけ / 減価償却 / 借方" value="' + esc(dictQ) + '" autocomplete="off"></div>';
    h += '<div class="seg full" style="margin-bottom:12px">' + [['all', 'ぜんぶ'], ['acc', '勘定科目'], ['word', '用語']].map(function (x) { return '<button class="' + (dictTab === x[0] ? 'on' : '') + '" data-act="dictTab" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
    h += '<div id="dictList">' + dictList() + '</div>';
    return h + '</div>';
  };
  function dictList() {
    var w = B.cleanWord(dictQ), out = [];
    if (dictTab !== 'word') Object.keys(B.accounts).forEach(function (n) {
      var a = B.accounts[n];
      if (w && (B.cleanWord(n) + B.cleanWord(a.y) + a.a.map(B.cleanWord).join('')).indexOf(w) < 0) return;
      out.push('<button class="gl" data-act="accInfo" data-acc="' + esc(n) + '"><span class="gtag ' + a.g + '">' + B.groupName[a.g] + '</span><span class="grow"><span class="w">' + esc(n) + '</span> <span class="y">' + esc(a.y) + '</span><br><span class="n">' + esc(a.n) + '</span></span></button>');
    });
    if (dictTab !== 'acc') B.glossary.forEach(function (g) {
      if (w && (B.cleanWord(g.w) + B.cleanWord(g.y)).indexOf(w) < 0) return;
      out.push('<button class="gl" data-act="glossInfo" data-v="' + esc(g.w) + '"><span class="gtag ot">用語</span><span class="grow"><span class="w">' + esc(g.w) + '</span> <span class="y">' + esc(g.y) + '</span><br><span class="n">' + esc(String(g.s).slice(0, 44)) + (String(g.s).length > 44 ? '…' : '') + '</span></span></button>');
    });
    return out.length ? out.slice(0, 200).join('') : '<div class="muted center mt16">見つかりませんでした</div>';
  }
  AFTER.dict = function () {
    var inp = document.getElementById('dictIn');
    inp.addEventListener('input', function () { dictQ = inp.value; document.getElementById('dictList').innerHTML = dictList(); });
  };
  function accInfo(name) {
    var a = B.accounts[name]; if (!a) return;
    var g = B.glossary.filter(function (x) { return x.w === name; })[0];
    var home = B.groupHome[a.g];
    var uses = B.templates.filter(function (t) { return false; });
    var h = '<div class="grab"></div><div class="row"><span class="gtag ' + a.g + '">' + B.groupName[a.g] + '</span>' + (a.r === 'old' ? '<span class="pill">2027年3月までの試験</span>' : a.r === 'new' ? '<span class="pill pri">🆕 2027年4月〜</span>' : '') + '</div>' +
      '<h3 style="font-size:22px;margin:8px 0 0">' + esc(name) + '</h3><div class="muted">' + esc(a.y) + (a.a.length ? ' ・ 別名: ' + esc(a.a.join('、')) : '') + '</div>' +
      '<div class="card mt12">' + esc(a.n) + '</div>';
    if (home) h += B.fig({ type: 't', title: name, dr: [[home === 'dr' ? '増えたら こっち' : '減ったら こっち', '']], cr: [[home === 'cr' ? '増えたら こっち' : '減ったら こっち', '']] });
    if (g) h += '<div class="mt12">' + exSeg(S.set.exp, 'glLvl') + '<div class="exText mt12" id="glText" data-w="">' + B.rich(g[S.set.exp]) + '</div></div>';
    openSheet(h);
    sheetCtx = { type: 'gloss', g: g };
  }
  function glossInfo(word) {
    var g = B.glossary.filter(function (x) { return x.w === word; })[0]; if (!g) { if (B.accounts[word]) accInfo(word); return; }
    var h = '<div class="grab"></div><span class="gtag ot">用語</span><h3 style="font-size:22px;margin:8px 0 0">' + esc(g.w) + '</h3><div class="muted">' + esc(g.y) + ' ・ ' + esc(topicName(g.topic)) + '</div>' +
      '<div class="mt12">' + exSeg(S.set.exp, 'glLvl') + '<div class="exText mt12" id="glText">' + B.rich(g[S.set.exp]) + '</div></div>';
    openSheet(h); sheetCtx = { type: 'gloss', g: g };
  }

  /* ---------- 記録 ---------- */
  VIEWS.stats = function () {
    var ul = B.userLevel(), ps = B.passScore(), tot = 0, ok = 0, days = 0;
    Object.keys(S.days).forEach(function (k) { tot += S.days[k].n; ok += S.days[k].ok; if (S.days[k].n) days++; });
    var h = '<div class="scr">' + tabTop('記録', '<button class="iconBtn" data-act="go" data-v="settings">⚙️</button>');
    h += '<div class="card"><div class="row">' + B.ring(ul.cur / ul.need, 72, 8, 'var(--pri)', 'var(--bg2)', '<span style="font-size:20px">' + ul.lv + '</span><small>Lv</small>') + '<div class="grow"><div style="font-weight:900;font-size:18px">' + esc(B.rankName()) + '</div><div class="muted">次のLvまで ' + (ul.need - ul.cur) + ' XP ・ 合計 ' + S.xp + ' XP</div></div></div></div>';
    h += '<div class="stat3"><div><b>' + tot + '</b><span>解いた問題</span></div><div><b>' + (tot ? Math.round(ok / tot * 100) : 0) + '%</b><span>正解率</span></div><div><b>' + B.streakNow() + '</b><span>連続日数 🔥</span></div></div>';
    h += '<div class="card"><h2>合格予想</h2>' + (ps == null ? '<div class="muted">8問以上 解くと表示します。</div>' : '<div class="gauge"><div class="gv">' + ps + '<small> 点</small></div><div class="grow small">' + esc(B.rankName()) + '</div></div><div class="gline"><i data-w="' + ps + '" style="width:0"></i><div class="pass"></div></div>') + '</div>';
    // 4週間のカレンダー
    var cells = '', now = new Date();
    for (var i = 27; i >= 0; i--) { var d = new Date(now.getTime() - i * 86400000), k = B.today(d), n = S.days[k] ? S.days[k].n : 0; cells += '<i class="' + (n >= S.set.goal ? 'h3' : n >= Math.ceil(S.set.goal / 2) ? 'h2' : n ? 'h1' : '') + (i === 0 ? ' today' : '') + '" title="' + k + ' ' + n + '問"></i>'; }
    h += '<div class="card"><h2>この4週間(学習した日 ' + days + '日)</h2><div class="heat">' + cells + '</div><div class="muted mt8">濃いほど たくさん解いた日。目標 ' + S.set.goal + '問で いちばん濃い色</div></div>';
    h += '<div class="card"><h2>分野ごとの習熟度</h2>' + B.topics.filter(function (t) { return t.w > 0 && !(t.id === 'tegata' && S.set.range === 'new'); }).map(function (t) { var st = B.topicStat(t.id), m = Math.round(st.m); return '<button class="row mt8" style="width:100%;text-align:left" data-act="openTopic" data-v="' + t.id + '"><span style="width:24px">' + t.icon + '</span><span class="grow"><span class="row small"><span class="grow">' + esc(t.name) + '</span>' + lvTag(B.lvLabel(t.id)) + '<b style="width:42px;text-align:right">' + m + '%</b></span><div class="bar"><i data-w="' + m + '"></i></div></span></button>'; }).join('') + '</div>';
    if (S.exams.length) h += '<div class="card"><h2>模擬試験</h2>' + S.exams.slice(-8).map(function (e) { var dt = new Date(e.at); return '<div class="row small mt8"><span class="grow">' + (dt.getMonth() + 1) + '/' + dt.getDate() + '</span><div class="bar grow" style="margin:0"><i data-w="' + Math.round(e.score / e.max * 100) + '"></i></div><b>' + e.score + '/' + e.max + '</b></div>'; }).join('') + '</div>';
    var weak = B.weakList().slice(0, 8);
    if (weak.length) h += '<div class="sec">よくまちがえる問題</div><div class="qlist">' + weak.map(function (x, i) { var q = B.make(x.tp, 7); return '<button data-act="weakItem" data-v="' + x.tp.id + '"><span class="mk">❌' + x.ng + '</span><span class="tx">' + esc(q.q.replace(/\n/g, ' ')) + '</span><span>›</span></button>'; }).join('') + '</div><button class="btn sub mt8" data-act="startReview">🔁 まとめて復習する</button>';
    return h + '</div>';
  };

  /* ---------- 設定 ---------- */
  VIEWS.settings = function () {
    var s = S.set;
    function seg(key, opts) { return '<div class="seg">' + opts.map(function (o) { return '<button class="' + (String(s[key]) === String(o[0]) ? 'on' : '') + '" data-act="setOpt" data-k="' + key + '" data-v="' + o[0] + '" data-stay="1">' + o[1] + '</button>'; }).join('') + '</div>'; }
    var h = '<div class="scr noNav">' + topBar('設定');
    h += '<div class="card"><div class="set"><div class="grow"><div class="t">受験する時期</div><div class="d">2027年4月から範囲が変わります(手形がなくなり、定率法・除却などが増える)</div></div></div><div class="choice">' +
      chooseBtn('range', 'old', '📅', '2027年3月までに受ける', '今の範囲') + chooseBtn('range', 'new', '🆕', '2027年4月以降に受ける', '新しい範囲') + chooseBtn('range', 'all', '💼', '決めていない・実務のため', '両方とも') + '</div></div>';
    h += '<div class="card">' +
      '<div class="set"><div class="grow"><div class="t">説明の くわしさ</div><div class="d">答えのあとに最初に出す説明</div></div>' + seg('exp', [['s', 'やさしく'], ['m', 'ふつう'], ['l', 'くわしく']]) + '</div>' +
      '<div class="set"><div class="grow"><div class="t">1日の目標</div></div>' + seg('goal', [[3, '3問'], [10, '10問'], [20, '20問']]) + '</div>' +
      '<div class="set"><div class="grow"><div class="t">仕訳の答え方</div><div class="d">入力は、自分で科目を書く(声でもOK)。覚えるのに効く</div></div>' + seg('mode', [['tap', 'タップ'], ['type', '入力']]) + '</div>' +
      '<div class="set"><div class="grow"><div class="t">効果音</div></div>' + seg('sound', [['true', 'あり'], ['false', 'なし']]) + '</div>' +
      '<div class="set"><div class="grow"><div class="t">画面の色</div></div>' + seg('theme', [['auto', '自動'], ['light', '明るい'], ['dark', '暗い']]) + '</div>' +
      '<div class="set"><div class="grow"><div class="t">文字の大きさ</div></div>' + seg('size', [['m', 'ふつう'], ['l', '大きい']]) + '</div></div>';
    h += '<div class="card"><div class="set"><div class="grow"><div class="t">レベル診断を もう一度</div><div class="d">今のレベルをはかり直す</div></div><button class="pill pri" data-act="startPlacement">診断</button></div>' +
      '<div class="set"><div class="grow"><div class="t">記録を書き出す</div><div class="d">機種変更のとき用。文字をコピーして保存</div></div><button class="pill" data-act="exportData">書き出す</button></div>' +
      '<div class="set"><div class="grow"><div class="t">記録を読みこむ</div></div><button class="pill" data-act="importData">読みこむ</button></div>' +
      '<div class="set"><div class="grow"><div class="t">記録を全部消す</div></div><button class="pill ng" data-act="resetAll">消す</button></div></div>';
    h += '<div class="muted center">まなぼき 簿記3級 ・ 無料・広告なし・登録なし<br>記録はこのスマホの中だけに保存されます<br>問題数 ' + B.templates.length + '種類(数字が変わるので実質無限)・レッスン ' + B.lessons.length + '本・用語 ' + (B.glossary.length + Object.keys(B.accounts).length) + '語<br><span class="small">日商簿記検定の公式アプリではありません</span></div>';
    return h + '</div>';
  };

  function applyTheme() {
    var r = document.documentElement;
    if (S.set.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.set.theme);
    r.setAttribute('data-size', S.set.size);
    var dark = S.set.theme === 'dark' || (S.set.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#0b1220' : '#f3f5fa');
  }

  /* =========================================================
     ボタンの動き
     ========================================================= */
  var ACTS = {
    home: function () { goHome(); },
    back: function () { back(); },
    go: function (d) { go(d.v); },
    tab: function (d) { go(d.tab); },
    wStep: function (d) { go('welcome', { step: Number(d.v) }, { replace: true }); },
    setOpt: function (d) {
      var v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = Number(v);
      S.set[d.k] = v; B.save(); applyTheme();
      render();
    },
    setGoal: function (d) { S.set.goal = Number(d.v); B.save(); render(); },
    startPlacement: function () { S.set.onboarded = true; B.save(); startSession(B.placementSet(), 'レベル診断', { type: 'placement' }); },
    skipPlacement: function () { S.set.onboarded = true; B.save(); goHome(); },
    afterPlacement: function () { SES = null; goHome(); var nl = nextLesson(); if (nl && B.passScore() != null && B.passScore() < 40) setTimeout(function () { toast('まずは「つぎのレッスン」から読むのがおすすめ'); }, 400); },
    startAuto: function () { var d = B.dayStat(), left = Math.max(5, Math.min(10, S.set.goal - d.n)); startSession(B.pickSet({ n: left, mode: 'auto' }), 'おまかせ'); },
    startQuick: function () { startSession(B.pickSet({ n: 3, mode: 'auto' }), '3問だけ'); },
    startReview: function () { var qs = B.pickSet({ n: 10, mode: 'review', fill: false }); if (!qs.length) { toast('復習する問題はまだありません 👍'); return; } startSession(qs, '復習'); },
    startWeak: function () { startSession(B.pickSet({ n: 10, mode: 'weak' }), '苦手克服'); },
    startUp: function () { startSession(B.pickSet({ n: 10, mode: 'auto', lvMin: 2 }), 'チャレンジ'); },
    startShiwake: function () { startSession(B.pickSet({ n: 15, kinds: ['shiwake'], mode: 'auto' }), '仕訳トレーニング'); },
    startType: function () { startSession(B.pickSet({ n: 10, kinds: ['shiwake'], mode: 'auto' }), '入力で答える', { mode: 'type' }); },
    startTopic: function (d) { startSession(B.pickSet({ n: 10, topics: [d.v], mode: 'auto' }), topicName(d.v)); },
    retryWrong: function () { var qs = SES.res.filter(function (r) { return !r.ok; }).map(function (r) { var tp = B.templates.filter(function (t) { return t.id === r.q.id; })[0]; return tp ? B.make(tp, Math.floor(Math.random() * 1e9) + 1) : r.q; }); startSession(qs, 'まちがえた問題'); },
    openTopic: function (d) { go('topic', { id: d.v }); },
    openLesson: function (d) { LS = null; go('lesson', { id: d.v }); },
    lsLvl: function (d) { LS.lvl = d.v; render(); },
    lsNext: function () { var l = B.lessons.filter(function (x) { return x.id === LS.id; })[0]; if (LS.i < l.cards.length) { LS.i++; sfx('tap'); render(); window.scrollTo(0, 0); } },
    lsPrev: function () { if (LS.i > 0) { LS.i--; render(); window.scrollTo(0, 0); } },
    lsQuiz: function (d) { var l = B.lessons.filter(function (x) { return x.id === LS.id; })[0], q = l.quiz[Number(d.q)]; LS.qa[d.q] = Number(d.v); sfx(Number(d.v) === q.ans ? 'ok' : 'ng'); render(); },
    lsDone: function () { var l = finishLesson(); startSession(B.pickSet({ n: 5, topics: [l.topic], mode: 'auto' }), topicName(l.topic) + '(レッスンのあと)'); },
    lsFinish: function () { finishLesson(); back(); },
    qMode: function (d) { Q.mode = d.v; SES.mode = d.v; render(); },
    qHint: function () { Q.hint = true; render(); },
    qGiveup: function () { doCheck(true); },
    qCheck: function () { if (canCheck()) doCheck(false); },
    qSel: function (d) { Q.sel = Number(d.v); sfx('tap'); render(); },
    qTF: function (d) { Q.sel = d.v === '1'; doCheck(false); },
    qNum: function (d) { if (d.v === 'go') { if (Q.num === '') { toast('数字を入れてください'); return; } doCheck(false); } else padKey(d.v, 'q'); },
    qEx: function (d) { Q.exLvl = d.v; render(); var el = document.querySelector('.exBox'); if (el) el.scrollIntoView({ block: 'start' }); },
    askMore: function () {
      var q = Q.q, lvl = Q.exLvl === 'l' ? 'm' : 's';
      Q.exLvl = lvl; render();
      var el = document.querySelector('.exBox'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(lvl === 's' ? 'いちばん やさしい説明にしました' : 'ふつうの説明にしました');
      setTimeout(function () { var ls = lessonsOf(q.topic); if (ls.length) toast('レッスンで図を見ると、もっと分かりやすいですよ'); }, 2200);
    },
    qNext: function () { SES.i++; if (SES.i >= SES.qs.length) finishSession(); else { startQ(); render(); window.scrollTo(0, 0); } },
    jwAcc: function (d) { openAccSheet(d.k, d.s, Number(d.i)); },
    jwAmt: function (d) { openPadSheet(d.k, d.s, Number(d.i)); },
    jwAdd: function (d) { W[d.k].u[d.s].push(['', 0]); refreshJw(d.k); },
    jwDel: function (d) { W[d.k].u[d.s].splice(Number(d.i), 1); refreshJw(d.k); },
    pickAcc: function (d) { pickAcc(d.v); },
    sheetTypeMode: function () { var c = sheetCtx; if (Q && c.key === 'cur') { Q.mode = 'type'; SES.mode = 'type'; } else S.set.mode = 'type'; openAccSheet(c.key, c.side, c.i); },
    sheetTapMode: function () { var c = sheetCtx; if (Q && c.key === 'cur') { Q.mode = 'tap'; SES.mode = 'tap'; } else S.set.mode = 'tap'; openAccSheet(c.key, c.side, c.i); },
    mic: function () { startMic(); },
    pad: function (d) { if (d.v === 'go') padCommit(); else padKey(d.v, 'p'); },
    padQuick: function (d) { padVal = String(d.v); showPad(); padCommit(); },
    reviewItem: function (d) { go('reviewOne', { i: Number(d.v) }); },
    rvEx: function (d) { params.lvl = d.v; render(); },
    weakItem: function (d) { var tp = B.templates.filter(function (t) { return t.id === d.v; })[0]; if (tp) go('reviewOne', { i: 0, list: [{ q: B.make(tp, 7), ok: null }] }); },
    accInfo: function (d) { accInfo(d.acc); },
    glossInfo: function (d) { glossInfo(d.v); },
    glLvl: function (d) { var c = sheetCtx; if (!c || !c.g) return; var el = document.getElementById('glText'); if (el) el.innerHTML = B.rich(c.g[d.v]); $sheet.querySelectorAll('[data-act=glLvl]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === d.v); }); },
    exLvl: function () { },
    dictTab: function (d) { dictTab = d.v; render(); },
    examStart: function (d) { examStart(d.v); },
    exTab: function (d) { EXAM.tab = Number(d.v); render(); window.scrollTo(0, 0); },
    exGo: function (d) { EXAM.cur = Number(d.v); render(); },
    exMove: function (d) { var n = EXAM.cur + Number(d.v); if (n >= EXAM.q1.length) { if (EXAM.e2) { EXAM.tab = 2; render(); window.scrollTo(0, 0); } return; } EXAM.cur = Math.max(0, n); render(); },
    exChoice: function (d) { var ans = d.k === 'e2' ? EXAM.a2 : EXAM.a3; ans[d.i] = Number(d.v); var y = window.scrollY; render(); window.scrollTo(0, y); },
    exTF: function (d) { var ans = d.k === 'e2' ? EXAM.a2 : EXAM.a3; ans[d.i] = d.v === '1'; var y = window.scrollY; render(); window.scrollTo(0, y); },
    exDocs: function () { var X = EXAM.tab === 2 ? EXAM.e2 : EXAM.e3; openSheet('<div class="grab"></div><h3>📋 資料(第' + EXAM.tab + '問)</h3><div class="qtext" style="font-size:14.5px">' + B.rich(X.intro, { acc: false }) + '</div>' + (X.figs || []).map(B.fig).join('') + '<button class="btn mt12" data-act="closeSheet">とじる</button>'); },
    closeSheet: function () { closeSheet(); },
    exSubmit: function () {
      var blank = EXAM.q1.filter(function (q, i) { var u = W['x' + i].u; return !u.dr.some(function (l) { return l[0]; }); }).length;
      confirmBox('提出しますか?', (blank ? 'まだ答えていない第1問が ' + blank + '問あります。' : '') + '提出すると採点します。', '提出する', 'もどる', examSubmit);
    },
    exrTab: function (d) { params.tab = Number(d.v); render(); },
    exrItem: function (d) { var i = Number(d.v), q = EXAM.q1[i]; go('reviewOne', { i: 0, list: [{ q: q, ok: EXAM.r.r1[i], u: W['x' + i].u }] }); },
    exrEx: function (d) { params.lvl = d.v; render(); },
    exportData: function () {
      var txt = B.exportData();
      var h = '<div class="grab"></div><h3>記録の書き出し</h3><div class="muted small">下の文字を全部コピーして、メモなどに保存してください。</div><textarea id="exTxt" style="width:100%;height:160px;border-radius:12px;border:1px solid var(--line);background:var(--card);padding:10px;font-size:16px;margin-top:8px">' + esc(txt) + '</textarea><button class="btn mt8" data-act="copyEx">コピーする</button>';
      openSheet(h);
    },
    copyEx: function () { var t = document.getElementById('exTxt'); t.select(); try { if (navigator.clipboard) navigator.clipboard.writeText(t.value); else document.execCommand('copy'); toast('コピーしました'); } catch (e) { document.execCommand('copy'); toast('コピーしました'); } },
    importData: function () { var h = '<div class="grab"></div><h3>記録の読みこみ</h3><div class="muted small">書き出した文字を貼りつけてください。今の記録は置きかわります。</div><textarea id="imTxt" style="width:100%;height:160px;border-radius:12px;border:1px solid var(--line);background:var(--card);padding:10px;font-size:16px;margin-top:8px"></textarea><button class="btn mt8" data-act="doImport">読みこむ</button>'; openSheet(h); },
    doImport: function () { try { B.importData(document.getElementById('imTxt').value); S = B.S; applyTheme(); closeSheet(); toast('読みこみました'); goHome(); } catch (e) { toast('読みこめませんでした: ' + e.message); } },
    resetAll: function () { confirmBox('記録を全部消しますか?', '元にはもどせません。', '消す', 'やめる', function () { B.reset(); S = B.S; applyTheme(); go('welcome', { step: 0 }, { replace: true }); }); }
  };
  function finishLesson() {
    var l = B.lessons.filter(function (x) { return x.id === LS.id; })[0];
    if (!S.lessons[l.id]) { S.lessons[l.id] = Date.now(); B.addXp(20); var t = B.topicStat(l.topic); t.m = Math.min(100, t.m + 3); B.save(); toast('📖 レッスン完了 +20 XP'); }
    return l;
  }
  function act(name, d) { var fn = ACTS[name]; if (fn) fn(d || {}); }

  /* =========================================================
     はじめる
     ========================================================= */
  function boot() {
    S = B.load();
    $app = document.getElementById('app'); $nav = document.getElementById('nav'); $sheet = document.getElementById('sheet'); $sheetBack = document.getElementById('sheetBack'); $toast = document.getElementById('toast');
    applyTheme();
    if (window.matchMedia) try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (e) { }
    document.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-act],[data-tab]') : null;
      if (!el || el.disabled) return;
      if (el.hasAttribute('data-tab')) { go(el.getAttribute('data-tab')); return; }
      var d = {}; for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (a.name.indexOf('data-') === 0) d[a.name.slice(5)] = a.value; }
      act(el.getAttribute('data-act'), d);
      if (el.blur) el.blur();
    });
    $sheetBack.addEventListener('click', closeSheet);
    try { history.replaceState({ s: 'root' }, ''); history.pushState({ s: 'app' }, ''); } catch (e) { }
    var hash = location.hash;
    var dm = hash.match(/demo-([a-z0-9]+)/);
    if (!S.set.onboarded && !dm) { screen = 'welcome'; params = { step: 0 }; render(); }
    else goHome();
    if (dm) demo(dm[1]);
  }
  /* 確認用(スクリーンショットを撮るため): #demo-quiz など */
  function demo(w) {
    S.set.onboarded = true;
    if (w === 'quiz') { var tp = B.templates.filter(function (t) { return t.kind === 'shiwake' && t.lv === 2; })[0] || B.templates[0]; startSession([B.make(tp, 3)], 'おまかせ'); }
    else if (w === 'fb') { var tp2 = B.templates.filter(function (t) { return t.kind === 'shiwake' && t.lv === 2; })[0] || B.templates[0]; startSession([B.make(tp2, 3)], 'おまかせ'); W.cur.u.dr[0] = [W.cur.q.cr[0][0], W.cur.q.cr[0][1]]; W.cur.u.cr[0] = [W.cur.q.dr[0][0], W.cur.q.dr[0][1]]; doCheck(false); }
    else if (w === 'lesson') { var l = B.lessons[1] || B.lessons[0]; if (l) { LS = null; go('lesson', { id: l.id }); LS.i = 1; render(); } }
    else if (w === 'exam') examStart('full');
    else if (w === 'exam3') { examStart('full'); EXAM.tab = 3; render(); }
    else if (TABS[w] || VIEWS[w]) go(w);
  }

  B.app = { go: go, act: act, render: render, debug: function () { return { Q: Q, W: W, SES: SES, EXAM: EXAM, screen: screen }; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
