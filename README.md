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

That's the whole install. The two lines above are the only commands — you type
them into Claude exactly as written. You can't ask Claude in plain English to
"install the skill" for you; it has to be these `/plugin` lines.

**Hit a permission or "repository not found" error?** This repo is private, so
Claude needs access to it. Easiest fix: ask Clark to make the repo public (the
code has no secrets). Otherwise sign in with `gh auth login` first, using a
GitHub account Clark has added to the repo.

**Updating later:** `/plugin marketplace update skills`, then reinstall.

> Comfortable with git and skipping plugins? Each skill is a plain folder under
> `plugins/<name>/skills/<name>/` — clone this repo and copy or symlink the
> folder into `~/.claude/skills/`.

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
