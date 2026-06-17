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
    env = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1'}
    result = subprocess.run(
        ['python', SHEET_SCRIPT] + args,
        capture_output=True, text=True, encoding='utf-8', cwd=REPO_ROOT, timeout=60, env=env
    )
    if result.returncode != 0:
        err = result.stderr.strip()
        # Tab doesn't exist yet — treat as empty, not an error
        if 'Unable to parse range' in err or 'not found' in err.lower() or 'Worksheet' in err:
            return []
        raise RuntimeError(f"sheet_read.py failed: {err}")
    data = json.loads(result.stdout)
    # sheet_read.py returns {"ok": true, "rows": [...]} — extract the rows list
    if isinstance(data, dict):
        if not data.get('ok'):
            raise RuntimeError(data.get('error', 'sheet_read.py returned ok=false'))
        return data.get('rows', [])
    return data  # already a list


def read_unposted_social(name: str) -> list[dict]:
    return _run_script(['--sheet', 'social', '--name', name, '--action', 'unposted'])


def read_all_social(name: str) -> list[dict]:
    return _run_script(['--sheet', 'social', '--name', name, '--action', 'all'])


def read_unposted_blog(name: str) -> list[dict]:
    return _run_script(['--sheet', 'blog', '--name', name, '--action', 'unposted'])


def read_all_blog(name: str) -> list[dict]:
    return _run_script(['--sheet', 'blog', '--name', name, '--action', 'all'])
