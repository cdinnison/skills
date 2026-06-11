# Using `/shareable` (teammate setup)

This connects you to the **shared** `shareable` backend so your review links and
comment threads live alongside everyone else's. You do **not** deploy anything —
no Cloudflare, no `wrangler`, no `setup.py`.

> Just want to *review* a plan someone sent you? Do nothing. Open the URL,
> highlight text, comment. This guide is only for *generating* links yourself.

## 1. Install the skill

```bash
git clone <repo-url> ~/.claude/skills/shareable
```

Claude Code picks up the skill automatically. You can ignore `worker/` entirely
(that's the backend, already deployed and shared).

## 2. Write your config

Get the **upload token** from Clark (Slack / 1Password — it is not in this repo).
Then create `~/.config/shareable/config.json`:

```bash
mkdir -p ~/.config/shareable
cat > ~/.config/shareable/config.json <<'JSON'
{
  "workerUrl": "https://shareable.cdinnison.workers.dev",
  "uploadToken": "PASTE_TOKEN_FROM_CLARK"
}
JSON
```

That's it — the `workerUrl` is the shared backend; only the token is secret.

## 3. Use it

```
/shareable my-plan.html
```

or directly:

```bash
python ~/.claude/skills/shareable/scripts/shareable.py my-plan.html
```

You'll get back a URL like `https://shareable.cdinnison.workers.dev/<slug>`.
Paste it in Slack. Re-running on the same file bumps the version under the same
URL; pass `--new` to fork a fresh thread.

## Notes

- **One shared store.** Everyone uploads through Clark's Cloudflare account and
  comments collect in the same place. Keep the token to the team.
- **No auth on links.** The URL is the secret (~72 bits). Don't share links for
  anything compliance-sensitive.
- **5 MB / HTML only.** Convert Markdown to HTML first.

To self-host your own isolated backend instead, see `README.md` → Install +
`scripts/setup.py`.
