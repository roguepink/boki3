#!/usr/bin/env python3
"""本当に指で操作するのと同じ流れを自動で通す(おまかせ10問を全部正解で/全部まちがいで、診断、模擬試験の提出)。
   ~/.local/venvs/ryokoshi/bin/python tools/flow.py [--engine webkit]
"""
import sys, socket, threading, http.server, re
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def digits_click(pg, n):
    for ch in str(n):
        pg.click(f'#sheet .pad button[data-v="{ch}"]')
    pg.click('#sheet .pad button[data-v="go"]')

def answer_shiwake(pg, key, q, sel_root=''):
    # 行を足す
    for side in ('dr', 'cr'):
        need = len(q[side])
        have = pg.locator(f'{sel_root}#jw-{key} .jcol.{side} .jrow').count()
        while have < need:
            pg.click(f'{sel_root}#jw-{key} .jcol.{side} .addRow'); pg.wait_for_timeout(60)
            have += 1
        for i, (acc, amt) in enumerate(q[side]):
            pg.click(f'{sel_root}#jw-{key} button.acc[data-s="{side}"][data-i="{i}"]')
            pg.wait_for_selector('#sheet.on')
            chip = pg.locator(f'#sheet [data-act=pickAcc][data-v="{acc}"]')
            if chip.count() == 0:
                # 入力方式のとき
                pg.fill('#accIn', acc); pg.wait_for_timeout(80)
                chip = pg.locator(f'#sheet [data-act=pickAcc][data-v="{acc}"]')
            chip.first.click()
            pg.wait_for_selector('#sheet.on .pad', timeout=3000)
            pg.wait_for_timeout(300)
            digits_click(pg, amt)
            pg.wait_for_timeout(320)

def run(engine):
    port = free_port()
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    errs, fails = [], []
    with sync_playwright() as p:
        b = p.webkit.launch() if engine == 'webkit' else p.chromium.launch(channel='chrome', headless=True, args=['--mute-audio'])
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=engine != 'webkit', has_touch=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/index.html#noinstall')
        pg.wait_for_timeout(600)
        # ようこそ → 診断しない
        pg.click('[data-act=wStep][data-v="1"]'); pg.click('[data-act=setOpt][data-v=all]'); pg.click('[data-act=wStep][data-v="2"]')
        pg.click('[data-act=wStep][data-v="3"]'); pg.click('[data-act=skipPlacement]')
        pg.wait_for_selector('.hero')
        for rnd, want_ok in (('正解', True), ('まちがい', False)):
            pg.click('.hero [data-act=startAuto]'); pg.wait_for_timeout(300)
            n = 0
            for k in range(30):
                st = pg.evaluate('(() => { var d = BOKI.app.debug(); return { scr: d.screen, q: d.Q && d.Q.q, phase: d.Q && d.Q.phase }; })()')
                if st['scr'] != 'quiz': break
                q = st['q']; n += 1
                if want_ok:
                    if q['kind'] == 'shiwake': answer_shiwake(pg, 'cur', q); pg.click('#qCheck')
                    elif q['kind'] == 'choice':
                        pg.click(f'[data-act=qSel][data-v="{q["ans"]}"]'); pg.click('#qCheck')
                    elif q['kind'] == 'tf': pg.click(f'[data-act=qTF][data-v="{1 if q["ans"] else 0}"]')
                    elif q['kind'] == 'num':
                        for ch in str(q['ans']): pg.click(f'.pad button[data-act=qNum][data-v="{ch}"]')
                        pg.click('.pad button[data-act=qNum][data-v="go"]')
                else:
                    pg.click('[data-act=qGiveup]')
                pg.wait_for_timeout(250)
                ok = pg.evaluate('BOKI.app.debug().Q.ok')
                if ok != want_ok: fails.append(f'{rnd}: {q["id"]} の答え合わせが {ok}  q={q["q"][:40]}')
                pg.click('[data-act=qNext]'); pg.wait_for_timeout(250)
            print(f'{rnd}の回: {n}問を通した')
            pg.wait_for_selector('.result'); pg.click('[data-act=home]'); pg.wait_for_timeout(300)
        # 模擬試験: 第1問を全部正解で入れて提出
        pg.evaluate("BOKI.app.go('examTop')"); pg.click('[data-act=examStart][data-v=q1]'); pg.wait_for_timeout(300)
        qs = pg.evaluate('BOKI.app.debug().EXAM.q1')
        for i, q in enumerate(qs[:3]):
            pg.click(f'[data-act=exGo][data-v="{i}"]'); pg.wait_for_timeout(150)
            answer_shiwake(pg, f'x{i}', q)
        pg.click('[data-act=exSubmit]'); pg.click('.modal [data-y]'); pg.wait_for_timeout(400)
        sc = pg.evaluate('BOKI.app.debug().EXAM.r.s1')
        print('模擬試験 第1問: 3問だけ正しく入れて', sc, '点(9点のはず)')
        if sc != 9: fails.append(f'模擬試験の点数が {sc}')
        b.close()
    srv.shutdown()
    for e in errs: print('× ページのエラー:', e)
    for f in fails: print('× ', f)
    print('結果:', 'OK' if not errs and not fails else 'NG')

if __name__ == '__main__':
    run(sys.argv[sys.argv.index('--engine') + 1] if '--engine' in sys.argv else 'chrome')
