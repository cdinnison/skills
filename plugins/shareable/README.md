# shareable

Shareable HTML drafts with inline comments. Generate an HTML plan, run
`shareable file.html`, paste the link in Slack. Reviewers highlight text to
comment, threads anchor to the selection and survive revisions.

Self-hosted on your own Cloudflare account. ~50 lines of skill script,
~300 lines of overlay JS, one Worker.

```
  /shareable pricing-plan.html
  ↓
  https://shareable.<your-acct>.workers.dev/k7m3px9q2nf4b8
```

## How it works

```
Claude Code ──/shareable──▶ scripts/shareable.py ──POST──▶ Cloudflare Worker
                                                              │
                            ┌─────────────────────────────────┼──────────────┐
                            ▼                                 ▼              ▼
                       R2 (HTML)                          KV (meta)   HTMLRewriter
                                                                            │
Reviewer browser ◀── GET /<slug> + overlay injected at serve time ──────────┘
                          │
                          └──▶ /api/comments/<slug>  (polled, 10s)
```

- **Unguessable URLs** — 14-char alphanumeric slugs (~72 bits entropy).
- **`X-Robots-Tag: noindex`** on every response.
- **Text-selection anchored comments** — three-tier fallback (xpath → context
  match → fuzzy text) survives most edits; lost anchors marked "orphaned".
- **Same URL across revisions** — sidecar `.shareable.json` tracks the slug, each
  upload becomes a new version.
- **No auth** — first comment prompts for a name, stored in `localStorage`.
  Honor-system identity.

## Install

```bash
git clone <this repo> ~/.claude/skills/shareable
cd ~/.claude/skills/shareable
python scripts/setup.py
```

Setup prereqs:
- Cloudflare account with R2 enabled
- `wrangler login` already run
- `npm` available

Setup creates the R2 bucket, KV namespace, deploys the Worker, generates an
upload token, and writes config to `~/.config/shareable/config.json`.

## Use

```bash
python scripts/shareable.py my-plan.html
# → https://shareable.<acct>.workers.dev/<slug>
```

Re-uploading the same file (sidecar present) bumps the version. Use `--new`
to fork a new slug.

## Development

Edit Worker code in `worker/src/`, redeploy with `cd worker && wrangler deploy`.

Edit overlay UI in `worker/public/_/overlay.{js,css}` — also picked up by
`wrangler deploy` (assets uploaded with the Worker).

Local dev: `cd worker && wrangler dev` runs the Worker locally with a tunnel.

## Layout

```
shareable/
  SKILL.md                 # Claude Code skill manifest
  README.md
  scripts/
    shareable.py           # /shareable <file>
    setup.py               # one-time bootstrap
  worker/
    wrangler.toml          # cloudflare config (KV id patched by setup)
    package.json
    tsconfig.json
    src/
      index.ts             # router + handlers
      inject.ts            # HTMLRewriter overlay injection
      slug.ts              # slug mint + validate
      types.ts             # Comment, Version
    public/
      _/overlay.js         # comment overlay UI
      _/overlay.css
      index.html           # landing at /
```

## Tradeoffs

- **No auth.** If the link leaks, anyone can read + comment. The link itself
  is the secret. Fine for team feedback; not fine if compliance cares.
- **Single-writer KV.** Comments stored as one JSON blob per slug. Concurrent
  commenters on the same slug can race. Real-world use (review documents
  with a small group) won't hit it.
- **Latest version only.** Older versions stay in R2 but aren't reachable
  via the URL. Comments tag their original version so you know if an anchor
  is stale.
