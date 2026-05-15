import "./styles.css";
import { buildingConfig, progressNodes, winLevel, type BuildingConfigItem } from "./buildingConfig";
import { getBuildingIntro } from "./buildingIntroConfig";

type Direction = "up" | "down" | "left" | "right";

type Tile = {
  id: number;
  value: number;
};

type GameState = {
  board: Array<Tile | null>;
  score: number;
  bestScore: number;
  unlockedLevels: number[];
  selectedLevel: number;
  isWon: boolean;
  isGameOver: boolean;
};

type RemoteClearState = "idle" | "loading" | "cleared" | "not-cleared" | "syncing" | "error";

type PlayerContext = {
  userId: string | null;
  clearState: RemoteClearState;
  clearedAt: string | null;
  rank: number | null;
};

type AdmissionGameStatus = {
  cleared: boolean;
  cleared_at: string | null;
  rank: number | null;
};

type AdmissionRegisterClearResponse = {
  game_status: AdmissionGameStatus;
};

const boardSize = 4;
const cellCount = boardSize * boardSize;
const designWidth = 440;
const admissionApi = {
  baseUrl: "https://leaderboard.liruochen.cn",
  campaignId: "zgca-admission",
  gameId: "zgca-2048"
};
const admissionApiTimeoutMs = 10_000;
const storageKeys = {
  bestScore: "zgca-2048-best-score",
  unlockedLevels: "zgca-2048-unlocked-levels",
  tutorialSeen: "zgca-2048-tutorial-seen"
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

let nextTileId = 1;
let touchStartX = 0;
let touchStartY = 0;
let virtualPadOpen = false;
let tutorialOpen = localStorage.getItem(storageKeys.tutorialSeen) !== "true";

const getUserIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const supportedKeys = ["user_id", "userId", "uid"];

  for (const key of supportedKeys) {
    const value = params.get(key)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
};

let playerContext: PlayerContext = {
  userId: getUserIdFromUrl(),
  clearState: "idle",
  clearedAt: null,
  rank: null
};
let remoteClearRequestToken = 0;

const updateViewportScale = () => {
  const portraitRatio = window.innerHeight / window.innerWidth;
  const shouldScale = portraitRatio >= 1.25;
  const scale = shouldScale ? window.innerWidth / designWidth : 1;
  const tutorialScale = shouldScale ? Math.max(1, scale) : 1;
  const gameShell = document.querySelector<HTMLElement>(".game-shell");
  const scaledContentHeight = gameShell ? gameShell.scrollHeight * scale : window.innerHeight;

  document.documentElement.style.setProperty("--mobile-scale", String(scale));
  document.documentElement.style.setProperty("--tutorial-scale", String(tutorialScale));
  document.documentElement.style.setProperty("--scaled-content-height", `${scaledContentHeight}px`);
  document.documentElement.classList.toggle("is-mobile-scale", shouldScale);
};

const getStoredBestScore = () => Number(localStorage.getItem(storageKeys.bestScore) ?? "0");

const getStoredUnlockedLevels = () => {
  const raw = localStorage.getItem(storageKeys.unlockedLevels);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "number") : [];
  } catch {
    return [];
  }
};

const createEmptyBoard = () => Array<Tile | null>(cellCount).fill(null);

const createTile = (value = 2): Tile => ({
  id: nextTileId++,
  value
});

const getBuildingByLevel = (level: number) =>
  buildingConfig.find((item) => item.level === level);

const getLatestUnlockedProgressLevel = (levels: number[]) => {
  const sorted = progressNodes
    .filter((item) => levels.includes(item.level))
    .sort((a, b) => b.level - a.level);

  return sorted[0]?.level ?? progressNodes[0].level;
};

const getUnlockedFromBoard = (board: Array<Tile | null>, currentLevels: number[]) => {
  const nextLevels = new Set(currentLevels);

  for (const tile of board) {
    const building = tile ? getBuildingByLevel(tile.value) : undefined;

    if (building?.isProgressNode) {
      nextLevels.add(building.level);
    }
  }

  return [...nextLevels].sort((a, b) => a - b);
};

const persistProgress = (state: GameState) => {
  localStorage.setItem(storageKeys.bestScore, String(state.bestScore));
  localStorage.setItem(storageKeys.unlockedLevels, JSON.stringify(state.unlockedLevels));
};

