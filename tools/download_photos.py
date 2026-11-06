#!/usr/bin/env python3
"""Download listing photos with TLS verification; retain remote URLs on failure."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'js/data.js'

def download(url):
    name = hashlib.sha256(url.encode()).hexdigest()[:24] + '.jpg'
    target = ROOT / 'img' / name
    if target.exists() and target.stat().st_size > 1000:
        return url, 'img/' + name, None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'SuzdalQuizPhotoImport/1.0'})
        with urllib.request.urlopen(req, timeout=25) as response:
            body = response.read(20 * 1024 * 1024 + 1)
            mime = response.headers.get_content_type()
        if len(body) > 20 * 1024 * 1024 or len(body) < 1000:
            raise ValueError('Unexpected image size')
        if not mime.startswith('image/'):
            raise ValueError('Server did not return an image')
        if not (body.startswith(b'\xff\xd8\xff') or body.startswith(b'\x89PNG\r\n\x1a\n') or (body.startswith(b'RIFF') and body[8:12] == b'WEBP')):
            raise ValueError('Unsupported image contents')
        temp = target.with_suffix('.tmp')
        temp.write_bytes(body)
        temp.replace(target)
        return url, 'img/' + name, None
    except Exception as exc:
        return url, url, type(exc).__name__ + ': ' + str(exc)


def main():
    source = DATA.read_text(encoding='utf-8')
    lots = json.loads(source.split('window.APARTMENTS =', 1)[1].strip().removesuffix(';'))
    urls = sorted({url for lot in lots for url in lot['photos'] if url.startswith('https://')})
    if not urls:
        print('All photos are already local.')
        return 0
    # Preserve the original sources before replacing successful paths.
    backup = ROOT / 'tools/photo-sources.json'
    if not backup.exists():
        backup.write_text(json.dumps(lots, ensure_ascii=False, indent=2), encoding='utf-8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(download, urls))
    paths = {url: path for url, path, error in results}
    failed = [error for _, _, error in results if error]
    for lot in lots:
        lot['photos'] = [paths.get(url, url) for url in lot['photos']]
    updated = DATA.with_suffix('.tmp')
    updated.write_text('// Объявления Суздаля из CSV пользователя. Цена за сутки.\nwindow.APARTMENTS = ' + json.dumps(lots, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
    updated.replace(DATA)
    print(f'Downloaded: {len(urls) - len(failed)}; failed: {len(failed)}. Failed images retain their original URLs.')
    if failed:
        print('First error:', failed[0])
        print('Check network access to *.img.avito.st, or retry on your computer.')
        return 1
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
