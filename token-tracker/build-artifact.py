#!/usr/bin/env python3
"""Buduje wersję artefaktową z index.html.

Artefakty na claude.ai mają ostre CSP: żaden skrypt z zewnętrznego hosta się nie
załaduje. Ten skrypt wkleja Chart.js i PDF.js prosto do pliku i zdejmuje ramkę
<!DOCTYPE>/<html>/<head>/<body>, bo platforma dokłada własną.

Użycie:
    python3 build-artifact.py [katalog-z-bibliotekami] [plik-wyjściowy]

Biblioteki bierze z podanego katalogu (domyślnie ./vendor), oczekując plików:
    chart.umd.js, pdf.min.js, pdf.worker.min.js
Najprościej je zdobyć:
    npm i chart.js@4.4.1 pdfjs-dist@3.11.174
    cp node_modules/chart.js/dist/chart.umd.js vendor/
    cp node_modules/pdfjs-dist/build/pdf.min.js node_modules/pdfjs-dist/build/pdf.worker.min.js vendor/
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
libs = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'vendor')
out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, 'artifact.html')

def read(name):
    path = os.path.join(libs, name)
    if not os.path.exists(path):
        sys.exit('Brak pliku biblioteki: ' + path + '\n' + __doc__)
    return io.open(path, encoding='utf-8').read()

src = io.open(os.path.join(HERE, 'index.html'), encoding='utf-8').read()
chart = read('chart.umd.js')
pdfjs = read('pdf.min.js')
worker = read('pdf.worker.min.js')

# Zamknięcie skryptu w treści biblioteki rozerwałoby blok <script>.
for name, body in (('chart.umd.js', chart), ('pdf.min.js', pdfjs), ('pdf.worker.min.js', worker)):
    if '</script' in body.lower():
        sys.exit('Biblioteka ' + name + ' zawiera </script — trzeba by ją zescapować.')

# 1. zdejmij ramkę dokumentu — platforma dokłada własny <head> i <body>
body_html = src
body_html = re.sub(r'(?is)^.*?<head[^>]*>', '', body_html, count=1)
body_html = re.sub(r'(?is)</head>\s*<body[^>]*>', '\n', body_html, count=1)
body_html = re.sub(r'(?is)</body>\s*</html>\s*$', '', body_html, count=1)
body_html = re.sub(r'(?is)<meta[^>]*>\s*', '', body_html)

# 2. Chart.js zamiast tagu z CDN
cdn_tag = re.search(r'(?is)<script src="https://cdnjs[^"]*chart[^"]*"[^>]*>\s*</script>', body_html)
if not cdn_tag:
    sys.exit('Nie znaleziono tagu <script> z Chart.js w index.html.')
body_html = body_html.replace(cdn_tag.group(0),
    '<script>\n/* Chart.js 4.4.1 — wklejony, bo artefakt nie pobierze go z CDN */\n'
    + chart + '\nwindow.__chartReady = (typeof window.Chart !== "undefined");\n</script>')

# 3. PDF.js: biblioteka inline, worker jako tekst — aplikacja zrobi z niego blob
inline_pdf = ('<script>\n/* PDF.js 3.11.174 — wklejony razem ze źródłem workera */\n'
              + pdfjs + '\n</script>\n'
              + '<script type="text/plain" id="pdfWorkerSource">' + worker + '</script>\n')
body_html = body_html.replace('<script>\n"use strict";', inline_pdf + '<script>\n"use strict";', 1)

io.open(out_path, 'w', encoding='utf-8').write(body_html)
print('Zapisano %s (%.1f MB)' % (out_path, os.path.getsize(out_path) / 1048576.0))
