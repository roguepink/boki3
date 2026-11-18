/* 学習のしくみ: 記録・レベル(習熟度)・出題えらび・復習の間隔・答え合わせ */
(function () {
  'use strict';
  var B = window.BOKI;
  var KEY = 'boki3-v1';
  var DAY = 86400000;

  function today(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  B.today = today;

  function fresh() {
    return {
      v: 1, created: Date.now(),
      set: { range: 'old', exp: 'm', goal: 10, sound: true, mode: 'tap', theme: 'auto', size: 'm', onboarded: false },
      xp: 0, streak: { n: 0, last: '' }, days: {}, topics: {}, items: {}, lessons: {}, exams: [], placed: false, hist: []
    };
  }
  var S = fresh();
  var canSave = true;
  /* 用語のダブりを1つにする(先に読んだほうを残す) */
  (function () { var seen = {}, out = []; B.glossary.forEach(function (g) { if (!seen[g.w]) { seen[g.w] = 1; out.push(g); } }); B.glossary.length = 0; out.forEach(function (g) { B.glossary.push(g); }); })();
  B.load = function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var o = JSON.parse(raw), f = fresh();
        for (var k in f) if (!(k in o)) o[k] = f[k];
        for (var k2 in f.set) if (!(k2 in o.set)) o.set[k2] = f.set[k2];
        S = o;
      }
    } catch (e) { canSave = false; }
    B.S = S;
    return S;
  };
  B.save = function () { if (!canSave) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { canSave = false; } };
  B.canSave = function () { return canSave; };
  B.reset = function () { S = fresh(); B.S = S; B.save(); };
  B.exportData = function () { return JSON.stringify(S); };
  B.importData = function (txt) { var o = JSON.parse(txt); if (!o || o.v !== 1) throw new Error('形がちがいます'); S = o; B.S = S; B.save(); };

  /* 受験時期の範囲に入るか */
  B.inRange = function (r) {
    var set = S.set.range; r = r || 'both';
    if (r === 'both' || set === 'all') return true;
    return r === set;
  };

  /* 分野の習熟度 0〜100 */
  function T(id) { if (!S.topics[id]) S.topics[id] = { m: 0, n: 0, ok: 0 }; return S.topics[id]; }
  B.topicStat = T;
  /* 習熟度 → 出す問題のレベル */
  B.topicLv = function (id) { var m = T(id).m; return m < 35 ? 1 : m < 70 ? 2 : 3; };
  B.lvName = ['まだ', '初級', '中級', '上級'];
  B.lvLabel = function (id) { var t = T(id); if (!t.n) return 0; return B.topicLv(id); };

  /* 合格予想(0〜100点)。分野の重み × 習熟度。まだ少ししか解いていないときは null */
  B.passScore = function () {
    var sum = 0, wsum = 0, n = 0;
    B.topics.forEach(function (t) {
      if (!t.w) return;
      if (t.id === 'tegata' && S.set.range === 'new') return;
      var st = T(t.id); n += st.n;
      wsum += t.w; sum += t.w * Math.min(100, st.m * 1.05);
    });
    if (n < 8) return null;
    return Math.round(sum / wsum);
  };

  /* ユーザーの段(XP から) */
  B.userLevel = function () {
    var xp = S.xp, lv = 1, need = 60;
    while (xp >= need) { xp -= need; lv++; need = Math.round(60 + lv * 25); }
    return { lv: lv, cur: xp, need: need };
  };
  B.rankName = function () {
    var p = B.passScore();
    if (p == null) return 'これから';
    if (p >= 85) return '簿記マスター';
    if (p >= 70) return '合格圏';
    if (p >= 55) return 'あと一歩';
    if (p >= 35) return '基礎固め中';
    return 'スタート';
  };

  /* 今日の記録 */
  function D() { var k = today(); if (!S.days[k]) S.days[k] = { n: 0, ok: 0, xp: 0 }; return S.days[k]; }
  B.dayStat = D;
  function touchStreak() {
    var k = today();
    if (S.streak.last === k) return;
    var y = today(new Date(Date.now() - DAY));
    S.streak.n = S.streak.last === y ? S.streak.n + 1 : 1;
    S.streak.last = k;
  }
  B.streakNow = function () {
    var k = today(), y = today(new Date(Date.now() - DAY));
    return (S.streak.last === k || S.streak.last === y) ? S.streak.n : 0;
  };
  B.addXp = function (n) { S.xp += n; D().xp += n; };

  /* 復習の間隔(日) */
  var IV = [0.007, 1, 3, 7, 14, 30, 60];
  function I(id) { if (!S.items[id]) S.items[id] = { box: 0, due: 0, n: 0, ok: 0, ng: 0, last: 0 }; return S.items[id]; }
  B.itemStat = I;

  /* 答えた記録をつける。戻り値: { xp, lvUp: 分野が上のレベルに上がったら その分野id } */
  B.record = function (q, ok, opt) {
    opt = opt || {};
    var t = T(q.topic), before = B.topicLv(q.topic), wasN = t.n;
    var it = I(q.id), now = Date.now();
    t.n++; it.n++; it.last = now;
    var w = [0, 4, 6.5, 9][q.lv || 1];
    if (ok) {
      t.ok++; it.ok++;
      var gain = w * (1 - t.m / 125) * (opt.hint ? 0.5 : 1);
      if (q.lv > before) gain *= 1.4;
      t.m = Math.min(100, t.m + gain);
      it.box = Math.min(IV.length - 1, it.box + (opt.hint ? 0 : 1));
    } else {
      it.ng++;
      t.m = Math.max(0, t.m - (3 + (4 - (q.lv || 1))));
      it.box = 0;
    }
    it.due = now + IV[it.box] * DAY;
    var xp = ok ? (5 * (q.lv || 1) + (opt.hint ? 0 : 5)) : 2;
    B.addXp(xp);
    var d = D(); d.n++; if (ok) d.ok++;
    touchStreak();
    S.hist.push([now, q.id, ok ? 1 : 0]); if (S.hist.length > 600) S.hist.splice(0, S.hist.length - 600);
    B.save();
    var after = B.topicLv(q.topic);
    return { xp: xp, lvUp: (after > before && wasN > 0) ? q.topic : null, lvDown: after < before ? q.topic : null };
  };

  /* 復習の対象: 期限が来た まちがえたことのある問題 */
  B.dueList = function () {
    var now = Date.now(), out = [];
    B.templates.forEach(function (tp) {
      var it = S.items[tp.id];
      if (!it || !B.inRange(tp.range)) return;
      if (it.ng > 0 && it.due <= now && it.box < 5) out.push(tp);
    });
    return out;
  };
  B.weakList = function () {
    var out = [];
    B.templates.forEach(function (tp) { var it = S.items[tp.id]; if (it && it.ng > 0 && B.inRange(tp.range)) out.push({ tp: tp, ng: it.ng, ok: it.ok }); });
    out.sort(function (a, b) { return (b.ng - b.ok * 0.5) - (a.ng - a.ok * 0.5); });
    return out;
  };

  /* 出題えらび。opt: { topics:[...], kinds:[...], n, mode:'auto'|'review'|'weak'|'exam', lvMin } */
  B.pickSet = function (opt) {
    opt = opt || {};
    var n = opt.n || 10, now = Date.now();
    var pool = B.templates.filter(function (tp) {
      if (!B.inRange(tp.range)) return false;
      if (opt.topics && opt.topics.indexOf(tp.topic) < 0) return false;
      if (opt.kinds && opt.kinds.indexOf(tp.kind) < 0) return false;
      if (opt.lvMin && tp.lv < opt.lvMin) return false;
      return true;
    });
    if (opt.mode === 'review') {
      var due = B.dueList().filter(function (tp) { return pool.indexOf(tp) >= 0; });
      pool = due.length ? due : B.weakList().map(function (x) { return x.tp; }).filter(function (tp) { return pool.indexOf(tp) >= 0; });
    }
    if (!pool.length) return [];
    var weakTopics = {};
    if (opt.mode === 'weak' || opt.mode === 'auto') {
      var ts = B.topics.filter(function (t) { return t.w > 0; }).map(function (t) { return [t.id, T(t.id).m]; }).sort(function (a, b) { return a[1] - b[1]; });
      ts.slice(0, 4).forEach(function (x, i) { weakTopics[x[0]] = 4 - i; });
    }
    function weight(tp) {
      var target = B.topicLv(tp.topic), d = Math.abs(tp.lv - target);
      var w = [1, 0.3, 0.07][d];
      if (opt.mode === 'exam') w = tp.lv >= 2 ? 1 : 0.4;
      var it = S.items[tp.id];
      if (!it) w *= 1.4;
      else {
        if (it.ng > 0 && it.due <= now) w *= 3;
        if (now - it.last < 10 * 60000) w *= 0.15;
        if (it.box >= 4) w *= 0.4;
      }
      if (weakTopics[tp.topic]) w *= 1 + weakTopics[tp.topic] * (opt.mode === 'weak' ? 1.2 : 0.25);
      var tw = (B.topicById(tp.topic) || {}).w || 3;
      w *= 0.6 + tw / 12;
      if (tp.kind === 'shiwake') w *= 1.25;
      return w;
    }
    var out = [], used = {}, r = Math.random;
    var lastTopic = null;
    for (var k = 0; k < n * 4 && out.length < n; k++) {
      var tot = 0, ws = pool.map(function (tp) { var w = used[tp.id] ? 0 : weight(tp); if (tp.topic === lastTopic && pool.length > 8 && !opt.topics) w *= 0.5; tot += w; return w; });
      if (tot <= 0) break;
      var x = r() * tot, i = 0;
      while (x > ws[i]) { x -= ws[i]; i++; }
      var tp = pool[Math.min(i, pool.length - 1)];
      used[tp.id] = 1; lastTopic = tp.topic;
      out.push(tp);
    }
    // 足りないときは同じひな型を別の数字で
    while (out.length < n && pool.length && opt.fill !== false) out.push(pool[Math.floor(r() * pool.length)]);
    return out.map(function (tp) { return B.make(tp, Math.floor(Math.random() * 1e9) + 1); });
  };

  /* レベル診断の問題(分野ごとに1問ずつ・易しめから) */
  B.placementSet = function () {
    var ids = ['kiso', 'kiso', 'genkin', 'yokin', 'shohin', 'shohin', 'saiken', 'sonota', 'kotei', 'zei', 'hiyo', 'kashi', 'kessan', 'denpyo'];
    var out = [], used = {};
    ids.forEach(function (id, i) {
      var want = i < 4 ? 1 : 2;
      var c = B.templates.filter(function (tp) { return tp.topic === id && B.inRange(tp.range) && !used[tp.id] && tp.lv <= want; });
      if (!c.length) c = B.templates.filter(function (tp) { return tp.topic === id && B.inRange(tp.range) && !used[tp.id]; });
      if (!c.length) return;
      var pref = c.filter(function (tp) { return tp.lv === want; });
      var tp = (pref.length ? pref : c)[Math.floor(Math.random() * (pref.length ? pref : c).length)];
      used[tp.id] = 1; out.push(B.make(tp, Math.floor(Math.random() * 1e9) + 1));
    });
    return out;
  };
  /* 診断の結果を習熟度に反映 */
  B.applyPlacement = function (results) {
    var by = {}, all = 0, okAll = 0;
    results.forEach(function (r) { by[r.topic] = by[r.topic] || [0, 0]; by[r.topic][0]++; all++; if (r.ok) { by[r.topic][1]++; okAll++; } });
    var ratio = all ? okAll / all : 0;
    B.topics.forEach(function (t) {
      var st = T(t.id);
      if (by[t.id]) st.m = Math.max(st.m, Math.round(10 + 50 * by[t.id][1] / by[t.id][0] * (0.6 + ratio * 0.5)));
      else st.m = Math.max(st.m, Math.round(ratio * 35));
    });
    S.placed = true; B.save();
    return ratio;
  };

  /* ===== 答え合わせ ===== */
  function norm(lines) {
    var m = {};
    (lines || []).forEach(function (l) { if (!l || !l[0]) return; m[l[0]] = (m[l[0]] || 0) + (Number(l[1]) || 0); });
    return m;
  }
  function sameMap(a, b) {
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) if (b[ka[i]] !== a[ka[i]]) return false;
    return true;
  }
  /* まとめた名前と くわしい名前(どちらで書いても正解にする組) */
  var CANON = {
    '前払家賃': '前払費用', '前払保険料': '前払費用', '前払地代': '前払費用', '前払利息': '前払費用',
    '未払家賃': '未払費用', '未払利息': '未払費用', '未払給料': '未払費用', '未払地代': '未払費用',
    '前受家賃': '前受収益', '前受地代': '前受収益', '前受利息': '前受収益',
    '未収利息': '未収収益', '未収家賃': '未収収益', '未収地代': '未収収益',
    '建物減価償却累計額': '減価償却累計額', '備品減価償却累計額': '減価償却累計額', '車両運搬具減価償却累計額': '減価償却累計額',
    '従業員立替金': '立替金', '従業員預り金': '預り金', '前渡金': '前払金'
  };
  B.CANON = CANON;
  function canon(n) { return CANON[n] || n; }
  B.canon = canon;
  function canonMap(m) { var o = {}; Object.keys(m).forEach(function (k) { var c = canon(k); o[c] = (o[c] || 0) + m[k]; }); return o; }
  /* 仕訳を比べる。戻り値 { ok, notes:[{t, info}], mark:{dr:{}, cr:{}} } */
  B.checkShiwake = function (q, udr, ucr) {
    var ad = norm(q.dr), ac = norm(q.cr), ud = norm(udr), uc = norm(ucr);
    var ok = sameMap(ad, ud) && sameMap(ac, uc);
    var notes = [], mark = { dr: {}, cr: {} };
    if (ok) return { ok: true, notes: notes, mark: mark };
    /* 左右に同じ科目があるとき、差し引きした形が同じなら意味は同じ */
    function net(d, c) { var dd = {}, cc = {}; Object.keys(d).forEach(function (k) { dd[canon(k)] = (dd[canon(k)] || 0) + d[k]; }); Object.keys(c).forEach(function (k) { var x = canon(k); if (dd[x]) { var m = Math.min(dd[x], c[k]); dd[x] -= m; cc[x] = (cc[x] || 0) + c[k] - m; } else cc[x] = (cc[x] || 0) + c[k]; }); Object.keys(dd).forEach(function (k) { if (!dd[k]) delete dd[k]; }); Object.keys(cc).forEach(function (k) { if (!cc[k]) delete cc[k]; }); return [dd, cc]; }
    var na = net(ad, ac), nu = net(ud, uc);
    if (!(sameMap(canonMap(ad), canonMap(ud)) && sameMap(canonMap(ac), canonMap(uc))) && sameMap(na[0], nu[0]) && sameMap(na[1], nu[1])) {
      notes.push({ t: '正解です(差し引きすると同じ意味になります)。ただ、試験では上の「正しい仕訳」の形で書くのがふつうです。', info: true });
      return { ok: true, notes: notes, mark: mark, alias: true };
    }
    if (sameMap(canonMap(ad), canonMap(ud)) && sameMap(canonMap(ac), canonMap(uc))) {
      var pairs = [];
      Object.keys(ud).concat(Object.keys(uc)).forEach(function (k) { if (!(k in ad) && !(k in ac)) { var want = Object.keys(ad).concat(Object.keys(ac)).filter(function (a) { return canon(a) === canon(k); })[0]; if (want) pairs.push('「' + k + '」→「' + want + '」'); } });
      notes.push({ t: '正解です。' + pairs.join('、') + ' のように、くわしい名前でも まとめた名前でも意味は同じです。本番では、問題に書かれた科目の中から選びます。', info: true });
      return { ok: true, notes: notes, mark: mark, alias: true };
    }
    if (sameMap(ad, uc) && sameMap(ac, ud)) {
      notes.push({ t: '借方と貸方が**逆**になっています。科目と金額は合っています!増えた・減ったで左右を決めましょう(資産・費用が増えたら左)。' });
      return { ok: false, notes: notes, mark: mark, reversed: true };
    }
    var said = {};
    function side(ans, usr, name, key, other) {
      Object.keys(usr).forEach(function (acc) {
        if (!(acc in ans)) {
          mark[key][acc] = 'wrongline';
          if (said[acc]) return; said[acc] = 1;
          if (q.miss && q.miss[acc]) notes.push({ t: '「' + acc + '」→ ' + q.miss[acc] });
          else if (acc in other) notes.push({ t: '「' + acc + '」は' + (key === 'dr' ? '貸方' : '借方') + 'に入ります。' });
          else {
            var a = B.accounts[acc];
            notes.push({ t: '「' + acc + '」はこの取引では使いません。' + (a && a.n ? '(' + acc + ' = ' + a.n + ')' : '') });
          }
        } else if (usr[acc] !== ans[acc]) {
          mark[key][acc] = 'wrongline';
          notes.push({ t: '「' + acc + '」の金額がちがいます(あなた ' + B.f(usr[acc]) + ' 円)。計算をもう一度。', info: true });
        }
      });
      Object.keys(ans).forEach(function (acc) {
        if (!(acc in usr) && !said['m' + acc]) {
          said['m' + acc] = 1;
          var a = B.accounts[acc];
          notes.push({ t: name + 'に「' + acc + '」が足りません。' + (a && a.n ? '(' + a.n + ')' : ''), info: true });
        }
      });
    }
    side(ad, ud, '借方', 'dr', ac);
    side(ac, uc, '貸方', 'cr', ad);
    var sd = 0, sc = 0; Object.keys(ud).forEach(function (k) { sd += ud[k]; }); Object.keys(uc).forEach(function (k) { sc += uc[k]; });
    if (sd !== sc) notes.push({ t: '借方の合計(' + B.f(sd) + ')と貸方の合計(' + B.f(sc) + ')が合っていません。仕訳は必ず左右が同じ金額になります。', info: true });
    return { ok: false, notes: notes, mark: mark };
  };

  /* 正解の科目のグループから、自動のヒントを作る */
  B.hintFor = function (q) {
    if (q.kind !== 'shiwake') return q.pt ? '💡 ' + q.pt : 'まず、問題文の中の「お金・物・権利・義務」がどう動いたかを考えよう。';
    function gs(lines) {
      var seen = {}, out = [];
      lines.forEach(function (l) { var a = B.accounts[l[0]]; var g = a ? B.groupName[a.g] : '?'; if (!seen[g]) { seen[g] = 1; out.push(g); } });
      return out.join('・');
    }
    return '借方(左)には **' + gs(q.dr) + '** の科目が ' + q.dr.length + ' つ、貸方(右)には **' + gs(q.cr) + '** の科目が ' + q.cr.length + ' つ入ります。';
  };

  /* 入力した言葉 → 勘定科目(ひらがな・カタカナ・別名・音声のゆれ) */
  function kana(s) { return String(s || '').replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); }); }
  function clean(s) { return kana(String(s || '').normalize ? String(s).normalize('NFKC') : String(s)).replace(/[\s　、。,.・「」]/g, '').replace(/勘定$/, ''); }
  B.cleanWord = clean;
  B.matchAccount = function (word) {
    var w = clean(word); if (!w) return null;
    var A = B.accounts, best = null;
    Object.keys(A).forEach(function (n) {
      if (best) return;
      var a = A[n];
      if (clean(n) === w || clean(a.y) === w) best = n;
      else a.a.forEach(function (al) { if (clean(al) === w) best = n; });
    });
    return best;
  };
  B.suggestAccounts = function (word, limit) {
    var w = clean(word); var A = B.accounts, out = [];
    if (!w) return out;
    Object.keys(A).forEach(function (n) {
      if (!B.inRange(A[n].r)) return;
      var a = A[n], hay = [clean(n), clean(a.y)].concat(a.a.map(clean));
      var score = 0;
      hay.forEach(function (h) { if (h === w) score = Math.max(score, 100); else if (h.indexOf(w) === 0) score = Math.max(score, 60); else if (h.indexOf(w) >= 0) score = Math.max(score, 30); });
      if (score) out.push([n, score - n.length * 0.1]);
    });
    out.sort(function (a, b) { return b[1] - a[1]; });
    return out.slice(0, limit || 6).map(function (x) { return x[0]; });
  };

  /* 仕訳問題の選択肢(科目のチップ)を作る */
  B.chipsFor = function (q) {
    var want = q.lv >= 3 ? 10 : q.lv === 2 ? 8 : 6;
    var set = {}, list = [];
    function add(n) { if (n && B.accounts[n] && !set[n]) { set[n] = 1; list.push(n); } }
    q.dr.forEach(function (l) { add(l[0]); }); q.cr.forEach(function (l) { add(l[0]); });
    (q.opts || []).forEach(add);
    if (list.length < want) {
      var gs = {}; list.forEach(function (n) { gs[B.accounts[n].g] = 1; });
      var cs = {}; list.forEach(function (n) { cs[canon(n)] = 1; });
      var extra = Object.keys(B.accounts).filter(function (n) { var a = B.accounts[n]; return !set[n] && gs[a.g] && B.inRange(a.r) && a.g !== 'ot' && !cs[canon(n)]; });
      for (var i = extra.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = extra[i]; extra[i] = extra[j]; extra[j] = t; }
      while (list.length < want && extra.length) add(extra.pop());
    }
    for (var k = list.length - 1; k > 0; k--) { var m = Math.floor(Math.random() * (k + 1)); var tt = list[k]; list[k] = list[m]; list[m] = tt; }
    return list;
  };
})();
