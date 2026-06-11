# skills

Clark's personal [Claude Code](https://claude.com/claude-code) skills, packaged
as a plugin marketplace so teammates can install them by name and get updates
with a `git pull`.

## Install (teammates)

Add the marketplace once, then install whatever you want:

```
/plugin marketplace add cdinnison/skills
/plugin install shareable@skills
```

Update later with `/plugin marketplace update skills`.

> Prefer not to use the plugin system? Each skill is a plain folder under
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
