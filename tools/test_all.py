#!/usr/bin/env python3
"""全部のひな型・レッスン・模擬試験で、答え合わせ・選択肢・図の描画を確かめる"""
import socket, threading, http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
JS = r'''() => {
  var B = BOKI, bad = [];
  B.templates.forEach(function (t) {
    for (var k = 1; k <= 25; k++) {
      var q = B.make(t, k * 104729);
      if (q.kind === 'shiwake') {
        if (!B.checkShiwake(q, q.dr, q.cr).ok) bad.push(t.id + ': 正しい答えが不正解になる');
        var ch = B.chipsFor(q);
        q.dr.concat(q.cr).forEach(function (l) { if (ch.indexOf(l[0]) < 0) bad.push(t.id + ': 選択肢に ' + l[0] + ' がない'); });
        if (B.checkShiwake(q, q.cr, q.dr).ok && JSON.stringify(q.dr) !== JSON.stringify(q.cr)) bad.push(t.id + ': 逆でも正解になる');
      }
      if (q.kind === 'choice') { var set = {}; q.choices.forEach(function (c) { if (set[c]) bad.push(t.id + ': 選択肢がかぶる ' + c); set[c] = 1; }); }
      var html = B.rich(q.q) + B.docFig(q.doc) + B.rich(q.ex.s) + B.rich(q.ex.m) + B.rich(q.ex.l) + B.fig({ type: 'shiwake', dr: q.dr || [], cr: q.cr || [] });
      if (/undefined|NaN/.test(q.q + q.ex.s + q.ex.m + q.ex.l)) bad.push(t.id + ': 文に undefined/NaN');
      if (q.doc && !B.docFig(q.doc)) bad.push(t.id + ': 証ひょうが描けない');
    }
  });
  B.lessons.forEach(function (l) { l.cards.forEach(function (c, i) { if (c.fig && !B.fig(c.fig)) bad.push(l.id + ' カード' + (i + 1) + ': 図が描けない ' + c.fig.type); if (/undefined|NaN/.test(B.fig(c.fig))) bad.push(l.id + ' カード' + (i + 1) + ': 図に undefined/NaN'); }); });
  B.exam2.concat(B.exam3).forEach(function (x) { (x.figs || []).forEach(function (f, i) { if (!B.fig(f)) bad.push(x.id + ' 図' + (i + 1) + ': 描けない'); });
    x.parts.forEach(function (p, i) { if (p.kind === 'shiwake' && !B.checkShiwake(p, p.dr, p.cr).ok) bad.push(x.id + ' 小問' + (i + 1) + ': 正しい答えが不正解'); }); });
  var seen = {}; return bad.filter(function (b) { var k = b.split(':')[0] + b.split(':')[1]; if (seen[k]) return false; seen[k] = 1; return true; });
}'''
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True); pg = b.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/index.html#noinstall'); pg.wait_for_timeout(600)
    bad = pg.evaluate(JS)
    for x in bad[:80]: print('×', x)
    for e in errs: print('× ページのエラー', e)
    print('まちがい', len(bad), '件')
    b.close()
srv.shutdown()
