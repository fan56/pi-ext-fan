/**
 * pi-ext-fan — @agent interception + family-bucket companion installer
 *
 * Kept features:
 *   1. at-agent  — @agent syntax interception + autocomplete
 *   2. companions — 18-item family bucket in 3 groups (aiwayds / rpiv / ecosystem),
 *      each entry having one of three action types:
 *        - pi    : installed via `pi install <source>` (npm:@...)
 *        - copy  : local files synced into ~/.pi/agent/agents (fun-agent agents,
 *                  copied only when the target does not already exist)
 *        - check : probe CLI presence (`command -v ...`), hint printed when missing
 *
 * Removed (replaced by standalone extensions):
 *   - sidebar      → @aiwayds/pi-sidebar-panel  (/sidebar command)
 *   - last-request → @aiwayds/pi-powerline-footer (footer bar)
 *   - clean-status → no longer needed (pi clears zombie status itself)
 *
 * Commands:
 *   /ext                       — show help
 *   /ext help                  — show help
 *   /ext status | list | ls    — at-agent state + companion install status (grouped by aiwayds / rpiv / ecosystem)
 *   /ext install-all           — one-shot: install every missing pi-type, sync copy-type, probe check-type
 *   /ext all                   — deprecated, use '/ext install-all'
 *   /ext setup                 — interactive picker (all selected by default, grouped) → run chosen companions
 *   /ext setup <name>...       — run named companions (pi install / copy sync / check probe)
 *   /ext uninstall             — interactive picker of installed pi-type → `pi remove` chosen
 *   /ext uninstall <name>...   — `pi remove` named pi-type; copy/check types are skipped (not uninstallable)
 *   /ext on | off              — enable / disable @agent interception
 *   /ext at-agent [on|off]     — toggle (default) or set @agent interception
 *   /think                     — cycle/set thinking level
 *
 * Both install and uninstall share a single in-flight latch and progress widget:
 *   - Install runs `pi install <source>`, syncs copy targets, probes check CLIs.
 *   - Uninstall runs `pi remove <source>` for installed pi-type items only.
 *     copy-type (agents/*.md) and check-type (CLI probes) are explicitly NOT
 *     uninstalled — copy targets may carry user customizations, and check entries
 *     describe external CLIs with no installed artefact on disk.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  Key,
  truncateToWidth,
  Container,
  Text,
} from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// ═══════════════════════════════════════════════════════════════════
// Feature State (at-agent is the only remaining feature)
// ═══════════════════════════════════════════════════════════════════

interface FeatureState {
  atAgent: boolean;
}

const DEFAULT_STATE: FeatureState = {
  atAgent: true,
};

const state: FeatureState = { ...DEFAULT_STATE };

const AT_AGENT_ALIASES = new Set(["at-agent", "at_agent", "atagent"]);

// ═══════════════════════════════════════════════════════════════════
// Companion extensions (installed via /ext setup)
// ═══════════════════════════════════════════════════════════════════

type CompanionGroup = "aiwayds" | "rpiv" | "ecosystem";
type CompanionType = "pi" | "copy" | "check";

interface Companion {
  label: string;
  pkg: string; // detection package name (pi-type: used by isCompanionInstalled)
  group: CompanionGroup; // display grouping: aiwayds / rpiv / ecosystem
  type: CompanionType; // how to install: pi install | copy local files | probe CLI
  source?: string; // type=pi: source passed to `pi install` (e.g. "npm:@scope/pkg")
  copyFrom?: string[]; // type=copy: candidate source dirs (absolute), first existing wins
  copyTo?: string; // type=copy: destination directory
  files?: string[]; // type=copy: explicit file list; empty/omitted → auto-discover *.md
  checkCmd?: string; // type=check: probe command (e.g. "command -v lean-ctx")
  hint?: string; // type=check: install hint shown when the CLI is missing
}

const COMPANIONS: Record<string, Companion> = {
  // ── aiwayds group (9) — pi install ───────────────────────────────
  sidebar: {
    label: "Sidebar Panel",
    pkg: "@aiwayds/pi-sidebar-panel",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-sidebar-panel",
  },
  footbar: {
    label: "Powerline Footer",
    pkg: "@aiwayds/pi-powerline-footer",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-powerline-footer",
  },
  cron: {
    label: "Kimi Cron",
    pkg: "@aiwayds/pi-kimi-cron",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-kimi-cron",
  },
  "think-panel": {
    label: "Think Panel",
    pkg: "@aiwayds/pi-think-panel",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-think-panel",
  },
  bailian: {
    label: "Bailian Token Plan",
    pkg: "@aiwayds/pi-bailian-token-plan",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-bailian-token-plan",
  },
  jarvis: {
    label: "Jarvis Sphere",
    pkg: "@aiwayds/pi-jarvis-sphere",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-jarvis-sphere",
  },
  "model-favs": {
    label: "Model Favorites",
    pkg: "@aiwayds/pi-model-favorites",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-model-favorites",
  },
  "topic-memory": {
    label: "Topic Memory",
    pkg: "@aiwayds/pi-topic-memory",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-topic-memory",
  },
  "fun-agent": {
    label: "Fun Agent",
    pkg: "@aiwayds/pi-fun-agent",
    group: "aiwayds",
    type: "pi",
    source: "npm:@aiwayds/pi-fun-agent",
  },
  // ── rpiv group (5) — pi install ──────────────────────────────────
  "rpiv-ask-user-question": {
    label: "RPIV Ask User Question",
    pkg: "@juicesharp/rpiv-ask-user-question",
    group: "rpiv",
    type: "pi",
    source: "npm:@juicesharp/rpiv-ask-user-question",
  },
  "rpiv-todo": {
    label: "RPIV Todo",
    pkg: "@juicesharp/rpiv-todo",
    group: "rpiv",
    type: "pi",
    source: "npm:@juicesharp/rpiv-todo",
  },
  "rpiv-advisor": {
    label: "RPIV Advisor",
    pkg: "@juicesharp/rpiv-advisor",
    group: "rpiv",
    type: "pi",
    source: "npm:@juicesharp/rpiv-advisor",
  },
  "rpiv-i18n": {
    label: "RPIV i18n",
    pkg: "@juicesharp/rpiv-i18n",
    group: "rpiv",
    type: "pi",
    source: "npm:@juicesharp/rpiv-i18n",
  },
  "rpiv-btw": {
    label: "RPIV By The Way",
    pkg: "@juicesharp/rpiv-btw",
    group: "rpiv",
    type: "pi",
    source: "npm:@juicesharp/rpiv-btw",
  },
  // ── ecosystem group (4) — pi / copy / check ──────────────────────
  "lean-ctx": {
    label: "lean-ctx (pi extension)",
    pkg: "pi-lean-ctx",
    group: "ecosystem",
    type: "pi",
    source: "npm:pi-lean-ctx",
  },
  "lean-ctx-cli": {
    label: "lean-ctx CLI",
    pkg: "lean-ctx-cli",
    group: "ecosystem",
    type: "check",
    checkCmd: "command -v lean-ctx",
    hint: "cargo install lean-ctx  # 或: brew tap yvgude/lean-ctx && brew install lean-ctx",
  },
  agents: {
    label: "Agents (auto-sync)",
    pkg: "agents",
    group: "ecosystem",
    type: "copy",
    copyFrom: [
      path.join(
        os.homedir(),
        ".pi",
        "agent",
        "npm",
        "node_modules",
        "@aiwayds",
        "pi-fun-agent",
        "agents",
      ),
      path.join(os.homedir(), "github", "fun-agent", "agents"),
    ],
    copyTo: path.join(os.homedir(), ".pi", "agent", "agents"),
  },
  "pi-subagents": {
    label: "Subagents",
    pkg: "@tintinweb/pi-subagents",
    group: "ecosystem",
    type: "pi",
    source: "npm:@tintinweb/pi-subagents",
  },
};

function settingsPackages(): string[] {
  try {
    const cfg = JSON.parse(
      readFileSync(
        path.join(os.homedir(), ".pi", "agent", "settings.json"),
        "utf8",
      ),
    );
    return Array.isArray(cfg?.packages) ? cfg.packages.map(String) : [];
  } catch {
    /* settings.json missing/unreadable */
  }
  return [];
}

