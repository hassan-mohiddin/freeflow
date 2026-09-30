// Retired v2 Tool Execution settings tests, moved from pi-extension/tests/integration/pi-extension.test.js
// at commit 2409625 (D-024). They rely on that file's helpers and imports and are not runnable on their own.

test("Pi settings and status disclose capture retention and verified reader availability", async () => {
  const cwd = await configuredRepo({
    toolExecution: {
      enabled: true,
      capture: { enabled: true },
      accounting: { enabled: true },
    },
  });
  try {
    const { commands } = loadExtension(freeflowExtension, {
      appendEntry() {},
      async setModel() {
        return true;
      },
      setThinkingLevel() {},
    });
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.ui.custom = async (factory) => {
      const component = factory({ requestRender() {} }, testTheme, {}, () => {});
      assert.match(
        renderText(component, 180),
        /Tool Execution\s+enabled \(8\) capture active · programs off · workspace inactive · discovery inactive · adapters 0 allowed · accounting active/,
      );
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      const detail = renderText(component);
      assert.match(detail, /Capture new Bash text results/);
      assert.match(detail, /Disabling new capture retains sidecar files/);
      return undefined;
    };
    await command.definition.handler("settings repo", settingsCtx);

    const statusCtx = context(cwd);
    await command.definition.handler("status", statusCtx);
    assert.match(statusCtx.notifications.at(-1).message, /verified reader enabled/);
    assert.match(statusCtx.notifications.at(-1).message, /native Bash is built in, custom tools require adapters/);
    assert.match(statusCtx.notifications.at(-1).message, /captured files are retained until explicit deletion/);

    const issueCtx = context(cwd);
    await handleFreeflowCommand("status", issueCtx, async () => {}, {}, undefined, {
      status: () => ({
        queued: 0,
        failures: [
          {
            code: "storage_busy",
            message: "Native output retained; remove stale .capture-reservation only when no process is active.",
          },
        ],
      }),
    });
    assert.match(issueCtx.notifications.at(-1).message, /latest capture issue storage_busy/);
    assert.match(issueCtx.notifications.at(-1).message, /remove stale \.capture-reservation/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Pi settings expose every supported Tool Execution control in grouped local and repository views", async () => {
  const cwd = await configuredRepo({
    toolExecution: {
      enabled: true,
      capture: { enabled: true },
      workspace: { enabled: true },
      discovery: { enabled: true },
      accounting: { enabled: true },
    },
  });
  try {
    const { commands } = loadExtension();
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);

    const renderGroup = async (group) => {
      let rendered = "";
      settingsCtx.ui.custom = async (factory) => {
        const component = factory({ requestRender() {} }, testTheme, {}, () => {});
        component.handleInput("Tool Execution");
        component.handleInput("\r");
        if (group) {
          component.handleInput(group);
          component.handleInput("\r");
        }
        rendered = renderText(component, 180);
        return undefined;
      };
      await command.definition.handler("settings local", settingsCtx);
      return rendered;
    };

    const overview = await renderGroup();
    assert.match(overview, /Configuration preset/);
    assert.match(overview, /Capture and recovery/);
    assert.match(overview, /Programs/);
    assert.match(overview, /Workspace/);
    assert.match(overview, /Operation discovery/);
    assert.match(overview, /Cooperating adapters/);
    assert.match(overview, /Accounting observations/);

    const capture = await renderGroup("Capture and recovery");
    assert.match(capture, /Capture new Bash text results/);
    assert.match(capture, /Inline result budget/);
    assert.match(capture, /Maximum captured result/);

    const programs = await renderGroup("Programs");
    assert.match(programs, /Program mode/);
    assert.match(programs, /Program timeout/);
    assert.match(programs, /Parallel program reads/);

    const workspace = await renderGroup("Workspace");
    assert.match(workspace, /Local workspace reads/);
    assert.match(workspace, /Exact workspace replacement/);
    assert.match(workspace, /Workspace root/);
    assert.match(workspace, /Denied workspace paths/);

    const adapters = await renderGroup("Cooperating adapters");
    assert.match(adapters, /Allowed cooperating adapters/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("Tool Execution presets atomically configure full and read-only local modes while preserving advanced leaves", async () => {
  const repository = {
    toolExecution: {
      capture: { maxStoredBytes: 16_777_216 },
      programs: { timeoutMs: 5000, maxParallelReads: 2 },
      workspace: { root: "workspace-root", denyPaths: [".git", "private"] },
      adapters: { allow: ["fixture.records"] },
    },
  };
  const local = { toolExecution: { capture: { maxInlineBytes: 2048 } } };
  const cwd = await configuredRepo(repository);
  const localPath = join(cwd, ".freeflow/local.json");
  await writeFile(localPath, JSON.stringify(local, null, 2), "utf8");
  try {
    const { commands } = loadExtension();
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    let confirmations = 0;
    settingsCtx.ui.confirm = async () => {
      confirmations += 1;
      return true;
    };

    const choosePreset = async (down) => {
      let rendered = "";
      settingsCtx.ui.custom = async (factory) => {
        let result;
        const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
          result = value;
        });
        component.handleInput("Tool Execution");
        component.handleInput("\r");
        component.handleInput("Configuration preset");
        component.handleInput("\r");
        for (let index = 0; index < down; index += 1) component.handleInput("\u001b[B");
        component.handleInput("\r");
        await component.waitForWrites();
        rendered = renderText(component, 180);
        component.handleInput("\u001b");
        component.handleInput("\u001b");
        return result;
      };
      await command.definition.handler("settings local", settingsCtx);
      return rendered;
    };

    const fullPresetView = await choosePreset(2);
    assert.match(fullPresetView, /Programs\s+enabled \(3\) adapters/);
    assert.match(fullPresetView, /Workspace\s+enabled \(4\) reads active · writes enabled/);
    let saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.toolExecution.enabled, true);
    assert.equal(saved.toolExecution.capture.enabled, true);
    assert.equal(saved.toolExecution.capture.maxInlineBytes, 2048);
    assert.equal(saved.toolExecution.programs.mode, "adapters");
    assert.equal(saved.toolExecution.workspace.enabled, true);
    assert.equal(saved.toolExecution.workspace.write, true);
    assert.equal(saved.toolExecution.discovery.enabled, true);
    assert.equal(saved.toolExecution.accounting.enabled, true);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")), repository);

    await choosePreset(1);
    saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.toolExecution.programs.mode, "adapters");
    assert.equal(saved.toolExecution.workspace.write, false);
    assert.equal(saved.toolExecution.capture.maxInlineBytes, 2048);
    assert.equal(confirmations, 1, "only the full-local preset requires write confirmation");
    assert.equal(settingsCtx.reloads.length, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("personal Tool Execution settings enable adapters and confirmed writes without erasing other leaves", async () => {
  const repository = {
    toolExecution: {
      enabled: true,
      capture: { enabled: true, maxInlineBytes: 4096 },
      programs: { mode: "reduction", timeoutMs: 5000, maxParallelReads: 2 },
      workspace: { enabled: true, write: false, denyPaths: [".git", "private"] },
      discovery: { enabled: true },
      accounting: { enabled: true },
    },
  };
  const local = { toolExecution: { capture: { maxInlineBytes: 2048 } } };
  const cwd = await configuredRepo(repository);
  const localPath = join(cwd, ".freeflow/local.json");
  await writeFile(localPath, JSON.stringify(local, null, 2), "utf8");
  try {
    const { commands } = loadExtension();
    const command = commands.find((candidate) => candidate.name === "freeflow");
    const settingsCtx = context(cwd);
    settingsCtx.isIdle = () => true;
    let confirmations = 0;
    settingsCtx.ui.confirm = async () => {
      confirmations += 1;
      return true;
    };

    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      component.handleInput("Tool Execution");
      component.handleInput("\r");
      component.handleInput("Programs");
      component.handleInput("\r");
      component.handleInput("Program mode");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings local", settingsCtx);

    settingsCtx.ui.custom = async (factory) => {
      let result;
      const component = factory({ requestRender() {} }, testTheme, {}, (value) => {
        result = value;
      });
      component.handleInput("Tool Execution");
      component.handleInput("\r");
      component.handleInput("Workspace");
      component.handleInput("\r");
      component.handleInput("Exact workspace replacement");
      component.handleInput("\r");
      component.handleInput("\u001b[B");
      component.handleInput("\r");
      await component.waitForWrites();
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      component.handleInput("\u001b");
      return result;
    };
    await command.definition.handler("settings local", settingsCtx);

    const saved = JSON.parse(await readFile(localPath, "utf8"));
    assert.equal(saved.toolExecution.capture.maxInlineBytes, 2048);
    assert.equal(saved.toolExecution.programs.mode, "adapters");
    assert.equal(saved.toolExecution.workspace.write, true);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, ".freeflow/config.json"), "utf8")), repository);
    assert.equal(confirmations, 1);
    assert.equal(settingsCtx.reloads.length, 2);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
