#!/usr/bin/env python3
"""shareable — upload an HTML file and get a shareable comment URL.

Usage:
    python shareable.py <file.html>
    python shareable.py <file.html> --new        # force new slug (don't reuse sidecar)
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


CONFIG_PATH = Path.home() / ".config" / "shareable" / "config.json"


def die(msg: str, code: int = 1) -> None:
    print(f"shareable: {msg}", file=sys.stderr)
    sys.exit(code)


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        die(
            f"no config at {CONFIG_PATH}.\n"
            "Run setup first:  python scripts/setup.py"
        )
    try:
        return json.loads(CONFIG_PATH.read_text())
    except json.JSONDecodeError as e:
        die(f"config is invalid JSON: {e}")


def sidecar_path(html_path: Path) -> Path:
    return html_path.with_suffix(html_path.suffix + ".shareable.json")


def read_sidecar(html_path: Path) -> dict:
    p = sidecar_path(html_path)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return {}


def write_sidecar(html_path: Path, slug: str, url: str, version: int) -> None:
    p = sidecar_path(html_path)
    p.write_text(
        json.dumps(
            {"slug": slug, "url": url, "lastVersion": version},
            indent=2,
        )
        + "\n"
    )


def copy_to_clipboard(text: str) -> bool:
    system = platform.system()
    if system == "Darwin" and shutil.which("pbcopy"):
        subprocess.run(["pbcopy"], input=text, text=True, check=False)
        return True
    if shutil.which("wl-copy"):
        subprocess.run(["wl-copy"], input=text, text=True, check=False)
        return True
    if shutil.which("xclip"):
        subprocess.run(
            ["xclip", "-selection", "clipboard"],
            input=text,
            text=True,
            check=False,
        )
        return True
    return False


def upload(worker_url: str, token: str, html: bytes, slug: str | None) -> dict:
    url = worker_url.rstrip("/") + "/api/upload"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "text/html; charset=utf-8",
        "User-Agent": "shareable/0.1 (+https://github.com/)",
    }
    if slug:
        headers["Shareable-Slug"] = slug
    req = urllib.request.Request(url, data=html, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        die(f"upload failed: HTTP {e.code} — {body}")
    except urllib.error.URLError as e:
        die(f"upload failed: {e.reason}")


def main(argv: list[str]) -> None:
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = {a for a in argv[1:] if a.startswith("--")}

    if len(args) != 1:
        die("usage: shareable.py <file.html> [--new]")

    html_path = Path(args[0]).expanduser().resolve()
    if not html_path.exists():
        die(f"file not found: {html_path}")
    if html_path.suffix.lower() not in (".html", ".htm"):
        die(f"expected .html, got {html_path.suffix}")

    config = load_config()
    worker_url = config.get("workerUrl")
    token = config.get("uploadToken")
    if not worker_url or not token:
        die(f"config missing workerUrl or uploadToken: {CONFIG_PATH}")

    existing = {} if "--new" in flags else read_sidecar(html_path)
    slug = existing.get("slug")

    html = html_path.read_bytes()
    print(f"shareable: uploading {html_path.name} ({len(html):,} bytes)…", file=sys.stderr)
    result = upload(worker_url, token, html, slug)

    write_sidecar(html_path, result["slug"], result["url"], result["version"])

    url = result["url"]
    copied = copy_to_clipboard(url)

    print(url)
    print(
        f"  version: {result['version']}"
        + ("  (existing slug)" if slug == result["slug"] else "  (new slug)"),
        file=sys.stderr,
    )
    if copied:
        print("  copied to clipboard.", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv)
