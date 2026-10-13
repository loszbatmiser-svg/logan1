"""Buduje wersję index.html do publikacji jako artefakt claude.ai.

Podgląd artefaktu sam opakowuje stronę w <!doctype html><html><head>…<body>, więc plik do publikacji
nie może mieć własnego szkieletu — inaczej powstaje dokument zagnieżdżony w dokumencie. Lokalny
index.html zostaje pełnym dokumentem, żeby działał otwarty prosto z dysku.

Użycie: python3 tools/build_artifact.py [wyjście]   (domyślnie dist/index.html)
"""
import pathlib
import sys

SKELETON = {'<!DOCTYPE html>', '<html lang="pl">', '<head>', '  <meta charset="UTF-8">',
            '</head>', '<body>', '</body>', '</html>'}

root = pathlib.Path(__file__).resolve().parent.parent
dst = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'index.html'
lines = (root / 'index.html').read_text(encoding='utf-8').split('\n')
out = [line for line in lines if line not in SKELETON]
if len(lines) - len(out) != len(SKELETON):
    sys.exit('Szkielet index.html wygląda inaczej niż oczekiwano — sprawdź SKELETON.')
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text('\n'.join(out), encoding='utf-8')
print(f'{dst} ({dst.stat().st_size} B)')
