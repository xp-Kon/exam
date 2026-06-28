#!/usr/bin/env python3
"""
Tailwind CSS Configuration Generator - ponytail: simplified from class to functions

Generate tailwind.config.js/ts with custom theme configuration.
Supports colors, fonts, spacing, breakpoints, and plugin recommendations.
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

_VALID_PLUGIN_NAME = re.compile(r'^(@[a-zA-Z0-9_-]+/)?[a-zA-Z0-9_-]+(/[a-zA-Z0-9_.-]+)*$')


def _default_content_paths(framework: str) -> List[str]:
    """Get default content paths for framework."""
    paths = {
        "react": ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
        "vue": ["./src/**/*.{vue,js,ts,jsx,tsx}", "./index.html"],
        "svelte": ["./src/**/*.{svelte,js,ts}", "./src/app.html"],
        "nextjs": ["./app/**/*.{js,ts,jsx,tsx}", "./pages/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
    }
    return paths.get(framework, paths["react"])


def _format_plugins(plugins: List[str]) -> str:
    """Format plugins array for config with validation."""
    if not plugins:
        return ""
    plugin_requires = []
    for plugin in plugins:
        if not _VALID_PLUGIN_NAME.match(plugin):
            raise ValueError(f"Invalid plugin name: {plugin!r}. Plugin names must be valid npm package names.")
        plugin_requires.append(f"require('{plugin}')")
    return ", ".join(plugin_requires)


def generate_config(
    typescript: bool = True,
    framework: str = "react",
    colors: Optional[Dict[str, str]] = None,
    fonts: Optional[Dict[str, List[str]]] = None,
    spacing: Optional[Dict[str, str]] = None,
    breakpoints: Optional[Dict[str, str]] = None,
    plugins: Optional[List[str]] = None,
) -> str:
    """Generate Tailwind config as string."""
    config: Dict[str, Any] = {
        "darkMode": ["class"],
        "content": _default_content_paths(framework),
        "theme": {"extend": {}},
        "plugins": [],
    }

    if colors:
        config["theme"]["extend"].setdefault("colors", {}).update(colors)
    if fonts:
        config["theme"]["extend"].setdefault("fontFamily", {}).update(fonts)
    if spacing:
        config["theme"]["extend"].setdefault("spacing", {}).update(spacing)
    if breakpoints:
        config["theme"]["extend"].setdefault("screens", {}).update(breakpoints)
    if plugins:
        config["plugins"].extend(plugins)

    ext = "ts" if typescript else "js"
    config_obj = {k: v for k, v in config.items() if k != "plugins"}
    config_json = json.dumps(config_obj, indent=2)
    plugins_str = _format_plugins(config["plugins"])

    if typescript:
        return f"""import type {{ Config }} from 'tailwindcss'

const config: Config = {{
  {chr(10).join('  ' + line if i > 0 else line.strip()) for i, line in enumerate(config_json.split(chr(10)))},
  plugins: [{plugins_str}],
}}

export default config
""".replace("  \n", "\n").rstrip()
    else:
        return f"""/** @type {{import('tailwindcss').Config}} */
module.exports = {{
  {chr(10).join('  ' + line if i > 0 else line.strip()) for i, line in enumerate(config_json.split(chr(10)))},
  plugins: [{plugins_str}],
}}
""".replace("  \n", "\n").rstrip()


def write_config(
    output_path: Path,
    typescript: bool = True,
    framework: str = "react",
    colors: Optional[Dict[str, str]] = None,
    fonts: Optional[Dict[str, List[str]]] = None,
    spacing: Optional[Dict[str, str]] = None,
    breakpoints: Optional[Dict[str, str]] = None,
    plugins: Optional[List[str]] = None,
) -> tuple:
    """Write config to file. Returns (success, message)."""
    try:
        config_content = generate_config(typescript, framework, colors, fonts, spacing, breakpoints, plugins)
        output_path.write_text(config_content)
        return True, f"Configuration written to {output_path}"
    except OSError as e:
        return False, f"Failed to write config: {e}"


def recommend_plugins(framework: str) -> List[str]:
    """Get plugin recommendations based on framework."""
    recommendations = ["tailwindcss-animate"]
    if framework == "nextjs":
        recommendations.append("@tailwindcss/typography")
    return recommendations


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Tailwind CSS configuration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate TypeScript config for Next.js
  python tailwind_config_gen.py --framework nextjs

  # Generate JavaScript config with custom colors
  python tailwind_config_gen.py --js --colors brand:#3b82f6 accent:#8b5cf6

  # Add custom fonts
  python tailwind_config_gen.py --fonts display:"Playfair Display,serif"

  # Add custom spacing and breakpoints
  python tailwind_config_gen.py --spacing navbar:4rem --breakpoints 3xl:1920px

  # Add recommended plugins
  python tailwind_config_gen.py --plugins
        """,
    )

    parser.add_argument("--framework", choices=["react", "vue", "svelte", "nextjs"], default="react")
    parser.add_argument("--js", action="store_true", help="Generate JavaScript config instead of TypeScript")
    parser.add_argument("--output", type=Path, help="Output file path")
    parser.add_argument("--colors", nargs="*", metavar="NAME:VALUE", help="Custom colors (e.g., brand:#3b82f6)")
    parser.add_argument("--fonts", nargs="*", metavar="TYPE:FAMILY", help="Custom fonts")
    parser.add_argument("--spacing", nargs="*", metavar="NAME:VALUE", help="Custom spacing")
    parser.add_argument("--breakpoints", nargs="*", metavar="NAME:WIDTH", help="Custom breakpoints")
    parser.add_argument("--plugins", action="store_true", help="Add recommended plugins")
    parser.add_argument("--validate-only", action="store_true", help="Validate config without writing file")

    args = parser.parse_args()

    # Parse key-value arguments
    def parse_kv(items: Optional[List[str]], split_fn=str.split) -> Dict:
        result = {}
        if not items:
            return result
        for item in items:
            try:
                key, value = item.split(":", 1)
                result[key] = value
            except ValueError:
                print(f"Invalid spec: {item}", file=sys.stderr)
                sys.exit(1)
        return result

    colors = parse_kv(args.colors) if args.colors else None
    fonts_raw = parse_kv(args.fonts, lambda x: [f.strip().strip("'\"") for f in x.split(",")]) if args.fonts else None
    spacing = parse_kv(args.spacing) if args.spacing else None
    breakpoints = parse_kv(args.breakpoints) if args.breakpoints else None

    plugins = recommend_plugins(args.framework) if args.plugins else None

    output_path = args.output or (Path.cwd() / f"tailwind.config.{'js' if args.js else 'ts'}")

    success, message = write_config(
        output_path=output_path,
        typescript=not args.js,
        framework=args.framework,
        colors=colors,
        fonts=fonts_raw,
        spacing=spacing,
        breakpoints=breakpoints,
        plugins=plugins,
    )

    print(message)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
