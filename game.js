const COLS = 5;
const ROWS = 8;
const SUMMON_COST = 10;
const PATH = [
  [2, 0],
  [2, 1],
  [2, 2],
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [3, 4],
  [2, 4],
  [1, 4],
  [1, 5],
  [2, 5],
  [3, 5],
  [3, 6],
  [2, 6],
  [2, 7],
];

const pathSet = new Set(PATH.map(([x, y]) => `${x},${y}`));

const state = {
  baseHp: 20,
  gold: 30,
  wave: 1,
  towers: new Map(),
  enemies: [],
  damagePopups: [],
  selectedTowerId: null,
  nextTowerId: 1,
  nextEnemyId: 1,
  nextPopupId: 1,
};

const boardEl = document.getElementById("board");
const baseHpEl = document.getElementById("baseHp");
const goldEl = document.getElementById("gold");
const waveEl = document.getElementById("wave");
const summonBtn = document.getElementById("summonBtn");

function key(x, y) {
  return `${x},${y}`;
}

function randomSlot() {
  const slots = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const k = key(x, y);
      if (!pathSet.has(k) && !state.towers.has(k)) {
        slots.push([x, y]);
      }
    }
  }
  if (!slots.length) return null;
  return slots[Math.floor(Math.random() * slots.length)];
}

function createBoardCells() {
  boardEl.innerHTML = "";
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const cell = document.createElement("div");
      cell.className = `cell ${pathSet.has(key(x, y)) ? "path" : "slot"}`;
      cell.dataset.x = x;
      cell.dataset.y = y;
      boardEl.appendChild(cell);
    }
  }
}

function renderHud() {
  baseHpEl.textContent = Math.max(state.baseHp, 0);
  goldEl.textContent = state.gold;
  waveEl.textContent = state.wave;
  summonBtn.disabled = state.gold < SUMMON_COST || state.baseHp <= 0;
}

function towerDamageForLevel(level) {
  return level * 2;
}

function renderTowers() {
  document.querySelectorAll(".tower").forEach((el) => el.remove());
  state.towers.forEach((tower, k) => {
    const cell = findCellByKey(k);
    if (!cell) return;
    const towerEl = document.createElement("button");
    towerEl.className = "tower";
    towerEl.dataset.id = tower.id;
    if (tower.id === state.selectedTowerId) towerEl.classList.add("selected");
    towerEl.textContent = `L${tower.level}`;
    towerEl.title = `Level ${tower.level}`;
    towerEl.addEventListener("click", () => onTowerTap(tower));
    cell.appendChild(towerEl);
  });
}

function renderEnemies() {
  document.querySelectorAll(".enemy").forEach((el) => el.remove());
  state.enemies.forEach((enemy) => {
    const [x, y] = PATH[enemy.pathIndex];
    const cell = findCellByKey(key(x, y));
    if (!cell) return;
    const enemyEl = document.createElement("div");
    enemyEl.className = "enemy";
    if (enemy.hitMs > 0) enemyEl.classList.add("hit");
    enemyEl.textContent = `E${enemy.hp}`;
    cell.appendChild(enemyEl);
  });
}

function renderDamagePopups() {
  document.querySelectorAll(".damage-popup").forEach((el) => el.remove());
  state.damagePopups.forEach((popup) => {
    const [x, y] = PATH[popup.pathIndex];
    const cell = findCellByKey(key(x, y));
    if (!cell) return;
    const popupEl = document.createElement("div");
    popupEl.className = "damage-popup";
    popupEl.textContent = `-${popup.amount}`;
    cell.appendChild(popupEl);
  });
}

function findCellByKey(k) {
  const [x, y] = k.split(",");
  return boardEl.querySelector(`.cell[data-x='${x}'][data-y='${y}']`);
}

function onTowerTap(tapped) {
  if (state.baseHp <= 0) return;

  if (state.selectedTowerId === tapped.id) {
    state.selectedTowerId = null;
    renderTowers();
    return;
  }

  const selected = [...state.towers.values()].find((t) => t.id === state.selectedTowerId);
  if (!selected) {
    state.selectedTowerId = tapped.id;
    renderTowers();
    return;
  }

  if (selected.level !== tapped.level) {
    state.selectedTowerId = tapped.id;
    renderTowers();
    return;
  }

  selected.level += 1;
  state.towers.delete(key(tapped.x, tapped.y));
  state.selectedTowerId = selected.id;
  renderTowers();
}

