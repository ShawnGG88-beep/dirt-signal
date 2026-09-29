#!/usr/bin/env python3
"""
Load the Dirt Signal desktop web build in WebKitGTK under Xvfb and collect
frame-time / sync-paint probe results from ?autoperf=1#/design.

Requires: python3-gi, gir1.2-webkit2-4.1 (or 4.0), gir1.2-gtk-3.0, xvfb.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import gi

gi.require_version("Gtk", "3.0")

# Prefer 4.1 (Ubuntu 22.04+/Tauri), fall back to 4.0.
_WEBKIT = None
for _ver in ("4.1", "4.0"):
    try:
        gi.require_version("WebKit2", _ver)
        _WEBKIT = _ver
        break
    except ValueError:
        continue
if _WEBKIT is None:
    raise SystemExit("WebKit2 GIR not found (tried 4.1 and 4.0)")

from gi.repository import GLib, Gtk, WebKit2  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        required=True,
        help="URL to load (include ?autoperf=1#/design)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Path to write JSON results",
    )
    parser.add_argument(
        "--timeout-sec",
        type=float,
        default=90.0,
        help="Max seconds to wait for probe completion",
    )
    args = parser.parse_args()

    result_holder: dict = {"done": False, "payload": None, "error": None}

    win = Gtk.Window(title="Dirt Signal WebKitGTK perf")
    win.set_default_size(1280, 800)
    win.connect("destroy", Gtk.main_quit)

    webview = WebKit2.WebView()
    settings = webview.get_settings()
    settings.set_enable_developer_extras(True)
    settings.set_hardware_acceleration_policy(
        WebKit2.HardwareAccelerationPolicy.ALWAYS
    )

    def on_load_changed(_view, event):
        if event != WebKit2.LoadEvent.FINISHED:
            return
        print(f"[webkitgtk-perf] loaded {_WEBKIT}: {args.url}", flush=True)

    def poll_result():
        def on_js(webview, result, _user_data=None):
            try:
                js_result = webview.run_javascript_finish(result)
                value = js_result.get_js_value()
                raw = value.to_string() if value is not None else ""
            except Exception as exc:  # noqa: BLE001
                print(f"[webkitgtk-perf] js error: {exc}", flush=True)
                return

            if not raw or raw == "null" or raw == "undefined":
                return
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                print(f"[webkitgtk-perf] non-json: {raw[:200]}", flush=True)
                return
            result_holder["done"] = True
            result_holder["payload"] = payload
            print("[webkitgtk-perf] probe complete", flush=True)
            Gtk.main_quit()

        webview.run_javascript(
            "document.documentElement.getAttribute('data-perf-result')",
            None,
            on_js,
            None,
        )
        return True  # keep timeout source alive until done

    def on_timeout():
        if not result_holder["done"]:
            result_holder["error"] = f"timeout after {args.timeout_sec}s"
            print(f"[webkitgtk-perf] {result_holder['error']}", flush=True)
            Gtk.main_quit()
        return False

    webview.connect("load-changed", on_load_changed)
    win.add(webview)
    win.show_all()
    webview.load_uri(args.url)

    GLib.timeout_add(500, poll_result)
    GLib.timeout_add(int(args.timeout_sec * 1000), on_timeout)

    started = time.time()
    Gtk.main()
    elapsed = time.time() - started

    if result_holder["error"] and not result_holder["payload"]:
        args.out.write_text(
            json.dumps(
                {
                    "error": result_holder["error"],
                    "webkit": _WEBKIT,
                    "url": args.url,
                    "elapsedSec": elapsed,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return 1

    payload = result_holder["payload"] or {}
    payload["webkitGtkVersion"] = _WEBKIT
    payload["url"] = args.url
    payload["elapsedSec"] = elapsed
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def row(label: str, sample: dict) -> str:
        sync = sample.get("syncPaintCost") or {}
        return (
            f"| {label} | {sample.get('blurL1', '?')} | "
            f"{sample.get('avgFrameMs', 0):.2f} | {sample.get('p95FrameMs', 0):.2f} | "
            f"{sample.get('maxFrameMs', 0):.2f} | {sample.get('estimatedFps', 0):.1f} | "
            f"{(sample.get('displayRefreshHz') or 0):.1f} | "
            f"{'yes' if sample.get('rafLooksVsyncCapped') else 'no'} | "
            f"{sync.get('avgMs', 0):.2f} | {sync.get('p95Ms', 0):.2f} |"
        )

    print("\n## WebKitGTK probe table\n", flush=True)
    print(
        "| Mode | L1 blur | rAF avg | rAF p95 | rAF max | ~fps | refresh Hz | rAF vsync-capped | sync paint avg | sync paint p95 |",
        flush=True,
    )
    print(
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        flush=True,
    )
    if "default" in payload:
        print(row("Default", payload["default"]), flush=True)
    if "lowL1" in payload:
        print(row("Low L1", payload["lowL1"]), flush=True)
    print(f"\nWrote {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
