// Smoke test: load index.ts via jiti (same loader pi uses) and verify:
//   1. The default export is a factory function (ExtensionAPI → void).
//   2. dispatchExt routes subcommands correctly:
//        - bare /ext and '/ext help' are equivalent (both → help)
//        - '/ext all' triggers the deprecated-alias flag
//        - '/ext list' and '/ext ls' route to the same kind as '/ext status'
//        - at-agent family: 'on'/'off' + 'at-agent on'/'at-agent off'/bare
//        - '/ext uninstall' (bare) routes to the uninstall kind, no names
//        - '/ext uninstall <name>...' carries the names through dispatch
//          (copy/check types are routed the same way; the runner skips them)
//        - unknown subcommands return an error result (no crash)
//        - undefined/null args don't crash and don't route to error
//   3. EXT_HELP_TEXT is a non-empty string mentioning every subcommand.
// No pi runtime required at load time.
const path = require("node:path");
const { createJiti } = require("jiti");

const assert = (cond, msg) => {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`);
};

(async () => {
  const jiti = createJiti(__filename, { interopDefault: true });
  const mod = await jiti.import(path.join(__dirname, "index.ts"));

  // 1. Default export shape.
  assert(
    typeof mod.default === "function",
    `default export is not a function, got ${typeof mod.default}`,
  );
  assert(
    mod.default.length === 1,
    `factory should take 1 arg (pi), got ${mod.default.length}`,
  );
  console.log(
    `SMOKE OK: default export is a function (arity ${mod.default.length})`,
  );

  // 2. dispatchExt routing.
  assert(
    typeof mod.dispatchExt === "function",
    `dispatchExt should be exported as a function`,
  );

  // bare /ext and '/ext help' are equivalent.
  const bare = mod.dispatchExt("");
  const help = mod.dispatchExt("help");
  assert(
    bare.kind === "help" && help.kind === "help",
    `bare /ext and '/ext help' should both route to help, got bare=${bare.kind} help=${help.kind}`,
  );
  console.log(`SMOKE OK: bare /ext and '/ext help' route to help`);

  // '/ext all' carries the deprecated alias flag.
  const allRes = mod.dispatchExt("all");
  assert(
    allRes.kind === "install-all" && allRes.deprecatedAlias === "all",
    `'/ext all' should yield install-all + deprecatedAlias='all', got ${JSON.stringify(allRes)}`,
  );
  // '/ext install-all' is the canonical name (no deprecatedAlias).
  const installAllRes = mod.dispatchExt("install-all");
  assert(
    installAllRes.kind === "install-all" && !installAllRes.deprecatedAlias,
    `'/ext install-all' should yield install-all without deprecatedAlias, got ${JSON.stringify(installAllRes)}`,
  );
  console.log(`SMOKE OK: '/ext all' is deprecated alias for '/ext install-all'`);

  // '/ext list' and '/ext ls' route to the same kind as '/ext status'.
  const statusRes = mod.dispatchExt("status");
  const listRes = mod.dispatchExt("list");
  const lsRes = mod.dispatchExt("ls");
  assert(
    statusRes.kind === "status" &&
      listRes.kind === "status" &&
      lsRes.kind === "status",
    `status/list/ls should all route to status, got status=${statusRes.kind} list=${listRes.kind} ls=${lsRes.kind}`,
  );
  console.log(`SMOKE OK: '/ext status', '/ext list', '/ext ls' all route to status`);

  // at-agent family: every form routes correctly.
  const atOn = mod.dispatchExt("on");
  const atOff = mod.dispatchExt("off");
  const atAliasOn = mod.dispatchExt("at-agent on");
  const atAliasOff = mod.dispatchExt("at-agent off");
  const atBare = mod.dispatchExt("at-agent");
  const atAliasUnderscoreOn = mod.dispatchExt("at_agent on");
  const atAliasConcatToggle = mod.dispatchExt("atagent");
  assert(
    atOn.kind === "at-agent-on" &&
      atOff.kind === "at-agent-off" &&
      atAliasOn.kind === "at-agent-on" &&
      atAliasOff.kind === "at-agent-off" &&
      atBare.kind === "at-agent-toggle" &&
      atAliasUnderscoreOn.kind === "at-agent-on" &&
      atAliasConcatToggle.kind === "at-agent-toggle",
    `at-agent family should route consistently, got on=${atOn.kind} off=${atOff.kind} at-agent on=${atAliasOn.kind} at-agent off=${atAliasOff.kind} at-agent=${atBare.kind} at_agent on=${atAliasUnderscoreOn.kind} atagent=${atAliasConcatToggle.kind}`,
  );
  console.log(
    `SMOKE OK: at-agent family (on/off/at-agent on/off/bare + aliases) routes correctly`,
  );

  // /ext uninstall — bare form routes to the uninstall kind with no names.
  const uninstallBare = mod.dispatchExt("uninstall");
  assert(
    uninstallBare.kind === "uninstall" &&
      Array.isArray(uninstallBare.names) &&
      uninstallBare.names.length === 0,
    `bare '/ext uninstall' should route to uninstall with empty names, got ${JSON.stringify(uninstallBare)}`,
  );

  // /ext uninstall <name>... — names pass through dispatch unchanged. We use
  // a mix of pi-type (sidebar/footbar) and copy-type (agents) to confirm the
  // dispatch layer is type-agnostic — the runner is what filters / skips.
  const uninstallNamed = mod.dispatchExt("uninstall sidebar footbar");
  assert(
    uninstallNamed.kind === "uninstall" &&
      Array.isArray(uninstallNamed.names) &&
      uninstallNamed.names.length === 2 &&
      uninstallNamed.names[0] === "sidebar" &&
      uninstallNamed.names[1] === "footbar",
    `'/ext uninstall sidebar footbar' should route to uninstall with names=['sidebar','footbar'], got ${JSON.stringify(uninstallNamed)}`,
  );

  const uninstallCopy = mod.dispatchExt("uninstall agents");
  assert(
    uninstallCopy.kind === "uninstall" &&
      Array.isArray(uninstallCopy.names) &&
      uninstallCopy.names.length === 1 &&
      uninstallCopy.names[0] === "agents",
    `'/ext uninstall agents' (copy type) should still route to uninstall — dispatch is type-agnostic, the runner decides what to skip. got ${JSON.stringify(uninstallCopy)}`,
  );

  console.log(
    `SMOKE OK: '/ext uninstall' (bare + named + copy-type) routes to uninstall kind`,
  );

  // Unknown subcommand returns an error result (no crash, no undefined).
  const bogus = mod.dispatchExt("bogus");
  assert(
    bogus.kind === "error" &&
      typeof bogus.message === "string" &&
      bogus.message.includes("bogus"),
    `unknown subcommand should yield error with helpful message, got ${JSON.stringify(bogus)}`,
  );
  console.log(`SMOKE OK: unknown subcommand yields error (no crash)`);

  // undefined / null args must not throw and must not be classified as an
  // error (treated as bare /ext → help).
  let undefRes, nullRes;
  try {
    undefRes = mod.dispatchExt(undefined);
  } catch (e) {
    throw new Error(`dispatchExt(undefined) threw: ${e.message}`);
  }
  try {
    nullRes = mod.dispatchExt(null);
  } catch (e) {
    throw new Error(`dispatchExt(null) threw: ${e.message}`);
  }
  assert(
    undefRes && nullRes && undefRes.kind === "help" && nullRes.kind === "help",
    `dispatchExt(undefined/null) should be a safe no-op (→ help), got undefined=${JSON.stringify(undefRes)} null=${JSON.stringify(nullRes)}`,
  );
  console.log(`SMOKE OK: dispatchExt(undefined/null) → help (no throw, no error route)`);

  // 3. Help text mentions every subcommand.
  assert(
    typeof mod.EXT_HELP_TEXT === "string" && mod.EXT_HELP_TEXT.length > 0,
    "EXT_HELP_TEXT should be a non-empty string",
  );
  for (const kw of [
    "help",
    "status",
    "list",
    "ls",
    "install-all",
    "setup",
    "uninstall",
    "on",
    "off",
    "at-agent",
  ]) {
    assert(
      mod.EXT_HELP_TEXT.includes(kw),
      `EXT_HELP_TEXT should mention "${kw}"`,
    );
  }
  console.log(`SMOKE OK: EXT_HELP_TEXT mentions every subcommand`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
