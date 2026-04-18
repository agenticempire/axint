"""
Command-line entry point for the Python SDK.

The Python compiler is fully native — it parses Python source into
the shared IR and generates Swift directly, with no Node.js dependency.

Commands
--------
    axint init [dir]               Scaffold a new Axint project
    axint compile <file>           Parse .py definitions → Swift
    axint parse <file>             Parse + print the IR as JSON
    axint validate <file>          Validate definitions without generating Swift
    axint eject <file>             Export generated Swift to standalone Xcode project
    axint watch <file|dir>         Watch .py files and auto-compile on change
    axint mcp                      Start the MCP server for AI coding assistants
    axint registry login           Authenticate with registry.axint.ai
    axint registry publish         Publish a package to the registry
    axint registry add <package>   Install a package from the registry
    axint registry search [query]  Search packages in the registry
    axint --version                Show the SDK version
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import __version__
from .generator import (
    generate_entitlements_fragment,
    generate_info_plist_fragment,
    generate_swift,
    generate_swift_app,
    generate_swift_view,
    generate_swift_widget,
)
from .ir import IntentIR
from .parser import (
    ParserError,
    parse_app_source,
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
        prog="axint",
        description="Python SDK for Axint — define Apple Intents, Views, Widgets, and Apps in Python.",
    )
    parser.add_argument(
        "--version", action="version", version=f"axint {__version__}"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init", help="Scaffold a new Axint project")
    p_init.add_argument("dir", nargs="?", default=".", help="Project directory")
    p_init.add_argument("--name", help="Project name (defaults to directory name)")

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

    p_eject = sub.add_parser("eject", help="Export generated Swift to standalone Xcode project")
    p_eject.add_argument("file", help="Path to the .py file")
    p_eject.add_argument("--out", default=".", help="Output directory")

    p_watch = sub.add_parser("watch", help="Watch .py files and auto-compile on change")
    p_watch.add_argument("file", help="Path to .py file or directory")
    p_watch.add_argument("--out", default=".", help="Output directory for Swift")
    p_watch.add_argument("--emit-info-plist", action="store_true", help="Emit Info.plist fragment")
    p_watch.add_argument("--emit-entitlements", action="store_true", help="Emit entitlements fragment")

    sub.add_parser("mcp", help="Start the MCP server for AI coding assistants")

    registry_sub = sub.add_parser("registry", help="Manage packages in the Axint Registry").add_subparsers(
        dest="registry_command", required=True
    )

    registry_sub.add_parser("login", help="Authenticate with registry.axint.ai")
    registry_sub.add_parser("publish", help="Publish a package to the registry")

    p_add = registry_sub.add_parser("add", help="Install a package from the registry")
    p_add.add_argument("package", help="Package to install (e.g., @namespace/slug)")
    p_add.add_argument("--to", default="intents", help="Target directory")

    p_search = registry_sub.add_parser("search", help="Search the registry")
    p_search.add_argument("query", nargs="?", help="Search term")
    p_search.add_argument("--limit", default="20", help="Max results")
    p_search.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args(argv)

    if args.command == "init":
        return _cmd_init(args)
    if args.command == "parse":
        return _cmd_parse(args)
    if args.command == "compile":
        return _cmd_compile(args)
    if args.command == "validate":
        return _cmd_validate(args)
    if args.command == "eject":
        return _cmd_eject(args)
    if args.command == "watch":
        return _cmd_watch(args)
    if args.command == "mcp":
        return _cmd_mcp(args)
    if args.command == "registry":
        return _cmd_registry(args)

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
    with contextlib.suppress(ParserError):
        result["intents"] = parse_source(source, file=file)
    with contextlib.suppress(ParserError):
        result["views"] = parse_view_source(source, file=file)
    with contextlib.suppress(ParserError):
        result["widgets"] = parse_widget_source(source, file=file)
    with contextlib.suppress(ParserError):
        result["apps"] = parse_app_source(source, file=file)
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


def _cmd_init(args: argparse.Namespace) -> int:
    target_dir = Path(args.dir).resolve()
    project_name = args.name or target_dir.name

    print()
    print("\033[38;5;208m◆\033[0m \033[1mAxint\033[0m · init")
    print()

    if target_dir.exists():
        try:
            entries = [e.name for e in target_dir.iterdir() if not e.name.startswith(".")]
            if entries:
                print("  \033[31merror:\033[0m Directory is not empty", file=sys.stderr)
                return 1
        except OSError:
            pass
    else:
        target_dir.mkdir(parents=True, exist_ok=True)

    files_written = 0

    (target_dir / "axint.config.yaml").write_text(
        f"""name: {project_name}
