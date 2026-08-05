# pi-ext-fan

pi-coding-agent extension: **@agent interception + companion extension installer**.

## Features

### 1. `@agent` syntax interception + autocomplete

Type `@<agent-name> <task>` in the input box to dispatch to a sub-agent:

- `@workhorse "write the tests"` → transforms into `/run workhorse "write the tests"`
- Autocomplete for agent names on `@` (from built-in + `~/.pi/agent/agents` + `~/.agents`)
- Toggle with `/ext on` / `/ext off` (bare `/ext` toggles)

### 2. Companion installer (`/ext setup`)

`/ext setup` opens an **interactive checkbox picker** (all companions selected by
default) — space toggles a row, `a` selects all/none, enter installs the checked
ones, esc cancels.

| Key | Label | Source |
| ----- | ------- | -------- |
| `sidebar` | Sidebar Panel | `npm:@aiwayds/pi-sidebar-panel` |
| `footbar` | Powerline Footer | `npm:@aiwayds/pi-powerline-footer` |
| `cron` | Kimi Cron | `npm:@aiwayds/pi-kimi-cron` |
| `fun-agents` | Fun Agents | `../../github/fun-agent` (local) |
| `think-panel` | Think Panel | `npm:@aiwayds/pi-think-panel` |
| `bailian` | Bailian Token Plan | `npm:@aiwayds/pi-bailian-token-plan` |

Named installs keep the direct path: `/ext setup <name> [<name>...]`.

- `/ext status` — at-agent state + companion install status
- `/ext setup` — interactive picker
- `/ext setup <name>` — install one companion directly

### 3. `/think` — cycle/set thinking level

`/think` cycles `off → minimal → low → medium → high → xhigh → max`;
`/think high` sets a specific level.

### 4. Skill shortcuts

- `/init` → forwards to `/skill:init` (root AGENTS.md)
- `/init-deep` → forwards to `/skill:init-deep` (.architect shadow tree)

## Install

```bash
pi install npm:@aiwayds/pi-ext-fan
```

Or clone and run from source (`/reload` to activate after edits).

## License

MIT
