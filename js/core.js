/* ぼきトレ 簿記3級 — データを入れる箱と、問題づくりの道具。
   ES modules は使わない(file:// でも、古い iPhone でも動かすため)。 */
(function () {
  'use strict';
  var B = window.BOKI = window.BOKI || {};
  B.accounts = B.accounts || {};      // 勘定科目 名前 → {g:グループ, y:よみ, a:[別名]}
  B.templates = B.templates || [];    // 問題のひな型
  B.lessons = B.lessons || [];        // レッスン
  B.glossary = B.glossary || [];      // 用語辞典
  B.exam2 = B.exam2 || [];            // 模擬試験 第2問
  B.exam3 = B.exam3 || [];            // 模擬試験 第3問
  B.tips = B.tips || [];              // 今日のひとこと(実務のコツ)

  function push(list) { return function (arr) { for (var i = 0; i < arr.length; i++) list.push(arr[i]); }; }
  B.addTemplates = push(B.templates);
  B.addLessons = push(B.lessons);
  B.addGlossary = push(B.glossary);
  B.addExam2 = push(B.exam2);
  B.addExam3 = push(B.exam3);
  B.addTips = push(B.tips);

  /* 分野(トピック)。順番 = おすすめの学ぶ順。w = 試験での重み(合格予想に使う) */
  B.topics = [
    { id: 'kiso',   name: '簿記のきほん',         icon: '🧭', w: 6,  desc: '5つのグループ・借方と貸方・仕訳のルール' },
    { id: 'genkin', name: '現金',                 icon: '💴', w: 6,  desc: '現金・現金過不足・小口現金' },
    { id: 'yokin',  name: '預金',                 icon: '🏦', w: 6,  desc: '普通預金・当座預金・定期預金・当座借越' },
    { id: 'shohin', name: '商品の売り買い',       icon: '🛒', w: 12, desc: '仕入・売上・返品・送料・クレジット・商品券' },
    { id: 'saiken', name: '掛けと前払い',         icon: '🤝', w: 8,  desc: '売掛金・買掛金・前払金・前受金・電子記録債権' },
    { id: 'tegata', name: '手形',                 icon: '📜', w: 3,  desc: '約束手形・手形貸付金/借入金(2027年3月までの試験)' },
    { id: 'sonota', name: 'いろいろな貸し借り',   icon: '🔁', w: 8,  desc: '貸付金・借入金・未収入金・未払金・仮払金・仮受金・立替金・預り金' },
    { id: 'kotei',  name: '固定資産',             icon: '🏢', w: 8,  desc: '買ったとき・減価償却・売ったとき' },
    { id: 'zei',    name: '税金',                 icon: '🧾', w: 7,  desc: '租税公課・消費税・法人税等' },
    { id: 'kabu',   name: '株式会社',             icon: '🏛️', w: 4,  desc: '資本金・利益の配当・利益準備金' },
    { id: 'hiyo',   name: '給料と経過勘定',       icon: '⏳', w: 9,  desc: '給料・法定福利費・前払/未払/前受/未収・貯蔵品' },
    { id: 'kashi',  name: '貸倒れ',               icon: '💥', w: 5,  desc: '貸倒損失・貸倒引当金・償却債権取立益' },
    { id: 'kessan', name: '決算',                 icon: '📊', w: 14, desc: '決算整理・売上原価・精算表・財務諸表' },
    { id: 'denpyo', name: '伝票・帳簿・証ひょう', icon: '🗂️', w: 6,  desc: '三伝票・補助簿・請求書や領収書・訂正仕訳' },
    { id: 'jitsumu',name: '会社の経理で使う',     icon: '💼', w: 0,  desc: '経理の1か月・交通費・給料・請求書の実務' }
  ];
  B.topicById = function (id) { for (var i = 0; i < B.topics.length; i++) if (B.topics[i].id === id) return B.topics[i]; return null; };

  /* 数字を 12,345 の形に */
  B.f = function (n) { n = Math.round(Number(n) || 0); var s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (n < 0 ? '-' : '') + s; };

  /* たね つきの乱数(同じ たね なら同じ問題になる) */
  B.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    function next() { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }
    var r = {
      rand: next,
      /* min 以上 max 以下で、step きざみ */
      int: function (min, max, step) { step = step || 1; var n = Math.floor((max - min) / step) + 1; return min + Math.floor(next() * n) * step; },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle: function (arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; },
      chance: function (p) { return next() < p; },
      f: B.f
    };
    return r;
  };

  /* ひな型から 1問つくる。seed を変えると金額や言い回しが変わる */
  B.make = function (tpl, seed) {
    var r = B.rng(seed || 1);
    var q = tpl.gen(r);
    q.id = tpl.id; q.topic = tpl.topic; q.lv = tpl.lv; q.kind = tpl.kind; q.seed = seed; q.range = tpl.range || 'both';
    return q;
  };
})();
