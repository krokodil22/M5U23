const directionOrder = ['up', 'right', 'down', 'left'];
const directionVectors = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
const directionRotation = { up: 0, right: 90, down: 180, left: 270 };

// 0 — стена, 1 — туннель, 2 — старт, 3 — финиш.
const levelMaps = [
  ['00000000000','00000000000','00000000000','00000000000','00000000000','02111111130','00000000000','00000000000','00000000000','00000000000','00000000000','00000000000'],
  ['00000000000','00000000000','00000000000','02111111100','00000000100','00000000100','00000000100','00000000100','00000000300','00000000000','00000000000','00000000000'],
  ['00000000000','00000000000','00000000000','02111111100','00000000100','00000000100','00000000100','00000000100','03111111100','00000000000','00000000000','00000000000'],
  ['00000000000','00000000000','00000000000','02111111100','00000000100','00111110100','00100010100','00103110100','00100000100','00111111100','00000000000','00000000000'],
  ['00000000000','00000000000','00000000000','00030000000','00010000000','00010000000','00011110000','00000010000','00000010000','00000020000','00000000000','00000000000'],
  ['00000000000','00000000000','02111111110','00000000100','00100000100','00130000100','00100000100','00100000100','01111111110','00100000100','00000000100','00000000000'],
  ['00000000000','00000000000','02111000000','00001000000','00001111110','00000000010','00000000010','00000000010','00000000010','00000000010','00000000030','00000000000'],
  ['00000000000','00000000000','01110000000','01010111000','01010101000','01010101000','01010101000','01010101000','01010101000','01011101000','02000001130','00000000000'],
  ['00000000000','00000000000','02000003000','01000101000','01000101000','01000101000','11111111110','01000001000','01000001000','01000000000','01000000000','00000000000'],
  ['00000000000','00000000000','00200000000','00101010000','00101010100','00101010100','01111111110','00101010000','00101130000','00100000000','00000000000','00000000000'],
];
const commandLimits = [3, 7, 6, 6, 10, 7, 10, 18, 12, 12];

const levels = levelMaps.map((map, index) => {
  let start;
  let finish;
  const path = [];
  map.forEach((line, row) => [...line].forEach((value, col) => {
    if (value !== '0') path.push([row, col]);
    if (value === '2') start = [row, col];
    if (value === '3') finish = [row, col];
  }));
  return { title: `Уровень ${index + 1}`, map, path, start, finish, commandLimit: commandLimits[index] };
});

const board = document.getElementById('board');
const levelTitle = document.getElementById('level-title');
const levelProgress = document.getElementById('level-progress');
const workspaceContainer = document.getElementById('blockly-workspace');
const runButton = document.getElementById('run-program');
const levelSelect = document.getElementById('level-select');
const levelCompleteModal = document.getElementById('level-complete-modal');
const levelCompleteTitle = document.getElementById('level-complete-title');
const levelCompleteMessage = document.getElementById('level-complete-message');
const nextLevelButton = document.getElementById('next-level-button');
const retryLevelButton = document.getElementById('retry-level-button');
const levelHint = document.getElementById('level-hint');
const levelRule = document.getElementById('level-rule');

function getToolbox(levelIndex) {
  const contents = [
    { kind: 'block', type: 'maze_move_forward' },
    { kind: 'block', type: 'maze_turn_left' },
    { kind: 'block', type: 'maze_turn_right' },
    { kind: 'block', type: 'maze_repeat_until' },
    { kind: 'sep', gap: 28 },
    { kind: 'label', text: 'Сенсоры' },
    { kind: 'block', type: 'maze_sensor_finish' },
    { kind: 'block', type: 'maze_sensor_left' },
    { kind: 'block', type: 'maze_sensor_right' },
  ];

  if (levelIndex >= 2) contents.splice(4, 0, { kind: 'block', type: 'maze_if' });
  return { kind: 'flyoutToolbox', contents };
}

let workspace;
let currentLevelIndex = 0;
let currentPosition;
let currentDirection = 'right';
let highestUnlockedLevel = 0;
let isProgramRunning = false;
const progressStorageKey = 'tunnel-highest-unlocked-level';

