/* 中身のチェック。結果を window.__report に入れる */
window.__validate = function () {
  var B = window.BOKI, A = B.accounts, E = [], W = [], S = {};
  var topics = {}; B.topics.forEach(function (t) { topics[t.id] = 1; });
  var KINDS = { shiwake: 1, choice: 1, tf: 1, num: 1 };
  var FIGS = { t: 1, shiwake: 1, groups: 1, flow: 1, vs: 1, timeline: 1, bs: 1, table: 1, doc: 1, box: 1 };
  function str(x) { return typeof x === 'string' && x.trim().length > 0; }
  function exOk(ex, where) {
    if (!ex || !str(ex.s) || !str(ex.m) || !str(ex.l)) E.push(where + ': ex の s/m/l がない');
  }
  function checkLines(lines, where, side) {
    if (!Array.isArray(lines) || !lines.length) { E.push(where + ': ' + side + ' が空'); return 0; }
    var sum = 0, seen = {};
    lines.forEach(function (ln) {
      if (!A[ln[0]]) E.push(where + ': 科目「' + ln[0] + '」が一覧にない');
      if (seen[ln[0]]) E.push(where + ': ' + side + ' に「' + ln[0] + '」が2回');
      seen[ln[0]] = 1;
      if (!(typeof ln[1] === 'number' && ln[1] > 0 && Math.round(ln[1]) === ln[1])) E.push(where + ': 金額がおかしい ' + JSON.stringify(ln));
      sum += ln[1];
    });
    return sum;
  }
  function checkShiwake(q, where) {
    var d = checkLines(q.dr, where, '借方'), c = checkLines(q.cr, where, '貸方');
    if (d !== c) E.push(where + ': 借方 ' + d + ' と 貸方 ' + c + ' が合わない  q=' + (q.q || '').slice(0, 40));
    (q.dr || []).forEach(function (l) { (q.cr || []).forEach(function (m) { if (l[0] === m[0]) W.push(where + ': 同じ科目が両側に ' + l[0]); }); });
    if (!Array.isArray(q.opts) || q.opts.length < 2) E.push(where + ': opts が少ない');
    (q.opts || []).forEach(function (o) { if (!A[o]) E.push(where + ': opts の科目「' + o + '」が一覧にない'); });
    if (q.miss) Object.keys(q.miss).forEach(function (k) { if (!A[k]) W.push(where + ': miss の科目「' + k + '」が一覧にない'); });
  }
  function checkPart(q, where) {
    if (!KINDS[q.kind]) { E.push(where + ': kind がおかしい ' + q.kind); return; }
    if (!str(q.q)) E.push(where + ': q がない');
    if (q.kind === 'shiwake') checkShiwake(q, where);
    if (q.kind === 'choice') { if (!Array.isArray(q.choices) || q.choices.length < 2 || !(q.ans >= 0 && q.ans < q.choices.length)) E.push(where + ': choice の choices/ans がおかしい'); }
    if (q.kind === 'tf') { if (typeof q.ans !== 'boolean') E.push(where + ': tf の ans が true/false でない'); }
    if (q.kind === 'num') { if (typeof q.ans !== 'number' || !isFinite(q.ans)) E.push(where + ': num の ans が数字でない'); }
  }
  function checkFig(f, where) {
    if (!f) return; if (!FIGS[f.type]) E.push(where + ': 図の type がおかしい ' + f.type);
  }

  // ひな型
  var ids = {};
  B.templates.forEach(function (t, i) {
    var w = 'ひな型 ' + (t.id || ('#' + i));
    if (!t.id) E.push(w + ': id がない');
    if (ids[t.id]) E.push(w + ': id が重なる'); ids[t.id] = 1;
    if (!topics[t.topic]) E.push(w + ': topic がおかしい ' + t.topic);
    if (!(t.lv >= 1 && t.lv <= 3)) E.push(w + ': lv がおかしい');
    if (!KINDS[t.kind]) E.push(w + ': kind がおかしい');
    if (t.range && ['both', 'old', 'new'].indexOf(t.range) < 0) E.push(w + ': range がおかしい');
    if (typeof t.gen !== 'function') { E.push(w + ': gen がない'); return; }
    S[t.topic] = S[t.topic] || { n: 0, lv1: 0, lv2: 0, lv3: 0 };
    S[t.topic].n++; S[t.topic]['lv' + t.lv]++;
    var texts = {};
    for (var seed = 1; seed <= 40; seed++) {
      var q;
      try { q = B.make(t, seed * 7919); } catch (e) { E.push(w + ' seed' + seed + ': gen でエラー ' + e.message); break; }
      q.kind = t.kind;
      checkPart(q, w + ' seed' + seed);
      exOk(q.ex, w);
      if (q.doc && !q.doc.type) E.push(w + ': doc.type がない');
      if (t.range !== 'old') ((q.dr || []).concat(q.cr || [])).forEach(function (l) { if (A[l[0]] && A[l[0]].r === 'old') E.push(w + ': 手形の科目「' + l[0] + '」を使うなら range:old'); });
      if (t.range !== 'new') ((q.dr || []).concat(q.cr || [])).forEach(function (l) { if (A[l[0]] && A[l[0]].r === 'new') E.push(w + ': 新しい科目「' + l[0] + '」を使うなら range:new'); });
      texts[q.q] = 1;
      if (E.length > 400) break;
    }
  });
  // レッスン
  var lids = {};
  B.lessons.forEach(function (l, i) {
    var w = 'レッスン ' + (l.id || '#' + i);
    if (lids[l.id]) E.push(w + ': id が重なる'); lids[l.id] = 1;
    if (!topics[l.topic]) E.push(w + ': topic がおかしい');
    if (!str(l.title)) E.push(w + ': title がない');
    if (!Array.isArray(l.cards) || l.cards.length < 2) E.push(w + ': cards が少ない');
    (l.cards || []).forEach(function (c, j) {
      if (!str(c.h) || !str(c.s) || !str(c.m) || !str(c.l)) E.push(w + ' カード' + (j + 1) + ': h/s/m/l がない');
      checkFig(c.fig, w + ' カード' + (j + 1));
    });
    (l.quiz || []).forEach(function (q, j) { if (!str(q.q) || !Array.isArray(q.choices) || !(q.ans >= 0 && q.ans < q.choices.length)) E.push(w + ' 小テスト' + (j + 1) + ': おかしい'); });
  });
  B.glossary.forEach(function (g, i) { if (!str(g.w) || !str(g.y) || !str(g.s) || !str(g.m) || !str(g.l)) E.push('用語 ' + (g.w || '#' + i) + ': w/y/s/m/l がない'); });
  B.tips.forEach(function (t, i) { if (!str(t.t) || !str(t.b)) E.push('ひとこと #' + i + ': t/b がない'); });
  function exam(list, total, name) {
    list.forEach(function (x) {
      var w = name + ' ' + x.id, sum = 0;
      if (!str(x.intro)) E.push(w + ': intro がない');
      (x.figs || []).forEach(function (f, j) { checkFig(f, w + ' 図' + (j + 1)); });
      (x.parts || []).forEach(function (p, j) { checkPart(p, w + ' 小問' + (j + 1)); sum += p.pts || 0; });
      if (sum !== total) E.push(w + ': 点数の合計が ' + sum + '(' + total + ' にする)');
      exOk(x.ex, w);
    });
  }
  exam(B.exam2, 20, '第2問'); exam(B.exam3, 35, '第3問');
  window.__report = {
    loadErrors: window.__loadErr, missing: window.__missing || [], errors: E, warnings: W, stats: S,
    counts: { templates: B.templates.length, lessons: B.lessons.length, glossary: B.glossary.length, tips: B.tips.length, exam2: B.exam2.length, exam3: B.exam3.length }
  };
  return window.__report;
};
