# pi-ext-fan

pi-coding-agent extension: **@agent interception + family-bucket companion installer**.

## Features

### 1. `@agent` syntax interception + autocomplete

Type `@<agent-name> <task>` in the input box to dispatch to a sub-agent:

- `@workhorse "write the tests"` → transforms into `/run workhorse "write the tests"`
- Autocomplete for agent names on `@` (from built-in + `~/.pi/agent/agents` + `~/.agents`)
- Toggle with `/ext on` / `/ext off` (bare `/ext` toggles)

### 2. Family-bucket installer (`/ext all` / `/ext setup`)

The 9-item family bucket (all `npm:` sources, tracked to `latest`):

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

- `/ext all` — **one-shot install** of every missing companion: skips already
  installed ones, no picker, no prompts, then summarizes what happened.
- `/ext setup` — interactive checkbox picker (all selected by default): space
  toggles a row, `a` selects all/none, enter installs the checked ones, esc cancels.
- `/ext setup <name> [<name>...]` — direct install of named companions.
- `/ext status` — at-agent state + companion install status.

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
/ext all    ← installs every missing family-bucket companion (one shot)
/reload     ← activates the newly installed extensions
```

That's it — `/ext all` skips anything already installed, so it's idempotent and
safe to re-run anytime a companion is missing.

Prefer a manual pick? Use `/ext setup` (interactive checkbox list) or
`/ext setup <name>` for a single package. Check what's present with `/ext status`.

## License

MIT