const defineBlocks = Blockly.common?.defineBlocksWithJsonArray ?? Blockly.defineBlocksWithJsonArray;
defineBlocks([
  { type: 'maze_start', message0: 'Запуск', nextStatement: null, colour: 45, deletable: false, movable: false, hat: 'cap' },
  { type: 'maze_move_forward', message0: 'шаг вперед', previousStatement: null, nextStatement: null, colour: 340 },
  { type: 'maze_turn_left', message0: 'повернуть налево', previousStatement: null, nextStatement: null, colour: 340 },
  { type: 'maze_turn_right', message0: 'повернуть направо', previousStatement: null, nextStatement: null, colour: 340 },
  { type: 'maze_repeat_until', message0: 'повторять, пока не %1 %2 %3', args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210 },
  { type: 'maze_if', message0: 'если %1 то %2 %3', args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: 210 },
  { type: 'maze_sensor_finish', message0: 'финиш', output: 'Boolean', colour: 120 },
  { type: 'maze_sensor_left', message0: 'проход слева', output: 'Boolean', colour: 120 },
  { type: 'maze_sensor_right', message0: 'проход справа', output: 'Boolean', colour: 120 },
]);

function initializeBlockly() {
  workspace = Blockly.inject(workspaceContainer, {
    toolbox: getToolbox(0), toolboxPosition: 'start', trashcan: true, renderer: 'zelos',
    grid: { spacing: 24, length: 3, colour: 'rgba(124,140,255,.18)', snap: true },
    zoom: { controls: true, wheel: true, startScale: .9, maxScale: 1.4, minScale: .6, scaleSpeed: 1.1 },
    move: { scrollbars: true, drag: true, wheel: true },
  });
  resetWorkspace();
  requestAnimationFrame(() => { Blockly.svgResize(workspace); workspace.scrollCenter(); });
  window.addEventListener('resize', () => Blockly.svgResize(workspace));
}

function resetWorkspace() {
  if (!workspace) return;
  workspace.clear();
  const block = workspace.newBlock('maze_start');
  block.initSvg(); block.render(); block.moveBy(36, 36);
  Blockly.svgResize(workspace);
}

const toKey = ([row, col]) => `${row},${col}`;
const getCurrentLevel = () => levels[currentLevelIndex];
const applyMove = (position, direction) => position.map((value, index) => value + directionVectors[direction][index]);
function rotateDirection(direction, turn) {
  const shift = turn === 'turn-left' ? -1 : 1;
  return directionOrder[(directionOrder.indexOf(direction) + shift + 4) % 4];
}
function getInitialDirection(level) {
  const [row, col] = level.start;
  return directionOrder.find((direction) => level.path.some((point) => toKey(point) === toKey(applyMove([row, col], direction)))) || 'right';
}

function renderLevelOptions() {
  levelSelect.innerHTML = levels.map((level, index) => `<option value="${index}" ${index === currentLevelIndex ? 'selected' : ''} ${index > highestUnlockedLevel ? 'disabled' : ''}>${level.title}${index > highestUnlockedLevel ? ' 🔒' : ''}</option>`).join('');
}

function renderBoard() {
  const level = getCurrentLevel();
  board.style.gridTemplateColumns = `repeat(${level.map[0].length}, minmax(0, 1fr))`;
  board.style.gridTemplateRows = `repeat(${level.map.length}, minmax(0, 1fr))`;
  board.innerHTML = '';
  level.map.forEach((line, row) => [...line].forEach((value, col) => {
    const cell = document.createElement('div');
    cell.className = `cell ${value === '0' ? 'empty' : 'path'} ${value === '2' ? 'start' : ''} ${value === '3' ? 'finish' : ''}`;
    if (row === currentPosition?.[0] && col === currentPosition?.[1]) {
      const hero = document.createElement('div');
      hero.className = 'hero';
      hero.style.transform = `rotate(${directionRotation[currentDirection]}deg)`;
      cell.appendChild(hero);
    }
    board.appendChild(cell);
  }));
  levelTitle.textContent = level.title;
  levelProgress.textContent = `Открыто уровней: ${highestUnlockedLevel + 1} из ${levels.length}`;
  levelHint.textContent = 'Собери программу с циклами и сенсорами, чтобы добраться до финиша.';
  levelRule.textContent = level.commandLimit ? `Лимит: ${level.commandLimit} команд` : 'На этом уровне лимита команд нет';
  renderLevelOptions();
}

function resetLevelState() {
  currentPosition = [...getCurrentLevel().start];
  currentDirection = getInitialDirection(getCurrentLevel());
  renderBoard();
}
function setLevel(index) {
  if (index < 0 || index > highestUnlockedLevel || index >= levels.length) return;
  currentLevelIndex = index;
  hideModal(); workspace.updateToolbox(getToolbox(index)); resetWorkspace(); resetLevelState();
}
function saveProgress() { try { localStorage.setItem(progressStorageKey, highestUnlockedLevel); } catch (_) { /* storage may be disabled */ } }
function loadProgress() { try { highestUnlockedLevel = Math.min(Math.max(parseInt(localStorage.getItem(progressStorageKey), 10) || 0, 0), levels.length - 1); } catch (_) { highestUnlockedLevel = 0; } }

