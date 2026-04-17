#!/usr/bin/env python3
"""Verify the live Python install page on docs.axint.ai matches the package."""

from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

DOCS_URL = "https://docs.axint.ai/python/install/"
PYPROJECT = Path(__file__).resolve().parent.parent / "python" / "pyproject.toml"


def read_version(path: Path) -> str:
    text = path.read_text()
    match = re.search(r'(?m)^version\s*=\s*"([^"]+)"', text)
    if not match:
        raise RuntimeError(f"no version field in {path}")
    return match.group(1)


def main() -> int:
    version = read_version(PYPROJECT)
    major_minor = ".".join(version.split(".")[:2])

    try:
        with urllib.request.urlopen(DOCS_URL, timeout=20) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception as err:
        print(f"could not fetch {DOCS_URL}: {err}", file=sys.stderr)
        return 2

    if "pip install axint" not in html:
        print(f"docs missing `pip install axint` install command", file=sys.stderr)
        return 1

    # Any pinned `pip install axint==X.Y.Z` must match the package version.
    pinned = re.findall(r"pip install axint==([\d.a-z]+)", html)
    for pin in pinned:
        if pin != version:
            print(
                f"docs pins axint=={pin}, pyproject is {version}",
                file=sys.stderr,
            )
            return 1

    # Catch stale prerelease references like the 0.1.0a1 line.
    stale = re.findall(r"\b0\.1\.0a\d+\b", html)
    if stale and major_minor != "0.1":
        print(
            f"docs references stale prerelease {stale[0]}, current is {version}",
            file=sys.stderr,
        )
        return 1

    print(f"docs.axint.ai/python/install matches pyproject {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