function isCompanionInstalled(c: Companion): boolean {
  switch (c.type) {
    case "check": {
      // Probe CLI presence via checkCmd; never installs anything.
      if (!c.checkCmd) return false;
      try {
        const r = spawnSync(c.checkCmd, {
          shell: true,
          stdio: "ignore",
          timeout: 3_000,
        });
        return r.status === 0;
      } catch {
        return false;
      }
    }
    case "copy": {
      // Installed iff every expected agent file already exists in copyTo
      // (protects local customizations — never overwrite existing files).
      const target = c.copyTo;
      if (!target || !existsSync(target)) return false;
      const src = (c.copyFrom ?? []).find((d) => existsSync(d));
      if (src) {
        const want = agentFilesIn(src);
        if (want.length === 0) return true; // nothing to sync → already satisfied
        return want.every((f) => existsSync(path.join(target, f)));
      }
      // No known source (fun-agent not installed): any agent file present counts.
      try {
        return fs.readdirSync(target).some((f) => f.endsWith(".md"));
      } catch {
        return false;
      }
    }
    default: {
      // pi install writes to settings.json packages; local conventional dirs also count.
      const pkgs = settingsPackages();
      if (pkgs.some((p) => p.includes(c.pkg))) return true;
      // Basename fallback: local-path registrations (e.g. "../../github/pi-model-favorites" or
      // "../../github/fun-agent") don't contain the full scoped pkg name. Compare the bare package
      // basename, tolerating a missing "pi-" prefix (local dir "fun-agent" vs pkg "pi-fun-agent").
      const base = c.pkg.split("/").pop() ?? "";
      const short = base.replace(/^pi-/, "");
      if (pkgs.some((p) => p.includes(base) || p.includes(short))) return true;
      if (
        existsSync(path.join(os.homedir(), ".pi", "agent", "extensions", c.pkg))
      )
        return true;
      return false;
    }
  }
}

/** Non-hidden, non-backup .md files in a directory (used to discover agent sources). */
function agentFilesIn(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter(
        (f) => f.endsWith(".md") && !f.startsWith(".") && !f.includes(".bak"),
      )
      .sort();
  } catch {
    return [];
  }
}

const GROUP_ORDER: CompanionGroup[] = ["aiwayds", "rpiv", "ecosystem"];

/** COMPANIONS entries in display order: grouped (aiwayds → rpiv → ecosystem), then insertion. */
function orderedCompanions(): Array<[string, Companion]> {
  return Object.entries(COMPANIONS).sort(
    (a, b) => GROUP_ORDER.indexOf(a[1].group) - GROUP_ORDER.indexOf(b[1].group),
  );
}

/** Companions eligible for `pi remove`: installed pi-type only.
 *  copy-type (agents/*.md) and check-type (CLI probes) are NOT uninstallable
 *  — copy targets may hold user customizations and check entries describe
 *  external CLIs with no on-disk artefact. Used by the bare uninstall picker
 *  filter and by the dispatcher's empty-installed fast-path. */