const callAdmissionApi = async <ResponseBody>(
  path: "/api/admission/game_status" | "/api/admission/register_clear"
) => {
  if (!playerContext.userId) {
    throw new Error("Missing user id.");
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), admissionApiTimeoutMs);

  const response = await fetch(`${admissionApi.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      campaign_id: admissionApi.campaignId,
      game_id: admissionApi.gameId,
      user_id: playerContext.userId
    }),
    signal: controller.signal
  }).finally(() => {
    window.clearTimeout(timeoutId);
  });

  if (!response.ok) {
    throw new Error(`Admission API request failed: ${response.status}`);
  }

  return (await response.json()) as ResponseBody;
};

const updateRemoteClearStatus = (gameStatus: AdmissionGameStatus) => {
  playerContext = {
    ...playerContext,
    clearState: gameStatus.cleared ? "cleared" : "not-cleared",
    clearedAt: gameStatus.cleared_at,
    rank: gameStatus.rank
  };
};

const fetchRemoteClearStatus = async () => {
  if (!playerContext.userId) {
    return;
  }

  const requestToken = ++remoteClearRequestToken;
  playerContext = {
    ...playerContext,
    clearState: "loading"
  };
  render();

  try {
    const gameStatus = await callAdmissionApi<AdmissionGameStatus>("/api/admission/game_status");
    if (requestToken !== remoteClearRequestToken) {
      return;
    }
    updateRemoteClearStatus(gameStatus);
  } catch (error) {
    console.error(error);
    if (requestToken !== remoteClearRequestToken) {
      return;
    }
    playerContext = {
      ...playerContext,
      clearState: "error"
    };
  }

  render();
};

const registerRemoteClear = async () => {
  if (!playerContext.userId || playerContext.clearState === "syncing") {
    return;
  }

  const requestToken = ++remoteClearRequestToken;
  playerContext = {
    ...playerContext,
    clearState: "syncing"
  };
  render();

  try {
    const result = await callAdmissionApi<AdmissionRegisterClearResponse>(
      "/api/admission/register_clear"
    );
    if (requestToken !== remoteClearRequestToken) {
      return;
    }
    updateRemoteClearStatus(result.game_status);
  } catch (error) {
    console.error(error);
    if (requestToken !== remoteClearRequestToken) {
      return;
    }
    playerContext = {
      ...playerContext,
      clearState: "error"
    };
  }

  render();
};

const addRandomTile = (board: Array<Tile | null>) => {
  const emptyIndexes = board
    .map((tile, index) => (tile === null ? index : -1))
    .filter((index) => index >= 0);

  if (emptyIndexes.length === 0) {
    return board;
  }

  const nextBoard = [...board];
  const targetIndex = emptyIndexes[Math.floor(Math.random() * emptyIndexes.length)];
  nextBoard[targetIndex] = createTile(Math.random() < 0.9 ? 2 : 4);

  return nextBoard;
};

const createInitialState = (): GameState => {
  let board = createEmptyBoard();
  board = addRandomTile(addRandomTile(board));

  const unlockedLevels = getUnlockedFromBoard(board, getStoredUnlockedLevels());

  return {
    board,
    score: 0,
    bestScore: getStoredBestScore(),
    unlockedLevels,
    selectedLevel: getLatestUnlockedProgressLevel(unlockedLevels),
    isWon: false,
    isGameOver: false
  };
};

let state = createInitialState();

const cloneLine = (line: Array<Tile | null>) => line.filter((tile): tile is Tile => tile !== null);

const mergeLine = (line: Array<Tile | null>) => {
  const compacted = cloneLine(line);
  const mergedLine: Array<Tile | null> = [];
  let gainedScore = 0;

  for (let index = 0; index < compacted.length; index++) {
    const current = compacted[index];
    const next = compacted[index + 1];

    if (next && current.value === next.value) {
      const mergedValue = current.value * 2;
      mergedLine.push(createTile(mergedValue));
      gainedScore += mergedValue;
      index++;
    } else {
      mergedLine.push(current);
    }
  }

  while (mergedLine.length < boardSize) {
    mergedLine.push(null);
  }

  return { line: mergedLine, gainedScore };
};

const readLine = (board: Array<Tile | null>, direction: Direction, lineIndex: number) => {
  const line: Array<Tile | null> = [];

  for (let offset = 0; offset < boardSize; offset++) {
    if (direction === "left") {
      line.push(board[lineIndex * boardSize + offset]);
    }

    if (direction === "right") {
      line.push(board[lineIndex * boardSize + (boardSize - 1 - offset)]);
    }

    if (direction === "up") {
      line.push(board[offset * boardSize + lineIndex]);
    }

    if (direction === "down") {
      line.push(board[(boardSize - 1 - offset) * boardSize + lineIndex]);
    }
  }

  return line;
};

const writeLine = (
  board: Array<Tile | null>,
  direction: Direction,
  lineIndex: number,
  line: Array<Tile | null>
) => {
  for (let offset = 0; offset < boardSize; offset++) {
    if (direction === "left") {
      board[lineIndex * boardSize + offset] = line[offset];
    }

    if (direction === "right") {
      board[lineIndex * boardSize + (boardSize - 1 - offset)] = line[offset];
    }

    if (direction === "up") {
      board[offset * boardSize + lineIndex] = line[offset];
    }

    if (direction === "down") {
      board[(boardSize - 1 - offset) * boardSize + lineIndex] = line[offset];
    }
  }
};

const boardsAreEqual = (currentBoard: Array<Tile | null>, nextBoard: Array<Tile | null>) =>
  currentBoard.every((tile, index) => tile?.value === nextBoard[index]?.value);

const canMove = (board: Array<Tile | null>) => {
  if (board.some((tile) => tile === null)) {
    return true;
  }

  for (let row = 0; row < boardSize; row++) {
    for (let column = 0; column < boardSize; column++) {
      const tile = board[row * boardSize + column];
      const rightTile = column < boardSize - 1 ? board[row * boardSize + column + 1] : null;
      const bottomTile = row < boardSize - 1 ? board[(row + 1) * boardSize + column] : null;

      if (tile && (tile.value === rightTile?.value || tile.value === bottomTile?.value)) {
        return true;
      }
    }
  }

  return false;
};

const getNewlyUnlockedLevel = (previousLevels: number[], nextLevels: number[]) => {
  const newlyUnlocked = nextLevels
    .filter((level) => !previousLevels.includes(level))
    .sort((a, b) => b - a);

  return newlyUnlocked[0];
};

const move = (direction: Direction) => {
  if (state.isWon || state.isGameOver) {
    return;
  }

  const movedBoard = createEmptyBoard();
  let gainedScore = 0;

  for (let lineIndex = 0; lineIndex < boardSize; lineIndex++) {
    const result = mergeLine(readLine(state.board, direction, lineIndex));
    writeLine(movedBoard, direction, lineIndex, result.line);
    gainedScore += result.gainedScore;
  }

  if (boardsAreEqual(state.board, movedBoard)) {
    return;
  }

  const boardWithNewTile = addRandomTile(movedBoard);
  const nextScore = state.score + gainedScore;
  const bestScore = Math.max(state.bestScore, nextScore);
  const previousUnlocked = state.unlockedLevels;
  const unlockedLevels = getUnlockedFromBoard(boardWithNewTile, previousUnlocked);
  const newlyUnlockedLevel = getNewlyUnlockedLevel(previousUnlocked, unlockedLevels);
  const selectedLevel = newlyUnlockedLevel ?? state.selectedLevel;
  const isWon = boardWithNewTile.some((tile) => tile?.value === winLevel);
  const isGameOver = !isWon && !canMove(boardWithNewTile);

  state = {
    board: boardWithNewTile,
    score: nextScore,
    bestScore,
    unlockedLevels,
    selectedLevel,
    isWon,
    isGameOver
  };

  persistProgress(state);
  render();

  if (isWon) {
    void registerRemoteClear();
  }
};

const resetGame = () => {
  state = createInitialState();
  persistProgress(state);
  render();
};

const selectBuilding = (building: BuildingConfigItem) => {
  if (!state.unlockedLevels.includes(building.level)) {
    return;
  }

  state = {
    ...state,
    selectedLevel: building.level
  };

  render();
};

const getTileClassName = (value: number) => `tile tile-${Math.min(value, 256)}`;

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] ?? character
  );

const formatApiTime = (value: string) => {
  let parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    parsed = new Date(value.replace(" ", "T") + "Z");
  }

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  const seconds = String(parsed.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const getRemoteClearText = () => {
  if (playerContext.clearState === "loading") {
    return "通关状态查询中";
  }

  if (playerContext.clearState === "syncing") {
    return "通关状态登记中";
  }

  if (playerContext.clearState === "cleared") {
    const rankText = playerContext.rank ? ` · 单项第 ${playerContext.rank} 名` : "";
    return `已登记通关${rankText}`;
  }

  if (playerContext.clearState === "error") {
    return "状态同步失败";
  }

  return "暂未通关";
};

const renderPlayerStatus = () => {
  if (!playerContext.userId) {
    return "";
  }

  const clearedAt = playerContext.clearedAt ? `<span>${escapeHtml(formatApiTime(playerContext.clearedAt))}</span>` : "";

  return `
    <section class="player-status" aria-live="polite">
      <span>用户 ${escapeHtml(playerContext.userId)}</span>
      <strong>${getRemoteClearText()}</strong>
      ${clearedAt}
    </section>
  `;
};

const renderProgress = () =>
  progressNodes
    .map((node, index) => {
      const isUnlocked = state.unlockedLevels.includes(node.level);
      const isSelected = state.selectedLevel === node.level;
      const nodeClassNames = [
        "progress-node",
        isUnlocked ? "unlocked" : "locked",
        isSelected ? "selected" : ""
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <button
          class="${nodeClassNames}"
          data-level="${node.level}"
          ${isUnlocked ? "" : "disabled"}
          aria-label="${isUnlocked ? `查看 ${node.name} 介绍` : `未解锁节点 ${index + 1}`}"
        >
          <span class="node-icon">${isUnlocked ? node.icon : node.lockedIcon}</span>
          <span class="node-label">${isUnlocked ? node.name : "??"}</span>
        </button>
      `;
    })
    .join("");

