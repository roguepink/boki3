/* 図を描く(HTML の文字列を返す)。レッスン・解説・問題で使う */
(function () {
  'use strict';
  var B = window.BOKI;
  var F = B.f;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  B.esc = esc;

  /* 勘定科目を色つきにする(長い名前から順に)。タップで説明が出る */
  var accRe = null;
  function getAccRe() {
    if (accRe) return accRe;
    var names = Object.keys(B.accounts).sort(function (a, b) { return b.length - a.length; });
    accRe = new RegExp('(' + names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'g');
    return accRe;
  }
  function accSpan(name) {
    var a = B.accounts[name]; if (!a) return esc(name);
    return '<span class="acc acc-' + a.g + '" data-act="accInfo" data-acc="' + esc(name) + '">' + esc(name) + '</span>';
  }
  B.accSpan = accSpan;

  /* 本文の整形: エスケープ → **太字** → 改行 → 科目に色(opt.acc が false なら色なし) */
  B.rich = function (s, opt) {
    opt = opt || {};
    var h = esc(s);
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (opt.acc !== false) {
      // タグの中は触らない
      h = h.split(/(<[^>]+>)/).map(function (part) {
        if (part.charAt(0) === '<') return part;
        return part.replace(getAccRe(), function (m) { return accSpan(m); });
      }).join('');
    }
    return h.replace(/\n/g, '<br>');
  };

  function accName(name, plain) {
    var a = B.accounts[name];
    if (!a || plain) return esc(name);
    return '<span class="acc-' + a.g + '">' + esc(name) + '</span>';
  }

  function money(n) { return typeof n === 'number' ? F(n) : esc(n); }

  var R = {};

  R.t = function (f) {
    function side(lines, label) {
      var h = '<div><div class="side">' + label + '</div>';
      (lines || []).forEach(function (l) { h += '<div class="tl"><span>' + esc(l[0]) + '</span><b>' + money(l[1]) + '</b></div>'; });
      return h + '</div>';
    }
    return '<div class="tacc"><div class="tt">' + accName(f.title || '') + '</div><div class="tb">' + side(f.dr, '借方(左)') + side(f.cr, '貸方(右)') + '</div></div>' + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  /* 仕訳の形。mark: { dr: {科目: 'good'|'wrongline'}, cr: … } で色をつけられる */
  R.shiwake = function (f) {
    function col(lines, cls, m) {
      var h = '<div>';
      (lines || []).forEach(function (l) {
        var k = m && m[l[0]] ? ' ' + m[l[0]] : '';
        h += '<div class="l' + k + '"><span>' + accName(l[0]) + '</span><span class="n">' + money(l[1]) + '</span></div>';
      });
      if (!lines || !lines.length) h += '<div class="l"><span class="muted">(なし)</span></div>';
      return h + '</div>';
    }
    var mk = f.mark || {};
    return '<div class="jfig"><div class="h dr">借方</div><div class="h cr">貸方</div>' + col(f.dr, 'dr', mk.dr) + col(f.cr, 'cr', mk.cr) + '</div>' + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  var GINFO = {
    as: { n: '資産', d: 'お金・物・もらえる権利', c: 'var(--g-as)' },
    li: { n: '負債', d: '払う義務(借金など)', c: 'var(--g-li)' },
    eq: { n: '純資産', d: '元手・ためた利益', c: 'var(--g-eq)' },
    ex: { n: '費用', d: 'もうけのために使った', c: 'var(--g-ex)' },
    re: { n: '収益', d: 'もうけのもと', c: 'var(--g-re)' }
  };
  R.groups = function (f) {
    var hl = f.hl || [];
    function box(g, flex) {
      var i = GINFO[g], cls = hl.length ? (hl.indexOf(g) >= 0 ? ' hl' : ' dim') : '';
      return '<div class="gbox' + cls + '" style="background:' + i.c + ';color:#fff;flex:' + flex + '"><b>' + i.n + '</b><span>' + i.d + '</span></div>';
    }
    return '<div class="groups">' +
      '<div class="gcol"><div class="gh">貸借対照表(左)</div>' + box('as', 3) + '<div class="gh">損益計算書(左)</div>' + box('ex', 2) + '</div>' +
      '<div class="gcol"><div class="gh">貸借対照表(右)</div>' + box('li', 1.5) + box('eq', 1.5) + '<div class="gh">損益計算書(右)</div>' + box('re', 2) + '</div>' +
      '</div><div class="cap">左側のグループは「増えたら左(借方)」、右側は「増えたら右(貸方)」</div>';
  };

  R.flow = function (f) {
    var steps = f.steps || [];
    var v = steps.length > 4 ? ' v' : '';
    var h = '<div class="flow' + v + '">';
    steps.forEach(function (s, i) {
      if (i) h += '<div class="ar">›</div>';
      h += '<div class="st"><div class="i">' + esc(s.icon || '•') + '</div><div class="l">' + esc(s.label || '') + '</div>' + (s.sub ? '<div class="s">' + esc(s.sub) + '</div>' : '') + '</div>';
    });
    return h + '</div>' + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  R.vs = function (f) {
    function side(x) {
      x = x || {};
      return '<div><div class="h">' + esc(x.icon || '') + ' ' + B.rich(x.title || '') + '</div><ul>' + (x.items || []).map(function (it) { return '<li>' + B.rich(it) + '</li>'; }).join('') + '</ul></div>';
    }
    return '<div class="vs">' + side(f.left) + side(f.right) + '</div>' + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  R.timeline = function (f) {
    var segs = f.segs || [], tot = 0;
    segs.forEach(function (s) { tot += s.n || 1; });
    var h = '<div class="tline">' + (f.title ? '<div class="ttl">' + esc(f.title) + (f.total ? '(' + F(f.total) + '円)' : '') + '</div>' : '') + '<div class="tbar">';
    segs.forEach(function (s) {
      var amt = f.total ? Math.round(f.total * (s.n || 1) / tot) : null;
      h += '<div class="' + (s.k || 'this') + '" style="flex:' + (s.n || 1) + '">' + esc(s.label || '') + (amt != null ? '<br>' + F(amt) + '円' : '') + '</div>';
    });
    h += '</div>';
    if (f.ticks) h += '<div class="ticks">' + f.ticks.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
    return h + '</div>' + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  R.bs = function (f) {
    function col(lines) {
      return '<div>' + (lines || []).map(function (l) { return '<div class="bi"><span>' + accName(l[0]) + '</span><b>' + money(l[1]) + '</b></div>'; }).join('') + '</div>';
    }
    return '<div class="bsfig">' + (f.title ? '<div class="bt">' + esc(f.title) + '</div>' : '') + '<div class="bb">' + col(f.left) + col(f.right) + '</div></div>' + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  R.table = function (f) {
    var h = '<div class="tblWrap"><table class="tbl">';
    if (f.head) h += '<tr>' + f.head.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';
    (f.rows || []).forEach(function (r) {
      h += '<tr>' + r.map(function (c) { var n = typeof c === 'number'; return '<td' + (n ? ' class="n"' : '') + '>' + (n ? F(c) : esc(c)) + '</td>'; }).join('') + '</tr>';
    });
    return h + '</table></div>' + (f.title ? '<div class="cap">' + esc(f.title) + '</div>' : '') + (f.note ? '<div class="cap">' + esc(f.note) + '</div>' : '');
  };

  R.doc = function (f) {
    var type = f.type === 'doc' ? (f.dtype || f.kind || 'invoice') : f.type;
    var title = f.title || { invoice: '請求書', receipt: '領収書', bank: '取引明細', slip: '伝票' }[type] || '書類';
    var h = '<div class="doc"><div class="dt">' + esc(title) + '</div>';
    h += '<div class="dh"><div>' + (f.to ? esc(f.to) + ' 御中' : '') + '</div><div style="text-align:right">' + (f.date ? esc(f.date) + '<br>' : '') + (f.from ? esc(f.from) : '') + '</div></div>';
    if (type === 'receipt' && f.total != null && !(f.rows && f.rows.length)) {
      h += '<div style="text-align:center;font-size:20px;font-weight:900;margin:8px 0">¥' + F(f.total) + ' -</div>';
      if (f.note) h += '<div class="dn">' + esc(f.note) + '</div>';
      if (f.tax != null) h += '<div class="dn">(うち消費税 ¥' + F(f.tax) + ')</div>';
      h += '<div class="stamp">領収</div>';
      return h + '</div>';
    }
    var rows = f.rows || [];
    if (rows.length) {
      var head = f.head || (type === 'bank' ? ['日付', '内容', 'お引出し', 'お預入れ'] : ['品名', '数量', '単価', '金額']);
      h += '<table><tr>' + head.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';
      rows.forEach(function (r) {
        h += '<tr>' + r.map(function (c) { var n = typeof c === 'number'; return '<td' + (n ? ' class="n"' : '') + '>' + (n ? F(c) : esc(c == null ? '' : c)) + '</td>'; }).join('') + '</tr>';
      });
      h += '</table>';
    }
    if (f.tax != null || f.total != null) {
      h += '<div class="tot">' + (f.tax != null ? '<span>消費税 ¥' + F(f.tax) + '</span>' : '') + (f.total != null ? '<span>合計 ¥' + F(f.total) + '</span>' : '') + '</div>';
    }
    if (f.note) h += '<div class="dn">' + esc(f.note) + '</div>';
    if (type === 'receipt') h += '<div class="stamp">領収</div>';
    return h + '</div>';
  };
  R.invoice = R.doc; R.receipt = R.doc; R.bank = R.doc; R.slip = R.doc;

  R.box = function (f) {
    return '<div class="boxfig"><div class="bi">' + esc(f.icon || '💡') + '</div><div>' + (f.title ? '<b>' + esc(f.title) + '</b>' : '') + B.rich(f.text || '') + '</div></div>';
  };

  B.fig = function (f) {
    if (!f) return '';
    try {
      var fn = R[f.type];
      if (!fn) return '';
      return '<div class="fig">' + fn(f) + '</div>';
    } catch (e) { return ''; }
  };
  /* 問題の証ひょう(doc の type は invoice など) */
  B.docFig = function (d) { if (!d) return ''; try { return '<div class="fig">' + R.doc(d) + '</div>'; } catch (e) { return ''; } };

  /* 丸いメーター(SVG) */
  B.ring = function (pct, size, stroke, color, track, label) {
    size = size || 64; stroke = stroke || 7;
    var r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px"><svg width="' + size + '" height="' + size + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (track || 'rgba(255,255,255,.18)') + '" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (color || '#5eead4') + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg><div class="lbl">' + (label || '') + '</div></div>';
  };
})();
