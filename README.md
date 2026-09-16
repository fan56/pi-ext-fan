# pi-ext-fan

pi-coding-agent extension: **@agent interception + family-bucket companion installer**.

## Features

### 1. `@agent` syntax interception + autocomplete

Type `@<agent-name> <task>` in the input box to dispatch to a sub-agent:

- `@workhorse "write the tests"` → transforms into `/run workhorse "write the tests"`
- Autocomplete for agent names on `@` (from built-in + `~/.pi/agent/agents` + `~/.agents`)
- Toggle with `/ext on` / `/ext off` (or `/ext at-agent [on|off]`)

### 2. `/ext` command surface

Bare `/ext` (or `/ext help`) prints the subcommand summary:

```
/ext commands:
  help                                  show this help
  status | list | ls                    at-agent state + companion install status
  install-all                           install every companion in dependency order
  setup [name ...]                      interactive picker (or run named companions)
  uninstall [name ...]                  picker of installed pi-type, or `pi remove` named
                                        (copy/check types are not uninstallable)
  on | off                              enable / disable @agent interception
  at-agent [on|off]                     toggle (default) or set @agent interception
```

- `/ext status` (alias: `/ext list`, `/ext ls`) — at-agent state + companion
  install status, **grouped by `aiwayds` / `rpiv` / `ecosystem`** with per-line
  ✅/❌. The three names share a single handler, so output is identical.
- `/ext on` / `/ext off` — enable / disable `@agent` interception directly.
- `/ext at-agent [on|off]` — alias-set (`at-agent` / `at_agent` / `atagent`)
  that accepts an optional `on` / `off` argument, defaulting to a toggle.
- Unknown subcommands print the help text plus a one-line error pointing at
  `/ext help` — no silent no-op, no crash.

### 3. Family-bucket installer (`/ext install-all` / `/ext setup`)

The family bucket covers **18 companions in 3 groups**. Each entry is one of
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

#### `rpiv` group (5, all `pi`)

| Key | Label | Source |
| ----- | ------- | -------- |
| `rpiv-ask-user-question` | RPIV Ask User Question | `npm:@juicesharp/rpiv-ask-user-question` |
| `rpiv-todo` | RPIV Todo | `npm:@juicesharp/rpiv-todo` |
| `rpiv-advisor` | RPIV Advisor | `npm:@juicesharp/rpiv-advisor` |
| `rpiv-i18n` | RPIV i18n | `npm:@juicesharp/rpiv-i18n` |
| `rpiv-btw` | RPIV By The Way | `npm:@juicesharp/rpiv-btw` |

#### `ecosystem` group (4)

| Key | Label | Type | Detail |
| ----- | ------- | ------ | -------- |
| `lean-ctx` | lean-ctx (pi extension) | `pi` | `npm:pi-lean-ctx` |
| `lean-ctx-cli` | lean-ctx CLI | `check` | probes `command -v lean-ctx`; hint: `cargo install lean-ctx` (or `brew tap yvgude/lean-ctx && brew install lean-ctx`) |
| `agents` | Agents (auto-sync) | `copy` | syncs fun-agent's `agents/*.md` → `~/.pi/agent/agents/` (skip-if-exists) |
| `pi-subagents` | Subagents | `pi` | `npm:@tintinweb/pi-subagents` |