function uninstallableCompanions(): Array<[string, Companion]> {
  return orderedCompanions().filter(
    ([, c]) => c.type === "pi" && isCompanionInstalled(c),
  );
}

/** Detail suffix for picker/status rows: pi-type shows the npm pkg, others show the action type. */
function companionDetail(c: Companion): string {
  return c.type === "pi" ? c.pkg : `[${c.type}]`;
}

/**
 * Copy companion agent files (fun-agent's agents/) into ~/.pi/agent/agents/.
 * Probes copyFrom in order (first existing dir wins). A file is copied only
 * when the target does NOT already exist — local customizations (e.g. a tuned
 * oldfox.md) are never overwritten. Returns copy statistics; on a fatal error
 * (e.g. mkdirSync EPERM/ENOSPC) the error is surfaced via `error` so the
 * caller can mark the item failed without aborting the whole phase.
 */
async function syncAgents(
  c: Companion,
  ctx: ExtensionContext,
): Promise<{
  copied: number;
  skipped: number;
  source?: string;
  error?: string;
}> {
  const src = (c.copyFrom ?? []).find((d) => existsSync(d));
  if (!src) {
    ctx.ui.notify(
      `agents: no source dir found (${(c.copyFrom ?? []).join(", ")})`,
      "warning",
    );
    return { copied: 0, skipped: 0 };
  }
  const target = c.copyTo;
  if (!target) return { copied: 0, skipped: 0 };
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (e) {
    // mkdir failure (EPERM/ENOSPC/etc.) — don't crash the whole install run;
    // caller surfaces this as a per-item failure in the summary notify.
    const msg = (e as Error).message;
    ctx.ui.notify(`agents: mkdir ${target} failed — ${msg}`, "error");
    return { copied: 0, skipped: 0, source: src, error: msg };
  }
  const files = c.files && c.files.length > 0 ? c.files : agentFilesIn(src);
  let copied = 0;
  let skipped = 0;
  for (const f of files) {
    const from = path.join(src, f);
    const to = path.join(target, f);
    if (!existsSync(from)) {
      skipped++; // listed but absent from source → skip
      continue;
    }
    if (existsSync(to)) {
      skipped++; // already present → never overwrite local customization
      continue;
    }
    try {
      fs.copyFileSync(from, to);
      copied++;
    } catch (e) {
      ctx.ui.notify(
        `agents: copy ${f} failed — ${(e as Error).message}`,
        "error",
      );
    }
  }
  return { copied, skipped, source: src };
}

interface PickerItem {
  name: string;
  label: string;
  installed: boolean;
}

/**
 * Checkbox list for /ext setup (install) and /ext uninstall: items are checked
 * by default, space toggles a row, enter runs the checked ones, esc cancels.
 * Header text + enter-action verb are passed in so the same widget works for
 * both install and uninstall with appropriate wording.
 */
class CompanionPicker {
  private items: PickerItem[];
  private checked = new Set<string>();
  private cursor = 0;
  private cache?: { width: number; lines: string[] };
  private header: string;

  public onDone?: (names: string[]) => void;
  public onCancel?: () => void;

  constructor(items: PickerItem[], header: string) {
    this.items = items;
    this.header = header;
    for (const it of items) this.checked.add(it.name); // 默认全选
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) && this.cursor > 0) {
      this.cursor--;
    } else if (
      matchesKey(data, Key.down) &&
      this.cursor < this.items.length - 1
    ) {
      this.cursor++;
    } else if (matchesKey(data, Key.space)) {
      const name = this.items[this.cursor].name;
      if (this.checked.has(name)) this.checked.delete(name);
      else this.checked.add(name);
    } else if (matchesKey(data, "a")) {
      if (this.checked.size === this.items.length) this.checked.clear();
      else for (const it of this.items) this.checked.add(it.name);
    } else if (matchesKey(data, Key.enter)) {
      this.onDone?.(
        this.items.map((it) => it.name).filter((n) => this.checked.has(n)),
      );
      return;
    } else if (matchesKey(data, Key.escape)) {
      this.onCancel?.();
      return;
    } else {
      return; // 未处理按键，无需重绘
    }
    this.cache = undefined;
  }

  render(width: number, theme: Theme): string[] {
    if (this.cache && this.cache.width === width) return this.cache.lines;
    const lines: string[] = [
      theme.bold(truncateToWidth(this.header, width)),
      "",
    ];
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const cursor = i === this.cursor ? theme.fg("accent", ">") : " ";
      const box = this.checked.has(it.name)
        ? theme.fg("success", "[x]")
        : theme.fg("dim", "[ ]");
      const label = it.installed
        ? theme.fg("dim", `${it.label} (installed)`)
        : it.label;
      lines.push(truncateToWidth(`${cursor} ${box} ${label}`, width));
    }
    this.cache = { width, lines };
    return lines;
  }

  invalidate(): void {
    this.cache = undefined;
  }
}

interface PickOptions {
  /** "install": show all companions. "uninstall": only installed pi-type (copy/check not uninstallable). */
  purpose: "install" | "uninstall";
}

