#!/usr/bin/env python3
"""画面を撮って、エラーを拾う(確認用)。
   ~/.local/venvs/ryokoshi/bin/python tools/shot.py home quiz fb lesson ... [--dark] [--w 390]
   撮った絵は _check/ に出る(Git に入らない)。名前: home / learn / practice / dict / stats / settings / quiz / fb / lesson / exam / exam3 / welcome
"""
import sys, socket, threading, http.server, functools, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_check'; OUT.mkdir(exist_ok=True)


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dark = '--dark' in sys.argv
    w = int(sys.argv[sys.argv.index('--w') + 1]) if '--w' in sys.argv else 390
    full = '--full' in sys.argv
    port = free_port()
    class Q(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), Q)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True, args=['--mute-audio'])
        ctx = b.new_context(viewport={'width': w, 'height': 844}, device_scale_factor=2, color_scheme='dark' if dark else 'light', is_mobile=True, has_touch=True)
        for name in args or ['home']:
            pg = ctx.new_page()
            pg.on('pageerror', lambda e, n=name: errs.append(f'{n}: {e}'))
            pg.on('console', lambda m, n=name: errs.append(f'{n} console.{m.type}: {m.text}') if m.type in ('error',) else None)
            if name == 'welcome':
                pg.goto(f'http://127.0.0.1:{port}/index.html#noinstall')
            else:
                pg.goto(f'http://127.0.0.1:{port}/index.html#noinstall-demo-{name}')
            pg.wait_for_timeout(1200)
            f = OUT / f'{name}{"-dark" if dark else ""}.png'
            pg.screenshot(path=str(f), full_page=full)
            print('撮った:', f)
            pg.close()
        b.close()
    srv.shutdown()
    for e in errs:
        print('×', e)
    print('エラー', len(errs), '件')


if __name__ == '__main__':
    main()
