import xml.etree.ElementTree as ET

root = ET.parse("target/site/jacoco/jacoco.xml").getroot()
for counter in root.findall("counter"):
    if counter.get("type") in {"LINE", "INSTRUCTION"}:
        missed = int(counter.get("missed"))
        covered = int(counter.get("covered"))
        total = missed + covered
        print(f"{counter.get('type')}: {covered}/{total} = {covered / total * 100:.2f}%")
