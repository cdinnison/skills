#!/usr/bin/env python3
"""shareable — one-time setup wizard.

Bootstraps the Cloudflare Worker, R2 bucket, KV namespace, and local config.
Idempotent: safe to re-run.

Requires: wrangler CLI logged in (`wrangler login`), npm.
"""

from __future__ import annotations

import json
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
WORKER_DIR = REPO_ROOT / "worker"
WRANGLER_TOML = WORKER_DIR / "wrangler.toml"
CONFIG_DIR = Path.home() / ".config" / "shareable"
CONFIG_PATH = CONFIG_DIR / "config.json"

R2_BUCKET = "shareable-html"
KV_TITLE = "shareable"     # namespace title passed to `wrangler kv namespace create`
KV_BINDING = "KV"          # binding name in worker code / wrangler.toml


def die(msg: str, code: int = 1) -> None:
    print(f"\n✗ {msg}", file=sys.stderr)
    sys.exit(code)


def step(msg: str) -> None:
    print(f"\n→ {msg}")


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def run(
    cmd: list[str],
    cwd: Path | None = None,
    check: bool = True,
    input_text: str | None = None,
) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        check=check,
        capture_output=True,
        text=True,
        input=input_text,
    )


def require(binary: str) -> None:
    if not shutil.which(binary):
        die(f"`{binary}` not found in PATH. Install it first.")


def check_wrangler_auth() -> None:
    step("Checking wrangler auth…")
    res = run(["npx", "wrangler", "whoami"], cwd=WORKER_DIR, check=False)
    out = res.stdout + res.stderr
    if res.returncode != 0 or "You are not authenticated" in out or "not authenticated" in out.lower():
        die("not logged in. Run:  cd worker && npx wrangler login")
    ok("authenticated")


def npm_install() -> None:
    step("Installing worker dependencies…")
    run(["npm", "install"], cwd=WORKER_DIR)
    ok("dependencies installed")


def create_r2_bucket() -> None:
    step(f"Creating R2 bucket `{R2_BUCKET}` (idempotent)…")
    res = run(
        ["npx", "wrangler", "r2", "bucket", "create", R2_BUCKET],
        cwd=WORKER_DIR,
        check=False,
    )
    out = res.stdout + res.stderr
    if res.returncode == 0:
        ok(f"created `{R2_BUCKET}`")
    elif "already exists" in out.lower():
        ok(f"`{R2_BUCKET}` already exists")
    else:
        die(f"failed to create R2 bucket:\n{out}")


def find_or_create_kv() -> str:
    step(f"Setting up KV namespace `{KV_TITLE}`…")
    listed = run(
        ["npx", "wrangler", "kv", "namespace", "list"],
        cwd=WORKER_DIR,
        check=False,
    )
    if listed.returncode == 0:
        try:
            data = json.loads(listed.stdout)
            for ns in data:
                title = ns.get("title", "")
                if title == KV_TITLE or title.endswith(f"-{KV_TITLE}"):
                    ok(f"existing namespace `{title}` ({ns['id']})")
                    return ns["id"]
        except json.JSONDecodeError:
            pass

    res = run(
        ["npx", "wrangler", "kv", "namespace", "create", KV_TITLE],
        cwd=WORKER_DIR,
        check=False,
    )
    out = res.stdout + res.stderr
    m = re.search(r'id\s*=\s*"([0-9a-f]+)"', out)
    if not m:
        m = re.search(r'"id":\s*"([0-9a-f]+)"', out)
    if not m:
        die(f"could not parse KV namespace id from output:\n{out}")
    ok(f"created KV namespace ({m.group(1)})")
    return m.group(1)


def patch_wrangler_toml(kv_id: str) -> None:
    step("Patching wrangler.toml…")
    text = WRANGLER_TOML.read_text()
    if f'id = "{kv_id}"' in text:
        ok("wrangler.toml already up to date")
        return
    new = re.sub(
        r'(\[\[kv_namespaces\]\][^\[]*?id\s*=\s*)"[^"]*"',
        rf'\1"{kv_id}"',
        text,
        count=1,
        flags=re.DOTALL,
    )
    if new == text:
        die("couldn't patch wrangler.toml — please edit manually")
    WRANGLER_TOML.write_text(new)
    ok(f"wrangler.toml updated with KV id")


def upload_token() -> str:
    step("Setting upload token secret…")
    token = secrets.token_hex(24)
    res = run(
        ["npx", "wrangler", "secret", "put", "UPLOAD_TOKEN"],
        cwd=WORKER_DIR,
        check=False,
        input_text=token + "\n",
    )
    out = res.stdout + res.stderr
    if res.returncode != 0:
        die(f"failed to set UPLOAD_TOKEN:\n{out}")
    ok("UPLOAD_TOKEN set")
    return token


def deploy_worker() -> str:
    step("Deploying worker…")
    res = run(["npx", "wrangler", "deploy"], cwd=WORKER_DIR, check=False)
    out = res.stdout + res.stderr
    if res.returncode != 0:
        die(f"deploy failed:\n{out}")
    m = re.search(r"https://[a-z0-9.-]+\.workers\.dev", out)
    if not m:
        print(out)
        url = input("\n  Paste the worker URL from above: ").strip()
        if not url.startswith("http"):
            die("invalid worker URL")
        return url.rstrip("/")
    ok(f"deployed to {m.group(0)}")
    return m.group(0)


def write_config(worker_url: str, token: str) -> None:
    step(f"Writing config to {CONFIG_PATH}…")
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(
            {"workerUrl": worker_url, "uploadToken": token},
            indent=2,
        )
        + "\n"
    )
    CONFIG_PATH.chmod(0o600)
    ok("config saved")


def main() -> None:
    print("shareable setup\n" + "=" * 40)

    require("npm")
    npm_install()
    check_wrangler_auth()
    create_r2_bucket()
    kv_id = find_or_create_kv()
    patch_wrangler_toml(kv_id)
    token = upload_token()
    worker_url = deploy_worker()
    write_config(worker_url, token)

    print("\n" + "=" * 40)
    print("done. try it:")
    print(f"  python {REPO_ROOT}/scripts/shareable.py path/to/file.html")


if __name__ == "__main__":
    main()