async function pickCompanions(
  ctx: ExtensionContext,
  opts: PickOptions = { purpose: "install" },
): Promise<string[] | null> {
  const visible =
    opts.purpose === "uninstall" ? uninstallableCompanions() : orderedCompanions();
  const items: PickerItem[] = visible.map(([name, c]) => ({
    name,
    label: `${c.label} (${companionDetail(c)})`,
    installed: isCompanionInstalled(c),
  }));
  const header =
    opts.purpose === "uninstall"
      ? "Uninstall companions — space: toggle · a: all/none · enter: remove · esc: cancel"
      : "Install companions — space: toggle · a: all/none · enter: install · esc: cancel";
  return ctx.ui.custom<string[] | null>((tui, theme, _keybindings, done) => {
    const picker = new CompanionPicker(items, header);
    picker.onDone = done;
    picker.onCancel = () => done(null);
    return {
      render: (width) => picker.render(width, theme),
      handleInput: (data) => {
        picker.handleInput(data);
        tui.requestRender();
      },
      invalidate: () => picker.invalidate(),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// /ext subcommand dispatch + help (pure, exported for smoke-test)
// ═══════════════════════════════════════════════════════════════════

export type DispatchKind =
  | "help"
  | "status"
  | "setup"
  | "install-all"
  | "uninstall"
  | "at-agent-on"
  | "at-agent-off"
  | "at-agent-toggle"
  | "error";

export interface DispatchResult {
  kind: DispatchKind;
  /** Names passed after "setup" or "uninstall" (empty → picker or one-shot). */
  names?: string[];
  /** Deprecated alias that triggered install-all (e.g. "all"). */
  deprecatedAlias?: string;
  /** Error message (when kind === "error"). */
  message?: string;
}

/**
 * Resolve a `/ext` argument string into a dispatch decision. No side effects —
 * state mutation and UI calls happen in the caller. Exported so smoke-test can
 * verify routing without spinning up a pi runtime.
 */
export function dispatchExt(args: string | undefined | null): DispatchResult {
  const trimmed = (args ?? "").trim();
  if (trimmed === "") return { kind: "help" };
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];

  if (cmd === "help") return { kind: "help" };
  if (cmd === "status" || cmd === "list" || cmd === "ls")
    return { kind: "status" };
  if (cmd === "setup") return { kind: "setup", names: parts.slice(1) };
  if (cmd === "install-all") return { kind: "install-all" };
  if (cmd === "all")
    return { kind: "install-all", deprecatedAlias: "all" };
  if (cmd === "uninstall") return { kind: "uninstall", names: parts.slice(1) };
  if (cmd === "on") return { kind: "at-agent-on" };
  if (cmd === "off") return { kind: "at-agent-off" };
  if (AT_AGENT_ALIASES.has(cmd)) {
    const action = parts[1];
    if (action === "on") return { kind: "at-agent-on" };
    if (action === "off") return { kind: "at-agent-off" };
    return { kind: "at-agent-toggle" };
  }
  return {
    kind: "error",
    message: `Unknown subcommand: ${cmd}. Try '/ext help'.`,
  };
}

/** Help text shown by bare `/ext` and `/ext help`. */
export const EXT_HELP_TEXT = [
  "/ext commands:",
  "  help                                  show this help",
  "  status | list | ls                    at-agent state + companion install status",
  "  install-all                           install every companion in dependency order",
  "  all (deprecated: install-all)         alias kept for muscle memory",
  "  setup [name ...]                      interactive picker (or run named companions)",
  "  uninstall [name ...]                  picker of installed pi-type, or `pi remove` named",
  "                                        (copy/check types are not uninstallable)",
  "  on | off                              enable / disable @agent interception",
  "  at-agent [on|off]                     toggle (default) or set @agent interception",
].join("\n");

// ═══════════════════════════════════════════════════════════════════
// Shared companion-op runner (used by /ext install-all, /ext setup, /ext uninstall)
// ═══════════════════════════════════════════════════════════════════

const EXT_OP_WIDGET_KEY = "ext-op-progress";

/** Cap of widget lines the host renders (matches pi's MAX_WIDGET_LINES = 10).
 *  We send a 1-line header + at most 9 body lines so the last in-progress row
 *  and the most recent results stay visible even for the 18-item family. */
const MAX_WIDGET_BODY_LINES = 9;

type CompanionAction = "install" | "uninstall";
/** Origin command — controls header prefix in the summary notify. */
type OpSource = "setup" | "install-all" | "uninstall";

interface RunOptions {
  action: CompanionAction;
  source: OpSource;
  /** When true and names is empty: show the picker. */
  interactive: boolean;
}

const fmtElapsed = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** Reentrancy guard: only one companion-op (install or uninstall) at a time.
 *  Tracks which action is in flight so the rejection notify can name it. */
let opInFlight: CompanionAction | null = null;

/**
 * Run pi → copy → check phases sequentially over the selected targets. Shows
 * per-item progress in a setWidget above the editor (replaced in place after
 * each item). A single failure never aborts the run. Returns when every item
 * has been attempted; emits a final summary notify.
 *
 * The action discriminator ("install" | "uninstall") flips each phase:
 *   - pi-type    : `pi install <source>`  vs  `pi remove <source>` (only if installed)
 *   - copy-type   : syncAgents()          vs  skipped (copy targets may be user-edited)
 *   - check-type  : probe CLI presence    vs  skipped (no installed artefact)
 *
 * The widget is always cleared in a `finally` block — even if a copy / exec
 * throws synchronously out of runCompanionOp — so a half-finished widget
 * never gets stuck above the editor.
 */
async function runCompanionOp(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  names: string[],
  opts: RunOptions,
): Promise<void> {
  const { action, source, interactive } = opts;
  const verb = action === "install" ? "installed" : "removed";

  // Reentrancy guard: refuse overlapping companion-op runs. Install and
  // uninstall share the same latch; the rejection message names whichever
  // action is currently in flight.
  if (opInFlight) {
    const cap = opInFlight === "install" ? "Install" : "Uninstall";
    ctx.ui.notify(`${cap} already in progress`, "warning");
    return;
  }
  opInFlight = action;

  try {
    const hasNames = names.length > 0;
    // Dedupe by name — `/ext setup a a b` or repeated entries in a future
    // picker must not double-count toward `total`.
    const targets0 = hasNames
      ? [...new Set(names)]
      : orderedCompanions().map(([n]) => n);

    // Validate unknown names up front — fail fast with a single notify.
    const unknown = targets0.filter((n) => !COMPANIONS[n]);
    if (unknown.length > 0) {
      ctx.ui.notify(
        `Unknown companion: ${unknown.join(", ")}. Available: ${orderedCompanions()
          .map(([n]) => n)
          .join(", ")}`,
        "error",
      );
      return;
    }

    let targets = targets0;
    if (!hasNames && interactive) {
      const picked = await pickCompanions(ctx, { purpose: action });
      if (picked === null) {
        const cap = action === "install" ? "Setup" : "Uninstall";
        ctx.ui.notify(`${cap} cancelled`, "info");
        return;
      }
      targets = picked;
      if (targets.length === 0) {
        ctx.ui.notify(
          `No companions selected — nothing to ${action}`,
          "warning",
        );
        return;
      }
    }

    const total = targets.length;
    const sel = new Set(targets);
    const done: string[] = [];
    let processed = 0;
    const counts = { installed: 0, skipped: 0, failed: 0 };
    // The counts object's primary field is always `installed`; the displayed
    // label switches between "installed" and "removed" per action verb.
    const headLabel = action === "install" ? "installed" : "removed";

    const renderWidget = (inProgress?: string): void => {
      const tail = inProgress ? [...done, inProgress] : done.slice();
      const body = tail.slice(-MAX_WIDGET_BODY_LINES);
      const headVerb = action === "install" ? "Installing" : "Uninstalling";
      const header = `${headVerb} ${processed}/${total} · ${headLabel}=${counts.installed} skipped=${counts.skipped} failed=${counts.failed}`;
      ctx.ui.setWidget(
        EXT_OP_WIDGET_KEY,
        [header, ...body],
        { placement: "aboveEditor" },
      );
    };

    const nextIndex = (): string => {
      processed++;
      return `[${processed}/${total}]`;
    };

    // Phase 1 — pi-type (must complete first so fun-agent's files land before copy phase).
    for (const [name] of orderedCompanions()) {
      if (!sel.has(name)) continue;
      const c = COMPANIONS[name];
      if (c.type !== "pi") continue;
      const idx = nextIndex();
      renderWidget(`${idx} ${c.label} …`);
      const t0 = Date.now();
      if (action === "install") {
        if (isCompanionInstalled(c)) {
          done.push(`${idx} ${c.label} ⏭ skipped (already installed)`);
          counts.skipped++;
          continue;
        }
        try {
          const res = await pi.exec("pi", ["install", c.source!], {
            cwd: process.cwd(),
          });
          const code =
            (res as { code?: number; status?: number } | null)?.code ??
            (res as { status?: number } | null)?.status ??
            0;
          const dt = Date.now() - t0;
          if (code === 0) {
            done.push(`${idx} ${c.label} ✅ installed (${fmtElapsed(dt)})`);
            counts.installed++;
          } else {
            done.push(
              `${idx} ${c.label} ❌ failed: pi install exited ${code} (${fmtElapsed(dt)})`,
            );
            counts.failed++;
          }
        } catch (e) {
          const dt = Date.now() - t0;
          done.push(
            `${idx} ${c.label} ❌ failed: ${(e as Error).message} (${fmtElapsed(dt)})`,
          );
          counts.failed++;
        }
      } else {
        // uninstall
        if (!isCompanionInstalled(c)) {
          done.push(`${idx} ${c.label} ⏭ skipped (not installed)`);
          counts.skipped++;
          continue;
        }
        // Known limitation: `pi remove` matches against the registered
        // source string. Every COMPANIONS entry today uses an `npm:...`
        // source (see isCompanionInstalled's local-path fallback for how
        // detection tolerates those), but if a companion ever ships with a
        // local-path source (e.g. "../../github/pi-model-favorites"), the
        // same local-path string must be passed here or pi will refuse to
        // find it. Today this branch is unreachable for that case because
        // no COMPANIONS entry registers as a local path.
        try {
          const res = await pi.exec("pi", ["remove", c.source!], {
            cwd: process.cwd(),
          });
          const code =
            (res as { code?: number; status?: number } | null)?.code ??
            (res as { status?: number } | null)?.status ??
            0;
          const dt = Date.now() - t0;
          if (code === 0) {
            done.push(`${idx} ${c.label} ✅ removed (${fmtElapsed(dt)})`);
            counts.installed++;
          } else {
            done.push(
              `${idx} ${c.label} ❌ failed: pi remove exited ${code} (${fmtElapsed(dt)})`,
            );
            counts.failed++;
          }
        } catch (e) {
          const dt = Date.now() - t0;
          done.push(
            `${idx} ${c.label} ❌ failed: ${(e as Error).message} (${fmtElapsed(dt)})`,
          );
          counts.failed++;
        }
      }
    }

    // Phase 2 — copy-type: sync fun-agent agents on install, skip on uninstall.
    for (const [name] of orderedCompanions()) {
      if (!sel.has(name)) continue;
      const c = COMPANIONS[name];
      if (c.type !== "copy") continue;
      const idx = nextIndex();
      renderWidget(`${idx} ${c.label} …`);
      const t0 = Date.now();
      if (action === "install") {
        if (isCompanionInstalled(c)) {
          done.push(`${idx} ${c.label} ⏭ skipped (target exists)`);
          counts.skipped++;
          continue;
        }
        const r = await syncAgents(c, ctx);
        const dt = Date.now() - t0;
        if (r.error) {
          // mkdirSync failure (or other fatal) inside syncAgents — count as
          // failed so the summary reflects the broken item without aborting.
          done.push(
            `${idx} ${c.label} ❌ failed: ${r.error} (${fmtElapsed(dt)})`,
          );
          counts.failed++;
        } else if (r.source && r.copied > 0) {
          done.push(
            `${idx} ${c.label} ✅ installed (copied ${r.copied}, ${fmtElapsed(dt)})`,
          );
          counts.installed++;
        } else if (r.source) {
          done.push(`${idx} ${c.label} ⏭ skipped (target exists)`);
          counts.skipped++;
        } else {
          done.push(`${idx} ${c.label} ❌ failed: no source dir found`);
          counts.failed++;
        }
      } else {
        // uninstall: copy-type targets may carry user customizations; this
        // version never deletes them. Skipped (not a failure). No (X.Xs)
        // suffix — ⏭/ℹ lines are no-op decisions, not timed work.
        done.push(
          `${idx} ${c.label} ⏭ skipped (not uninstallable: copy targets may be user-edited)`,
        );
        counts.skipped++;
      }
    }

    // Phase 3 — check-type: probe CLI presence on install, skip on uninstall.
    for (const [name] of orderedCompanions()) {
      if (!sel.has(name)) continue;
      const c = COMPANIONS[name];
      if (c.type !== "check") continue;
      const idx = nextIndex();
      renderWidget(`${idx} ${c.label} …`);
      const t0 = Date.now();
      if (action === "install") {
        if (isCompanionInstalled(c)) {
          const dt = Date.now() - t0;
          done.push(`${idx} ${c.label} ✅ installed (${fmtElapsed(dt)})`);
          counts.installed++;
        } else {
          done.push(`${idx} ${c.label} ℹ hint: ${c.hint ?? "see package docs"}`);
          counts.skipped++;
        }
      } else {
        // uninstall: check entries describe external CLIs with no installed
        // artefact on disk — nothing to remove. Skipped (not a failure).
        // No (X.Xs) suffix — ⏭/ℹ lines are no-op decisions, not timed work.
        done.push(
          `${idx} ${c.label} ⏭ skipped (not uninstallable: check entries are CLI probes only)`,
        );
        counts.skipped++;
      }
    }

    const summary = `Done. ${verb}=${counts.installed} skipped=${counts.skipped} failed=${counts.failed} (total ${total})`;
    const header =
      source === "install-all"
        ? "install-all:"
        : source === "setup"
          ? "setup:"
          : "uninstall:";
    // Install copies new files into ~/.pi/agent and registers packages —
    // pi only re-reads that directory on /reload, so a separate hint is
    // required. Uninstall removes packages but never re-reads, so a
    // shorter "run /reload to apply" reminder is enough.
    const tail =
      action === "install"
        ? "Reload pi (/reload) to activate new extensions"
        : "run /reload to apply";
    ctx.ui.notify(
      `${header}\n${done.join("\n")}\n${summary}\n${tail}`,
      counts.failed > 0 ? "warning" : "info",
    );
  } finally {
    // Always clear the progress widget so it never gets stuck above the editor
    // when a phase throws synchronously (e.g. EPERM on mkdir during copy).
    // Reset the latch FIRST so a setWidget throw can never permanently jam
    // opInFlight and reject every subsequent companion op.
    opInFlight = null;
    try {
      ctx.ui.setWidget(EXT_OP_WIDGET_KEY, undefined);
    } catch {
      // best-effort widget teardown; never let it affect the main flow
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Feature: @agent syntax interception + autocomplete
// ═══════════════════════════════════════════════════════════════════

function getBuiltinAgentNames(): string[] {
  const dirs = [
    "/Users/fliu56/.pi/agent/npm/node_modules/@tintinweb/pi-subagents/agents",
    path.join(os.homedir(), ".pi/agent/agents"),
    path.join(os.homedir(), ".agents"),
  ];
  const names = new Set<string>();
  for (const dir of dirs) {
    try {
      for (const entry of fs.readdirSync(dir)) {
        if (entry.endsWith(".md")) names.add(entry.replace(".md", ""));
      }
    } catch {
      /* dir doesn't exist */
    }
  }
  return [...names].sort();
}

function registerAtAgent(pi: ExtensionAPI): void {
  pi.on("input", async (event, ctx) => {
    if (!state.atAgent) return { action: "continue" };
    const match = event.text.match(/^@(\w[\w-]*)\s*(.*)/);
    if (!match) return { action: "continue" };
    const agent = match[1];
    const task = match[2]?.trim();
    if (task) {
      return { action: "transform", text: `/run ${agent} "${task}"` };
    }
    ctx.ui.notify(`@${agent} — add a task after the agent name`, "info");
    return { action: "handled" };
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!state.atAgent) return;
    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: ["@"],
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const line = lines[cursorLine] ?? "";
        const beforeCursor = line.slice(0, cursorCol);
        const match = beforeCursor.match(/(?:^|[ \t])@([^\s@]*)$/);
        if (!match)
          return current.getSuggestions(lines, cursorLine, cursorCol, options);
        const prefix = match[1] ?? "";
        const agents = getBuiltinAgentNames();
        const filtered = agents.filter((a) =>
          a.startsWith(prefix.toLowerCase()),
        );
        return {
          prefix: `@${prefix}`,
          items: filtered.map((a) => ({
            value: `@${a}`,
            label: `@${a}`,
            description: `Run ${a} subagent`,
          })),
        };
      },
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        return current.applyCompletion(
          lines,
          cursorLine,
          cursorCol,
          item,
          prefix,
        );
      },
      shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
        return (
          current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ??
          true
        );
      },
    }));
  });
}

