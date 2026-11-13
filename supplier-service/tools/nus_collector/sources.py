"""Small allowlist of official sources and deterministic HTML extraction."""

import hashlib
import re

from bs4 import BeautifulSoup

BASE = "https://uci.nus.edu.sg/campus-life/campus-services/retail-dining/"
SOURCES = {
    "kent-ridge": BASE + "kent-ridge/",
    "utown": BASE + "university-town/",
    "retail": BASE + "retail-outlets-in-kent-ridge-bukit-timah-and-university-town/",
}


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def key(value):
    return re.sub(r"\s+", " ", value.replace("’", "'").strip()).casefold()


def suggested_hours(text):
    """Only propose a single unqualified daily interval; preserve anything else."""
    if re.search(r"vacation|term time|closed|last order|\bPH\b", text, re.I):
        return "", ""
    if re.fullmatch(r"\s*(?:daily|mon\s*[-–]\s*sun)?\s*:?\s*(?:24/7|24 hours)\s*", text, re.I):
        return "0000hrs", "0000hrs"
    match = re.fullmatch(
        r"\s*(?:daily|mon\s*[-–]\s*sun)\s*[:,]?\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)"
        r"\s*[-–—]\s*(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)\s*", text, re.I,
    )
    if not match:
        return "", ""
    result = []
    for hour, minute, period in (match.groups()[:3], match.groups()[3:]):
        hour, minute = int(hour), int(minute or 0)
        if not 1 <= hour <= 12 or minute > 59:
            return "", ""
        result.append(f"{hour % 12 + (12 if period.lower() == 'pm' else 0):02}{minute:02}hrs")
    return tuple(result)


def parse_html(source, html):
    """Read listing headings and their text until the next listing/footer heading.

    Unrecognized location blocks are errors rather than silently skipped records.
    Adapters deliberately fail closed when the directory's structure changes.
    """
    soup = BeautifulSoup(html, "html.parser")
    if "_Incapsula_Resource" in html or soup.find(string=re.compile("verify you are human", re.I)):
        raise ValueError("Bot-protection response; save the rendered directory as HTML in a browser and use --snapshots.")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    headings = soup.find_all(["h4", "h5"])
    records, issues = [], []
    for heading in headings:
        name = heading.get_text(" ", strip=True)
        fragments = []
        for element in heading.next_elements:
            if getattr(element, "name", None) in {"h1", "h2", "h3", "h4", "h5", "h6"}:
                break
            if isinstance(element, str) and element.strip() and heading not in element.parents:
                fragments.append(str(element).strip())
        text = "\n".join(fragments)
        location = re.search(r"Location\s*:\s*([^\n]+)", text, re.I)
        if not location:
            if re.search(r"hours|carpark|bus stop|location", text, re.I) and "Have Questions" not in name:
                issues.append(f"Listing {name!r} has no parseable Location.")
            continue
        raw_location = location[1].strip()
        building = re.split(r",?\s+(?:level\s+|#)\w", raw_location, maxsplit=1, flags=re.I)[0].strip(" ,")
        floor_match = re.search(r"\blevel\s+(B?\d+)|#(B?\d+)-", raw_location, re.I)
        floor = (floor_match[1] or floor_match[2]) if floor_match else ""
        hours = re.search(r"(?:Term Time[^\n]*|Vacation[^\n]*|Operating Hours[^\n]*)(?:\n|$)(.*)", text, re.I | re.S)
        raw_hours = hours[0] if hours else ""
        raw_hours = re.split(r"Nearest|Contact|Seating Capacity|Number of Stalls", raw_hours, flags=re.I)[0].strip()
        # Headers qualify schedules; leave proposals unknown unless clearly daily.
        simple = re.sub(r"^(?:Term Time & Vacation Operating Hours|Operating Hours)\s*:\s*", "", raw_hours, flags=re.I)
        opening, closing = suggested_hours(simple)
        reason = ""
        if re.search(r"Bukit Timah|Kent Vale", raw_location, re.I):
            reason = "Outside Kent Ridge/UTown coverage"
        elif re.search(r"OCBC|bank|salon|beautique|hair destination|delivery", name, re.I):
            reason = "Outside supported supplier categories"
        elif re.search(r"temporarily closed|permanently closed", name + text, re.I):
            reason = "Closure requires review"
        category = "Food" if source != "retail" else "Printing" if re.search(r"print", name, re.I) else "Shopping"
        records.append({
            "candidate_id": source + "-" + digest(key(name) + "|" + key(raw_location))[:16],
            "source": source, "source_url": SOURCES[source], "source_name": name,
            "raw_location": raw_location, "raw_hours": raw_hours, "raw_text": name + "\n" + text,
            "content_hash": digest(name + "\n" + text), "exclusion_reason": reason,
            "proposed": {"Name": name, "Type": category, "Building": building, "Floor": floor,
                         "Location Description": "", "Latitude": "", "Longitude": "",
                         "StartingTime": opening, "ClosingTime": closing, "ImageURL": ""},
            "image_urls": [img.get("src", "") for img in heading.parent.find_all("img")],
        })
    if not records:
        issues.append("No outlet listings found; source may be empty, blocked, or have changed structure.")
    # Location labels outside recognized cards indicate potential silent data loss.
    locations = len(re.findall(r"\bLocation\s*:", soup.get_text("\n", strip=True), re.I))
    if locations != len(records):
        issues.append(f"Found {locations} location labels but parsed {len(records)} listings; inspect snapshot.")
    return records, issues
