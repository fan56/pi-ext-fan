#!/usr/bin/env node
/**
 * Collision check for pi-ext-fan's COMPANIONS table.
 *
 * Validates the basename / short-form ("pi-" stripped) detection logic used by
 * isCompanionInstalled():
 *   1. Within COMPANIONS — no two entries may share the same base or short
 *      (exact collisions = FAIL). Substring overlaps between entries are
 *      reported as informational (benign when the colliding entry is not a
 *      detection-active pi-type package registered in settings.json).
 *   2. Against ~/.pi/agent/settings.json — no third-party registration may be
 *      caught by any companion's base/short (false-positive detection = FAIL),
 *      and no registration may be owned by more than one companion (FAIL).
 *   3. Per-companion detection simulation mirrors isCompanionInstalled.
 *
 * Mirrors the COMPANIONS table in index.ts. Update this list when that table
 * changes. Not shipped in the published tarball ("files" in package.json).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// name → { pkg, type } — exact mirror of index.ts COMPANIONS.
const COMPANIONS = {
  // aiwayds group (9) — pi
  sidebar: { pkg: "@aiwayds/pi-sidebar-panel", type: "pi" },
  footbar: { pkg: "@aiwayds/pi-powerline-footer", type: "pi" },
  cron: { pkg: "@aiwayds/pi-kimi-cron", type: "pi" },
  "think-panel": { pkg: "@aiwayds/pi-think-panel", type: "pi" },
  bailian: { pkg: "@aiwayds/pi-bailian-token-plan", type: "pi" },
  jarvis: { pkg: "@aiwayds/pi-jarvis-sphere", type: "pi" },
  "model-favs": { pkg: "@aiwayds/pi-model-favorites", type: "pi" },
  "topic-memory": { pkg: "@aiwayds/pi-topic-memory", type: "pi" },
  "fun-agent": { pkg: "@aiwayds/pi-fun-agent", type: "pi" },
  // rpiv group (9) — pi
  "rpiv-pi": { pkg: "@juicesharp/rpiv-pi", type: "pi" },
  "rpiv-workflow": { pkg: "@juicesharp/rpiv-workflow", type: "pi" },
  "rpiv-ask-user-question": { pkg: "@juicesharp/rpiv-ask-user-question", type: "pi" },
  "rpiv-todo": { pkg: "@juicesharp/rpiv-todo", type: "pi" },
  "rpiv-advisor": { pkg: "@juicesharp/rpiv-advisor", type: "pi" },
  "rpiv-i18n": { pkg: "@juicesharp/rpiv-i18n", type: "pi" },
  "rpiv-web-tools": { pkg: "@juicesharp/rpiv-web-tools", type: "pi" },
  "rpiv-args": { pkg: "@juicesharp/rpiv-args", type: "pi" },
  "rpiv-btw": { pkg: "@juicesharp/rpiv-btw", type: "pi" },
  // ecosystem group (4)
  "lean-ctx": { pkg: "pi-lean-ctx", type: "pi" },
  "lean-ctx-cli": { pkg: "lean-ctx-cli", type: "check" },
  agents: { pkg: "agents", type: "copy" },
  "pi-subagents": { pkg: "@tintinweb/pi-subagents", type: "pi" },
};

const base = (pkg) => pkg.split("/").pop();
const short = (pkg) => base(pkg).replace(/^pi-/, "");
const DETECT_ACTIVE = (c) => c.type === "pi"; // only pi-type uses pkg/base/short detection

let settings;
try {
  settings = JSON.parse(
    readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf8"),
  );
} catch (e) {
  console.error(`Cannot read/parse ~/.pi/agent/settings.json: ${e.message}`);
  process.exit(2);
}
const REGS = settings.packages;

let fail = 0;

function reportFail(msg) {
  fail++;
  console.log(`  \u274c FAIL: ${msg}`);
}
function reportInfo(msg) {
  console.log(`  \u2139\ufe0f info: ${msg}`);
}
function reportOk(msg) {
  console.log(`  \u2705 ${msg}`);
}

console.log("=== 1. Within-COMPANIONS exact collisions (base/short identity) ===");
const names = Object.keys(COMPANIONS);
const seen = new Map(); // key(base|short|base$short) -> name
let withinFail = 0;
for (const n of names) {
  const { pkg } = COMPANIONS[n];
  const b = base(pkg);
  const s = short(pkg);
  for (const [kind, v] of [
    ["base", b],
    ["short", s],
  ]) {
    if (seen.has(`${kind}:${v}`)) {
      withinFail++;
      reportFail(`${kind} "${v}" of "${n}" collides with "${seen.get(`${kind}:${v}`)}"`);
    } else {
      seen.set(`${kind}:${v}`, n);
    }
  }
}
if (withinFail === 0) reportOk(`no duplicate base/short across ${names.length} companions`);

// cross: one entry's base equals another entry's short (and vice versa)
console.log("=== 2. Within-COMPANIONS cross base<->short ===");
let crossFail = 0;
for (const a of names) {
  for (const b of names) {
    if (a === b) continue;
    const A = COMPANIONS[a].pkg;
    const B = COMPANIONS[b].pkg;
    if (base(A) === short(B) || short(A) === base(B)) {
      crossFail++;
      reportFail(`"${a}" (${base(A)}/${short(A)}) collides cross-wise with "${b}" (${base(B)}/${short(B)})`);
    }
  }
}
if (crossFail === 0) reportOk("no cross base<->short collisions between companions");

console.log("=== 3. Within-COMPANIONS substring overlaps (informational) ===");
for (const a of names) {
  for (const b of names) {
    if (a === b) continue;
    const A = COMPANIONS[a];
    const B = COMPANIONS[b];
    if (short(A.pkg).length >= 3 && short(A.pkg) !== short(B.pkg) && short(A.pkg).length < short(B.pkg).length) {
      if (base(B.pkg).includes(short(A.pkg)) || short(B.pkg).includes(short(A.pkg))) {
        reportInfo(
          `short "${short(A.pkg)}" (${a}) is a substring of "${b}" (${base(B.pkg)}) — benign if "${b}" is not a detection-active registered pi package`,
        );
      }
    }
  }
}

console.log("=== 4. Registration ownership (settings.json) ===");
// For each registration, find which companions' detection would catch it.
const owners = new Map(); // reg -> [names]
for (const reg of REGS) {
  const caught = names.filter((n) => {
    const c = COMPANIONS[n];
    if (!DETECT_ACTIVE(c)) return false;
    const pkg = c.pkg;
    return reg.includes(pkg) || reg.includes(base(pkg)) || reg.includes(short(pkg));
  });
  owners.set(reg, caught);
  if (caught.length > 1) reportFail(`registration "${reg}" caught by ${caught.length} companions: ${caught.join(", ")}`);
  if (caught.length === 0) reportInfo(`registration "${reg}" matches no companion (third-party — must stay unmatched)`);
}

// Every pi-type companion must be caught by exactly the registrations that
// correspond to it. Report any detection-active companion with no owner.
console.log("=== 5. Per-companion detection (simulates isCompanionInstalled) ===");
for (const n of names) {
  const c = COMPANIONS[n];
  if (!DETECT_ACTIVE(c)) {
    console.log(`  \u23f9 ${n} (${c.type}) — pkg detection not used (skipped)`);
    continue;
  }
  const own = REGS.filter((r) => owners.get(r)?.includes(n));
  if (own.length === 0) {
    reportInfo(`${n} (${c.pkg}): no settings.json registration detected — NOT installed`);
  } else {
    reportOk(`${n} (${c.pkg}): installed via ${own.length} registration(s)`);
  }
}

// Explicit spot-checks called out in the design.
console.log("=== 6. Spot checks ===");
{
  const rpivPiShort = short(COMPANIONS["rpiv-pi"].pkg); // "rpiv-pi" (no ^pi- prefix)
  const others = names.filter((n) => n !== "rpiv-pi");
  const bad = others.filter(
    (n) => base(COMPANIONS[n].pkg).includes(rpivPiShort) || short(COMPANIONS[n].pkg).includes(rpivPiShort),
  );
  if (bad.length === 0) {
    reportOk(`rpiv-pi short "${rpivPiShort}" does not match any other rpiv/ecosystem companion`);
  } else {
    reportFail(`rpiv-pi short "${rpivPiShort}" matches: ${bad.join(", ")}`);
  }
  const thirdPartyHits = REGS.filter(
    (r) =>
      !names.some((n) => DETECT_ACTIVE(COMPANIONS[n]) && owners.get(r)?.includes(n)) &&
      names.some((n) => DETECT_ACTIVE(COMPANIONS[n]) && (r.includes(short(COMPANIONS[n].pkg)) || r.includes(base(COMPANIONS[n].pkg)))),
  );
  if (thirdPartyHits.length === 0) {
    reportOk("no third-party registration is caught by any companion short/base (0 false positives)");
  } else {
    reportFail(`third-party false positives: ${thirdPartyHits.join(", ")}`);
  }
}

console.log("");
console.log(fail === 0 ? "COLLISION CHECK: \u2705 PASS (0 failures)" : `COLLISION CHECK: \u274c FAIL (${fail} failures)`);
process.exit(fail === 0 ? 0 : 1);