const renderBoard = () =>
  state.board
    .map((tile) => {
      if (!tile) {
        return '<div class="cell"></div>';
      }

      const building = getBuildingByLevel(tile.value);
      const label = building?.icon ?? tile.value;

      return `
        <div class="${getTileClassName(tile.value)}">
          <span class="tile-label">${label}</span>
          <span class="tile-value">${tile.value}</span>
        </div>
      `;
    })
    .join("");

const renderIntro = () => {
  const selectedBuilding = getBuildingByLevel(state.selectedLevel) ?? progressNodes[0];
  const description = getBuildingIntro(selectedBuilding.id);

  return `
    <section class="intro-card">
      <div class="intro-icon">${selectedBuilding.icon}</div>
      <div class="intro-content">
        <p class="eyebrow">已解锁楼栋介绍</p>
        <h2>${selectedBuilding.title}</h2>
        <p>${description}</p>
      </div>
    </section>
  `;
};

const renderOverlay = () => {
  if (!state.isWon && !state.isGameOver) {
    return "";
  }

  return `
    <div class="overlay">
      <div class="result-card">
        <p class="eyebrow">${state.isWon ? "合成成功" : "挑战结束"}</p>
        <h2>${state.isWon ? "解锁 C9，游戏胜利！" : "没有可移动方块了"}</h2>
        <p>${state.isWon ? "你已经完成中关村学院建筑收集进度。" : "再来一局，继续解锁校园节点。"}</p>
        <button class="primary-button" data-action="restart">重新开始</button>
      </div>
    </div>
  `;
};

