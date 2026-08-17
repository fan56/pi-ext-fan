# pi-ext-fan

pi-coding-agent extension: **@agent interception + family-bucket companion installer**.

## Features

### 1. `@agent` syntax interception + autocomplete

Type `@<agent-name> <task>` in the input box to dispatch to a sub-agent:

- `@workhorse "write the tests"` → transforms into `/run workhorse "write the tests"`
- Autocomplete for agent names on `@` (from built-in + `~/.pi/agent/agents` + `~/.agents`)
- Toggle with `/ext on` / `/ext off` (bare `/ext` toggles)

### 2. Family-bucket installer (`/ext all` / `/ext setup`)

The family bucket covers **22 companions in 3 groups**. Each entry is one of
three action types:

- **`pi`** — installed via `pi install <source>` (tracked to `latest`)
- **`copy`** — agent `.md` files synced into `~/.pi/agent/agents` (copied only
  when the target file does **not** already exist, so local customizations like
  a hand-tuned `oldfox.md` are never overwritten)
- **`check`** — probes a CLI (`command -v …`); when missing it only prints an
  install hint, it never runs an installer

#### `aiwayds` group (9, all `pi`)

| Key | Label | Source |
| ----- | ------- | -------- |
| `sidebar` | Sidebar Panel | `npm:@aiwayds/pi-sidebar-panel` |
| `footbar` | Powerline Footer | `npm:@aiwayds/pi-powerline-footer` |
| `cron` | Kimi Cron | `npm:@aiwayds/pi-kimi-cron` |
| `think-panel` | Think Panel | `npm:@aiwayds/pi-think-panel` |
| `bailian` | Bailian Token Plan | `npm:@aiwayds/pi-bailian-token-plan` |
| `jarvis` | Jarvis Sphere | `npm:@aiwayds/pi-jarvis-sphere` |
| `model-favs` | Model Favorites | `npm:@aiwayds/pi-model-favorites` |
| `topic-memory` | Topic Memory | `npm:@aiwayds/pi-topic-memory` |
| `fun-agent` | Fun Agent | `npm:@aiwayds/pi-fun-agent` |

#### `rpiv` group (9, all `pi`)

| Key | Label | Source |
| ----- | ------- | -------- |
| `rpiv-pi` | RPIV Pi | `npm:@juicesharp/rpiv-pi` |
| `rpiv-workflow` | RPIV Workflow | `npm:@juicesharp/rpiv-workflow` |
| `rpiv-ask-user-question` | RPIV Ask User Question | `npm:@juicesharp/rpiv-ask-user-question` |
| `rpiv-todo` | RPIV Todo | `npm:@juicesharp/rpiv-todo` |
| `rpiv-advisor` | RPIV Advisor | `npm:@juicesharp/rpiv-advisor` |
| `rpiv-i18n` | RPIV i18n | `npm:@juicesharp/rpiv-i18n` |
| `rpiv-web-tools` | RPIV Web Tools | `npm:@juicesharp/rpiv-web-tools` |
| `rpiv-args` | RPIV Args | `npm:@juicesharp/rpiv-args` |
| `rpiv-btw` | RPIV By The Way | `npm:@juicesharp/rpiv-btw` |

#### `ecosystem` group (4)

| Key | Label | Type | Detail |
| ----- | ------- | ------ | -------- |
| `lean-ctx` | lean-ctx (pi extension) | `pi` | `npm:pi-lean-ctx` |
| `lean-ctx-cli` | lean-ctx CLI | `check` | probes `command -v lean-ctx`; hint: `cargo install lean-ctx` (or `brew tap yvgude/lean-ctx && brew install lean-ctx`) |
| `agents` | Agents (auto-sync) | `copy` | syncs fun-agent's `agents/*.md` → `~/.pi/agent/agents/` (skip-if-exists) |
| `pi-subagents` | Subagents | `pi` | `npm:@tintinweb/pi-subagents` |

`/ext all` runs the three phases in dependency order: **all `pi` installs first**, then the `copy` sync (depends on fun-agent's agents being on disk), then the `check` probes. The summary reports each group separately.

- `/ext all` — **one-shot setup**: installs every missing `pi`-type companion, re-syncs `agents` (idempotent, skips existing files), probes the CLI checks. No picker, no prompts.
- `/ext setup` — interactive checkbox picker (all selected by default, grouped): space toggles a row, `a` selects all/none, enter runs the checked ones, esc cancels.
- `/ext setup <name> [<name>...]` — run named companions directly.
- `/ext status` — at-agent state + companion install status, **grouped by `aiwayds` / `rpiv` / `ecosystem`** with per-line ✅/❌.

### 3. `/think` — cycle/set thinking level

`/think` cycles `off → minimal → low → medium → high → xhigh → max`;
`/think high` sets a specific level.

### 4. Skill shortcuts

- `/init` → forwards to `/skill:init` (root AGENTS.md)
- `/init-deep` → forwards to `/skill:init-deep` (.architect shadow tree)

## Install (fresh environment, three steps)

```bash
pi install npm:@aiwayds/pi-ext-fan
```

Then, inside the pi session:

```
/ext all    ← full setup: installs every missing companion, syncs agents, probes CLIs
/reload     ← activates the newly installed extensions
```

That's it — `/ext all` skips anything already installed, re-syncs `agents`
without touching existing files, and only *reports* a hint for missing CLIs.
It's idempotent and safe to re-run anytime a companion is missing or a new
agent file should be picked up.

Prefer a manual pick? Use `/ext setup` (interactive checkbox list) or
`/ext setup <name>` for a single package. Check what's present with `/ext status`.

## License

MIT
