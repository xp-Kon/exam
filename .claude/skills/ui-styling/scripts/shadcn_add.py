#!/usr/bin/env python3
"""
shadcn/ui Component Installer - ponytail: simplified from class to functions

Add shadcn/ui components to project with automatic dependency handling.
Wraps shadcn CLI for programmatic component installation.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import List, Optional


def get_shadcn_version(project_root: Path) -> str:
    """Read shadcn version from package.json; fall back to pinned default."""
    pkg_json = project_root / "package.json"
    if pkg_json.exists():
        try:
            pkg = json.loads(pkg_json.read_text())
            for section in ("dependencies", "devDependencies"):
                version = pkg.get(section, {}).get("shadcn")
                if version:
                    return version.lstrip("^~>=<").split()[0]
        except (json.JSONDecodeError, KeyError):
            pass
    return "2.3.0"


def check_shadcn_config(project_root: Path) -> bool:
    """Check if shadcn is initialized in project."""
    return (project_root / "components.json").exists()


def get_installed_components(project_root: Path) -> List[str]:
    """Get list of already installed components."""
    components_json = project_root / "components.json"
    if not components_json.exists():
        return []

    try:
        with open(components_json) as f:
            config = json.load(f)

        components_dir = project_root / config.get("aliases", {}).get("components", "components").replace("@/", "")
        ui_dir = components_dir / "ui"

        if not ui_dir.exists():
            return []

        return [f.stem for f in ui_dir.glob("*.tsx") if f.is_file()]
    except (json.JSONDecodeError, KeyError, OSError):
        return []


def add_components(
    project_root: Path,
    components: List[str],
    overwrite: bool = False,
    dry_run: bool = False,
) -> tuple:
    """
    Add shadcn/ui components.

    Returns:
        Tuple of (success, message)
    """
    if not components:
        return False, "No components specified"

    if not check_shadcn_config(project_root):
        return False, "shadcn not initialized. Run 'npx shadcn@latest init' first"

    installed = get_installed_components(project_root)
    already_installed = [c for c in components if c in installed]

    if already_installed and not overwrite:
        return False, f"Components already installed: {', '.join(already_installed)}. Use --overwrite to reinstall"

    shadcn_version = get_shadcn_version(project_root)
    cmd = ["npx", f"shadcn@{shadcn_version}", "add"] + components

    if overwrite:
        cmd.append("--overwrite")

    if dry_run:
        return True, f"Would run: {' '.join(cmd)}"

    try:
        result = subprocess.run(cmd, cwd=project_root, capture_output=True, text=True, check=True)
        success_msg = f"Successfully added components: {', '.join(components)}"
        if result.stdout:
            success_msg += f"\n\nOutput:\n{result.stdout}"
        return True, success_msg
    except subprocess.CalledProcessError as e:
        error_msg = f"Failed to add components: {e.stderr or e.stdout or str(e)}"
        return False, error_msg
    except FileNotFoundError:
        return False, "npx not found. Ensure Node.js is installed"


def add_all_components(
    project_root: Path,
    overwrite: bool = False,
    dry_run: bool = False,
) -> tuple:
    """Add all available shadcn/ui components."""
    if not check_shadcn_config(project_root):
        return False, "shadcn not initialized. Run 'npx shadcn@latest init' first"

    shadcn_version = get_shadcn_version(project_root)
    cmd = ["npx", f"shadcn@{shadcn_version}", "add", "--all"]

    if overwrite:
        cmd.append("--overwrite")

    if dry_run:
        return True, f"Would run: {' '.join(cmd)}"

    try:
        result = subprocess.run(cmd, cwd=project_root, capture_output=True, text=True, check=True)
        success_msg = "Successfully added all components"
        if result.stdout:
            success_msg += f"\n\nOutput:\n{result.stdout}"
        return True, success_msg
    except subprocess.CalledProcessError as e:
        error_msg = f"Failed to add all components: {e.stderr or e.stdout or str(e)}"
        return False, error_msg
    except FileNotFoundError:
        return False, "npx not found. Ensure Node.js is installed"


def list_installed(project_root: Path) -> tuple:
    """List installed components."""
    if not check_shadcn_config(project_root):
        return False, "shadcn not initialized"

    installed = get_installed_components(project_root)

    if not installed:
        return True, "No components installed"

    return True, f"Installed components:\n" + "\n".join(f"  - {c}" for c in sorted(installed))


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Add shadcn/ui components to your project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Add single component
  python shadcn_add.py button

  # Add multiple components
  python shadcn_add.py button card dialog

  # Add all components
  python shadcn_add.py --all

  # Overwrite existing components
  python shadcn_add.py button --overwrite

  # Dry run (show what would be done)
  python shadcn_add.py button card --dry-run

  # List installed components
  python shadcn_add.py --list
        """,
    )

    parser.add_argument("components", nargs="*", help="Component names to add")
    parser.add_argument("--all", action="store_true", help="Add all available components")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing components")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without executing")
    parser.add_argument("--list", action="store_true", help="List installed components")
    parser.add_argument("--project-root", type=Path, help="Project root directory (default: current directory)")

    args = parser.parse_args()

    project_root = args.project_root or Path.cwd()

    if args.list:
        success, message = list_installed(project_root)
        print(message)
        sys.exit(0 if success else 1)

    if args.all:
        success, message = add_all_components(project_root, overwrite=args.overwrite, dry_run=args.dry_run)
        print(message)
        sys.exit(0 if success else 1)

    if not args.components:
        parser.print_help()
        sys.exit(1)

    success, message = add_components(project_root, args.components, overwrite=args.overwrite, dry_run=args.dry_run)
    print(message)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