const renderVirtualPad = () => {
  if (!virtualPadOpen || state.isWon || state.isGameOver) {
    return "";
  }

  return `
    <section class="virtual-pad" aria-label="虚拟方向键">
      <button class="virtual-key up" data-direction="up" aria-label="向上移动">▲</button>
      <button class="virtual-key left" data-direction="left" aria-label="向左移动">◀</button>
      <button class="virtual-key center" aria-hidden="true" disabled></button>
      <button class="virtual-key right" data-direction="right" aria-label="向右移动">▶</button>
      <button class="virtual-key down" data-direction="down" aria-label="向下移动">▼</button>
    </section>
  `;
};

const renderTutorial = () => {
  if (!tutorialOpen) {
    return "";
  }

  return `
    <section class="tutorial-overlay" aria-label="新手教学">
      <div class="tutorial-card">
        <p class="eyebrow">玩法教学</p>
        <h2>欢迎来到中关村学院 2048</h2>
        <p>滑动屏幕，让相同楼栋方块合并升级。</p>
        <p>合成C9，获取游戏胜利</p>
        <div class="tutorial-pad-hint">
          <span class="tutorial-icon">✥</span>
          <span>底部按钮，展开虚拟方向键。</span>
        </div>
        <button class="primary-button" data-action="close-tutorial">开始游戏</button>
      </div>
    </section>
  `;
};