// ═══════════════════════════════════════════════════════════════════
// /ext command handler
// ═══════════════════════════════════════════════════════════════════

function registerExtCommand(pi: ExtensionAPI): void {
  pi.registerCommand("ext", {
    description:
      "Toggle at-agent, show status, or install/uninstall companion extensions (try '/ext help')",
    handler: async (args: string, ctx) => {
      const d = dispatchExt(args);

      if (d.kind === "help") {
        ctx.ui.notify(EXT_HELP_TEXT, "info");
        return;
      }

      if (d.kind === "error") {
        ctx.ui.notify(`${EXT_HELP_TEXT}\n\n${d.message}`, "error");
        return;
      }

      if (d.kind === "status") {
        const lines = [`at-agent: ${state.atAgent ? "\u2705" : "\u274c"}`];
        let currentGroup: CompanionGroup | "" = "";
        for (const [name, c] of orderedCompanions()) {
          if (c.group !== currentGroup) {
            currentGroup = c.group;
            lines.push(`${currentGroup}:`);
          }
          lines.push(
            `  ${isCompanionInstalled(c) ? "\u2705" : "\u274c"} ${name} (${companionDetail(c)})`,
          );
        }
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (d.kind === "setup") {
        await runCompanionOp(pi, ctx, d.names ?? [], {
          action: "install",
          source: "setup",
          interactive: true,
        });
        return;
      }

      if (d.kind === "install-all") {
        if (d.deprecatedAlias) {
          ctx.ui.notify(
            `'${d.deprecatedAlias}' is deprecated — use '/ext install-all'`,
            "warning",
          );
        }
        await runCompanionOp(pi, ctx, [], {
          action: "install",
          source: "install-all",
          interactive: false,
        });
        return;
      }

      if (d.kind === "uninstall") {
        const names = d.names ?? [];
        if (names.length > 0) {
          // Direct path: `pi remove` named items; copy/check are skipped by
          // the runner's per-type logic. Unknown names are surfaced by the
          // runner's up-front validation.
          await runCompanionOp(pi, ctx, names, {
            action: "uninstall",
            source: "uninstall",
            interactive: false,
          });
          return;
        }
        // Bare: picker of installed pi-type only. Fast-path when nothing is
        // installed so we don't bother the user with an empty picker.
        const installed = uninstallableCompanions();
        if (installed.length === 0) {
          ctx.ui.notify("No installed pi-type companions to uninstall", "info");
          return;
        }
        // Pre-guard before the picker: refuse the bare `/ext uninstall` UI
        // (and its filter cost) when another companion-op is already in
        // flight. The runner has its own opInFlight check, but the picker
        // path runs *before* the runner and would otherwise flash a UI
        // surface that's about to be rejected.
        if (opInFlight) {
          const cap = opInFlight === "install" ? "Install" : "Uninstall";
          ctx.ui.notify(`${cap} already in progress`, "warning");
          return;
        }
        const picked = await pickCompanions(ctx, { purpose: "uninstall" });
        if (picked === null) {
          ctx.ui.notify("Uninstall cancelled", "info");
          return;
        }
        if (picked.length === 0) {
          ctx.ui.notify(
            "No companions selected — nothing to uninstall",
            "warning",
          );
          return;
        }
        await runCompanionOp(pi, ctx, picked, {
          action: "uninstall",
          source: "uninstall",
          interactive: false,
        });
        return;
      }

      if (d.kind === "at-agent-on") {
        state.atAgent = true;
        ctx.ui.notify("at-agent enabled", "info");
        return;
      }

      if (d.kind === "at-agent-off") {
        state.atAgent = false;
        ctx.ui.notify("at-agent disabled", "warning");
        return;
      }

      if (d.kind === "at-agent-toggle") {
        state.atAgent = !state.atAgent;
        ctx.ui.notify(
          `at-agent ${state.atAgent ? "enabled" : "disabled"}`,
          state.atAgent ? "info" : "warning",
        );
        return;
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// /init + /architect — skill shortcuts
// Forward to /skill:init and /skill:architect via sendUserMessage,
// so users get bare slash commands instead of /skill:<name>.
// ═══════════════════════════════════════════════════════════════════

function registerSkillShortcuts(pi: ExtensionAPI): void {
  const forward =
    (skill: string) =>
    async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
      const trimmed = args?.trim() ?? "";
      ctx.ui.notify(
        `Launching /skill:${skill}${trimmed ? ` — ${trimmed}` : ""}`,
        "info",
      );
      await pi.sendUserMessage(
        `/skill:${skill}${trimmed ? ` ${trimmed}` : ""}`,
      );
    };

  pi.registerCommand("init", {
    description: "Generate or update the root AGENTS.md (incremental merge)",
    handler: forward("init"),
  });

  pi.registerCommand("init-deep", {
    description:
      "Generate .architect/**/architecture.md shadow tree (per-layer guidance)",
    handler: forward("init-deep"),
  });
}

// ═══════════════════════════════════════════════════════════════════
// /think command handler - cycle through thinking levels
// ═══════════════════════════════════════════════════════════════════

const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

type ThinkingLevel = (typeof THINKING_LEVELS)[number];

function registerThinkCommand(pi: ExtensionAPI): void {
  pi.registerCommand("think", {
    description: "Cycle or set thinking level",
    handler: async (args: string, ctx) => {
      const trimmed = args?.trim() || "";

      // If a specific level is provided, set it
      if (trimmed) {
        const level = trimmed.toLowerCase() as ThinkingLevel;
        if (THINKING_LEVELS.includes(level)) {
          pi.setThinkingLevel(level);
          ctx.ui.notify(`Thinking level: ${level}`, "info");
        } else {
          ctx.ui.notify(
            `Invalid level: ${trimmed}. Available: ${THINKING_LEVELS.join(", ")}`,
            "error",
          );
        }
        return;
      }

      // Cycle to next level
      const current = pi.getThinkingLevel();
      const currentIndex = THINKING_LEVELS.indexOf(current as ThinkingLevel);
      const nextIndex = (currentIndex + 1) % THINKING_LEVELS.length;
      const nextLevel = THINKING_LEVELS[nextIndex];

      pi.setThinkingLevel(nextLevel);
      ctx.ui.notify(`Thinking level: ${nextLevel}`, "info");
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// pi-turbo startup stats — bordered notice in the chat area at boot.
// Reads ~/.pi-turbo/timings.json; skips silently if pi-turbo isn't
// installed or didn't run this session (no error, no output).
// ═══════════════════════════════════════════════════════════════════

const TURBO_TIMINGS_FILE = path.join(os.homedir(), ".pi-turbo", "timings.json");
const TURBO_FRESHNESS_MS = 120_000; // generous window for slow boots

interface TurboStatsData {
  extensions: number;
  loadMs: number;
  emaMs: number;
  savedMs?: number;
  pct?: number;
}

interface TurboTimingsFile {
  history?: Array<{ ts?: string; n?: number; ms?: number }>;
  ema?: number;
}

/** Read the most recent pi-turbo run if it's fresh (i.e. pi-turbo ran this boot). */
function readLastTurboRun(): TurboStatsData | null {
  try {
    if (!existsSync(TURBO_TIMINGS_FILE)) return null;
    const data = JSON.parse(
      readFileSync(TURBO_TIMINGS_FILE, "utf8"),
    ) as TurboTimingsFile;
    const history = Array.isArray(data?.history) ? data.history : [];
    const last = history[history.length - 1];
    if (!last?.ts) return null;
    const ts = Date.parse(last.ts);
    if (!Number.isFinite(ts) || Date.now() - ts > TURBO_FRESHNESS_MS)
      return null;
    const extensions = Number(last.n) || 0;
    const loadMs = Number(last.ms) || 0;
    if (extensions === 0 || loadMs === 0) return null;
    return {
      extensions,
      loadMs,
      emaMs: Number(data.ema) || loadMs,
      ...readTurboSaved(),
    };
  } catch {
    return null; // missing/unreadable/corrupt → skip silently
  }
}

const TURBO_LAST_RUN_FILE = path.join(
  os.homedir(),
  ".pi-turbo",
  "last-run.json",
);

/** Read this boot's acceleration stats (saved ms + %) from last-run.json. */
function readTurboSaved(): { savedMs: number; pct: number } {
  try {
    if (!existsSync(TURBO_LAST_RUN_FILE)) return { savedMs: 0, pct: 0 };
    const data = JSON.parse(readFileSync(TURBO_LAST_RUN_FILE, "utf8")) as {
      ts?: string;
      savedMs?: number;
      pct?: number;
      profiling?: boolean;
      serial?: boolean;
    };
    if (!data?.ts) return { savedMs: 0, pct: 0 };
    const ts = Date.parse(data.ts);
    if (!Number.isFinite(ts) || Date.now() - ts > TURBO_FRESHNESS_MS)
      return { savedMs: 0, pct: 0 };
    const savedMs = Number(data.savedMs) || 0;
    if (data.profiling || data.serial || savedMs <= 0)
      return { savedMs: 0, pct: 0 };
    return { savedMs, pct: Number(data.pct) || 0 };
  } catch {
    return { savedMs: 0, pct: 0 }; // missing/unreadable/corrupt → no saved stats
  }
}

function registerPiTurboStats(pi: ExtensionAPI): void {
  pi.registerEntryRenderer<TurboStatsData>(
    "pi-turbo-stats",
    (entry, _opts, theme) => {
      const d = entry.data;
      if (!d) return undefined;
      const box = new Container();
      box.addChild(new DynamicBorder((t) => theme.fg("accent", t)));
      const body =
        `${theme.bold(theme.fg("accent", "⚡ pi-turbo"))}\n` +
        `${theme.fg("muted", `${d.extensions} extensions loaded in `)}${d.loadMs}ms` +
        `${theme.fg("muted", ` · EMA ${d.emaMs}ms`)}` +
        (d.savedMs
          ? `${theme.fg("muted", ` · saved `)}${d.savedMs}ms (${d.pct ?? 0}%)`
          : "");
      box.addChild(new Text(body, 1, 0));
      box.addChild(new DynamicBorder((t) => theme.fg("accent", t)));
      return box;
    },
  );

  pi.on("session_start", (event) => {
    if (event.reason !== "startup") return;
    const stats = readLastTurboRun();
    if (!stats) return; // pi-turbo absent/inactive/stale → skip silently
    pi.appendEntry<TurboStatsData>("pi-turbo-stats", stats);
  });
}

// ═══════════════════════════════════════════════════════════════════
// Default export
// ═══════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI): void {
  registerAtAgent(pi);
  registerThinkCommand(pi);
  registerExtCommand(pi);
  registerSkillShortcuts(pi);
  registerPiTurboStats(pi);
}