description: An Axint project
version: 0.0.1
entry: intents/example.py
""",
        encoding="utf-8",
    )
    files_written += 1

    intents_dir = target_dir / "intents"
    intents_dir.mkdir(exist_ok=True)

    (intents_dir / "example.py").write_text(
        '''from axint import define_intent, IntentParameter

example = define_intent(
    name="Example",
    title="An example intent",
    description="This is a starter intent",
    parameters=[
        IntentParameter(name="message", type="str", description="A message to process"),
    ],
)
''',
        encoding="utf-8",
    )
    files_written += 1

    (target_dir / ".gitignore").write_text(
        """*.swiftmodule
*.o
.build/
""",
        encoding="utf-8",
    )
    files_written += 1

    (target_dir / "README.md").write_text(
        f"""# {project_name}

An Axint project for iOS Shortcuts.

## Getting started

1. Install axint:
   \\`\\`\\`bash
   pip install axint
   \\`\\`\\`

2. Compile:
   \\`\\`\\`bash
   axint compile intents/example.py --out ./
   \\`\\`\\`

3. View the generated Swift in your current directory.

## Learn more

- [Axint docs](https://github.com/agenticempire/axint)
- [API reference](https://github.com/agenticempire/axint/tree/main/python)
""",
        encoding="utf-8",
    )
    files_written += 1

    print(f"  \033[32m✓\033[0m Project ready — {files_written} files written")
    print()
    print("  \033[1mNext:\033[0m")
    if args.dir != ".":
        print(f"    cd {args.dir}")
    print("    axint compile intents/example.py --out ./")
    print()
    print("  \033[2mDocs: https://github.com/agenticempire/axint#readme\033[0m")
    print()
    return 0


def _cmd_eject(args: argparse.Namespace) -> int:
    path = Path(args.file).resolve()
    source = _read_source(path)
    if source is None:
        return 1

    parsed = _parse_all(source, str(path))
    total = sum(len(v) for v in parsed.values())

    if total == 0:
        print("error: no definitions found in this file.", file=sys.stderr)
        return 1

    out_dir = Path(args.out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    for ir in parsed["intents"]:
        diags = validate_intent(ir)
        if any(d.severity == "error" for d in diags):
            _print_validator_diagnostics(diags)
            return 1

        swift_code = generate_swift(ir)
        swift_path = out_dir / f"{ir.name}.swift"
        swift_path.write_text(swift_code, encoding="utf-8")

        print(f"\033[32m✓\033[0m Ejected {ir.name} → {swift_path}")

    print()
    print("  These files are standalone and have no Axint dependency.")
    print()
    return 0


def _cmd_watch(args: argparse.Namespace) -> int:
    target = Path(args.file).resolve()
    files_to_watch: list[Path] = []

    if target.is_dir():
        for entry in target.glob("*.py"):
            if not entry.name.startswith("test_"):
                files_to_watch.append(entry)
    else:
        if not target.exists():
            print(f"\033[31merror:\033[0m File not found: {target}", file=sys.stderr)
            return 1
        files_to_watch.append(target)

    if not files_to_watch:
        print("\033[31merror:\033[0m No .py files found", file=sys.stderr)
        return 1

    out_dir = Path(args.out).resolve()

    print(f"\033[1maxint watch\033[0m — {len(files_to_watch)} file(s)\n")

    def compile_one(fpath: Path) -> bool:
        source = _read_source(fpath)
        if source is None:
            return False

        parsed = _parse_all(source, str(fpath))
        total = sum(len(v) for v in parsed.values())
        if total == 0:
            return False

        has_errors = False
        for ir in parsed["intents"]:
            diags = validate_intent(ir)
            if any(d.severity == "error" for d in diags):
                _print_validator_diagnostics(diags)
                has_errors = True
                continue
            swift = generate_swift(ir)
            swift_path = out_dir / f"{ir.name}.swift"
            swift_path.parent.mkdir(parents=True, exist_ok=True)
            swift_path.write_text(swift, encoding="utf-8")
            print(f"\033[32m✓\033[0m {ir.name} → {swift_path}")

        return not has_errors

    ok = 0
    fail = 0
    for f in files_to_watch:
        if compile_one(f):
            ok += 1
        else:
            fail += 1

    print()
    if fail > 0:
        print(f"\033[33m⚠\033[0m {ok} compiled, {fail} failed — watching for changes…\n")
    else:
        print(f"\033[32m✓\033[0m {ok} compiled — watching for changes…\n")

    try:
        import time
        last_mtime = {f: f.stat().st_mtime for f in files_to_watch}

        while True:
            time.sleep(0.5)
            for fpath in files_to_watch:
                try:
                    current_mtime = fpath.stat().st_mtime
                    if current_mtime != last_mtime.get(fpath):
                        last_mtime[fpath] = current_mtime
                        ts = time.strftime("%H:%M:%S")
                        print(f"\033[90m[{ts}]\033[0m {fpath.name} changed")
                        compile_one(fpath)
                        print()
                except OSError:
                    pass
    except KeyboardInterrupt:
        print("\n\033[90mStopped watching.\033[0m")
        return 0


def _cmd_mcp(args: argparse.Namespace) -> int:
    """Start the MCP server for AI coding assistants."""
    import asyncio

    from .mcp_server import build_server

    server = build_server()
    try:
        asyncio.run(server.main())
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception as e:
        print(f"error: MCP server failed: {e}", file=sys.stderr)
        return 1


def _cmd_registry(args: argparse.Namespace) -> int:
    if args.registry_command == "login":
        return _registry_login()
    if args.registry_command == "publish":
        return _registry_publish()
    if args.registry_command == "add":
        return _registry_add(args.package, args.to)
    if args.registry_command == "search":
        return _registry_search(args.query, args.limit, args.json)
    return 2


def _registry_login() -> int:
    print()
    print("\033[38;5;208m◆\033[0m \033[1mAxint\033[0m · login")
    print()

    registry_url = os.environ.get("AXINT_REGISTRY_URL", "https://registry.axint.ai")
    config_dir = Path.home() / ".axint"
    cred_path = config_dir / "credentials.json"

    try:
        body = json.dumps({"client_id": "axint-cli"}).encode("utf-8")
        req = Request(
            f"{registry_url}/api/v1/auth/device-code",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=10) as resp:
            device_data = json.loads(resp.read().decode("utf-8"))

        device_code = device_data.get("device_code")
        user_code = device_data.get("user_code")
        verification_uri = device_data.get("verification_uri")
        interval = device_data.get("interval", 5)

        print("  Open this URL in your browser:")
        print()
        print(f"    \033[1;4m{verification_uri}\033[0m")
        print()
        print(f"  And enter this code: \033[1;38;5;208m{user_code}\033[0m")
        print()
        print("  \033[2mWaiting for authorization…\033[0m")

        token = None
        poll_interval = interval
        max_polls = 60

        for _ in range(max_polls):
            time.sleep(poll_interval)

            poll_body = json.dumps(
                {"device_code": device_code, "grant_type": "device_code"}
            ).encode("utf-8")
            poll_req = Request(
                f"{registry_url}/api/v1/auth/token",
                data=poll_body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )

            try:
                with urlopen(poll_req, timeout=10) as resp:
                    token_data = json.loads(resp.read().decode("utf-8"))
                    token = token_data.get("access_token")
                    break
            except HTTPError as e:
                if e.code == 400:
                    err_data = json.loads(e.read().decode("utf-8"))
                    err = err_data.get("error")
                    if err == "authorization_pending":
                        continue
                    if err == "slow_down":
                        poll_interval += 5
                        continue
                    if err == "expired_token":
                        print(
                            "\033[31merror:\033[0m Login timed out. Run `axint registry login` again.",
                            file=sys.stderr,
                        )
                        return 1
                    print(f"\033[31merror:\033[0m {err}", file=sys.stderr)
                    return 1
                raise

        if not token:
            print(
                "\033[31merror:\033[0m Login timed out after 5 minutes.",
                file=sys.stderr,
            )
            return 1

        config_dir.mkdir(parents=True, exist_ok=True)
        cred_path.write_text(
            json.dumps({"access_token": token, "registry": registry_url}, indent=2),
            encoding="utf-8",
        )

        print(f"  \033[32m✓\033[0m Logged in! Credentials saved to \033[2m{cred_path}\033[0m")
        print()
        return 0

    except (URLError, HTTPError) as e:
        print(f"\033[31merror:\033[0m {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\033[31merror:\033[0m {e}", file=sys.stderr)
        return 1


def _registry_publish() -> int:
    print()
    print("\033[38;5;208m◆\033[0m \033[1mAxint\033[0m · publish")
    print()

    cwd = Path.cwd()
    config_path = cwd / "axint.config.yaml"

    if not config_path.exists():
        print(
            f"  \033[31merror:\033[0m No axint.config.yaml found in {cwd}",
            file=sys.stderr,
        )
        print("  \033[2mRun `axint init` to create one.\033[0m", file=sys.stderr)
        return 1

    try:
        import yaml
        config = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    except ImportError:
        print(
            "  \033[31merror:\033[0m PyYAML is required. Install with: pip install pyyaml",
            file=sys.stderr,
        )
        return 1
    except Exception as e:
        print(f"  \033[31merror:\033[0m Failed to parse config: {e}", file=sys.stderr)
        return 1

    entry_file = config.get("entry", "intents/example.py")
    entry_path = cwd / entry_file

    if not entry_path.exists():
        print(f"  \033[31merror:\033[0m Entry file not found: {entry_file}", file=sys.stderr)
        return 1

    print(f"  \033[2m⏺\033[0m Compiling {entry_file}…")

    source = entry_path.read_text(encoding="utf-8")
    parsed = _parse_all(source, str(entry_path))

    intents = parsed.get("intents", [])
    if not intents:
        print("  \033[31m✗\033[0m No intents found in entry file", file=sys.stderr)
        return 1

    ir = intents[0]
    diags = validate_intent(ir)
    if any(d.severity == "error" for d in diags):
        _print_validator_diagnostics(diags)
        return 1

    swift_code = generate_swift(ir)
    print(f"  \033[32m✓\033[0m Compiled → {len(swift_code.splitlines())} lines of Swift")

    registry_url = os.environ.get("AXINT_REGISTRY_URL", "https://registry.axint.ai")
    cred_path = Path.home() / ".axint" / "credentials.json"

    if not cred_path.exists():
        print(
            "  \033[31merror:\033[0m Not logged in. Run `axint registry login` first.",
            file=sys.stderr,
        )
        return 1

    try:
        creds = json.loads(cred_path.read_text(encoding="utf-8"))
        token = creds.get("access_token")
    except Exception:
        print(
            "  \033[31merror:\033[0m Corrupt credentials file. Run `axint registry login` again.",
            file=sys.stderr,
        )
        return 1

    # README is optional — ship it if the author has one.
    readme: str | None = None
    readme_path = cwd / config.get("readme", "README.md")
    if readme_path.exists():
        readme = readme_path.read_text(encoding="utf-8")

    # Matches the TS CLI: @ prefix is the registry convention.
    namespace = config.get("namespace", "user")
    if not namespace.startswith("@"):
        namespace = f"@{namespace}"

    plist_fragment = generate_info_plist_fragment(ir) or None

    # Same contract as axint/src/core/bundle-hash.ts. Server recomputes
    # this on receipt and rejects the publish if the bytes disagree.
    from .bundle_hash import hash_bundle

    bundle_hash = hash_bundle(
        {
            "ts_source": None,
            "py_source": source,
            "swift_output": swift_code,
            "plist_fragment": plist_fragment,
        }
    )

    payload: dict[str, Any] = {
        "namespace": namespace,
        "slug": config.get("slug", ir.name.lower()),
        "name": config.get("name", ir.name),
        "version": config.get("version", "0.0.1"),
        "description": config.get("description", ""),
        "readme": readme,
        "primary_language": config.get("primary_language", "python"),
        "surface_areas": config.get("surface_areas", []),
        "tags": config.get("tags", []),
        "license": config.get("license", "Apache-2.0"),
        "homepage": config.get("homepage"),
        "repository": config.get("repository"),
        "py_source": source,
        "swift_output": swift_code,
        "plist_fragment": plist_fragment,
        "ir": _ir_to_dict(ir),
        "compiler_version": __version__,
        "bundle_hash": bundle_hash,
    }

    print(f"  \033[2m⏺\033[0m Publishing to {registry_url}…")

    try:
        body = json.dumps(payload).encode("utf-8")
        req = Request(
            f"{registry_url}/api/v1/publish",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
                "X-Axint-Version": __version__,
            },
            method="POST",
        )
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        url = result.get("url", registry_url)
        server_hash = result.get("bundle_hash")
        if server_hash and server_hash != bundle_hash:
            print(
                f"  \033[31m✗\033[0m Registry recorded a different bundle hash "
                f"(client {bundle_hash} vs server {server_hash}). Publish rejected for your safety.",
                file=sys.stderr,
            )
            return 1

        print("  \033[32m✓\033[0m Published!")
        print()
        print(f"    {url}")
        print()
        print(f"  \033[2mBundle hash: sha256:{bundle_hash}\033[0m")
        print(f"  \033[2mInstall: axint add {namespace}/{payload['slug']}\033[0m")
        print()
        return 0

    except HTTPError as e:
        # Server returns `{error: string}`. We also fall back to the HTTP
        # reason for the case where the response body isn't JSON at all.
        try:
            err = json.loads(e.read().decode("utf-8"))
            message = err.get("error") or e.reason
        except Exception:
            message = e.reason
        print(f"  \033[31m✗\033[0m Publish failed: {message}", file=sys.stderr)
        return 1
    except URLError as e:
        print(f"  \033[31merror:\033[0m Could not reach {registry_url}: {e.reason}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\033[31merror:\033[0m {e}", file=sys.stderr)
        return 1


def _ir_to_dict(ir: Any) -> dict[str, Any]:
    """Serialize an IR dataclass to the shape the registry stores.

    The registry accepts an opaque `ir` field — we send the same JSON
    the TS SDK does so downstream tooling can diff both sides. Any IR
    type that dataclasses.asdict() can walk is fine; we gracefully
    degrade to an empty dict when the dataclass machinery can't see it.
    """
    import dataclasses

    # is_dataclass returns True for both instances and classes — narrow
    # to an instance before asdict() to keep the types honest.
    if dataclasses.is_dataclass(ir) and not isinstance(ir, type):
        return dataclasses.asdict(ir)
    return {}


def _registry_add(package: str, target_dir: str) -> int:
    print()
    print("\033[38;5;208m◆\033[0m \033[1mAxint\033[0m · add")
    print()

    import re

    match = re.match(r"^(@[a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)(?:@(.+))?$", package)
    if not match:
        print(
            "  \033[31merror:\033[0m Invalid package format. Expected: @namespace/slug or @namespace/slug@version",
            file=sys.stderr,
        )
        return 1

    namespace, slug, pkg_version = match.groups()
    registry_url = os.environ.get("AXINT_REGISTRY_URL", "https://registry.axint.ai")

    print(
        f"  \033[2m⏺\033[0m Fetching {namespace}/{slug}{f'@{pkg_version}' if pkg_version else ''}…"
    )

    try:
        query = f"?namespace={namespace}&slug={slug}"
        if pkg_version:
            query += f"&version={pkg_version}"

        req = Request(
            f"{registry_url}/api/v1/install{query}",
            headers={"X-Axint-Version": __version__},
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        target = Path(target_dir) / slug
        target.mkdir(parents=True, exist_ok=True)

        version_data = data.get("version", {})
        files_written = []

        if version_data.get("ts_source"):
            (target / "intent.ts").write_text(version_data["ts_source"], encoding="utf-8")
            files_written.append("intent.ts")

        if version_data.get("py_source"):
            (target / "intent.py").write_text(version_data["py_source"], encoding="utf-8")
            files_written.append("intent.py")

        (target / "intent.swift").write_text(version_data.get("swift_output", ""), encoding="utf-8")
        files_written.append("intent.swift")

        template_name = data.get("template", {}).get("full_name", package)
        ver = version_data.get("version", "0.0.1")

        print(f"  \033[32m✓\033[0m Installed {template_name}@{ver}")
        print(f"    → {target}/")
        for f in files_written:
            print(f"      {f}")
        print()
        print("  \033[1mNext:\033[0m")
        print(f"    axint compile {target_dir}/{slug}/intent.py --out ./")
        print()
        return 0

    except HTTPError as e:
        err = json.loads(e.read().decode("utf-8")) if e.code == 400 else {}
        detail = err.get("detail", f"Template not found (HTTP {e.code})")
        print(f"  \033[31m✗\033[0m {detail}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\033[31merror:\033[0m {e}", file=sys.stderr)
        return 1


def _registry_search(query: str | None, limit: str, as_json: bool) -> int:
    registry_url = os.environ.get("AXINT_REGISTRY_URL", "https://registry.axint.ai")
    limit_num = max(1, min(100, int(limit) if limit.isdigit() else 20))

    print()
    if not as_json:
        query_str = f'"{query}"' if query else ""
        print(f"  \033[38;5;208m◆\033[0m \033[1mAxint\033[0m · search {query_str}")
        print()

    try:
        params = f"?limit={limit_num}"
        if query:
            params += f"&q={query}"

        req = Request(
            f"{registry_url}/api/v1/search{params}",
            headers={"X-Axint-Version": __version__},
        )
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if as_json:
            print(json.dumps(data, indent=2))
            return 0

        results = data.get("results", [])
        if not results:
            print("  No packages found")
            print()
            return 0

        for pkg in results:
            pkg_name = pkg.get("package_name", "unknown")
            description = pkg.get("description", "")[:35].ljust(35)
            downloads = pkg.get("downloads", 0)

            dl_str = f"  \033[2m▼ {downloads}\033[0m" if downloads > 0 else ""
            print(f"  \033[38;5;208m◆\033[0m {pkg_name.ljust(30)} {description}{dl_str}")

        print()
        count = len(results)
        print(f"  {count} package{'s' if count != 1 else ''} found")
        print()
        if results:
            first_pkg = results[0].get("package_name", "@namespace/slug")
            print(f"  \033[2mInstall:\033[0m axint registry add {first_pkg}")
        print()
        return 0

    except Exception as e:
        print(f"\033[31merror:\033[0m {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
