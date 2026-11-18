#!/usr/bin/env python3
"""答え合わせ(checkShiwake)の判定を確かめる"""
import socket, threading, http.server, json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
CASES = [
  # (正解, 借方の答え, 貸方の答え, 期待)
  ({'dr': [['仕入', 1000]], 'cr': [['現金', 1000]]}, [['仕入', 1000]], [['現金', 1000]], True),
  ({'dr': [['仕入', 1000]], 'cr': [['現金', 1000]]}, [['現金', 1000]], [['仕入', 1000]], False),
  ({'dr': [['仕入', 1000]], 'cr': [['現金', 1000]]}, [['仕入', 900]], [['現金', 1000]], False),
  ({'dr': [['前払保険料', 8000]], 'cr': [['保険料', 8000]]}, [['前払費用', 8000]], [['保険料', 8000]], True),
  ({'dr': [['旅費交通費', 3000], ['通信費', 2000]], 'cr': [['当座預金', 5000]]}, [['旅費交通費', 3000], ['通信費', 2000], ['小口現金', 5000]], [['小口現金', 5000], ['当座預金', 5000]], True),
  ({'dr': [['仕入', 300], ['繰越商品', 200]], 'cr': [['繰越商品', 300], ['仕入', 200]]}, [['仕入', 300], ['繰越商品', 200]], [['繰越商品', 300], ['仕入', 200]], True),
  ({'dr': [['仕入', 1000]], 'cr': [['現金', 1000]]}, [['仕入', 1000], ['現金', 500]], [['現金', 1500]], True),
  ({'dr': [['仕入', 1000]], 'cr': [['現金', 1000]]}, [['売上', 1000]], [['現金', 1000]], False),
]
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True); pg = b.new_page()
    pg.goto(f'http://127.0.0.1:{port}/index.html#noinstall'); pg.wait_for_timeout(500)
    bad = 0
    for ans, ud, uc, want in CASES:
        r = pg.evaluate('([a,d,c]) => BOKI.checkShiwake(a,d,c)', [ans, ud, uc])
        mark = '○' if r['ok'] == want else '×'
        if r['ok'] != want: bad += 1
        print(mark, '期待', want, '結果', r['ok'], '|', ' / '.join(n['t'][:40] for n in r['notes']))
    b.close()
srv.shutdown(); print('まちがい', bad, '件')
