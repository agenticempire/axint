"""
Canonical hash over the bytes that leave the registry at install time.

Mirror of axint/src/core/bundle-hash.ts and the registry Worker's
bundle-hash.ts. Must stay byte-identical with both — anything that
changes serialization here has to ship to the other two in the same
release, or every install will fail bundle verification.

The contract:
  * UTF-8 JSON, keys in alphabetical order, no whitespace
  * Missing optional fields are explicit null, never absent
  * SHA-256, lower-case hex, 64 chars
"""

from __future__ import annotations

import hashlib
import json
from typing import TypedDict


class _SwiftOutput(TypedDict):
    swift_output: str


# swift_output is the only field every bundle must carry (the registry
# uses it as the canonical compiled artifact). The other three are
# optional for the same reason they're optional on the TS side: a
# Python-only or TS-only package legitimately omits the other source.
class BundleContents(_SwiftOutput, total=False):
    ts_source: str | None
    py_source: str | None
    plist_fragment: str | None


BUNDLE_HASH_ALGORITHM = "sha256"
BUNDLE_HASH_HEX_LENGTH = 64


def canonicalize_bundle(bundle: BundleContents) -> str:
    # .get() returns None for missing keys; we use it directly instead of
    # `or None` so empty strings stay as empty strings, matching the TS
    # `??` operator on the other side of the wire.
    normalized = {
        "plist_fragment": bundle.get("plist_fragment"),
        "py_source": bundle.get("py_source"),
        "swift_output": bundle["swift_output"],
        "ts_source": bundle.get("ts_source"),
    }
    return json.dumps(normalized, separators=(",", ":"))


def hash_bundle(bundle: BundleContents) -> str:
    canonical = canonicalize_bundle(bundle)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
