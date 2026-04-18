"""
Cross-language parity tests for bundle hash.

The two shared vectors below are asserted byte-for-byte in three places:
  * axint/tests/core/bundle-hash.test.ts        (TS CLI)
  * axint-registry/packages/api/src/bundle-hash.test.ts  (Worker)
  * here                                          (Python CLI)

If any one of them changes, all three must change in the same release —
otherwise installs will fail bundle verification across language boundaries.
"""

from __future__ import annotations

from axint.bundle_hash import (
    BUNDLE_HASH_HEX_LENGTH,
    canonicalize_bundle,
    hash_bundle,
)


def test_canonicalize_sorts_keys_and_normalizes_optionals_to_null() -> None:
    canonical = canonicalize_bundle({"ts_source": "ts", "swift_output": "sw"})
    assert canonical == (
        '{"plist_fragment":null,"py_source":null,"swift_output":"sw","ts_source":"ts"}'
    )


def test_canonicalize_treats_missing_and_explicit_none_the_same() -> None:
    no_optionals = canonicalize_bundle({"ts_source": "ts", "swift_output": "sw"})
    with_nones = canonicalize_bundle(
        {"ts_source": "ts", "swift_output": "sw", "py_source": None, "plist_fragment": None}
    )
    assert no_optionals == with_nones


def test_canonicalize_distinguishes_empty_string_from_missing() -> None:
    empty = canonicalize_bundle({"ts_source": "ts", "swift_output": "sw", "py_source": ""})
    missing = canonicalize_bundle({"ts_source": "ts", "swift_output": "sw"})
    assert empty != missing


def test_hash_returns_64_lowercase_hex() -> None:
    h = hash_bundle({"ts_source": "a", "swift_output": "b"})
    assert len(h) == BUNDLE_HASH_HEX_LENGTH
    assert all(c in "0123456789abcdef" for c in h)


def test_hash_matches_shared_vector_with_all_fields() -> None:
    h = hash_bundle(
        {"ts_source": "ts", "swift_output": "sw", "py_source": "py", "plist_fragment": "pl"}
    )
    assert h == "9f708e7e282ec5e3a578a18f1d4bc003e144265ea9bc0845337c65c96399bf04"


def test_hash_matches_shared_vector_for_python_only_bundle() -> None:
    h = hash_bundle({"py_source": "py", "swift_output": "sw"})
    assert h == "7757c15e7a4abc2cb54dd27f4b37cb0752ea0f2f3975fb02b05c68a5b59f0c83"
