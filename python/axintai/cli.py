"""
Command-line entry point for the Python SDK.

The Python compiler is fully native — it parses Python source into
the shared IR and generates Swift directly, with no Node.js dependency.

Commands
--------
    axintai compile <file>           Parse .py definitions → Swift
    axintai parse <file>             Parse + print the IR as JSON
    axintai validate <file>          Validate definitions without generating Swift
    axintai --version                Show the SDK version
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
    generate_swift_app,
    generate_swift_view,
    generate_swift_widget,
)
from .ir import AppIR, IntentIR, ViewIR, WidgetIR
from .parser import (
    ParserError,
    parse_app_source,
    parse_file,
    parse_source,
    parse_view_source,
    parse_widget_source,
)
from .validator import (
    ValidatorDiagnostic,
    validate_app,
    validate_intent,
    validate_view,
    validate_widget,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="axintai",
        description="Python SDK for Axint — define Apple Intents, Views, Widgets, and Apps in Python.",
    )
    parser.add_argument(
        "--version", action="version", version=f"axintai {__version__}"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_parse = sub.add_parser("parse", help="Parse a Python file and print the IR")
    p_parse.add_argument("file", help="Path to the .py file")
    p_parse.add_argument("--json", action="store_true", help="Output as JSON")

    p_compile = sub.add_parser("compile", help="Compile Python definitions → Swift (native)")
    p_compile.add_argument("file", help="Path to the .py file")
    p_compile.add_argument("--out", default=".", help="Output directory for Swift")
    p_compile.add_argument("--stdout", action="store_true", help="Print Swift to stdout")
    p_compile.add_argument("--emit-info-plist", action="store_true", help="Emit Info.plist fragment")
    p_compile.add_argument("--emit-entitlements", action="store_true", help="Emit entitlements fragment")
    p_compile.add_argument("--json", action="store_true", help="Output result as JSON")

    p_validate = sub.add_parser("validate", help="Validate definitions without generating Swift")
    p_validate.add_argument("file", help="Path to the .py file")

    args = parser.parse_args(argv)

    if args.command == "parse":
        return _cmd_parse(args)
    if args.command == "compile":
        return _cmd_compile(args)
    if args.command == "validate":
        return _cmd_validate(args)
    parser.print_help()
    return 2


def _read_source(path: Path) -> str | None:
    if not path.exists():
        print(f"error: file not found: {path}", file=sys.stderr)
        return None
    return path.read_text(encoding="utf-8")


def _parse_all(source: str, file: str) -> dict[str, list[Any]]:
    """Parse all definition types from a source string."""
    result: dict[str, list[Any]] = {"intents": [], "views": [], "widgets": [], "apps": []}
    try:
        result["intents"] = parse_source(source, file=file)
    except ParserError:
        pass
    try:
        result["views"] = parse_view_source(source, file=file)
    except ParserError:
        pass
    try:
        result["widgets"] = parse_widget_source(source, file=file)
    except ParserError:
        pass
    try:
        result["apps"] = parse_app_source(source, file=file)
    except ParserError:
        pass
    return result


def _cmd_parse(args: argparse.Namespace) -> int:
    path = Path(args.file)
    source = _read_source(path)
    if source is None:
        return 1

    parsed = _parse_all(source, str(path))
    total = sum(len(v) for v in parsed.values())

    if total == 0:
        print("error: no definitions found in this file.", file=sys.stderr)
        return 1

    if args.json:
        out: dict[str, Any] = {}
        if parsed["intents"]:
            out["intents"] = [ir.to_dict() for ir in parsed["intents"]]
        if parsed["views"]:
            out["views"] = [ir.to_dict() for ir in parsed["views"]]
        if parsed["widgets"]:
            out["widgets"] = [ir.to_dict() for ir in parsed["widgets"]]
        if parsed["apps"]:
            out["apps"] = [ir.to_dict() for ir in parsed["apps"]]
        print(json.dumps(out, indent=2))
    else:
        for ir in parsed["intents"]:
            print(f"  \033[38;5;208m◆\033[0m intent: {ir.name}  \033[2m— {ir.title}\033[0m")
            for p in ir.parameters:
                print(f"      {p.name}: {p.type}  \033[2m— {p.description}\033[0m")
        for ir in parsed["views"]:
            print(f"  \033[38;5;39m◆\033[0m view: {ir.name}  \033[2m— {len(ir.body)} body nodes\033[0m")
        for ir in parsed["widgets"]:
            print(f"  \033[38;5;141m◆\033[0m widget: {ir.name}  \033[2m— {ir.display_name}\033[0m")
        for ir in parsed["apps"]:
            print(f"  \033[38;5;46m◆\033[0m app: {ir.name}  \033[2m— {len(ir.scenes)} scenes\033[0m")

    return 0


def _cmd_compile(args: argparse.Namespace) -> int:
    path = Path(args.file)
    source = _read_source(path)
    if source is None:
        return 1

    parsed = _parse_all(source, str(path))
    total = sum(len(v) for v in parsed.values())

    if total == 0:
        print("error: no definitions found in this file.", file=sys.stderr)
        return 1

    exit_code = 0
    out_dir = Path(args.out)

    for ir in parsed["intents"]:
        exit_code |= _compile_intent(ir, args, out_dir)

    for ir in parsed["views"]:
        diags = validate_view(ir)
        if any(d.severity == "error" for d in diags):
            _print_validator_diagnostics(diags)
            exit_code = 1
            continue
        swift = generate_swift_view(ir)
        _emit_swift(swift, f"{ir.name}.swift", args, out_dir)
        _print_warnings(diags)

    for ir in parsed["widgets"]:
        diags = validate_widget(ir)
        if any(d.severity == "error" for d in diags):
            _print_validator_diagnostics(diags)
            exit_code = 1
            continue
        swift = generate_swift_widget(ir)
        _emit_swift(swift, f"{ir.name}Widget.swift", args, out_dir)
        _print_warnings(diags)

    for ir in parsed["apps"]:
        diags = validate_app(ir)
        if any(d.severity == "error" for d in diags):
            _print_validator_diagnostics(diags)
            exit_code = 1
            continue
        swift = generate_swift_app(ir)
        _emit_swift(swift, f"{ir.name}App.swift", args, out_dir)
        _print_warnings(diags)

    return exit_code


def _compile_intent(ir: IntentIR, args: argparse.Namespace, out_dir: Path) -> int:
    diagnostics = validate_intent(ir)
    if any(d.severity == "error" for d in diagnostics):
        _print_validator_diagnostics(diagnostics)
        return 1

    swift_code = generate_swift(ir)

    if args.json:
        plist_frag = generate_info_plist_fragment(ir) if args.emit_info_plist else None
        ent_frag = generate_entitlements_fragment(ir) if args.emit_entitlements else None
        print(json.dumps({
            "success": True,
            "name": ir.name,
            "swift": swift_code,
            "infoPlistFragment": plist_frag,
            "entitlementsFragment": ent_frag,
            "diagnostics": [
                {"code": d.code, "severity": d.severity, "message": d.message}
                for d in diagnostics
            ],
        }, indent=2))
        return 0

    _emit_swift(swift_code, f"{ir.name}Intent.swift", args, out_dir)

    if not args.stdout:
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

    _print_warnings(diagnostics)
    return 0


def _emit_swift(swift: str, filename: str, args: argparse.Namespace, out_dir: Path) -> None:
    if args.stdout:
        print(swift)
    else:
        out_dir.mkdir(parents=True, exist_ok=True)
        swift_path = out_dir / filename
        swift_path.write_text(swift, encoding="utf-8")
        print(f"\033[32m✓\033[0m Compiled → {swift_path}")


def _cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.file)
    source = _read_source(path)
    if source is None:
        return 1

    parsed = _parse_all(source, str(path))
    total = sum(len(v) for v in parsed.values())

    if total == 0:
        print("error: no definitions found in this file.", file=sys.stderr)
        return 1

    has_errors = False
    for ir in parsed["intents"]:
        diags = validate_intent(ir)
        if diags:
            _print_validator_diagnostics(diags)
        if any(d.severity == "error" for d in diags):
            has_errors = True
        else:
            print(f"\033[32m✓\033[0m {ir.name} — valid intent")

    for ir in parsed["views"]:
        diags = validate_view(ir)
        if diags:
            _print_validator_diagnostics(diags)
        if any(d.severity == "error" for d in diags):
            has_errors = True
        else:
            print(f"\033[32m✓\033[0m {ir.name} — valid view")

    for ir in parsed["widgets"]:
        diags = validate_widget(ir)
        if diags:
            _print_validator_diagnostics(diags)
        if any(d.severity == "error" for d in diags):
            has_errors = True
        else:
            print(f"\033[32m✓\033[0m {ir.name} — valid widget")

    for ir in parsed["apps"]:
        diags = validate_app(ir)
        if diags:
            _print_validator_diagnostics(diags)
        if any(d.severity == "error" for d in diags):
            has_errors = True
        else:
            print(f"\033[32m✓\033[0m {ir.name} — valid app")

    return 1 if has_errors else 0


def _print_warnings(diagnostics: list[ValidatorDiagnostic]) -> None:
    warnings = [d for d in diagnostics if d.severity == "warning"]
    if warnings:
        _print_validator_diagnostics(warnings)


def _print_parser_diagnostics(exc: ParserError) -> None:
    for d in exc.diagnostics:
        print(f"  error[{d.code}]: {d.message}", file=sys.stderr)
        if d.file:
            print(f"    --> {d.file}:{d.line or '?'}", file=sys.stderr)
        if d.suggestion:
            print(f"    = help: {d.suggestion}", file=sys.stderr)


def _print_validator_diagnostics(diagnostics: list[ValidatorDiagnostic]) -> None:
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