Both `/ext install-all` and `/ext setup` share the same sequential runner.
Items execute in strict dependency order — **all `pi` installs first**, then
the `copy` sync (depends on fun-agent's agents being on disk), then the
`check` probes — and within each phase the list order is preserved (never
concurrent).

`/ext uninstall` and `/ext uninstall <name>...` share the same runner with
the `action="uninstall"` flag. The dependency order is preserved (pi-type
attempts come first), but the per-phase handling diverges:

- `pi`-type — `pi remove <source>` is invoked only for currently installed
  items; not-installed items are skipped.
- `copy`-type — **skipped (not uninstallable)**. The synced agent files in
  `~/.pi/agent/agents/` may carry user customizations, so deleting them
  would be destructive. This version never removes them.
- `check`-type — **skipped (not uninstallable)**. These entries describe
  external CLIs (`lean-ctx`, etc.) with no installed artefact on disk; the
  user is expected to uninstall the CLI through its own package manager.

Both operations share a single in-flight latch: an `/ext install-all` (or
`/ext setup`) started while `/ext uninstall` is running (and vice versa) is
rejected with a notify naming whichever action is currently in flight.

Per-item progress is rendered in an editor widget above the input, updated
in place after each item. The widget shows a 1-line counter header (e.g.
`Installing 12/18 · installed=5 skipped=3 failed=1` or
`Uninstalling 3/8 · removed=2 skipped=1 failed=0`) followed by the **last 9
lines** — the most recent results plus the current in-progress row. Older
results scroll off the top as the run continues; the full list and a final
`Done.` summary arrive in the notify once the run completes.

Line shapes (install):

- `[3/18] Sidebar Panel …` — starting
- `[3/18] Sidebar Panel ✅ installed (2.1s)` — `pi` install succeeded
- `[3/18] Sidebar Panel ⏭ skipped (already installed)` — `pi` already present
- `[3/18] Agents (auto-sync) ⏭ skipped (target exists)` — `copy` target already present
- `[3/18] lean-ctx CLI ℹ hint: cargo install lean-ctx` — `check` probe missed
- `[3/18] Sidebar Panel ❌ failed: <error>` — non-zero exit / thrown exception

Line shapes (uninstall):

- `[3/8] Sidebar Panel …` — starting
- `[3/8] Sidebar Panel ✅ removed (1.8s)` — `pi remove` succeeded
- `[3/8] Sidebar Panel ⏭ skipped (not installed)` — `pi` not currently installed
- `[3/8] Agents (auto-sync) ⏭ skipped (not uninstallable: copy targets may be user-edited)` — `copy` type refused
- `[3/8] lean-ctx CLI ⏭ skipped (not uninstallable: check entries are CLI probes only)` — `check` type refused
- `[3/8] Sidebar Panel ❌ failed: <error>` — non-zero exit / thrown exception

A single failure never aborts the run; subsequent items continue. When the
last item finishes, the widget clears and a single notify summarises
`Done. installed=X skipped=Y failed=Z (total N)` (install) or
`Done. removed=X skipped=Y failed=Z (total N)` (uninstall), followed by the
full result list and an action-specific reload reminder — install runs
`Reload pi (/reload) to activate new extensions`, uninstall runs
`run /reload to apply`.

- `/ext install-all` — **one-shot setup**: installs every missing pi-type
  companion, re-syncs `agents` (idempotent, skips existing files), probes the
  CLI checks. No picker, no prompts.
- `/ext all` — **deprecated alias** for `/ext install-all`; prints a warning
  notify (`'all' is deprecated — use '/ext install-all'`) and then runs the
  same one-shot path. Kept so existing muscle memory still works.
- `/ext setup` — interactive checkbox picker (all selected by default,
  grouped): space toggles a row, `a` selects all/none, enter runs the checked
  ones, esc cancels.
- `/ext setup <name> [<name>...]` — run named companions directly (still uses
  the sequential runner and the same per-item progress widget).
- `/ext uninstall` — interactive picker of **currently installed `pi`-type**
  companions only (copy/check are filtered out — they're not uninstallable).
  Same space/`a`/enter/esc keys as `/ext setup`; same progress widget and
  summary format with `removed=` instead of `installed=`.
- `/ext uninstall <name> [<name>...]` — `pi remove` named items directly.
  `copy` and `check` items are accepted at the dispatch layer (so muscle
  memory like `/ext uninstall agents` doesn't error) but skipped in the
  runner with a clear reason; unknown names are rejected up front.

### 4. `/think` — cycle/set thinking level

`/think` cycles `off → minimal → low → medium → high → xhigh → max`;
`/think high` sets a specific level.

### 5. Skill shortcuts

- `/init` → forwards to `/skill:init` (root AGENTS.md)
- `/init-deep` → forwards to `/skill:init-deep` (.architect shadow tree)

## Install (fresh environment, three steps)

```bash
pi install npm:@aiwayds/pi-ext-fan
```

Then, inside the pi session:

```
/ext install-all    ← full setup: installs every missing companion, syncs agents, probes CLIs
/reload             ← activates the newly installed extensions
```

That's it — `/ext install-all` skips anything already installed, re-syncs
`agents` without touching existing files, and only *reports* a hint for
missing CLIs. It's idempotent and safe to re-run anytime a companion is
missing or a new agent file should be picked up.

Prefer a manual pick? Use `/ext setup` (interactive checkbox list) or
`/ext setup <name>` for a single package. Check what's present with
`/ext status` (or its `list` / `ls` aliases).

## License

MIT
