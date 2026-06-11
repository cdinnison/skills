# Using `/shareable` (teammate setup)

This connects you to the **shared** `shareable` backend (hosted on Replenysh's
Cloudflare account) so your review links and comment threads live alongside
everyone else's. You do **not** deploy anything — no Cloudflare, no `wrangler`,
no `setup.py`.

> Just want to *review* a plan someone sent you? Do nothing. Open the URL,
> highlight text, comment. This guide is only for *generating* links yourself.

## 1. Install the skill

You need the **Claude Code desktop app** or the **CLI** — the web version
(claude.ai/code) can't install plugins. In Claude Code, run these two lines:

```
/plugin marketplace add cdinnison/skills
/plugin install shareable@skills
```

That's it — Claude picks up the skill. (Plain `git clone` also works if you
prefer; see the repo README.)

## 2. Write your config

Get the **upload token** from Clark (Slack / 1Password — it is not in the repo).
Then create `~/.config/shareable/config.json`:

```bash
mkdir -p ~/.config/shareable
cat > ~/.config/shareable/config.json <<'JSON'
{
  "workerUrl": "https://shareable.REDACTED-SUBDOMAIN.workers.dev",
  "uploadToken": "PASTE_TOKEN_FROM_CLARK"
}
JSON
```

That's it — the `workerUrl` is the shared backend; only the token is secret.

## 3. Use it

```
/shareable my-plan.html
```

You'll get back a URL like `https://shareable.REDACTED-SUBDOMAIN.workers.dev/<slug>`.
Paste it in Slack. Re-running on the same file bumps the version under the same
URL; pass `--new` to fork a fresh thread.

## Notes

- **One shared store.** Everyone uploads through the Replenysh Cloudflare
  account and comments collect in the same place. Keep the token to the team.
- **Not indexed, but not access-controlled.** Every page sends `noindex` and the
  URL is unguessable (~72 bits), so search engines won't find it — but anyone
  with the link can read and comment. Don't share links for anything
  compliance-sensitive.
- **5 MB / HTML only.** Convert Markdown to HTML first.

To self-host your own isolated backend instead, see `README.md` → Install +
`scripts/setup.py`.
