"""
Thin wrapper around scripts/sheet_write.py.
"""
import json
import os
import subprocess
import tempfile
from django.conf import settings

REPO_ROOT = getattr(settings, 'REPO_ROOT', str(
    os.path.join(os.path.dirname(__file__), '..', '..')
))
SHEET_SCRIPT = os.path.join(REPO_ROOT, 'scripts', 'sheet_write.py')


def _run_script(args: list[str]) -> None:
    result = subprocess.run(
        ['python', SHEET_SCRIPT] + args,
        capture_output=True, text=True, cwd=REPO_ROOT, timeout=60
    )
    if result.returncode != 0:
        raise RuntimeError(f"sheet_write.py failed: {result.stderr.strip()}")


def write_social_result(name: str, row: int, updates: dict) -> None:
    # Use a temp file for large payloads to avoid command-line length limits
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.json', delete=False, encoding='utf-8'
    ) as f:
        json.dump(updates, f, ensure_ascii=False)
        tmp_path = f.name
    try:
        _run_script([
            '--sheet', 'social', '--name', name,
            '--row', str(row), '--updates-file', tmp_path,
        ])
    finally:
        os.unlink(tmp_path)


def write_blog_result(name: str, row: int, updates: dict) -> None:
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.json', delete=False, encoding='utf-8'
    ) as f:
        json.dump(updates, f, ensure_ascii=False)
        tmp_path = f.name
    try:
        _run_script([
            '--sheet', 'blog', '--name', name,
            '--row', str(row), '--updates-file', tmp_path,
        ])
    finally:
        os.unlink(tmp_path)


def flag_blog_red(name: str, row: int) -> None:
    _run_script(['--sheet', 'blog', '--name', name, '--row', str(row), '--flag-red'])
