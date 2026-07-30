# Skills

Agent skills are managed with the `skills` CLI (`https://docs.sui.io/skills`). Run
`npx skills --help` for the command list — this file only records what `--help` does not tell
you and what cost us time to discover.

## Layout

| Path | Whose | Contents |
|---|---|---|
| `.claude/skills/` | Claude Code | 17 vendored + `backlog` |
| `.agents/skills/` | Codex, OpenCode | same |
| `.pi/skills/` | pi | same |
| `skills/` | source for local skills (also OpenClaw's dir) | `backlog` |
| `skills-lock.json` | the CLI | what is installed, content-hashed |

Every directory is written by the CLI. **Do not create symlinks by hand** — `skills add`
places copies or links itself, per agent.

Vendored skills come from `mystenlabs/skills`. **Do not hand-edit them:** changes break the
recorded hash and are clobbered on the next sync. To change what is installed, add or remove
whole skills.

## Adding a local skill

Author it under `skills/<name>/SKILL.md` with `name:` and `description:` frontmatter, then
install it for each harness:

```bash
for a in claude-code codex opencode pi; do npx skills add ./skills/<name> -a $a -y; done
```

## Gotchas

Each of these cost real time; none are in `--help`.

| Behaviour | Consequence |
|---|---|
| Skill names are **positional** — `-s a,b,c` matches nothing | The command reports "No matching skills found" and exits 0. Silent no-op. |
| `-a` takes **space-separated** values, not commas | `-a eve sui-build` reads `sui-build` as an agent name: *"Invalid agents: sui-build"*. |
| A positional name after `-a` gets swallowed | Put skill names **before** the `-a` flag. |
| `--agent '*'` is rejected by `remove` | Despite `--help` documenting `*`. Name agents explicitly. |
| **`remove <skills> -a <agent>` empties `skills-lock.json`** | It clears every entry, even skills other agents still have. Back the file up and check `git diff skills-lock.json` after. |
| Multi-agent `-a x y z` can silently drop an agent | Observed with `pi`. **Install one agent at a time and verify the directory exists.** |
| Undetected agents are skipped silently | Each agent has a detection probe — pi needs `~/.pi/agent`, Claude Code needs `~/.claude`. If the harness is not installed for your user, its directory is never created and nothing says so. |
| Local skills are recorded with an **absolute path** | `skills-lock.json` stores e.g. `/home/<you>/…/skills/backlog`, so `experimental_install` will not resolve on another machine. |

## Do not install with `--all`

`--all` means *every* supported agent — 70+ of them. That is how this repo acquired a 602 KB
copy of every skill under `agent/skills/` for the **Eve** agent, which nothing here uses
(11,319 lines, removed). Install only for the harnesses in the layout table above.
