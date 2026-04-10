"""
Command-line entry point for the Python SDK.

The Python compiler is now fully native — it parses Python source into
the shared IR and generates Swift directly, with no Node.js dependency.

Commands
--------
    axintai compile <file>           Parse a .py intent → Swift
    axintai parse <file>             Parse + print the IR as JSON
    axintai validate <file>          Validate intent without generating Swift
    axintai --version                Show the SDK version
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
)
from .parser import ParserError, parse_file
from .validator import validate_intent


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

    # compile — native Python → Swift
    p_compile = sub.add_parser(
        "compile",
        help="Compile Python intent → Swift App Intent (native, no Node.js needed)",
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
    p_compile.add_argument(
        "--json", action="store_true", help="Output result as JSON (machine-readable)"
    )

    # validate — check intent without generating Swift
    p_validate = sub.add_parser(
        "validate",
        help="Validate a Python intent definition without generating output",
    )
    p_validate.add_argument("file", help="Path to the .py intent file")

    args = parser.parse_args(argv)

    if args.command == "parse":
        return _cmd_parse(args)
    if args.command == "compile":
        return _cmd_compile(args)
    if args.command == "validate":
        return _cmd_validate(args)
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
        _print_parser_diagnostics(exc)
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
        _print_parser_diagnostics(exc)
        return 1

    if not intents:
        print(
            "error: no `define_intent(...)` calls found in this file.",
            file=sys.stderr,
        )
        return 1

    exit_code = 0

    for ir in intents:
        # Validate
        diagnostics = validate_intent(ir)
        has_errors = any(d.severity == "error" for d in diagnostics)

        if has_errors:
            _print_validator_diagnostics(diagnostics)
            exit_code = 1
            continue

        # Generate Swift
        swift_code = generate_swift(ir)

        if args.json:
            plist_frag = generate_info_plist_fragment(ir) if args.emit_info_plist else None
            ent_frag = generate_entitlements_fragment(ir) if args.emit_entitlements else None
            print(
                json.dumps(
                    {
                        "success": True,
                        "name": ir.name,
                        "swift": swift_code,
                        "infoPlistFragment": plist_frag,
                        "entitlementsFragment": ent_frag,
                        "diagnostics": [
                            {"code": d.code, "severity": d.severity, "message": d.message}
                            for d in diagnostics
                        ],
                    },
                    indent=2,
                )
            )
            continue

        if args.stdout:
            print(swift_code)
        else:
            out_dir = Path(args.out)
            out_dir.mkdir(parents=True, exist_ok=True)
            swift_path = out_dir / f"{ir.name}Intent.swift"
            swift_path.write_text(swift_code, encoding="utf-8")
            print(f"\033[32m✓\033[0m Compiled {ir.name} → {swift_path}")

            if args.emit_info_plist:
                frag = generate_info_plist_fragment(ir)
                if frag:
                    plist_path = out_dir / f"{ir.name}Intent.plist.fragment.xml"
                    plist_path.write_text(frag, encoding="utf-8")
                    print(f"\033[32m✓\033[0m Info.plist fragment → {plist_path}")

            if args.emit_entitlements:
                frag = generate_entitlements_fragment(ir)
                if frag:
                    ent_path = out_dir / f"{ir.name}Intent.entitlements.fragment.xml"
                    ent_path.write_text(frag, encoding="utf-8")
                    print(f"\033[32m✓\033[0m Entitlements fragment → {ent_path}")

        # Print warnings
        warnings = [d for d in diagnostics if d.severity == "warning"]
        if warnings:
            _print_validator_diagnostics(warnings)

    return exit_code


def _cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.file)
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return 1
    try:
        intents = parse_file(path)
    except ParserError as exc:
        _print_parser_diagnostics(exc)
        return 1

    if not intents:
        print(
            "error: no `define_intent(...)` calls found in this file.",
            file=sys.stderr,
        )
        return 1

    has_errors = False
    for ir in intents:
        diagnostics = validate_intent(ir)
        if diagnostics:
            _print_validator_diagnostics(diagnostics)
        if any(d.severity == "error" for d in diagnostics):
            has_errors = True
        else:
            print(f"\033[32m✓\033[0m {ir.name} — valid intent definition")

    return 1 if has_errors else 0


# ── Helpers ─────────────────────────────────────────────────────────


def _print_parser_diagnostics(exc: ParserError) -> None:
    for d in exc.diagnostics:
        print(f"  error[{d.code}]: {d.message}", file=sys.stderr)
        if d.file:
            print(f"    --> {d.file}:{d.line or '?'}", file=sys.stderr)
        if d.suggestion:
            print(f"    = help: {d.suggestion}", file=sys.stderr)


def _print_validator_diagnostics(diagnostics: list) -> None:
    for d in diagnostics:
        prefix = (
            "\033[31merror\033[0m"
            if d.severity == "error"
            else "\033[33mwarning\033[0m"
            if d.severity == "warning"
            else "\033[36minfo\033[0m"
        )
        print(f"  {prefix}[{d.code}]: {d.message}", file=sys.stderr)
        if hasattr(d, "suggestion") and d.suggestion:
            print(f"    = help: {d.suggestion}", file=sys.stderr)


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
