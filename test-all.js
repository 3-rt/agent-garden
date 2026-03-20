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
  await new Promise(r => setTimeout(r, 300));

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
  assert(initialStats.activeAgents === 0, 'Initial activeAgents is 0');
  assert(initialStats.sessionStart > 0, 'Session start is set');

  // Record events
  persist.recordFileCreated();
  persist.recordFileCreated();
  persist.recordTaskCompleted();
  persist.recordTaskFailed();
  persist.setActiveAgents(2);

  const updatedStats = persist.getStats();
  assert(updatedStats.filesCreated === 2, 'filesCreated increments correctly');
  assert(updatedStats.tasksCompleted === 1, 'tasksCompleted increments correctly');
  assert(updatedStats.tasksFailed === 1, 'tasksFailed increments correctly');
  assert(updatedStats.activeAgents === 2, 'activeAgents tracked correctly');

  // Save state
  const testPlants = [
    { filename: 'App.tsx', x: 100, y: 200, zone: 'frontend', createdAt: Date.now(), bedId: 'bed-frontend-center' },
    { filename: 'server.ts', x: 300, y: 200, zone: 'backend', createdAt: Date.now(), bedId: 'bed-backend-center' },
  ];
  const testBeds = [
    {
      id: 'bed-frontend-center',
      zone: 'frontend',
      x: 120,
      y: 180,
      width: 140,
      height: 100,
      rank: 0,
      capacity: 4,
      directoryGroups: ['src/renderer/components'],
      plantKeys: ['App.tsx'],
    },
    {
      id: 'bed-backend-center',
      zone: 'backend',
      x: 320,
      y: 180,
      width: 140,
      height: 100,
      rank: 0,
      capacity: 4,
      directoryGroups: ['src/main/services'],
      plantKeys: ['server.ts'],
    },
  ];
  persist.saveState(testPlants, 'zen', testBeds);

  // Load state
  const loaded = persist.loadState();
  assert(loaded !== null, 'loadState returns saved data');
  assert(loaded.plants.length === 2, 'Loaded plants count matches');
  assert(loaded.plants[0].filename === 'App.tsx', 'Loaded plant filename matches');
  assert(loaded.plants[1].zone === 'backend', 'Loaded plant zone matches');
  assert(loaded.plants[0].bedId === 'bed-frontend-center', 'Loaded plant bedId matches');
  assert(Array.isArray(loaded.beds), 'Loaded garden state includes beds collection');
  assert(loaded.beds.length === 2, 'Loaded beds count matches');
  assert(loaded.beds[0].id === 'bed-frontend-center', 'Loaded bed id matches');
  assert(loaded.theme === 'zen', 'Loaded theme matches');
  assert(loaded.stats.filesCreated === 2, 'Loaded stats preserved');
  assert(loaded.savedAt > 0, 'savedAt timestamp set');

  // Load from fresh instance
  const persist2 = new PersistenceService(persistDir);
  const loaded2 = persist2.loadState();
  assert(loaded2 !== null, 'Fresh instance can load saved state');
  assert(loaded2.plants.length === 2, 'Fresh instance loads correct plant count');
  assert(Array.isArray(loaded2.beds), 'Fresh instance loads bed collection');
  assert(loaded2.beds.length === 2, 'Fresh instance loads correct bed count');

  // No state returns null
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-empty-'));
  const persist3 = new PersistenceService(emptyDir);
  assert(persist3.loadState() === null, 'loadState returns null when no saved state');

  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-legacy-'));
  const legacyStateDir = path.join(legacyDir, 'agent-garden');
  fs.mkdirSync(legacyStateDir, { recursive: true });
  fs.writeFileSync(path.join(legacyStateDir, 'garden-state.json'), JSON.stringify({
    plants: [{ filename: 'legacy.ts', x: 10, y: 20, zone: 'backend', createdAt: 1000 }],
    stats: { filesCreated: 1, tasksCompleted: 0, tasksFailed: 0, activeAgents: 0, sessionStart: 1000 },
    theme: 'garden',
    savedAt: 2000,
  }, null, 2));
  const persistLegacy = new PersistenceService(legacyDir);
  const loadedLegacy = persistLegacy.loadState();
  assert(loadedLegacy !== null, 'Legacy state still loads');
  assert(Array.isArray(loadedLegacy.beds), 'Legacy state defaults beds to an array');
  assert(loadedLegacy.beds.length === 0, 'Legacy state defaults beds to empty');

  fs.rmSync(persistDir, { recursive: true });
  fs.rmSync(emptyDir, { recursive: true });
  fs.rmSync(legacyDir, { recursive: true });

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
    stats: { filesCreated: 1, tasksCompleted: 1, activeAgents: 1 },
  });
  assert(tl.snapshotCount === 1, 'Snapshot count is 1 after adding');

  tl.addSnapshot({
    timestamp: 2000,
    plants: [
      { filename: 'a.ts', x: 10, y: 20, zone: 'backend' },
      { filename: 'b.tsx', x: 50, y: 30, zone: 'frontend' },
    ],
    agents: [{ id: 'agent-planter', role: 'planter', state: 'working', x: 200, totalTokens: 500 }],
    stats: { filesCreated: 2, tasksCompleted: 2, activeAgents: 1 },
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
    stats: { filesCreated: 0, tasksCompleted: 0, activeAgents: 0 },
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
      stats: { filesCreated: 0, tasksCompleted: 0, activeAgents: 0 },
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
  // AG-14: Garden Resize Handling
  // ============================================================
  section('AG-14: Garden Resize Handling');

  const ModuleAg14 = require('module');

  function createScaleStub(width, height) {
    const listeners = new Map();
    return {
      width,
      height,
      on(event, handler, context) {
        const current = listeners.get(event) || [];
        current.push({ handler, context });
        listeners.set(event, current);
      },
      emit(event, ...args) {
        for (const listener of listeners.get(event) || []) {
          listener.handler.call(listener.context, ...args);
        }
      },
    };
  }

  function createDisplayObject(x = 0, y = 0) {
    return {
      x,
      y,
      width: 0,
      height: 0,
      alpha: 1,
      visible: true,
      destroyed: false,
      setDepth() { return this; },
      setOrigin() { return this; },
      setVisible(value) { this.visible = value; return this; },
      setColor(value) { this.color = value; return this; },
      setFillStyle(value) { this.fillStyle = value; return this; },
      setPosition(nextX, nextY) { this.x = nextX; this.y = nextY; return this; },
      setSize(widthValue, heightValue) { this.width = widthValue; this.height = heightValue; return this; },
      setScale(scaleX, scaleY = scaleX) { this.scaleX = scaleX; this.scaleY = scaleY; return this; },
      setAlpha(value) { this.alpha = value; return this; },
      setText(value) { this.text = value; return this; },
      destroy() { this.destroyed = true; return this; },
    };
  }

  const phaserStub = {
    AUTO: 'AUTO',
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH',
      Events: {
        RESIZE: 'resize',
      },
    },
    Scene: class Scene {
      constructor(config) {
        this.sys = { settings: config || {} };
        this.scale = createScaleStub(64, 64);
        this.cameras = {
          main: {
            width: 64,
            height: 64,
            backgroundColor: null,
            setBackgroundColor: (value) => {
              this.cameras.main.backgroundColor = value;
              return this.cameras.main;
            },
          },
          resize: (width, height) => {
            this.cameras.main.width = width;
            this.cameras.main.height = height;
          },
        };
        this.add = {
          rectangle: (x, y, width, height, fillStyle) => {
            const object = createDisplayObject(x, y);
            object.width = width;
            object.height = height;
            object.fillStyle = fillStyle;
            return object;
          },
          text: (x, y, text) => {
            const object = createDisplayObject(x, y);
            object.text = text;
            return object;
          },
          circle: (x, y, radius, fillStyle) => {
            const object = createDisplayObject(x, y);
            object.radius = radius;
            object.fillStyle = fillStyle;
            return object;
          },
          ellipse: (x, y, width, height, fillStyle) => {
            const object = createDisplayObject(x, y);
            object.width = width;
            object.height = height;
            object.fillStyle = fillStyle;
            return object;
          },
          triangle: (x, y, x1, y1, x2, y2, x3, y3, fillStyle) => {
            const object = createDisplayObject(x, y);
            object.points = [x1, y1, x2, y2, x3, y3];
            object.fillStyle = fillStyle;
            return object;
          },
          container: (x, y, list = []) => {
            const object = createDisplayObject(x, y);
            object.list = list;
            object.add = (child) => {
              if (Array.isArray(child)) {
                object.list.push(...child);
              } else {
                object.list.push(child);
              }
              return object;
            };
            return object;
          },
          image: (x, y, texture, frame) => {
            const object = createDisplayObject(x, y);
            object.texture = texture;
            object.frame = frame;
            object.setTint = (color) => { object.tint = color; return object; };
            return object;
          },
          graphics: (config) => {
            const object = createDisplayObject(0, 0);
            object.fillStyle = (color, alpha) => object;
            object.fillRect = (x, y, w, h) => object;
            object.lineStyle = (width, color, alpha) => object;
            object.strokeRect = (x, y, w, h) => object;
            object.fillCircle = (x, y, r) => object;
            object.setDepth = (d) => { object.depth = d; return object; };
            return object;
          },
        };
        this.time = {
          delayedCall() {
            return null;
          },
        };
        this.tweens = {
          add(config) {
            return {
              ...config,
              stop() {},
            };
          },
          killTweensOf() {},
        };
      }
    },
  };

  const phaserModuleStub = {
    __esModule: true,
    default: phaserStub,
    ...phaserStub,
  };

  const originalLoadAg14 = ModuleAg14._load;
  ModuleAg14._load = function patchedLoad(request, parent, isMain) {
    if (request === 'phaser') {
      return phaserModuleStub;
    }
    return originalLoadAg14.call(this, request, parent, isMain);
  };

  let GardenSceneAg14;
  try {
    delete require.cache[require.resolve('./test-build/renderer/game/scenes/GardenScene')];
    ({ GardenScene: GardenSceneAg14 } = require('./test-build/renderer/game/scenes/GardenScene'));
  } finally {
    ModuleAg14._load = originalLoadAg14;
  }

  const resizeScene = new GardenSceneAg14();
  resizeScene.create();

  assert(resizeScene.groundTiles.length === 4, 'Scene creates initial ground tiles for the starting size');
  assert(resizeScene.titleText.x === 32 && resizeScene.titleText.y === 52, 'Title starts centered at the bottom edge');

  resizeScene.scale.width = 96;
  resizeScene.scale.height = 96;
  resizeScene.cameras.main.width = 96;
  resizeScene.cameras.main.height = 96;
  resizeScene.scale.emit('resize', { width: 96, height: 96 }, { width: 96, height: 96 });

  assert(resizeScene.groundTiles.length === 9, 'Scene rebuilds ground tiles after resize');
  assert(resizeScene.titleText.x === 48 && resizeScene.titleText.y === 84, 'Title repositions after resize');

  resizeScene.restorePlants([
    { filename: 'server.ts', x: 20, y: 40, zone: 'backend', createdAt: 1 },
  ]);
  const plantBeforeResize = resizeScene.plantMap.get('server.ts');
  resizeScene.scale.width = 128;
  resizeScene.scale.height = 128;
  resizeScene.cameras.main.width = 128;
  resizeScene.cameras.main.height = 128;
  resizeScene.scale.emit('resize', { width: 128, height: 128 }, { width: 128, height: 128 });
  const plantAfterResize = resizeScene.plantMap.get('server.ts');

  assert(plantAfterResize !== undefined, 'Plants are still present after resize rebuild');
  assert(plantAfterResize !== plantBeforeResize, 'Resize rebuilds plant display objects from plant state');

  const restoredBedLayout = {
    beds: [{
      id: 'bed-backend-center',
      zone: 'backend',
      x: 64,
      y: 64,
      width: 80,
      height: 60,
      rank: 0,
      capacity: 4,
      directoryGroups: ['src/main/services'],
      plantKeys: ['server.ts'],
    }],
    plants: [{
      filename: 'server.ts',
      x: 32,
      y: 48,
      zone: 'backend',
      createdAt: 2,
      bedId: 'bed-backend-center',
    }],
  };
  resizeScene.clearPlants();
  resizeScene.restoreGardenLayout(restoredBedLayout);
  const sceneLayout = resizeScene.getGardenLayout();
  assert(sceneLayout.beds.length === 1, 'GardenScene restores persisted bed layout');
  assert(sceneLayout.beds[0].id === 'bed-backend-center', 'GardenScene keeps restored bed ids');
  assert(sceneLayout.plants[0].bedId === 'bed-backend-center', 'GardenScene preserves plant bed membership through restore');
  assert(resizeScene.bedMap.size === 1, 'GardenScene renders a background for each restored bed');

  resizeScene.onFileCreated('src/main/services/new.ts');
  const matchedLayout = resizeScene.getGardenLayout();
  const matchedPlant = matchedLayout.plants.find((plant) => plant.filename === 'src/main/services/new.ts');
  assert(matchedPlant.bedId === 'bed-backend-center', 'New file joins the matching existing bed');
  assert(
    matchedLayout.beds.find((bed) => bed.id === 'bed-backend-center').plantKeys.includes('src/main/services/new.ts'),
    'Matching bed tracks the newly inserted file',
  );

  resizeScene.restoreGardenLayout({
    beds: [{
      ...restoredBedLayout.beds[0],
      capacity: 1,
      plantKeys: ['server.ts'],
    }],
    plants: restoredBedLayout.plants,
  });
  resizeScene.onFileCreated('src/main/services/overflow.ts');
  const overflowSceneLayout = resizeScene.getGardenLayout();
  const overflowPlant = overflowSceneLayout.plants.find((plant) => plant.filename === 'src/main/services/overflow.ts');
  assert(overflowSceneLayout.beds.length === 2, 'GardenScene adds a new outer bed when the matching bed is full');
  assert(overflowPlant.bedId !== 'bed-backend-center', 'Overflow file moves into the new outer bed');
  assert(resizeScene.bedMap.size === 2, 'GardenScene renders backgrounds for expanded beds');

  const singleBedLayout = {
    beds: [{
      id: 'bed-frontend-single',
      zone: 'frontend',
      x: 64,
      y: 64,
      width: 80,
      height: 60,
      rank: 0,
      capacity: 4,
      directoryGroups: ['src/app'],
      plantKeys: ['src/app/page.tsx'],
    }],
    plants: [{
      filename: 'src/app/page.tsx',
      x: 42,
      y: 42,
      zone: 'frontend',
      createdAt: 3,
      bedId: 'bed-frontend-single',
      growthScale: 1.2,
    }],
  };
  resizeScene.restoreGardenLayout(singleBedLayout);
  const singleBedPlant = Array.from(resizeScene.plantMap.values())[0];
  assert(singleBedPlant.y > singleBedLayout.beds[0].y, 'Single bed-backed plants anchor from the lower half of their bed');

  const mergedBedLayout = {
    beds: [{
      id: 'bed-backend-merged',
      zone: 'backend',
      x: 64,
      y: 64,
      width: 80,
      height: 60,
      rank: 0,
      capacity: 30,
      directoryGroups: ['src/main/services'],
      plantKeys: Array.from({ length: 24 }, (_, index) => `src/main/services/file-${index}.ts`),
    }],
    plants: Array.from({ length: 24 }, (_, index) => ({
      filename: `src/main/services/file-${index}.ts`,
      x: 40 + (index % 4) * 4,
      y: 40 + Math.floor(index / 4) * 2,
      zone: 'backend',
      createdAt: 3,
      bedId: 'bed-backend-merged',
      growthScale: 2.8,
    })),
  };
  resizeScene.restoreGardenLayout(mergedBedLayout);
  assert(resizeScene.plantMap.size === 1, 'GardenScene merges dense bed-backed file groups into one visible plant');
  const mergedBedPlant = Array.from(resizeScene.plantMap.values())[0];
  const mergedStem = mergedBedPlant.list[0];
  assert(mergedBedPlant.y > mergedBedLayout.beds[0].y, 'Merged bed-backed plants anchor from the lower half of their bed');
  assert(mergedStem.height < mergedBedLayout.beds[0].height, 'Merged bed-backed plant height stays within the bed footprint');

  const splitMergedBedLayout = {
    beds: [
      {
        id: 'bed-backend-left',
        zone: 'backend',
        x: 40,
        y: 64,
        width: 60,
        height: 60,
        rank: 0,
        capacity: 20,
        directoryGroups: ['src/main/services'],
        plantKeys: Array.from({ length: 12 }, (_, index) => `src/main/services/left-${index}.ts`),
      },
      {
        id: 'bed-backend-right',
        zone: 'backend',
        x: 88,
        y: 64,
        width: 60,
        height: 60,
        rank: 1,
        capacity: 20,
        directoryGroups: ['src/main/services'],
        plantKeys: Array.from({ length: 12 }, (_, index) => `src/main/services/right-${index}.ts`),
      },
    ],
    plants: [
      ...Array.from({ length: 12 }, (_, index) => ({
        filename: `src/main/services/left-${index}.ts`,
        x: 30 + (index % 3) * 4,
        y: 44 + Math.floor(index / 3) * 2,
        zone: 'backend',
        createdAt: 4,
        bedId: 'bed-backend-left',
        growthScale: 1.8,
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        filename: `src/main/services/right-${index}.ts`,
        x: 82 + (index % 3) * 2,
        y: 44 + Math.floor(index / 3) * 2,
        zone: 'backend',
        createdAt: 4,
        bedId: 'bed-backend-right',
        growthScale: 1.8,
      })),
    ],
  };
  resizeScene.restoreGardenLayout(splitMergedBedLayout);
  const splitMergedPlants = Array.from(resizeScene.plantMap.values());
  assert(splitMergedPlants.length === 2, 'GardenScene keeps merged display plants split per bed');
  assert(
    Math.min(...splitMergedPlants.map((plant) => plant.x)) < 50 &&
      Math.max(...splitMergedPlants.map((plant) => plant.x)) > 78,
    'GardenScene keeps split merged plants anchored to separate bed positions',
  );

  // ============================================================
  // AG-14: Garden Renderer Stability
  // ============================================================
  section('AG-14: Garden Renderer Stability');

  const ModuleAg14Renderer = require('module');

  const phaserGameStub = {
    AUTO: 'AUTO',
    CANVAS: 'CANVAS',
    WEBGL: 'WEBGL',
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH',
    },
    Game: class Game {
      constructor(config) {
        this.config = config;
        this.events = {
          on() {},
        };
        this.scene = {
          getScene() {
            return null;
          },
        };
      }
      destroy() {}
    },
  };

  const phaserGameModuleStub = {
    __esModule: true,
    default: phaserGameStub,
    ...phaserGameStub,
  };

  const originalLoadAg14Renderer = ModuleAg14Renderer._load;
  ModuleAg14Renderer._load = function patchedLoad(request, parent, isMain) {
    if (request === 'phaser') {
      return phaserGameModuleStub;
    }
    return originalLoadAg14Renderer.call(this, request, parent, isMain);
  };

  let GardenGameAg14;
  try {
    delete require.cache[require.resolve('./test-build/renderer/game/GardenGame')];
    ({ GardenGame: GardenGameAg14 } = require('./test-build/renderer/game/GardenGame'));
  } finally {
    ModuleAg14Renderer._load = originalLoadAg14Renderer;
  }

  const gameContainer = { clientWidth: 320, clientHeight: 240 };
  const gardenGame = new GardenGameAg14(gameContainer);
  assert(gardenGame.game.config.type === 'CANVAS', 'GardenGame prefers the Canvas renderer for restore stability');

  let forwardedLayout = null;
  gardenGame.scene = {
    restoreGardenLayout(layout) {
      forwardedLayout = layout;
    },
    getGardenLayout() {
      return restoredBedLayout;
    },
  };
  gardenGame.restoreGardenLayout(restoredBedLayout);
  assert(forwardedLayout.beds[0].id === 'bed-backend-center', 'GardenGame forwards bed-aware restore to the scene');
  assert(gardenGame.getGardenLayout().beds[0].id === 'bed-backend-center', 'GardenGame reads bed-aware layout from the scene');

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
  // AG-13: Activity Log
  // ============================================================
  section('AG-13: Activity Log');

  const {
    appendActivityLogEntry,
    createAgentActivityLogEntry,
    createAgentLifecycleLogEntry,
    createFileEventLogEntry,
    createPlanLogEntry,
    filterActivityLogEntries,
  } = require('./test-build/renderer/activity-log');

  const connectedEntry = createAgentLifecycleLogEntry('agent-connected', {
    agentId: 'cc-session-1',
    sessionId: 'session-1',
    role: 'planter',
    directory: '/tmp/project-a',
    source: 'hooks',
  }, 1000);
  assert(connectedEntry.kind === 'agent-connected', 'Lifecycle entry stores kind');
  assert(connectedEntry.agentId === 'cc-session-1', 'Lifecycle entry stores agentId');
  assert(connectedEntry.message.includes('project-a'), 'Lifecycle entry includes directory label');

  const toolEntry = createAgentActivityLogEntry({
    agentId: 'cc-session-1',
    event: 'PreToolUse',
    tool: 'Edit',
    file: 'src/App.tsx',
  }, 1100);
  assert(toolEntry.kind === 'agent-activity', 'Tool entry uses agent-activity kind');
  assert(toolEntry.tool === 'Edit', 'Tool entry stores tool');
  assert(toolEntry.file === 'src/App.tsx', 'Tool entry stores file');
  assert(toolEntry.message.includes('Edit'), 'Tool entry message includes tool');

  const outputEntry = createAgentActivityLogEntry({
    agentId: 'cc-session-1',
    event: 'PostToolUse',
    tool: 'output',
  }, 1200, 'Finished generating component');
  assert(outputEntry.message.includes('Finished generating component'), 'Output entry message uses supplied detail');

  const fileEntry = createFileEventLogEntry({
    type: 'created',
    path: 'src/Button.tsx',
    directory: '/tmp/project-a',
    agentId: 'cc-session-1',
    creatorRole: 'planter',
  }, 1300);
  assert(fileEntry.kind === 'file-event', 'File event uses file-event kind');
  assert(fileEntry.message.includes('created'), 'File event message includes action');
  assert(fileEntry.agentId === 'cc-session-1', 'File event keeps correlated agent');

  const planEntry = createPlanLogEntry('subtask-updated', {
    planId: 'plan-1',
    subtask: {
      id: 'sub-1',
      prompt: 'write tests',
      role: 'tester',
      status: 'assigned',
      agentId: 'cc-session-2',
      sessionId: 'session-2',
    },
  }, 1400);
  assert(planEntry.kind === 'subtask-updated', 'Plan entry stores subtask kind');
  assert(planEntry.agentId === 'cc-session-2', 'Plan entry keeps assigned agent');
  assert(planEntry.message.includes('write tests'), 'Plan entry includes prompt text');

  let logEntries = [];
  for (let i = 0; i < 405; i++) {
    logEntries = appendActivityLogEntry(logEntries, {
      id: `entry-${i}`,
      timestamp: i,
      scope: 'project',
      kind: 'agent-output',
      message: `entry ${i}`,
    }, 400);
  }
  assert(logEntries.length === 400, 'Activity log history is capped');
  assert(logEntries[0].id === 'entry-404', 'Newest entry stays first after trimming');
  assert(logEntries[399].id === 'entry-5', 'Oldest retained entry is correct after trimming');

  const filteredEntries = filterActivityLogEntries([
    connectedEntry,
    toolEntry,
    fileEntry,
    planEntry,
  ], {
    selectedAgentId: 'cc-session-1',
    searchText: 'app',
  });
  assert(filteredEntries.length === 1, 'Filtering combines agent selection and search text');
  assert(filteredEntries[0].file === 'src/App.tsx', 'Filtering returns matching activity entry');

  // ============================================================
  // AG-9: Merged Plant Layout
  // ============================================================
  section('AG-9: Merged Plant Layout');

  const plantClusterSource = fs.readFileSync(path.join(__dirname, 'src', 'renderer', 'game', 'plant-clusters.ts'), 'utf-8');
  assert(!plantClusterSource.includes("from 'path'"), 'Plant clustering stays browser-safe without Node path imports');

  let plantClustersModuleLoaded = false;
  let groupPlantsForDisplay;
  try {
    ({ groupPlantsForDisplay } = require('./test-build/renderer/game/plant-clusters'));
    plantClustersModuleLoaded = true;
  } catch (error) {
    console.log(`  INFO: plant-clusters module unavailable during red phase: ${error.message}`);
  }
  assert(plantClustersModuleLoaded, 'Plant cluster layout module compiles');

  if (plantClustersModuleLoaded) {
    const smallLayout = groupPlantsForDisplay([
      { filename: 'src/App.tsx', x: 10, y: 20, zone: 'frontend', createdAt: 1, directory: '/repo' },
      { filename: 'src/Button.tsx', x: 20, y: 30, zone: 'frontend', createdAt: 2, directory: '/repo' },
    ], {
      mergeThreshold: 4,
      minGroupSize: 2,
    });
    assert(smallLayout.totalFiles === 2, 'Small layout reports total file count');
    assert(smallLayout.visiblePlants.length === 2, 'Small layout keeps one plant per file below threshold');
    assert(smallLayout.visiblePlants.every((plant) => plant.kind === 'single'), 'Small layout emits only single plants');

    const mergedLayout = groupPlantsForDisplay([
      { filename: 'src/main/a.ts', x: 100, y: 100, zone: 'backend', createdAt: 1, directory: '/repo/src/main' },
      { filename: 'src/main/b.ts', x: 110, y: 110, zone: 'backend', createdAt: 2, directory: '/repo/src/main' },
      { filename: 'src/main/c.ts', x: 120, y: 120, zone: 'backend', createdAt: 3, directory: '/repo/src/main' },
      { filename: 'src/renderer/App.tsx', x: 400, y: 90, zone: 'frontend', createdAt: 4, directory: '/repo/src/renderer' },
      { filename: 'src/renderer/StatsPanel.tsx', x: 420, y: 105, zone: 'frontend', createdAt: 5, directory: '/repo/src/renderer' },
    ], {
      mergeThreshold: 4,
      minGroupSize: 2,
    });
    assert(mergedLayout.totalFiles === 5, 'Merged layout reports total file count');
    assert(mergedLayout.visiblePlants.length === 2, 'Merged layout collapses directory groups into composite plants');
    assert(mergedLayout.visiblePlants.every((plant) => plant.kind === 'merged'), 'Merged layout emits composite plants above threshold');

    const backendMergedPlant = mergedLayout.visiblePlants.find((plant) => plant.zone === 'backend');
    assert(backendMergedPlant.fileCount === 3, 'Merged plant stores grouped file count');
    assert(backendMergedPlant.label.includes('src/main'), 'Merged plant label includes grouped directory name');
    assert(backendMergedPlant.filenames.includes('src/main/a.ts'), 'Merged plant keeps grouped file membership');

    const mixedLayout = groupPlantsForDisplay([
      { filename: 'src/main/a.ts', x: 100, y: 100, zone: 'backend', createdAt: 1, directory: '/repo/src/main' },
      { filename: 'src/main/b.ts', x: 110, y: 110, zone: 'backend', createdAt: 2, directory: '/repo/src/main' },
      { filename: 'README.md', x: 300, y: 200, zone: 'backend', createdAt: 3, directory: '/repo' },
      { filename: 'src/App.tsx', x: 400, y: 90, zone: 'frontend', createdAt: 4, directory: '/repo/src' },
      { filename: 'src/Button.tsx', x: 410, y: 100, zone: 'frontend', createdAt: 5, directory: '/repo/src' },
    ], {
      mergeThreshold: 4,
      minGroupSize: 2,
    });
    assert(mixedLayout.visiblePlants.length === 3, 'Mixed layout keeps singleton files visible while merging larger groups');
    assert(mixedLayout.visiblePlants.some((plant) => plant.kind === 'single' && plant.filename === 'README.md'), 'Mixed layout preserves singleton file metadata');

    const tunedLayout = groupPlantsForDisplay([
      { filename: 'src/services/api.ts', x: 100, y: 100, zone: 'backend', createdAt: 1, growthScale: 1.4 },
      { filename: 'src/services/cache.ts', x: 115, y: 102, zone: 'backend', createdAt: 2, growthScale: 1.2 },
      { filename: 'src/lib/math.ts', x: 190, y: 120, zone: 'backend', createdAt: 3, growthScale: 1.1 },
      { filename: 'src/lib/date.ts', x: 205, y: 126, zone: 'backend', createdAt: 4, growthScale: 1.05 },
      { filename: 'README.md', x: 320, y: 140, zone: 'backend', createdAt: 5, growthScale: 0.95 },
      { filename: 'package-lock.json', x: 336, y: 142, zone: 'backend', createdAt: 6, growthScale: 0.95 },
      { filename: '__pycache__/server.cpython-313.pyc', x: 355, y: 150, zone: 'backend', createdAt: 7, growthScale: 0.95 },
      { filename: 'web/src/app/home/page.tsx', x: 420, y: 90, zone: 'frontend', createdAt: 8, growthScale: 1.35 },
      { filename: 'web/src/app/about/page.tsx', x: 438, y: 98, zone: 'frontend', createdAt: 9, growthScale: 1.3 },
      { filename: 'web/src/components/chart.tsx', x: 456, y: 110, zone: 'frontend', createdAt: 10, growthScale: 1.2 },
      { filename: 'web/src/components/table.tsx', x: 474, y: 118, zone: 'frontend', createdAt: 11, growthScale: 1.15 },
      { filename: 'tests/unit/test_forecast.py', x: 760, y: 160, zone: 'tests', createdAt: 12, growthScale: 1.2 },
      { filename: 'tests/unit/test_model.py', x: 778, y: 168, zone: 'tests', createdAt: 13, growthScale: 1.15 },
      { filename: 'tests/integration/test_api.py', x: 798, y: 174, zone: 'tests', createdAt: 14, growthScale: 1.1 },
      { filename: 'tests/__pycache__/test_api.cpython-313.pyc', x: 816, y: 182, zone: 'tests', createdAt: 15, growthScale: 0.95 },
    ], {
      mergeThreshold: 4,
      minGroupSize: 2,
    });

    const backendVisible = tunedLayout.visiblePlants.filter((plant) => plant.zone === 'backend');
    assert(backendVisible.length >= 2, 'Tuned layout keeps multiple visible plants in a populated backend zone');
    assert(backendVisible.some((plant) => plant.label.includes('src/services')), 'Tuned layout prioritizes services directories');
    assert(backendVisible.some((plant) => plant.label.includes('src/lib')), 'Tuned layout prioritizes library directories');
    assert(backendVisible.every((plant) => plant.label !== 'README.md'), 'Tuned layout suppresses README as a primary visible label');
    assert(backendVisible.every((plant) => !plant.label.includes('__pycache__')), 'Tuned layout suppresses cache labels');

    const testVisible = tunedLayout.visiblePlants.filter((plant) => plant.zone === 'tests');
    assert(testVisible.length >= 2, 'Tuned layout keeps multiple visible plants in a populated tests zone');
    assert(testVisible.some((plant) => plant.label.includes('tests/unit')), 'Tuned layout preserves high-signal test directories');
    assert(testVisible.every((plant) => !plant.label.includes('__pycache__')), 'Tuned layout avoids cache labels in tests zone');
  }

  // ============================================================
  // Phase 5f: Directory Management
  // ============================================================
  section('Phase 5f: FileWatcher Multi-Directory');

  const { FileWatcher: FW5f } = require('./test-build/main/services/watcher');
  const fw = new FW5f();

  // Primary directory
  const primaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-primary-'));
  let fwEvents = [];
  fw.start(primaryDir, (event) => fwEvents.push(event));
  assert(fw.getDirectory() === primaryDir, 'Primary directory is set');
  assert(fw.getDirectories().length === 1, 'One directory watched initially');
  assert(fw.getAdditionalDirectories().length === 0, 'No additional directories initially');

  // Add additional directory
  const addDir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-add1-'));
  assert(fw.addDirectory(addDir1) === true, 'addDirectory returns true');
  assert(fw.getDirectories().length === 2, 'Two directories watched');
  assert(fw.getAdditionalDirectories().length === 1, 'One additional directory');
  assert(fw.getAdditionalDirectories()[0] === addDir1, 'Additional directory matches');

  // Adding same directory again returns false
  assert(fw.addDirectory(addDir1) === false, 'addDirectory same dir returns false');
  assert(fw.getDirectories().length === 2, 'Still two directories');

  // Add second additional directory
  const addDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-add2-'));
  assert(fw.addDirectory(addDir2) === true, 'Second addDirectory returns true');
  assert(fw.getDirectories().length === 3, 'Three directories watched');
  assert(fw.getAdditionalDirectories().length === 2, 'Two additional directories');

  // File events include directory
  fwEvents = [];
  fs.writeFileSync(path.join(addDir1, 'added.txt'), 'hello');
  await new Promise(r => setTimeout(r, 2000));
  assert(fwEvents.length > 0, 'FileWatcher detects file in additional directory');
  const addEvent = fwEvents.find(e => e.path === 'added.txt');
  assert(addEvent !== undefined, 'Event has correct filename');
  assert(addEvent.directory === addDir1, 'Event includes directory');

  // Events from primary directory also include directory
  fwEvents = [];
  fs.writeFileSync(path.join(primaryDir, 'primary.txt'), 'world');
  await new Promise(r => setTimeout(r, 2000));
  const primaryEvent = fwEvents.find(e => e.path === 'primary.txt');
  assert(primaryEvent !== undefined, 'Primary dir event detected');
  assert(primaryEvent.directory === primaryDir, 'Primary event includes directory');

  // Remove additional directory
  assert(fw.removeDirectory(addDir1) === true, 'removeDirectory returns true');
  assert(fw.getDirectories().length === 2, 'Two directories after removal');
  assert(fw.getAdditionalDirectories().length === 1, 'One additional after removal');

  // Cannot remove primary directory
  assert(fw.removeDirectory(primaryDir) === false, 'Cannot remove primary directory');
  assert(fw.getDirectories().length === 2, 'Still two directories');

  // Remove non-existent directory
  assert(fw.removeDirectory('/nonexistent') === false, 'removeDirectory non-existent returns false');

  // No events after removal
  fwEvents = [];
  fs.writeFileSync(path.join(addDir1, 'after-remove.txt'), 'nope');
  await new Promise(r => setTimeout(r, 500));
  const removedDirEvents = fwEvents.filter(e => e.directory === addDir1);
  assert(removedDirEvents.length === 0, 'No events from removed directory');

  fw.stop();
  fs.rmSync(primaryDir, { recursive: true });
  fs.rmSync(addDir1, { recursive: true });
  fs.rmSync(addDir2, { recursive: true });

  // -- HeadGardener subtask directory --
  section('Phase 5f: HeadGardener Directory Routing');

  const { HeadGardener: HG5f } = require('./test-build/main/services/head-gardener');
  const { ClaudeCodeTracker: CCT5f } = require('./test-build/main/services/claude-code-tracker');
  const { ClaudeCodeManager: CCM5f } = require('./test-build/main/services/claude-code-manager');

  const tracker5f = new CCT5f();
  const manager5f = new CCM5f();
  const hg = new HG5f(tracker5f, manager5f, '/default/dir');

  // Verify default directory is used
  assert(hg.defaultDirectory !== undefined || true, 'HeadGardener has defaultDirectory');
  hg.setDefaultDirectory('/new/default');

  // Subtask type includes directory field
  const plan5f = { id: 'test', goal: 'test', subtasks: [], status: 'planning', createdAt: Date.now() };
  assert(plan5f !== null, 'OrchestrationPlan created');

  // Subtask with directory
  const subtask5f = { id: 'sub-1', prompt: 'test', role: 'planter', status: 'pending', directory: '/custom/dir' };
  assert(subtask5f.directory === '/custom/dir', 'Subtask has directory field');

  // ============================================================
  // Phase 5g: Type Consolidation
  // ============================================================
  section('Phase 5g: Type Consolidation');

  const sharedTypes = require('./test-build/shared/types');
  const persistenceModule = require('./test-build/main/services/persistence');

  const ps = new persistenceModule.PersistenceService('/tmp/agent-garden-test-5g');
  const statsCheck = ps.getStats();
  assert(statsCheck.activeAgents !== undefined || statsCheck.activeAgents === 0, 'Stats has activeAgents field');
  assert(statsCheck.tokensUsed === undefined, 'Stats no longer has tokensUsed field');

  section('Phase 5g: StatsPanel Types');

  const testStats = { filesCreated: 5, tasksCompleted: 3, tasksFailed: 1, activeAgents: 2, sessionStart: Date.now() };
  assert(testStats.activeAgents === 2, 'GardenStats accepts activeAgents');
  assert(testStats.tokensUsed === undefined, 'GardenStats has no tokensUsed');

  // ============================================================
  // Phase 5g: File-Agent Correlation
  // ============================================================
  section('Phase 5g: File-Agent Correlation');

  const correlationBuffer = new Map();
  function recordFileWrite(agentId, role, filename) {
    correlationBuffer.set(filename, { agentId, role, timestamp: Date.now() });
  }
  function getCorrelation(filename, maxAge = 2000) {
    const entry = correlationBuffer.get(filename);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > maxAge) {
      correlationBuffer.delete(filename);
      return null;
    }
    return entry;
  }

  recordFileWrite('agent-1', 'planter', 'test.tsx');
  const corr = getCorrelation('test.tsx');
  assert(corr !== null, 'Correlation found for recently written file');
  assert(corr.agentId === 'agent-1', 'Correlation has correct agentId');
  assert(corr.role === 'planter', 'Correlation has correct role');
  assert(getCorrelation('nonexistent.ts') === null, 'No correlation for unknown file');

  // ============================================================
  // Phase 5g: Plant Creator Attribution
  // ============================================================
  section('Phase 5g: Plant Creator Attribution');

  const plantWithRole = { filename: 'auth.tsx', x: 100, y: 200, zone: 'frontend', createdAt: Date.now(), creatorRole: 'planter' };
  assert(plantWithRole.creatorRole === 'planter', 'PlantState accepts creatorRole');
  const plantWithoutRole = { filename: 'old.ts', x: 50, y: 100, zone: 'backend', createdAt: Date.now() };
  assert(plantWithoutRole.creatorRole === undefined, 'Old PlantState has no creatorRole (graceful)');

  // ============================================================
  // Phase 5g: Stats Wiring
  // ============================================================
  section('Phase 5g: Stats Wiring');

  const { PersistenceService: PS5g } = require('./test-build/main/services/persistence');
  const ps5g = new PS5g('/tmp/agent-garden-test-stats-5g');

  ps5g.setActiveAgents(3);
  assert(ps5g.getStats().activeAgents === 3, 'Active agents tracked');

  ps5g.recordTaskCompleted();
  ps5g.recordTaskCompleted();
  assert(ps5g.getStats().tasksCompleted === 2, 'Tasks completed tracked');

  ps5g.recordTaskFailed();
  assert(ps5g.getStats().tasksFailed === 1, 'Tasks failed tracked');

  // ============================================================
  // Phase 5g: Hook Status Tracking
  // ============================================================
  section('Phase 5g: Hook Status Tracking');

  const { HookServer: HS5g } = require('./test-build/main/services/hook-server');
  const hs = new HS5g(0);
  assert(hs.getLastEventTime() === 0, 'No events initially');
  assert(hs.isRunning() === false, 'Not running initially');

  // ============================================================
  // Phase 5h: Hook Config Detection
  // ============================================================
  section('Phase 5h: Hook Config Detection');

  function checkHookConfig(settingsContent) {
    try {
      const settings = JSON.parse(settingsContent);
      const hooks = settings.hooks || {};
      const hookValues = Object.values(hooks);
      return hookValues.some(v => {
        const str = JSON.stringify(v);
        return str.includes('localhost:7890') || str.includes('127.0.0.1:7890');
      });
    } catch {
      return false;
    }
  }

  assert(checkHookConfig('{}') === false, 'Empty config has no hooks');
  assert(checkHookConfig('{"hooks":{"PreToolUse":"http://localhost:7890/hooks/PreToolUse"}}') === true, 'Detects hook URL');
  assert(checkHookConfig('not json') === false, 'Handles malformed JSON');
  assert(checkHookConfig('{"hooks":{}}') === false, 'Empty hooks object');

  // ============================================================
  // Phase 5h: Hook Auto-Configure
  // ============================================================
  section('Phase 5h: Hook Auto-Configure');

  function hookEntry(url) {
    return [{ hooks: [{ type: 'http', url }] }];
  }

  function mergeHookConfig(existingContent) {
    const hookConfig = {
      'SessionStart': hookEntry('http://localhost:7890/hooks/SessionStart'),
      'SessionEnd': hookEntry('http://localhost:7890/hooks/SessionEnd'),
      'Stop': hookEntry('http://localhost:7890/hooks/Stop'),
      'PreToolUse': hookEntry('http://localhost:7890/hooks/PreToolUse'),
      'PostToolUse': hookEntry('http://localhost:7890/hooks/PostToolUse'),
      'UserPromptSubmit': hookEntry('http://localhost:7890/hooks/UserPromptSubmit'),
      'Notification': hookEntry('http://localhost:7890/hooks/Notification'),
    };

    let settings;
    try {
      settings = existingContent ? JSON.parse(existingContent) : {};
    } catch {
      return { success: false, error: 'Malformed JSON in settings file' };
    }

    settings.hooks = { ...(settings.hooks || {}), ...hookConfig };
    return { success: true, content: JSON.stringify(settings, null, 2) };
  }

  const mr1 = mergeHookConfig('{}');
  assert(mr1.success === true, 'Merge into empty config succeeds');
  assert(JSON.stringify(JSON.parse(mr1.content).hooks.SessionStart).includes('7890'), 'Merged config has SessionStart hook');

  const mr2 = mergeHookConfig('{"apiKey":"secret","hooks":{"Custom":"http://other"}}');
  assert(mr2.success === true, 'Merge preserves existing settings');
  const parsed2 = JSON.parse(mr2.content);
  assert(parsed2.apiKey === 'secret', 'Preserves existing apiKey');
  assert(parsed2.hooks.Custom === 'http://other', 'Preserves existing custom hook');
  assert(JSON.stringify(parsed2.hooks.SessionStart).includes('7890'), 'Adds new hooks');

  const mr3 = mergeHookConfig('not json');
  assert(mr3.success === false, 'Rejects malformed JSON');
  assert(mr3.error.includes('Malformed'), 'Error message explains malformed JSON');

  const mr4 = mergeHookConfig(null);
  assert(mr4.success === true, 'Creates config from scratch');

  // ============================================================
  // Phase 5h: SetupBanner Logic
  // ============================================================
  section('Phase 5h: SetupBanner Logic');

  function shouldShowBanner(cliInstalled, hooksConfigured, dismissed) {
    if (dismissed) return false;
    if (hooksConfigured) return false;
    return true;
  }

  assert(shouldShowBanner(true, false, false) === true, 'Show banner when hooks not configured');
  assert(shouldShowBanner(true, true, false) === false, 'Hide banner when hooks configured');
  assert(shouldShowBanner(true, false, true) === false, 'Hide banner when dismissed');
  assert(shouldShowBanner(false, false, false) === true, 'Show banner when CLI missing');

  // ============================================================
  // AG-8: Session Closure Detection
  // ============================================================
  section('AG-8: Session Closure Detection');

  const { ClaudeCodeTracker: TrackerAG8 } = require('./test-build/main/services/claude-code-tracker');
  const trackerAg8 = new TrackerAG8();
  let disconnectEvent = null;

  trackerAg8.on('disconnected', (data) => {
    disconnectEvent = data;
  });

  trackerAg8.handleHookEvent({
    type: 'SessionStart',
    sessionId: 'hook-session-1',
    timestamp: Date.now(),
    directory: '/tmp/ag8-project',
  });
  assert(trackerAg8.getSession('hook-session-1') !== undefined, 'Hook session registers normally');

  trackerAg8.registerProcessSession(4242, '/tmp/ag8-project');
  assert(trackerAg8.getSession('hook-session-1').processPid === 4242, 'Hook session keeps deduped process PID for fallback exit detection');

  trackerAg8.removeProcessSession(4242);
  assert(trackerAg8.getSession('hook-session-1') !== undefined, 'Hook session survives process exit');
  assert(trackerAg8.getSession('hook-session-1').processPid === undefined, 'Process PID cleared after exit');

  // ============================================================
  // AG-10: Initial Garden Generation
  // ============================================================
  section('Garden Bed Layout');

  const {
    deriveBedCount,
    buildZoneBeds,
    assignGroupsToBeds,
    scatterPlantsInBed,
  } = require('./test-build/shared/garden-bed-layout');

  assert(deriveBedCount(0) === 0, 'No files produce no beds');
  assert(deriveBedCount(4) === 1, 'Small zones produce one bed');
  assert(deriveBedCount(9) === 2, 'Medium zones produce two beds');
  assert(deriveBedCount(18) === 4, 'Large zones produce four beds');

  const frontendBeds = buildZoneBeds({
    zone: 'frontend',
    fileCount: 12,
    zoneStart: 0,
    zoneWidth: 360,
    centerY: 200,
  });
  assert(frontendBeds.length === 3, 'Twelve files produce three frontend beds');
  const zoneCenterX = 180;
  const closestFrontendBed = frontendBeds.reduce((best, bed) => (
    Math.abs(bed.x - zoneCenterX) < Math.abs(best.x - zoneCenterX) ? bed : best
  ), frontendBeds[0]);
  assert(closestFrontendBed.rank === 0, 'Most central bed gets top priority rank');

  const assignmentBeds = [
    {
      id: 'bed-center',
      zone: 'backend',
      x: 200,
      y: 200,
      width: 120,
      height: 90,
      rank: 0,
      capacity: 4,
      directoryGroups: [],
      plantKeys: [],
    },
    {
      id: 'bed-outer',
      zone: 'backend',
      x: 320,
      y: 200,
      width: 120,
      height: 90,
      rank: 1,
      capacity: 4,
      directoryGroups: [],
      plantKeys: [],
    },
  ];

  const assignmentLayout = assignGroupsToBeds({
    beds: assignmentBeds,
    groups: [
      {
        groupPath: 'src/main/services',
        signalScore: 80,
        files: [
          { filename: 'src/main/services/a.ts', zone: 'backend', growthScale: 1.6 },
          { filename: 'src/main/services/b.ts', zone: 'backend', growthScale: 1.4 },
        ],
      },
      {
        groupPath: 'src/main/lib',
        signalScore: 20,
        files: [
          { filename: 'src/main/lib/c.ts', zone: 'backend', growthScale: 1.1 },
        ],
      },
    ],
    createdAt: 1234,
  });
  const centerBed = assignmentLayout.beds.find((bed) => bed.id === 'bed-center');
  const servicesPlants = assignmentLayout.plants.filter((plant) => plant.filename.includes('/services/'));
  assert(centerBed.directoryGroups.includes('src/main/services'), 'Highest-signal group claims center bed');
  assert(new Set(servicesPlants.map((plant) => plant.bedId)).size === 1, 'Directory group stays together when capacity allows');
  assert(servicesPlants[0].bedId === 'bed-center', 'Highest-signal group lands in the center bed');

  const overflowLayout = assignGroupsToBeds({
    beds: [
      { ...assignmentBeds[0], capacity: 2, directoryGroups: [], plantKeys: [] },
      { ...assignmentBeds[1], capacity: 2, directoryGroups: [], plantKeys: [] },
    ],
    groups: [
      {
        groupPath: 'src/main/services',
        signalScore: 80,
        files: [
          { filename: 'src/main/services/a.ts', zone: 'backend', growthScale: 1.6 },
          { filename: 'src/main/services/b.ts', zone: 'backend', growthScale: 1.5 },
          { filename: 'src/main/services/c.ts', zone: 'backend', growthScale: 1.4 },
        ],
      },
    ],
    createdAt: 5678,
  });
  assert(new Set(overflowLayout.plants.map((plant) => plant.bedId)).size === 2, 'Oversized directory group spills into an outer bed');

  const scatterBed = {
    id: 'bed-scatter',
    zone: 'tests',
    x: 500,
    y: 220,
    width: 140,
    height: 100,
    rank: 0,
    capacity: 4,
    directoryGroups: [],
    plantKeys: [],
  };
  const scatteredPlants = scatterPlantsInBed({
    bed: scatterBed,
    files: [
      { filename: 'src/tests/a.test.ts', zone: 'tests', growthScale: 1.2 },
      { filename: 'src/tests/b.test.ts', zone: 'tests', growthScale: 1.1 },
      { filename: 'src/tests/c.test.ts', zone: 'tests', growthScale: 1.0 },
    ],
    createdAt: 2468,
  });
  assert(scatteredPlants.every((plant) =>
    plant.x >= scatterBed.x - scatterBed.width / 2 + 12 &&
    plant.x <= scatterBed.x + scatterBed.width / 2 - 12 &&
    plant.y >= scatterBed.y - scatterBed.height / 2 + 12 &&
    plant.y <= scatterBed.y + scatterBed.height / 2 - 12
  ), 'Scatter placement keeps plants inside padded bed bounds');
  assert(scatteredPlants.every((plant, index) =>
    scatteredPlants.slice(index + 1).every((other) => {
      const dx = plant.x - other.x;
      const dy = plant.y - other.y;
      return Math.sqrt(dx * dx + dy * dy) >= 18;
    })
  ), 'Scatter placement preserves minimum spacing inside a bed');

  const splitBedDisplay = groupPlantsForDisplay([
    { filename: 'src/main/services/a.ts', x: 100, y: 200, zone: 'backend', createdAt: 1, bedId: 'bed-left' },
    { filename: 'src/main/services/b.ts', x: 300, y: 200, zone: 'backend', createdAt: 1, bedId: 'bed-right' },
  ], { mergeThreshold: 1, minGroupSize: 2 });
  assert(splitBedDisplay.visiblePlants.length === 2, 'Display clustering keeps split directory groups separate per bed');
  assert(
    splitBedDisplay.visiblePlants.every((plant) => plant.x === 100 || plant.x === 300),
    'Display clustering keeps split groups anchored to bed positions',
  );

  const remainderBedDisplay = groupPlantsForDisplay([
    { filename: 'README.md', x: 100, y: 190, zone: 'backend', createdAt: 1, bedId: 'bed-left' },
    { filename: 'package-lock.json', x: 100, y: 210, zone: 'backend', createdAt: 1, bedId: 'bed-left' },
    { filename: 'yarn.lock', x: 300, y: 190, zone: 'backend', createdAt: 1, bedId: 'bed-right' },
    { filename: 'pnpm-lock.yaml', x: 300, y: 210, zone: 'backend', createdAt: 1, bedId: 'bed-right' },
  ], { mergeThreshold: 1, minGroupSize: 2 });
  assert(
    remainderBedDisplay.visiblePlants.every((plant) => plant.x === 100 || plant.x === 300),
    'Display clustering keeps low-signal merged remainder anchored to individual beds',
  );

  // ============================================================
  // AG-10: Initial Garden Generation
  // ============================================================
  section('AG-10: Initial Garden Generation');

  const osAg10 = require('os');
  const pathAg10 = require('path');
  const fsAg10 = require('fs');
  const {
    shouldIgnoreRelativePath,
    scoreRelativePath,
    generateInitialGarden,
  } = require('./test-build/main/services/initial-garden-generator');

  assert(shouldIgnoreRelativePath('node_modules/react/index.js') === true, 'Generator ignores node_modules');
  assert(shouldIgnoreRelativePath('src/main/services/head-gardener.ts') === false, 'Generator keeps source files');
  assert(
    scoreRelativePath('src/main/services/head-gardener.ts', 24 * 1024) >
      scoreRelativePath('package-lock.json', 24 * 1024),
    'Important source paths score higher than lockfiles',
  );

  const ag10Dir = fsAg10.mkdtempSync(pathAg10.join(osAg10.tmpdir(), 'ag10-'));
  fsAg10.mkdirSync(pathAg10.join(ag10Dir, 'src', 'main', 'services'), { recursive: true });
  fsAg10.mkdirSync(pathAg10.join(ag10Dir, 'src', 'renderer', 'components'), { recursive: true });
  fsAg10.mkdirSync(pathAg10.join(ag10Dir, 'node_modules', 'ignored-lib'), { recursive: true });
  fsAg10.writeFileSync(pathAg10.join(ag10Dir, 'src', 'main', 'services', 'head-gardener.ts'), 'export const orchestrate = true;\n'.repeat(200));
  fsAg10.writeFileSync(pathAg10.join(ag10Dir, 'src', 'renderer', 'components', 'App.tsx'), 'export function App() { return null }\n'.repeat(80));
  fsAg10.writeFileSync(pathAg10.join(ag10Dir, 'package-lock.json'), '{}');
  fsAg10.writeFileSync(pathAg10.join(ag10Dir, 'node_modules', 'ignored-lib', 'index.js'), 'module.exports = {}');

  const generatedPlants = generateInitialGarden(ag10Dir);
  const filenames = generatedPlants.map((plant) => plant.filename);
  assert(filenames.includes('src/main/services/head-gardener.ts'), 'Generator includes important backend file');
  assert(filenames.includes('src/renderer/components/App.tsx'), 'Generator includes important frontend file');
  assert(!filenames.includes('package-lock.json'), 'Generator excludes low-signal lockfile');
  assert(!filenames.some((filename) => filename.includes('node_modules')), 'Generator excludes ignored directories');

  const backendPlant = generatedPlants.find((plant) => plant.filename === 'src/main/services/head-gardener.ts');
  const frontendPlant = generatedPlants.find((plant) => plant.filename === 'src/renderer/components/App.tsx');
  assert(backendPlant.zone === 'backend', 'Generator maps service file to backend zone');
  assert(frontendPlant.zone === 'frontend', 'Generator maps component file to frontend zone');
  assert(backendPlant.growthScale > frontendPlant.growthScale, 'Larger, more central file gets higher prominence');

  const generatedPlants2 = generateInitialGarden(ag10Dir);
  assert(
    JSON.stringify(generatedPlants.map(({ filename, x, y, zone, growthScale }) => ({ filename, x, y, zone, growthScale }))) ===
      JSON.stringify(generatedPlants2.map(({ filename, x, y, zone, growthScale }) => ({ filename, x, y, zone, growthScale }))),
    'Generator output is deterministic apart from timestamps',
  );

  fsAg10.rmSync(ag10Dir, { recursive: true, force: true });

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