const render = () => {
  app.innerHTML = `
    ${renderVirtualPad()}

    <main class="game-shell">
      <header class="top-bar">
        <div>
          <p class="eyebrow">ZGC Academy</p>
          <h1>中关村学院 2048</h1>
        </div>
        <div class="top-tools">
          <div class="score-group">
            <div class="score-card">
              <span>分数</span>
              <strong>${state.score}</strong>
            </div>
            <div class="score-card">
              <span>最高</span>
              <strong>${state.bestScore}</strong>
            </div>
          </div>
          <button class="help-button" data-action="open-tutorial" aria-label="重新打开教程">?</button>
        </div>
      </header>

      ${renderPlayerStatus()}

      <section class="progress-card">
        <div class="progress-title">
          <span>楼栋解锁进度</span>
          <strong>${state.unlockedLevels.filter((level) => progressNodes.some((node) => node.level === level)).length}/7</strong>
        </div>
        <div class="progress-track">${renderProgress()}</div>
      </section>

      ${renderIntro()}

      <section class="board-wrap" aria-label="2048 游戏棋盘">
        <div class="board">${renderBoard()}</div>
      </section>

      <footer class="action-bar">
        <div class="action-buttons">
          <button class="secondary-button" data-action="restart">重新开始</button>
          <button
            class="icon-button ${virtualPadOpen ? "active" : ""}"
            data-action="toggle-pad"
            aria-label="${virtualPadOpen ? "关闭虚拟按键" : "打开虚拟按键"}"
            aria-pressed="${virtualPadOpen}"
          >
            ✥
          </button>
        </div>
        <p>滑动屏幕或使用方向键移动方块</p>
      </footer>

      ${renderOverlay()}
    </main>

    ${renderTutorial()}
  `;

  document.querySelectorAll<HTMLButtonElement>(".progress-node").forEach((button) => {
    button.addEventListener("click", () => {
      const level = Number(button.dataset.level);
      const building = getBuildingByLevel(level);

      if (building) {
        selectBuilding(building);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="restart"]').forEach((button) => {
    button.addEventListener("click", resetGame);
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="toggle-pad"]').forEach((button) => {
    button.addEventListener("click", () => {
      virtualPadOpen = !virtualPadOpen;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="close-tutorial"]').forEach((button) => {
    button.addEventListener("click", () => {
      tutorialOpen = false;
      localStorage.setItem(storageKeys.tutorialSeen, "true");
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="open-tutorial"]').forEach((button) => {
    button.addEventListener("click", () => {
      tutorialOpen = true;
      render();
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.direction as Direction | undefined;

      if (direction) {
        move(direction);
      }
    });
  });

  requestAnimationFrame(updateViewportScale);
};

document.addEventListener("keydown", (event) => {
  const directionMap: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right"
  };
  const direction = directionMap[event.key];

  if (direction) {
    event.preventDefault();
    move(direction);
  }
});

document.addEventListener(
  "touchstart",
  (event) => {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
  },
  { passive: true }
);

document.addEventListener(
  "touchend",
  (event) => {
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));

    if (distance < 32) {
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      move(deltaX > 0 ? "right" : "left");
    } else {
      move(deltaY > 0 ? "down" : "up");
    }
  },
  { passive: true }
);

window.addEventListener("resize", updateViewportScale);
window.addEventListener("orientationchange", updateViewportScale);

updateViewportScale();
persistProgress(state);
render();
void fetchRemoteClearStatus();
