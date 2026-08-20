from __future__ import annotations

import argparse
import os
import plistlib
import subprocess
import sys
from pathlib import Path

from sync.config import BackupConfig, atomic_write_text, save_config

LABEL = "com.nhihad.concert-tracker-backup"
OWNER_EMAIL = "owner@example.com"


def launch_agents_dir() -> Path:
    return Path.home() / "Library" / "LaunchAgents"


def plist_path() -> Path:
    return launch_agents_dir() / f"{LABEL}.plist"


def default_artifact_runtime() -> Path:
    return Path.home() / ".cache" / "codex-runtimes" / "codex-primary-runtime" / "dependencies"


def configured_executable(path: Path) -> str:
    return str(path.expanduser().absolute())


def build_plist(config: BackupConfig) -> dict:
    return {
        "Label": LABEL,
        "ProgramArguments": [config.python_path, "-m", "sync.backup", "--scheduled"],
        "WorkingDirectory": config.project_root,
        "RunAtLoad": True,
        "StartCalendarInterval": {"Hour": 2, "Minute": 0},
        "ProcessType": "Background",
        "LowPriorityIO": True,
        "ThrottleInterval": 60,
        "StandardOutPath": str(config.log_dir / "launchd.out.log"),
        "StandardErrorPath": str(config.log_dir / "launchd.err.log"),
    }


def _launchctl(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["launchctl", *arguments],
        check=check,
        capture_output=True,
        text=True,
    )


def install(config: BackupConfig) -> Path:
    save_config(config)
    config.exports_dir.mkdir(parents=True, exist_ok=True)
    config.archive_dir.mkdir(parents=True, exist_ok=True)
    config.log_dir.mkdir(parents=True, exist_ok=True)
    target = plist_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = plistlib.dumps(build_plist(config), sort_keys=True).decode("utf-8")
    atomic_write_text(target, payload, mode=0o644)
    domain = f"gui/{os.getuid()}"
    _launchctl("bootout", f"{domain}/{LABEL}", check=False)
    _launchctl("bootstrap", domain, str(target))
    _launchctl("enable", f"{domain}/{LABEL}")
    return target


def uninstall() -> None:
    domain = f"gui/{os.getuid()}"
    _launchctl("bootout", f"{domain}/{LABEL}", check=False)
    plist_path().unlink(missing_ok=True)


def status() -> int:
    result = _launchctl("print", f"gui/{os.getuid()}/{LABEL}", check=False)
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip(), file=sys.stderr)
    return result.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Install the Concert Tracker backup LaunchAgent.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    install_parser = subparsers.add_parser("install")
    install_parser.add_argument("--project-root", type=Path, default=Path.cwd())
    install_parser.add_argument("--supabase-url", required=True)
    install_parser.add_argument("--publishable-key", required=True)
    install_parser.add_argument(
        "--secret-key",
        default="",
        help="Supabase secret key. Used instead of the publishable key when set, "
        "matching how the deployed backend reads (RLS-bypassing).",
    )
    install_parser.add_argument(
        "--data-provider",
        choices=["supabase", "neon"],
        default="supabase",
        help="Which backend to read from. See docs/DATA_PROVIDERS.md.",
    )
    install_parser.add_argument(
        "--database-url",
        default="",
        help="Neon connection string. Required when --data-provider=neon.",
    )
    install_parser.add_argument(
        "--public-user-id",
        default="11111111-1111-4111-8111-111111111111",
        help="The single configured app user; must match PUBLIC_USER_ID in the "
        "deployed backend's environment.",
    )
    install_parser.add_argument("--python-path", type=Path, default=Path(sys.executable))
    runtime = default_artifact_runtime()
    install_parser.add_argument("--node-path", type=Path, default=runtime / "node" / "bin" / "node")
    install_parser.add_argument(
        "--artifact-node-modules",
        type=Path,
        default=runtime / "node" / "node_modules",
    )
    subparsers.add_parser("status")
    subparsers.add_parser("uninstall")
    args = parser.parse_args()

    if args.command == "install":
        config = BackupConfig(
            project_root=str(args.project_root.expanduser().resolve()),
            supabase_url=args.supabase_url.rstrip("/"),
            publishable_key=args.publishable_key,
            supabase_secret_key=args.secret_key,
            data_provider=args.data_provider,
            database_url=args.database_url,
            public_user_id=args.public_user_id,
            owner_email=OWNER_EMAIL,
            # Keep the virtual-environment entry path. Resolving its symlink would
            # bypass the venv and launch Apple's base Python without dependencies.
            python_path=configured_executable(args.python_path),
            node_path=str(args.node_path.expanduser().resolve()),
            artifact_node_modules=str(args.artifact_node_modules.expanduser().resolve()),
        )
        target = install(config)
        print(f"Installed {LABEL}: {target}")
    elif args.command == "uninstall":
        uninstall()
        print(f"Uninstalled {LABEL}")
    else:
        raise SystemExit(status())


if __name__ == "__main__":
    main()
