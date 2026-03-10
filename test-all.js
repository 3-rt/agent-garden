// Comprehensive test suite for Agent Garden Phases 1-4
// Runs against tsc-compiled output in test-build/

let pass = 0;
let fail = 0;
const failures = [];

function assert(condition, msg) {
  if (condition) {
    pass++;
    console.log(`  PASS: ${msg}`);
  } else {
    fail++;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// ============================================================
// Phase 1: MVP Loop
// ============================================================
section('Phase 1: ClaudeService');

const { ClaudeService, ClaudeApiError } = require('./test-build/main/services/claude');

const claude = new ClaudeService();
assert(claude.hasApiKey() === false, 'No API key initially');
claude.setApiKey('test-key-123');
assert(claude.hasApiKey() === true, 'Has API key after setApiKey');
claude.setSystemPrompt('Custom prompt');
assert(true, 'setSystemPrompt does not throw');

const authErr = new ClaudeApiError('bad key', 'auth');
assert(authErr.type === 'auth', 'ClaudeApiError stores type');
assert(authErr.message === 'bad key', 'ClaudeApiError stores message');
assert(authErr instanceof Error, 'ClaudeApiError extends Error');
assert(new ClaudeApiError('x', 'rate-limit').type === 'rate-limit', 'rate-limit error type');
assert(new ClaudeApiError('x', 'network').type === 'network', 'network error type');

(async () => {
  // Demo mode streaming
  const demoService = new ClaudeService();
  let chunks = [];
  let gotDone = false;
  const result = await demoService.streamTask('create a component', (text, done) => {
    if (!done) chunks.push(text);
    else gotDone = true;
  });
  assert(chunks.length > 0, 'Demo mode produces chunks');
  assert(gotDone, 'Demo mode sends done=true');
  assert(result.filename !== null, 'Demo mode produces a filename');
  assert(result.content.length > 0, 'Demo mode produces content');

  // SaveToFile
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-test-'));
  const saver = new ClaudeService();
  const savedPath = await saver.saveToFile(tmpDir, 'hello.ts', 'export const x = 1;\n');
  assert(fs.existsSync(savedPath), 'saveToFile creates the file');
  assert(fs.readFileSync(savedPath, 'utf-8') === 'export const x = 1;\n', 'saveToFile writes correct content');
  const nestedPath = await saver.saveToFile(tmpDir, 'src/nested/deep.ts', 'export const y = 2;\n');
  assert(fs.existsSync(nestedPath), 'saveToFile creates nested directories');
  fs.rmSync(tmpDir, { recursive: true });

  // ============================================================
  section('Phase 1: FileWatcher');

  const { FileWatcher } = require('./test-build/main/services/watcher');
  const watcher = new FileWatcher();
  assert(watcher.getDirectory() === '', 'Initial directory is empty');

  const watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-watch-'));
  let fileEvents = [];
  watcher.start(watchDir, (event) => fileEvents.push(event));
  assert(watcher.getDirectory() === watchDir, 'getDirectory returns set directory');

  fs.writeFileSync(path.join(watchDir, 'test.txt'), 'hello');
  await new Promise(r => setTimeout(r, 2000));
  assert(fileEvents.length > 0, 'FileWatcher detects file creation');
  const hasTestTxt = fileEvents.some(e => e.path === 'test.txt');
  assert(hasTestTxt, 'FileWatcher reports correct filename');

  fileEvents = [];
  fs.writeFileSync(path.join(watchDir, 'test.txt'), 'updated');
  await new Promise(r => setTimeout(r, 2000));
  assert(fileEvents.length > 0, 'FileWatcher detects file modification');

  watcher.stop();
  fileEvents = [];
  fs.writeFileSync(path.join(watchDir, 'test2.txt'), 'after stop');
  await new Promise(r => setTimeout(r, 500));
  assert(fileEvents.length === 0, 'No events after watcher.stop()');

  const newDir = path.join(os.tmpdir(), 'ag-new-' + Date.now());
  const watcher2 = new FileWatcher();
  watcher2.start(newDir, () => {});
  assert(fs.existsSync(newDir), 'FileWatcher creates directory if missing');
  watcher2.stop();
  fs.rmSync(watchDir, { recursive: true });
  fs.rmSync(newDir, { recursive: true });

  // ============================================================
  section('Phase 3: TaskRouter');

  const { TaskRouter } = require('./test-build/main/services/task-router');
  const router = new TaskRouter();

  assert(router.route('@planter create a button') === 'planter', '@planter prefix routes to planter');
  assert(router.route('@weeder clean up code') === 'weeder', '@weeder prefix routes to weeder');
  assert(router.route('@tester write tests') === 'tester', '@tester prefix routes to tester');
  assert(router.route('@Tester write tests') === 'tester', '@Tester (capitalized) routes to tester');
  assert(router.route('write a test for my function') === 'tester', '"test" keyword routes to tester');
  assert(router.route('add spec for component') === 'tester', '"spec" keyword routes to tester');
  assert(router.route('refactor the login service') === 'weeder', '"refactor" keyword routes to weeder');
  assert(router.route('clean up the controller') === 'weeder', '"clean" keyword routes to weeder');
  assert(router.route('fix the bug in auth') === 'weeder', '"fix" keyword routes to weeder');
  assert(router.route('optimize database queries') === 'weeder', '"optimize" keyword routes to weeder');
  assert(router.route('create a new login page') === 'planter', 'General prompt routes to planter');

  assert(router.cleanPrompt('@planter create a button') === 'create a button', 'cleanPrompt removes prefix');
  assert(router.cleanPrompt('create a button') === 'create a button', 'cleanPrompt preserves prompt without prefix');

  assert(TaskRouter.fileToZone('app.test.ts') === 'tests', '.test. file maps to tests zone');
  assert(TaskRouter.fileToZone('app.spec.ts') === 'tests', '.spec. file maps to tests zone');
  assert(TaskRouter.fileToZone('Button.tsx') === 'frontend', '.tsx file maps to frontend zone');
  assert(TaskRouter.fileToZone('styles.css') === 'frontend', '.css file maps to frontend zone');
  assert(TaskRouter.fileToZone('server.ts') === 'backend', 'Generic .ts file maps to backend zone');

  // ============================================================
  section('Phase 3: AgentPool');

  const { AgentPool } = require('./test-build/main/services/agent-pool');

  const pool = new AgentPool();
  const info = pool.getAgentInfo();
  assert(info.length === 3, 'Pool has 3 agents');
  assert(info[0].id === 'agent-planter', 'First agent is planter');
  assert(info[1].id === 'agent-weeder', 'Second agent is weeder');
  assert(info[2].id === 'agent-tester', 'Third agent is tester');
  assert(info.every(a => a.busy === false), 'All agents start idle');
  assert(info.every(a => a.totalTokens === 0), 'All agents start with 0 tokens');
  assert(pool.hasApiKey() === false, 'Pool has no API key initially');
  pool.setApiKey('test-key');
  assert(pool.hasApiKey() === true, 'Pool has API key after setApiKey');

  const pool2 = new AgentPool();
  let streamChunks = [];
  const taskResult = await pool2.submitTask('create a hello world', (agentId, text, done) => {
    streamChunks.push({ agentId, text, done });
  });
  assert(taskResult.agentId === 'agent-planter', 'Demo task assigned to planter');
  assert(taskResult.result.filename !== null, 'Demo task produces filename');
  assert(streamChunks.length > 0, 'Demo task produces stream chunks');

  const planterInfo = pool2.getAgentInfo().find(a => a.id === 'agent-planter');
  assert(planterInfo.totalTokens > 0, 'Planter accumulated tokens after task');
  pool2.resetTokens('agent-planter');
  assert(pool2.getAgentInfo().find(a => a.id === 'agent-planter').totalTokens === 0, 'Tokens reset to 0');

  const weederResult = await pool2.submitTask('refactor the login', () => {});
  assert(weederResult.agentId === 'agent-weeder', 'Refactor task assigned to weeder');

  const testerResult = await pool2.submitTask('write test for auth', () => {});
  assert(testerResult.agentId === 'agent-tester', 'Test task assigned to tester');

  // Queue behavior
  const pool4 = new AgentPool();
  const results = [];
  const p1 = pool4.submitTask('create a form', () => {}).then(r => results.push(r));
  const p2 = pool4.submitTask('create a header', () => {}).then(r => results.push(r));
  await Promise.all([p1, p2]);
  assert(results.length === 2, 'Both queued tasks complete');
  assert(results.every(r => r.agentId === 'agent-planter'), 'Both queued to planter');

  // Parallel roles
  const pool5 = new AgentPool();
  const pr = [];
  const pa = pool5.submitTask('create a page', () => {}).then(() => pr.push('planter'));
  const pb = pool5.submitTask('refactor the code', () => {}).then(() => pr.push('weeder'));
  const pc = pool5.submitTask('write test cases', () => {}).then(() => pr.push('tester'));
  await Promise.all([pa, pb, pc]);
  assert(pr.length === 3, 'All three role tasks complete in parallel');

  // ============================================================
  // Phase 4: Persistence
  // ============================================================
  section('Phase 4: PersistenceService');

  const { PersistenceService } = require('./test-build/main/services/persistence');
  const persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-persist-'));
  const persist = new PersistenceService(persistDir);

  // Initial stats
  const initialStats = persist.getStats();
  assert(initialStats.filesCreated === 0, 'Initial filesCreated is 0');
  assert(initialStats.tasksCompleted === 0, 'Initial tasksCompleted is 0');
  assert(initialStats.tasksFailed === 0, 'Initial tasksFailed is 0');
  assert(initialStats.tokensUsed === 0, 'Initial tokensUsed is 0');
  assert(initialStats.sessionStart > 0, 'Session start is set');

  // Record events
  persist.recordFileCreated();
  persist.recordFileCreated();
  persist.recordTaskCompleted();
  persist.recordTaskFailed();
  persist.recordTokens(1500);
  persist.recordTokens(500);

  const updatedStats = persist.getStats();
  assert(updatedStats.filesCreated === 2, 'filesCreated increments correctly');
  assert(updatedStats.tasksCompleted === 1, 'tasksCompleted increments correctly');
  assert(updatedStats.tasksFailed === 1, 'tasksFailed increments correctly');
  assert(updatedStats.tokensUsed === 2000, 'tokensUsed accumulates correctly');

  // Save state
  const testPlants = [
    { filename: 'App.tsx', x: 100, y: 200, zone: 'frontend', createdAt: Date.now() },
    { filename: 'server.ts', x: 300, y: 200, zone: 'backend', createdAt: Date.now() },
  ];
  persist.saveState(testPlants, 'zen');

  // Load state
  const loaded = persist.loadState();
  assert(loaded !== null, 'loadState returns saved data');
  assert(loaded.plants.length === 2, 'Loaded plants count matches');
  assert(loaded.plants[0].filename === 'App.tsx', 'Loaded plant filename matches');
  assert(loaded.plants[1].zone === 'backend', 'Loaded plant zone matches');
  assert(loaded.theme === 'zen', 'Loaded theme matches');
  assert(loaded.stats.filesCreated === 2, 'Loaded stats preserved');
  assert(loaded.savedAt > 0, 'savedAt timestamp set');

  // Load from fresh instance
  const persist2 = new PersistenceService(persistDir);
  const loaded2 = persist2.loadState();
  assert(loaded2 !== null, 'Fresh instance can load saved state');
  assert(loaded2.plants.length === 2, 'Fresh instance loads correct plant count');

  // No state returns null
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-empty-'));
  const persist3 = new PersistenceService(emptyDir);
  assert(persist3.loadState() === null, 'loadState returns null when no saved state');

  fs.rmSync(persistDir, { recursive: true });
  fs.rmSync(emptyDir, { recursive: true });

  // ============================================================
  // Phase 4: TimeLapse
  // ============================================================
  section('Phase 4: TimeLapse');

  const { TimeLapse } = require('./test-build/renderer/game/systems/TimeLapse');
  const tl = new TimeLapse();

  assert(tl.isRecording === true, 'Recording is on by default');
  assert(tl.snapshotCount === 0, 'No snapshots initially');

  // Add snapshots
  tl.addSnapshot({
    timestamp: 1000,
    plants: [{ filename: 'a.ts', x: 10, y: 20, zone: 'backend' }],
    agents: [{ id: 'agent-planter', role: 'planter', state: 'idle', x: 100, totalTokens: 0 }],
    stats: { filesCreated: 1, tasksCompleted: 1, tokensUsed: 500 },
  });
  assert(tl.snapshotCount === 1, 'Snapshot count is 1 after adding');

  tl.addSnapshot({
    timestamp: 2000,
    plants: [
      { filename: 'a.ts', x: 10, y: 20, zone: 'backend' },
      { filename: 'b.tsx', x: 50, y: 30, zone: 'frontend' },
    ],
    agents: [{ id: 'agent-planter', role: 'planter', state: 'working', x: 200, totalTokens: 500 }],
    stats: { filesCreated: 2, tasksCompleted: 2, tokensUsed: 1000 },
  });
  assert(tl.snapshotCount === 2, 'Snapshot count is 2');

  // Get individual snapshot
  const snap = tl.getSnapshot(0);
  assert(snap !== null, 'getSnapshot returns snapshot');
  assert(snap.timestamp === 1000, 'Snapshot has correct timestamp');
  assert(snap.plants.length === 1, 'Snapshot has correct plant count');

  assert(tl.getSnapshot(99) === null, 'getSnapshot returns null for invalid index');

  // Recording toggle
  tl.setRecording(false);
  assert(tl.isRecording === false, 'Recording can be disabled');
  tl.addSnapshot({
    timestamp: 3000,
    plants: [],
    agents: [],
    stats: { filesCreated: 0, tasksCompleted: 0, tokensUsed: 0 },
  });
  assert(tl.snapshotCount === 2, 'No snapshot added when recording is off');
  tl.setRecording(true);

  // Export/Import JSON
  const exported = tl.exportJSON();
  assert(typeof exported === 'string', 'exportJSON returns a string');
  const parsed = JSON.parse(exported);
  assert(parsed.version === 1, 'Export has version field');
  assert(parsed.snapshots.length === 2, 'Export contains all snapshots');

  const tl2 = new TimeLapse();
  assert(tl2.importJSON(exported) === true, 'importJSON succeeds');
  assert(tl2.snapshotCount === 2, 'Imported snapshot count matches');
  assert(tl2.getSnapshot(1).plants.length === 2, 'Imported snapshot data intact');

  // Invalid JSON
  assert(tl2.importJSON('not json') === false, 'importJSON rejects invalid JSON');
  assert(tl2.importJSON('{"version":2}') === false, 'importJSON rejects wrong version');

  // Clear
  tl.clear();
  assert(tl.snapshotCount === 0, 'Snapshots cleared');

  // Max snapshots cap
  const tl3 = new TimeLapse();
  for (let i = 0; i < 210; i++) {
    tl3.addSnapshot({
      timestamp: i,
      plants: [],
      agents: [],
      stats: { filesCreated: 0, tasksCompleted: 0, tokensUsed: 0 },
    });
  }
  assert(tl3.snapshotCount === 200, 'Snapshots capped at 200');
  assert(tl3.getSnapshot(0).timestamp === 10, 'Oldest snapshots removed first');

  // ============================================================
  // Phase 4: ThemeManager
  // ============================================================
  section('Phase 4: ThemeManager');

  const { ThemeManager } = require('./test-build/renderer/game/systems/ThemeManager');
  const tm = new ThemeManager();

  // Default theme
  assert(tm.themeId === 'garden', 'Default theme is garden');
  assert(tm.current.name === 'Classic Garden', 'Default theme name correct');
  assert(typeof tm.current.groundLight === 'number', 'Theme has groundLight color');
  assert(typeof tm.current.pathColor === 'number', 'Theme has pathColor');
  assert(typeof tm.current.backgroundColor === 'string', 'Theme has backgroundColor');
  assert(tm.current.signColors.frontend !== undefined, 'Theme has zone sign colors');

  // Available themes
  const themes = ThemeManager.getAvailableThemes();
  assert(themes.length === 5, '5 themes available');
  assert(themes.some(t => t.id === 'garden'), 'Garden theme available');
  assert(themes.some(t => t.id === 'desert'), 'Desert theme available');
  assert(themes.some(t => t.id === 'zen'), 'Zen theme available');
  assert(themes.some(t => t.id === 'underwater'), 'Underwater theme available');
  assert(themes.some(t => t.id === 'space'), 'Space theme available');

  // Set theme
  tm.setTheme('desert');
  assert(tm.themeId === 'desert', 'Theme changed to desert');
  assert(tm.current.name === 'Desert Oasis', 'Desert theme name correct');

  tm.setTheme('space');
  assert(tm.themeId === 'space', 'Theme changed to space');

  // Invalid theme does nothing
  tm.setTheme('nonexistent');
  assert(tm.themeId === 'space', 'Invalid theme ID is ignored');

  // onChange listener
  let listenerCalled = false;
  let receivedTheme = null;
  const listener = (theme) => {
    listenerCalled = true;
    receivedTheme = theme;
  };
  tm.onChange(listener);
  tm.setTheme('zen');
  assert(listenerCalled, 'onChange listener is called');
  assert(receivedTheme.id === 'zen', 'Listener receives correct theme');

  // Remove listener
  listenerCalled = false;
  tm.removeListener(listener);
  tm.setTheme('garden');
  assert(!listenerCalled, 'Removed listener is not called');

  // Each theme has all required properties
  for (const themeInfo of themes) {
    tm.setTheme(themeInfo.id);
    const t = tm.current;
    assert(typeof t.groundLight === 'number', `${themeInfo.id}: has groundLight`);
    assert(typeof t.groundDark === 'number', `${themeInfo.id}: has groundDark`);
    assert(typeof t.pathColor === 'number', `${themeInfo.id}: has pathColor`);
    assert(typeof t.backgroundColor === 'string', `${themeInfo.id}: has backgroundColor`);
    assert(t.signColors.frontend !== undefined, `${themeInfo.id}: has frontend sign color`);
    assert(t.signColors.backend !== undefined, `${themeInfo.id}: has backend sign color`);
    assert(t.signColors.tests !== undefined, `${themeInfo.id}: has tests sign color`);
    assert(typeof t.labelColor === 'string', `${themeInfo.id}: has labelColor`);
    assert(typeof t.titleColor === 'string', `${themeInfo.id}: has titleColor`);
    assert(typeof t.dividerColor === 'number', `${themeInfo.id}: has dividerColor`);
  }

  // ============================================================
  // Phase 1-2: Filename inference
  // ============================================================
  section('Phase 1-2: Filename inference');

  const demoS = new ClaudeService();
  const r1 = await demoS.streamTask('create a component', () => {});
  assert(r1.filename === 'Component.tsx', 'Component prompt -> Component.tsx');
  const r2 = await demoS.streamTask('write a test', () => {});
  assert(r2.filename === 'test.spec.ts', 'Test prompt -> test.spec.ts');
  const r3 = await demoS.streamTask('create styles for the page', () => {});
  assert(r3.filename === 'styles.css', 'Style prompt -> styles.css');
  const r4 = await demoS.streamTask('build an api service', () => {});
  assert(r4.filename === 'service.ts', 'API prompt -> service.ts');
  const r5 = await demoS.streamTask('do something generic', () => {});
  assert(r5.filename === 'output.ts', 'Generic prompt -> output.ts');

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n========================================`);
  console.log(`  Results: ${pass} passed, ${fail} failed`);
  console.log(`========================================`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  process.exit(fail > 0 ? 1 : 0);
})();
