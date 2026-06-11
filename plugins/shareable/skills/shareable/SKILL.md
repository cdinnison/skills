---
name: shareable
description: |
  Upload an HTML plan/proposal/brief and get a shareable URL with inline
  comments anchored to text selections. Use when the user wants to share an
  HTML file for review, get a review link, or hand off an AI-generated plan
  to teammates for feedback. Triggers: `/shareable <file.html>`, "share this
  HTML", "make this commentable", "get a review link for…", or right after
  generating a long HTML plan when collaboration is implied.
---

# shareable

Share HTML files via an unguessable URL with inline text-selection comments.
Same URL across revisions (version history kept).

## How to invoke

Run this skill's `scripts/shareable.py` with the absolute path to the HTML file.
The script sits in the `scripts/` directory next to this SKILL.md — resolve it
relative to wherever the skill is installed:

```bash
# Installed as a plugin (the usual case for teammates):
python "${CLAUDE_PLUGIN_ROOT}/skills/shareable/scripts/shareable.py" <file.html>

# Cloned/symlinked manually instead:
python ~/.claude/skills/shareable/scripts/shareable.py <file.html>
```

The script:
1. Reads `~/.config/shareable/config.json` for the worker URL + upload token.
2. Looks for a sidecar `<file>.shareable.json` — if present, re-uploads as a new
   version under the same slug. Otherwise mints a new slug.
3. POSTs the HTML to the worker.
4. Writes the sidecar, prints the URL on stdout, copies it to the clipboard.

## Setup (one-time per machine)

Most teammates do **not** run this — they connect to the shared backend via
`TEAMMATES.md` instead. Only run setup to self-host your own isolated backend:

```bash
python "${CLAUDE_PLUGIN_ROOT}/skills/shareable/scripts/setup.py"   # plugin install
python ~/.claude/skills/shareable/scripts/setup.py                 # manual install
```

Requires:
- Cloudflare account with R2 enabled
- `wrangler` CLI installed and authenticated (`wrangler login`)
- `npm`

The setup script provisions:
- R2 bucket `shareable-html`
- KV namespace `shareable`
- Worker `shareable` deployed to `shareable.<account>.workers.dev`
- A random `UPLOAD_TOKEN` secret (and matches it in local config)

## Flags

- `--new` — force a new slug even if a sidecar exists. Useful for forking a
  draft into a separate review thread.

## Output

stdout: the share URL (one line, clean for capture).
stderr: status + diagnostics.

## When not to use

- Files larger than 5 MB — worker rejects them.
- Markdown files — this is HTML-only; convert first or use a different tool.
- Sensitive content — links are unguessable, not access-controlled. Anyone
  with the URL can read and comment.
