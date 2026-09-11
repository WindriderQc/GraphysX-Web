"""Index local EV3 manuals and optionally fetch LEGO Education's published PDFs.

Requires pypdf, Pillow and Poppler. Originals stay in ignored docs/Lego; only the
catalog and small covers are product assets. No PDF is uploaded by this tool.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "https://education.lego.com/en-us/product-resources/mindstorms-ev3/downloads/building-instructions/"
SOURCES = ROOT / "docs/kidx-education-sources.json"
ORIGINALS = ROOT / "docs/Lego"
COVERS = ROOT / "public/assets/kidx/library"


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "KidX local reference importer"}), timeout=90) as response:
        return response.read()


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.section = ""
        self.heading = False
        self.anchor = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag == "h2":
            self.heading = True
            self.section = ""
        href = dict(attrs).get("href", "")
        if tag == "a" and ".pdf" in href and href.startswith("https://assets.education.lego.com/"):
            self.anchor = {"url": href, "title": "", "section": self.section}

    def handle_data(self, data):
        if self.heading:
            self.section += data
        if self.anchor is not None:
            self.anchor["title"] += data

    def handle_endtag(self, tag):
        if tag == "h2":
            self.heading = False
        if tag == "a" and self.anchor is not None:
            self.anchor["title"] = self.anchor["title"].replace("Download", "").strip()
            self.items.append(self.anchor)
            self.anchor = None


def document_id(filename):
    return re.sub(r"[^a-z0-9]+", "-", Path(filename).stem.lower()).strip("-")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true", help="Fetch missing official Education PDFs")
    args = parser.parse_args()
    ORIGINALS.mkdir(parents=True, exist_ok=True)
    COVERS.mkdir(parents=True, exist_ok=True)
    if args.download:
        links = Links()
        links.feed(fetch(SOURCE).decode("utf-8"))
        sources = list({item["url"]: item for item in links.items}.values())
        if not sources:
            raise RuntimeError("No Education PDFs found; existing catalog left intact")
        SOURCES.write_text(json.dumps(sources, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        sources = json.loads(SOURCES.read_text(encoding="utf-8")) if SOURCES.exists() else []
    by_name = {unquote(Path(urlparse(item["url"]).path).name): item for item in sources}

    def download(item):
        filename, source = item
        target = ORIGINALS / filename
        if target.exists():
            return
        data = fetch(source["url"])
        if not data.startswith(b"%PDF-"):
            raise RuntimeError(f"Not a PDF: {filename}")
        target.write_bytes(data)
        print(f"Downloaded {filename}", flush=True)

    if args.download:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(download, by_name.items()))

    def index(file):
        source = by_name.get(file.name, {})
        reader = PdfReader(file)
        slug = document_id(file.name)
        cover = COVERS / (slug + ".webp")
        if not cover.exists():
            temporary = COVERS / slug
            subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-singlefile", "-scale-to", "560", "-png", str(file), str(temporary)], check=True, capture_output=True)
            with Image.open(temporary.with_suffix(".png")) as image:
                image.convert("RGB").save(cover, "WEBP", quality=78)
            temporary.with_suffix(".png").unlink()
        section = source.get("section", "")
        kind = "program" if "program" in file.name.lower() else "build"
        if "schematics" in file.name:
            kind = "reference"
        if file.name.startswith("31313") or file.name == "6124045.pdf":
            family = "31313"
            title = file.stem.replace("31313_X_", "").replace("_", " ")
            if file.name == "6124045.pdf":
                title = "Le livret du kit 31313"
                kind = "reference"
        else:
            family = next((name for key, name in [("Robot Educator", "Robot Educator"), ("Core", "Education Core"), ("Expansion", "Education Expansion"), ("Design Engineering", "Mécanismes"), ("Space", "Espace"), ("Science", "Sciences")] if key in section), "Références")
            title = source.get("title", file.stem.replace("-", " "))
        if "schematics" in file.name:
            title = "Électronique de la brique EV3"
        if title.isdigit():
            title = f"{family} · modèle {title}"
        data = file.read_bytes()
        return {"id": slug, "title": title, "family": family, "kind": kind, "pages": len(reader.pages), "filename": file.name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "sourceUrl": source.get("url"), "coverUrl": f"/assets/kidx/library/{slug}.webp"}

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        documents = list(pool.map(index, sorted(ORIGINALS.glob("*.pdf"))))
    target = ROOT / "src/kidx-document-catalog.json"
    target.write_text(json.dumps(documents, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Indexed {len(documents)} PDFs; originals remain local in docs/Lego.", flush=True)


if __name__ == "__main__":
    main()
