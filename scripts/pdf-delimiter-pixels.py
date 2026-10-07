"""Check exported delimiter strips after running pdf-delimiter-regression.mjs."""
import json
import subprocess
from pathlib import Path
from PIL import Image

root = Path('tmp/pdf-delimiter-qa')
segments = json.loads((root / 'segments.json').read_text(encoding='utf-8'))
for name in ['exam-450', 'book-200', 'book-300']:
    subprocess.run(['pdftoppm', '-scale-to-x', '1588', '-scale-to-y', '-1',
                    '-png', '-singlefile', str(root / f'{name}.pdf'), str(root / name)], check=True)
    image = Image.open(root / f'{name}.png').convert('RGB')
    scale = image.width / 794
    ratios = []
    for segment in segments:
        x1 = int(segment['x'] * scale)
        x2 = int((segment['x'] + segment['width']) * scale) + 1
        y1 = round(segment['y'] * scale) + 2
        y2 = round((segment['y'] + segment['height']) * scale) - 2
        rows = [any(max(image.getpixel((x, y))) < 150 for x in range(x1, x2)) for y in range(y1, y2)]
        ratio = sum(rows) / len(rows)
        ratios.append(round(ratio, 4))
        assert ratio >= 0.97, f'{name}: missing/misplaced delimiter strip {segment}, coverage={ratio}'
    print(json.dumps({'file':name, 'continuousStrips':len(segments), 'rowCoverage':ratios}))