function countBlocks(block) {
  let count = 0;
  for (let current = block; current; current = current.getNextBlock()) {
    count += 1;
    if (current.type === 'maze_if' || current.type === 'maze_repeat_until') {
      count += countBlocks(current.getInputTargetBlock('CONDITION'));
      count += countBlocks(current.getInputTargetBlock('DO'));
    }
  }
  return count;
}

function passageAt(relativeTurn) {
  const direction = rotateDirection(currentDirection, relativeTurn);
  return getCurrentLevel().path.some((point) => toKey(point) === toKey(applyMove(currentPosition, direction)));
}
function evaluateSensor(block) {
  if (!block) return false;
  if (block.type === 'maze_sensor_finish') return toKey(currentPosition) === toKey(getCurrentLevel().finish);
  if (block.type === 'maze_sensor_left') return passageAt('turn-left');
  if (block.type === 'maze_sensor_right') return passageAt('turn-right');
  return false;
}
const pause = () => new Promise((resolve) => setTimeout(resolve, 260));
async function executeChain(block, budget) {
  for (let current = block; current; current = current.getNextBlock()) {
    if (--budget.steps < 0) throw new Error('Программа выполняется слишком долго. Проверь условие цикла.');
    if (current.type === 'maze_move_forward') {
      currentPosition = applyMove(currentPosition, currentDirection);
      await pause(); renderBoard();
      if (!getCurrentLevel().path.some((point) => toKey(point) === toKey(currentPosition))) throw new Error('Герой вышел из туннеля.');
    } else if (current.type === 'maze_turn_left' || current.type === 'maze_turn_right') {
      currentDirection = rotateDirection(currentDirection, current.type === 'maze_turn_left' ? 'turn-left' : 'turn-right');
      await pause(); renderBoard();
    } else if (current.type === 'maze_if') {
      if (evaluateSensor(current.getInputTargetBlock('CONDITION'))) await executeChain(current.getInputTargetBlock('DO'), budget);
    } else if (current.type === 'maze_repeat_until') {
      const condition = current.getInputTargetBlock('CONDITION');
      const body = current.getInputTargetBlock('DO');
      if (!condition || !body) throw new Error('Заполни условие и тело цикла.');
      while (!evaluateSensor(condition)) await executeChain(body, budget);
    }
  }
}

function showModal(message, success = false) {
  levelCompleteTitle.hidden = false;
  levelCompleteTitle.textContent = success ? 'Молодец!' : 'Попробуй ещё раз';
  levelCompleteMessage.textContent = message;
  nextLevelButton.hidden = !success || currentLevelIndex === levels.length - 1;
  retryLevelButton.hidden = success;
  levelCompleteModal.classList.remove('hidden');
}
function hideModal() { levelCompleteModal.classList.add('hidden'); }

async function runProgram() {
  if (isProgramRunning) return;
  const start = workspace.getBlocksByType('maze_start', false)[0];
  const first = start?.getNextBlock();
  if (!first) return;
  const count = countBlocks(first);
  const limit = getCurrentLevel().commandLimit;
  if (limit && count > limit) { showModal(`В программе ${count} команд, а на этом уровне можно использовать не больше ${limit}.`); return; }
  resetLevelState(); isProgramRunning = true; runButton.disabled = true;
  try {
    await executeChain(first, { steps: 1000 });
    if (toKey(currentPosition) !== toKey(getCurrentLevel().finish)) throw new Error('Герой остановился до финиша.');
    highestUnlockedLevel = Math.max(highestUnlockedLevel, Math.min(currentLevelIndex + 1, levels.length - 1));
    saveProgress(); renderLevelOptions();
    showModal(`Уровень пройден! Использовано команд: ${count}${limit ? ` из ${limit}` : ''}.`, true);
  } catch (error) { showModal(error.message); }
  finally { isProgramRunning = false; runButton.disabled = false; }
}

runButton.addEventListener('click', runProgram);
levelSelect.addEventListener('change', (event) => setLevel(Number(event.target.value)));
nextLevelButton.addEventListener('click', () => setLevel(Math.min(currentLevelIndex + 1, highestUnlockedLevel)));
retryLevelButton.addEventListener('click', () => { hideModal(); resetLevelState(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideModal(); if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) runProgram(); });

loadProgress(); initializeBlockly(); setLevel(0);
