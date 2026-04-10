"""
Command-line entry point for the Python SDK.

The Python compiler is deliberately thin: it parses the Python source
into the shared IR and then shells out to the already-published
`@axintai/compiler` TypeScript compiler to produce Swift. This keeps a
single source of truth for the Swift generator — the Python layer
focuses on Python-specific parsing, diagnostics, and ergonomics.

Commands
--------
    axintai compile <file>           Parse a .py intent → IR (and optionally Swift)
    axintai parse <file>             Parse + print the IR as JSON
    axintai --version                Show the SDK version
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from . import __version__
from .parser import ParserError, parse_file


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="axintai",
        description="Python SDK for Axint — define Apple App Intents in Python.",
    )
    parser.add_argument(
        "--version", action="version", version=f"axintai {__version__}"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # parse — dump the IR
    p_parse = sub.add_parser("parse", help="Parse a Python intent file and print the IR")
    p_parse.add_argument("file", help="Path to the .py intent file")
    p_parse.add_argument("--json", action="store_true", help="Output as JSON")

    # compile — shell out to @axintai/compiler for Swift emission
    p_compile = sub.add_parser(
        "compile",
        help="Parse Python → IR → (shell out to the TS compiler for Swift emission)",
    )
    p_compile.add_argument("file", help="Path to the .py intent file")
    p_compile.add_argument("--out", default=".", help="Output directory for Swift")
    p_compile.add_argument(
        "--stdout", action="store_true", help="Print Swift to stdout instead of writing a file"
    )
    p_compile.add_argument(
        "--emit-info-plist", action="store_true", help="Emit Info.plist fragment"
    )
    p_compile.add_argument(
        "--emit-entitlements", action="store_true", help="Emit entitlements fragment"
    )

    args = parser.parse_args(argv)

    if args.command == "parse":
        return _cmd_parse(args)
    if args.command == "compile":
        return _cmd_compile(args)
    parser.print_help()
    return 2


def _cmd_parse(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 1
    try:
        intents = parse_file(path)
    except ParserError as exc:
        for d in exc.diagnostics:
            print(f"  error[{d.code}]: {d.message}", file=sys.stderr)
            if d.file:
                print(f"    --> {d.file}:{d.line or '?'}", file=sys.stderr)
            if d.suggestion:
                print(f"    = help: {d.suggestion}", file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps([ir.to_dict() for ir in intents], indent=2))
    else:
        for ir in intents:
            print(f"  \033[38;5;208m◆\033[0m {ir.name}  \033[2m— {ir.title}\033[0m")
            for p in ir.parameters:
                print(f"      {p.name}: {p.type}  \033[2m— {p.description}\033[0m")
    return 0


def _cmd_compile(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 1
    try:
        intents = parse_file(path)
    except ParserError as exc:
        for d in exc.diagnostics:
            print(f"  error[{d.code}]: {d.message}", file=sys.stderr)
            if d.file:
                print(f"    --> {d.file}:{d.line or '?'}", file=sys.stderr)
        return 1

    if not intents:
        print(
            "error: no `define_intent(...)` calls found in this file.",
            file=sys.stderr,
        )
        return 1

    # Shell out to the TS compiler using the shared IR JSON.
    # For alpha, we support the single-intent case; multi-intent files
    # are a v0.3.0 follow-up.
    if len(intents) > 1:
        print(
            "warning: multiple intents in one file — only the first is compiled (v0.3.0 will fix this).",
            file=sys.stderr,
        )
    ir = intents[0]
    ir_json = json.dumps(ir.to_dict())

    axint_bin = shutil.which("axint")
    if axint_bin is None:
        print(
            "error: `axint` CLI not found on $PATH. Install it with `npm install -g @axintai/compiler`.",
            file=sys.stderr,
        )
        return 1

    # For now we call the TS compiler directly against the .py file
    # using a thin --ir-json bridge (the bridge itself lands in the TS
    # compiler in v0.3.0 — this is the handshake that unblocks the
    # cross-language pipeline). The IR is printed here so early adopters
    # can pipe it into any downstream tool.
    print(
        f"\033[36m→\033[0m Parsed {ir.name} from {path.name}",
        file=sys.stderr,
    )
    print(
        f"\033[33mnote:\033[0m Python → Swift codegen bridge lands in @axintai/compiler v0.3.0.",
        file=sys.stderr,
    )
    print(
        f"\033[33mnote:\033[0m For now, the IR is printed below. Pipe it through `axint compile --ir-json -` once v0.3.0 ships.",
        file=sys.stderr,
    )
    print(ir_json)
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
