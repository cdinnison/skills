# skills

Clark's personal [Claude Code](https://claude.com/claude-code) skills, packaged
as a plugin marketplace so teammates can install them by name and get updates
with a `git pull`.

## Install — never used GitHub? Start here

You don't need to know anything about GitHub, git, or the command line. You do
need the **Claude Code desktop app** (or the terminal CLI). The **web version at
claude.ai/code can't install skills** — plugins only work in the desktop app,
the CLI, and the VS Code / JetBrains extensions.

1. **Get Claude Code.** Download the desktop app from
   [claude.com/claude-code](https://claude.com/claude-code) and sign in. (Already
   use it in the terminal? That's fine too.)
2. **Open Claude Code** and, in the message box, paste this and press enter:
   ```
   /plugin marketplace add cdinnison/skills
   ```
3. Then paste this and press enter:
   ```
   /plugin install shareable@skills
   ```

4. **Connect to the shared backend.** Ask Clark for your **upload token** (he'll
   send you a short string over Slack/1Password). Then just tell Claude, in the
   same chat:
   ```
   Create my shareable config with this token: <paste-the-token-from-clark>
   ```
   Claude writes `~/.config/shareable/config.json` for you (the worker URL is
   already public — only the token is secret). Prefer to do it by hand? The exact
   file is in [TEAMMATES.md](plugins/shareable/skills/shareable/TEAMMATES.md).

That's it — now `/shareable my-plan.html` gives you a review link to paste in Slack.

> The two `/plugin` lines in steps 2–3 are the only things you must type exactly.
> Everything else (step 4, using the skill) you can just ask Claude for in plain
> English. **"Repository not found"?** Re-run the step-2 line — the repo is public,
> so no GitHub login is needed.

**Updating later:** `/plugin marketplace update skills`, then reinstall.

> Comfortable with git and skipping plugins? Each skill is a plain folder under
> `plugins/<name>/skills/<name>/` — clone this repo and copy or symlink the
> folder into `~/.claude/skills/`.

## Handing out the token (admin — Clark)

Teammates need the shared **upload token** — not the Cloudflare deploy token. It's
already on your machine from setup; read it and send the `uploadToken` value:

```bash
cat ~/.config/shareable/config.json
```

Anyone with that token can upload to the shared backend, so keep it to the team. To
rotate it, re-run the skill's `scripts/setup.py` (mints a fresh token, updates your
own config, redeploys) and re-share the new value — existing links keep working.

## Skills

| Skill | What it does | Notes |
|-------|--------------|-------|
| [shareable](plugins/shareable) | Turn an HTML plan/brief into a shareable URL with inline, text-anchored comments. | Needs a backend — see [`TEAMMATES.md`](plugins/shareable/skills/shareable/TEAMMATES.md) to connect to the shared one, or [`README.md`](plugins/shareable/README.md) to self-host. |

## Layout

```
skills/
  .claude-plugin/marketplace.json   # marketplace manifest (lists plugins)
  plugins/
    <name>/
      .claude-plugin/plugin.json    # plugin manifest
      README.md
      skills/<name>/SKILL.md        # the skill itself
```

## Adding a skill

1. `mkdir -p plugins/<name>/{.claude-plugin,skills/<name>}` and drop your
   `SKILL.md` (plus any scripts) into `skills/<name>/`.
2. Add a `plugins/<name>/.claude-plugin/plugin.json` (copy `shareable`'s).
3. Add an entry to the `plugins` array in `.claude-plugin/marketplace.json`.
4. Bump the version, commit, push.