function summonTower() {
  if (state.gold < SUMMON_COST || state.baseHp <= 0) return;
  const slot = randomSlot();
  if (!slot) return;

  state.gold -= SUMMON_COST;
  const [x, y] = slot;
  state.towers.set(key(x, y), {
    id: state.nextTowerId,
    x,
    y,
    level: 1,
    cooldownMs: 0,
  });
  state.nextTowerId += 1;
  renderTowers();
  render();
}

function spawnEnemy() {
  if (state.baseHp <= 0) return;
  const hp = 8 + Math.floor((state.wave - 1) * 1.5);
  state.enemies.push({
    id: state.nextEnemyId,
    pathIndex: 0,
    hp,
    hitMs: 0,
    moveTimerMs: 0,
    moveRateMs: 900,
  });
  state.nextEnemyId += 1;
}

function dealTowerDamage(deltaMs) {
  if (!state.enemies.length) return;

  state.towers.forEach((tower) => {
    tower.cooldownMs -= deltaMs;
    if (tower.cooldownMs > 0) return;

    const target = chooseTargetForTower(tower);
    if (!target) return;

    const damage = towerDamageForLevel(tower.level);
    target.hp -= damage;
    target.hitMs = 160;
    pulseTower(tower.id);
    spawnDamagePopup(target.pathIndex, damage);
    tower.cooldownMs = Math.max(250, 900 - tower.level * 90);
  });

  const before = state.enemies.length;
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  const killed = before - state.enemies.length;
  if (killed > 0) {
    state.gold += killed * 4;
  }
}

function pulseTower(towerId) {
  const towerEl = document.querySelector(`.tower[data-id='${towerId}']`);
  if (!towerEl) return;
  towerEl.classList.remove("shooting");
  void towerEl.offsetWidth;
  towerEl.classList.add("shooting");
}

function spawnDamagePopup(pathIndex, amount) {
  state.damagePopups.push({
    id: state.nextPopupId,
    pathIndex,
    amount,
    ttlMs: 420,
  });
  state.nextPopupId += 1;
}

function updateEffectTimers(deltaMs) {
  state.enemies.forEach((enemy) => {
    enemy.hitMs = Math.max(0, enemy.hitMs - deltaMs);
  });

  state.damagePopups.forEach((popup) => {
    popup.ttlMs -= deltaMs;
  });
  state.damagePopups = state.damagePopups.filter((popup) => popup.ttlMs > 0);
}

function chooseTargetForTower(tower) {
  let best = null;
  let bestDist = Infinity;
  state.enemies.forEach((enemy) => {
    const [ex, ey] = PATH[enemy.pathIndex];
    const dist = Math.abs(tower.x - ex) + Math.abs(tower.y - ey);
    if (dist <= 2.2 && dist < bestDist) {
      best = enemy;
      bestDist = dist;
    }
  });
  return best;
}

function moveEnemies(deltaMs) {
  for (const enemy of state.enemies) {
    enemy.moveTimerMs += deltaMs;
    if (enemy.moveTimerMs < enemy.moveRateMs) continue;
    enemy.moveTimerMs = 0;
    enemy.pathIndex += 1;

    if (enemy.pathIndex >= PATH.length) {
      state.baseHp -= 1;
      enemy.hp = 0;
    }
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

let spawnTimerMs = 0;
let spawnedThisWave = 0;
let waveTarget = 6;

function updateWave(deltaMs) {
  spawnTimerMs += deltaMs;
  if (spawnedThisWave < waveTarget && spawnTimerMs >= 1200) {
    spawnTimerMs = 0;
    spawnEnemy();
    spawnedThisWave += 1;
  }

  const finished = spawnedThisWave >= waveTarget && state.enemies.length === 0;
  if (finished) {
    state.wave += 1;
    spawnedThisWave = 0;
    waveTarget += 2;
    state.gold += 10;
  }
}

function showGameOverIfNeeded() {
  if (state.baseHp > 0) return;
  summonBtn.disabled = true;
  summonBtn.textContent = "Defeated";
}

function render() {
  renderHud();
  renderEnemies();
  renderDamagePopups();
  showGameOverIfNeeded();
}

let lastTs = performance.now();
function tick(ts) {
  const delta = ts - lastTs;
  lastTs = ts;

  if (state.baseHp > 0) {
    updateWave(delta);
    moveEnemies(delta);
    dealTowerDamage(delta);
    updateEffectTimers(delta);
  }

  render();
  requestAnimationFrame(tick);
}

summonBtn.addEventListener("click", summonTower);
createBoardCells();
render();
requestAnimationFrame(tick);
