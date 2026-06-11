"""
Thin wrapper around scripts/sheet_read.py.
All actual sheet logic lives in the existing Python script — this module just
calls it as a subprocess and parses the JSON output.
"""
import json
import subprocess
import os
from django.conf import settings

REPO_ROOT = getattr(settings, 'REPO_ROOT', str(
    os.path.join(os.path.dirname(__file__), '..', '..')
))
SHEET_SCRIPT = os.path.join(REPO_ROOT, 'scripts', 'sheet_read.py')


def _run_script(args: list[str]) -> list[dict]:
    result = subprocess.run(
        ['python', SHEET_SCRIPT] + args,
        capture_output=True, text=True, cwd=REPO_ROOT, timeout=60
    )
    if result.returncode != 0:
        raise RuntimeError(f"sheet_read.py failed: {result.stderr.strip()}")
    return json.loads(result.stdout)


def read_unposted_social(name: str) -> list[dict]:
    return _run_script(['--sheet', 'social', '--name', name, '--action', 'unposted'])


def read_all_social(name: str) -> list[dict]:
    return _run_script(['--sheet', 'social', '--name', name, '--action', 'all'])


def read_unposted_blog(name: str) -> list[dict]:
    return _run_script(['--sheet', 'blog', '--name', name, '--action', 'unposted'])


def read_all_blog(name: str) -> list[dict]:
    return _run_script(['--sheet', 'blog', '--name', name, '--action', 'all'])
