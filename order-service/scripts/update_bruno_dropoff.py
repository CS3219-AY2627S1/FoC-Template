from pathlib import Path
import re

root = Path(__file__).resolve().parents[1] / "bruno"
count = 0
for path in root.rglob("*.bru"):
    text = path.read_text(encoding="utf-8")
    if "toLocation" not in text:
        continue
    new = re.sub(r'"toLocation"\s*:\s*"[^"]*"', '"deliveryPointId": 1', text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        count += 1
        print(path.relative_to(root))
print("updated", count)
