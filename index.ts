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
 *   /ext                — toggle at-agent on/off
 *   /ext status         — at-agent state + companion install status (grouped by aiwayds / rpiv / ecosystem)
 *   /ext all            — one-shot: install every missing pi-type, sync copy-type, probe check-type
 *   /ext setup          — interactive picker (all selected by default, grouped) → run chosen companions
 *   /ext setup <name>   — run one companion (pi install / copy sync / check probe)
 *   /think              — cycle/set thinking level
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

/** Detail suffix for picker/status rows: pi-type shows the npm pkg, others show the action type. */
function companionDetail(c: Companion): string {
  return c.type === "pi" ? c.pkg : `[${c.type}]`;
}

/**
 * Copy companion agent files (fun-agent's agents/) into ~/.pi/agent/agents/.
 * Probes copyFrom in order (first existing dir wins). A file is copied only
 * when the target does NOT already exist — local customizations (e.g. a tuned
 * oldfox.md) are never overwritten. Returns copy statistics.
 */
async function syncAgents(
  c: Companion,
  ctx: ExtensionContext,
): Promise<{ copied: number; skipped: number; source?: string }> {
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
  fs.mkdirSync(target, { recursive: true });
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
 * Checkbox list for /ext setup: all companions checked by default,
 * space toggles a row, enter installs the checked ones, esc cancels.
 */
class CompanionPicker {
  private items: PickerItem[];
  private checked = new Set<string>();
  private cursor = 0;
  private cache?: { width: number; lines: string[] };

  public onDone?: (names: string[]) => void;
  public onCancel?: () => void;

  constructor(items: PickerItem[]) {
    this.items = items;
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
      theme.bold(
        truncateToWidth(
          "Install companions — space: toggle · a: all/none · enter: install · esc: cancel",
          width,
        ),
      ),
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

async function pickCompanions(ctx: ExtensionContext): Promise<string[] | null> {
  const items: PickerItem[] = orderedCompanions().map(([name, c]) => ({
    name,
    label: `${c.label} (${companionDetail(c)})`,
    installed: isCompanionInstalled(c),
  }));
  return ctx.ui.custom<string[] | null>((tui, theme, _keybindings, done) => {
    const picker = new CompanionPicker(items);
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

async function runSetup(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  names: string[],
  opts: { interactive?: boolean } = {},
): Promise<void> {
  const interactive = opts.interactive ?? true;
  const hasNames = names.length > 0;
  const targets0 = hasNames ? names : orderedCompanions().map(([n]) => n);
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
    const picked = await pickCompanions(ctx);
    if (picked === null) {
      ctx.ui.notify("Setup cancelled", "info");
      return;
    }
    targets = picked;
    if (targets.length === 0) {
      ctx.ui.notify("No companions selected — nothing to install", "warning");
      return;
    }
  }
  const results: string[] = [];
  const sel = new Set(targets);
  const groupTag = (g: CompanionGroup) => `[${g}]`;
  // Phase 1 — install every selected pi-type companion (existing logic).
  // Run first so copy-type items (which need fun-agent's agents on disk) work.
  for (const [name] of orderedCompanions()) {
    const c = COMPANIONS[name];
    if (!sel.has(name) || c.type !== "pi") continue;
    if (isCompanionInstalled(c)) {
      results.push(`  ${groupTag(c.group)} ✅ ${c.label}: already installed`);
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
      results.push(
        code === 0
          ? `  ${groupTag(c.group)} ✅ ${c.label}: installed (${c.source})`
          : `  ${groupTag(c.group)} ❌ ${c.label}: pi install exited ${code}`,
      );
    } catch (e) {
      results.push(
        `  ${groupTag(c.group)} ❌ ${c.label}: FAILED — ${(e as Error).message}`,
      );
    }
  }
  // Phase 2 — copy-type: sync fun-agent agents (idempotent, skips existing files).
  for (const [name] of orderedCompanions()) {
    const c = COMPANIONS[name];
    if (!sel.has(name) || c.type !== "copy") continue;
    const r = await syncAgents(c, ctx);
    if (r.source) {
      results.push(
        `  ${groupTag(c.group)} ${r.copied > 0 ? "✅" : "ℹ️"} ${c.label}: synced (copied ${r.copied}, skipped ${r.skipped})`,
      );
    } else {
      results.push(`  ${groupTag(c.group)} ❌ ${c.label}: no source dir found`);
    }
  }
  // Phase 3 — check-type: probe CLI presence; only report a hint, never install.
  for (const [name] of orderedCompanions()) {
    const c = COMPANIONS[name];
    if (!sel.has(name) || c.type !== "check") continue;
    if (isCompanionInstalled(c)) {
      results.push(`  ${groupTag(c.group)} ✅ ${c.label}: found`);
    } else {
      results.push(
        `  ${groupTag(c.group)} ❌ ${c.label}: missing — install: ${c.hint ?? "see package docs"}`,
      );
    }
  }
  ctx.ui.notify(
    `Setup:\n${results.join("\n")}\nReload pi (/reload) to activate new extensions`,
    "info",
  );
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
      "Toggle at-agent, show status, or install companion extensions (setup)",
    handler: async (args: string, ctx) => {
      const trimmed = args?.trim() || "";
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0];

      if (cmd === "status") {
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

      if (cmd === "setup") {
        await runSetup(pi, ctx, parts.slice(1));
        return;
      }

      if (cmd === "all") {
        // One-shot family install: every missing companion, no picker, no prompts.
        await runSetup(pi, ctx, [], { interactive: false });
        return;
      }

      if (cmd === "on") {
        state.atAgent = true;
        ctx.ui.notify("at-agent enabled", "info");
        return;
      }

      if (cmd === "off") {
        state.atAgent = false;
        ctx.ui.notify("at-agent disabled", "warning");
        return;
      }

      if (AT_AGENT_ALIASES.has(cmd)) {
        const action = parts[1];
        if (action === "on") {
          state.atAgent = true;
          ctx.ui.notify("at-agent enabled", "info");
        } else if (action === "off") {
          state.atAgent = false;
          ctx.ui.notify("at-agent disabled", "warning");
        } else {
          state.atAgent = !state.atAgent;
          ctx.ui.notify(
            `at-agent ${state.atAgent ? "enabled" : "disabled"}`,
            state.atAgent ? "info" : "warning",
          );
        }
        return;
      }

      // bare /ext toggles at-agent
      state.atAgent = !state.atAgent;
      ctx.ui.notify(
        `at-agent ${state.atAgent ? "enabled" : "disabled"}`,
        state.atAgent ? "info" : "warning",
      );
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
