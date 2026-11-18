#!/usr/bin/env python3
"""ひな型から問題を作って文字で出す(目で検算する用)。 tools/dump.py [分野id...] [--n 1]"""
import sys, socket, threading, http.server
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
topics = [a for a in sys.argv[1:] if not a.startswith('--') and not a.isdigit()]
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True); pg = b.new_page()
    pg.goto(f'http://127.0.0.1:{port}/index.html#noinstall'); pg.wait_for_timeout(500)
    out = pg.evaluate('''(tops) => BOKI.templates.filter(t => !tops.length || tops.indexOf(t.topic) >= 0).map(t => { var q = BOKI.make(t, 12345); 
      var a = q.kind === 'shiwake' ? q.dr.map(l => l[0]+' '+l[1]).join(' / ') + '  ||  ' + q.cr.map(l => l[0]+' '+l[1]).join(' / ') : q.kind === 'choice' ? q.choices[q.ans] : String(q.ans);
      return '['+t.id+' lv'+t.lv+' '+t.kind+'] '+q.q.replace(/\\n/g,' ')+'\\n   → '+a; })''', topics)
    print('\n'.join(out))
    b.close()
srv.shutdown()
