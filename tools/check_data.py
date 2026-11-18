#!/usr/bin/env python3
"""中身(問題・レッスン・用語・模擬試験)を Chrome で読みこんで、まちがいを探す。
   ~/.local/venvs/ryokoshi/bin/python ~/claude-work/boki3/tools/check_data.py [--only q-a.js]
"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent


def main():
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True, args=['--mute-audio', '--allow-file-access-from-files'])
        pg = b.new_page()
        logs = []
        pg.on('pageerror', lambda e: logs.append('ページのエラー: ' + str(e)))
        pg.goto((HERE / 'validate.html').as_uri())
        pg.wait_for_function('window.__loaded === true', timeout=20000)
        rep = pg.evaluate('window.__validate()')
        b.close()
    errs = rep['errors']
    if only:
        key = only.replace('.js', '')
        errs = [e for e in errs if True]  # ファイル単位で分けられないので全部出す
    print('件数:', json.dumps(rep['counts'], ensure_ascii=False))
    print('分野ごとのひな型:', json.dumps(rep['stats'], ensure_ascii=False))
    if rep['missing']:
        print('まだないファイル:', ', '.join(rep['missing']))
    for e in logs + rep['loadErrors']:
        print('読みこみエラー:', e)
    # 同じ内容のエラーはまとめる(seed ちがい)
    seen, uniq = set(), []
    for e in errs:
        k = e.split(' seed')[0] + '|' + e.split(': ', 1)[-1][:30]
        if k in seen:
            continue
        seen.add(k); uniq.append(e)
    for e in uniq[:150]:
        print('× ', e)
    for w in rep['warnings'][:40]:
        print('△ ', w)
    print('エラー', len(uniq), '件 / 注意', len(rep['warnings']), '件')
    sys.exit(1 if uniq or logs or rep['loadErrors'] else 0)


if __name__ == '__main__':
    main()
