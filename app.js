const pieces = [
  { id: "innocence", title: "Innocence", label: "1", color: "#ff4f9a" },
  { id: "game-of-patience", title: "Game of Patience", label: "2", color: "#4e80ff" },
  { id: "rondo", title: "Rondo", label: "3", color: "#28c7b7" },
  { id: "romance", title: "Romance", label: "4", color: "#ff8b3d" },
];

const badgeRules = [
  { id: "first", name: "First Save", detail: "Log 1 session", test: (state) => state.sessions.length >= 1 },
  { id: "ten", name: "Ten Runs", detail: "Log 10 sessions", test: (state) => state.sessions.length >= 10 },
  { id: "careful", name: "Careful Ears", detail: "Make 2 or fewer mistakes", test: (state) => state.sessions.some((s) => s.mistakes <= 2) },
  { id: "all", name: "All Pieces", detail: "Practice every piece", test: (state) => pieces.every((p) => pieceSessions(state, p.id).length > 0) },
  { id: "streak", name: "Three Day Streak", detail: "Practice 3 days", test: (state) => getStreak(state.sessions) >= 3 },
  { id: "master", name: "Exam Ready", detail: "Reach 80% on a piece", test: (state) => pieces.some((p) => masteryForPiece(state, p.id) >= 80) },
];

const initialState = {
  selectedPiece: pieces[0].id,
  sessions: [],
  updatedAt: null,
};

const storageKey = "pianoQuestProgressV1";
const syncConfigKey = "pianoQuestGithubSyncV1";
const githubSync = {
  owner: "fadicog",
  repo: "piano",
  branch: "main",
  path: "data/progress.json",
};
let state = loadState();
let syncConfig = loadSyncConfig();
let syncInFlight = false;
let timer = {
  running: false,
  remaining: 10 * 60,
  interval: null,
};

const els = {
  totalScore: document.querySelector("#totalScore"),
  heroRank: document.querySelector("#heroRank"),
  streakDays: document.querySelector("#streakDays"),
  sessionCount: document.querySelector("#sessionCount"),
  bestPiece: document.querySelector("#bestPiece"),
  pieces: document.querySelector("#pieces"),
  selectedComposer: document.querySelector("#selectedComposer"),
  selectedTitle: document.querySelector("#selectedTitle"),
  pieceLevel: document.querySelector("#pieceLevel"),
  masteryText: document.querySelector("#masteryText"),
  masteryBar: document.querySelector("#masteryBar"),
  practiceForm: document.querySelector("#practiceForm"),
  performance: document.querySelector("#performance"),
  mistakes: document.querySelector("#mistakes"),
  minutes: document.querySelector("#minutes"),
  mood: document.querySelector("#mood"),
  note: document.querySelector("#note"),
  rewardBox: document.querySelector("#rewardBox"),
  badges: document.querySelector("#badges"),
  history: document.querySelector("#history"),
  clearPiece: document.querySelector("#clearPiece"),
  resetAll: document.querySelector("#resetAll"),
  confirmDialog: document.querySelector("#confirmDialog"),
  syncDialog: document.querySelector("#syncDialog"),
  syncForm: document.querySelector("#syncForm"),
  githubToken: document.querySelector("#githubToken"),
  syncNow: document.querySelector("#syncNow"),
  connectSync: document.querySelector("#connectSync"),
  disconnectSync: document.querySelector("#disconnectSync"),
  syncStatus: document.querySelector("#syncStatus"),
  timerToggle: document.querySelector("#timerToggle"),
  timerIcon: document.querySelector("#timerIcon"),
  timerDisplay: document.querySelector("#timerDisplay"),
  timerMinutes: document.querySelector("#timerMinutes"),
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (!stored || !Array.isArray(stored.sessions)) return cloneInitialState();
    return { ...initialState, ...stored, sessions: normalizeSessions(stored.sessions) };
  } catch {
    return cloneInitialState();
  }
}

function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

function saveState() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadSyncConfig() {
  try {
    const stored = JSON.parse(localStorage.getItem(syncConfigKey));
    return stored && stored.token ? stored : { token: "" };
  } catch {
    return { token: "" };
  }
}

function saveSyncConfig() {
  localStorage.setItem(syncConfigKey, JSON.stringify(syncConfig));
}

function normalizeSessions(sessions) {
  return sessions.filter(Boolean).map((session) => ({
    ...session,
    id: session.id || crypto.randomUUID(),
    date: session.date || new Date().toISOString(),
  }));
}

function pieceSessions(currentState, pieceId) {
  return currentState.sessions.filter((session) => session.pieceId === pieceId);
}

function scoreSession({ performance, mistakes, minutes }) {
  const performancePoints = performance * 18;
  const mistakePenalty = Math.min(mistakes * 4, 60);
  const timeBonus = Math.min(minutes * 2, 30);
  const cleanBonus = mistakes === 0 ? 25 : mistakes <= 2 ? 12 : 0;
  return Math.max(5, performancePoints + timeBonus + cleanBonus - mistakePenalty);
}

function masteryForPiece(currentState, pieceId) {
  const sessions = pieceSessions(currentState, pieceId);
  if (!sessions.length) return 0;
  const recent = sessions.slice(-6);
  const averageScore = recent.reduce((sum, session) => sum + session.score, 0) / recent.length;
  const consistencyBonus = Math.min(sessions.length * 4, 24);
  return Math.min(100, Math.round(averageScore * 0.72 + consistencyBonus));
}

function getTotalScore() {
  return state.sessions.reduce((sum, session) => sum + session.score, 0);
}

function getRank(score) {
  if (score >= 3000) return "Concert Star";
  if (score >= 1800) return "Melody Maker";
  if (score >= 900) return "Rhythm Ranger";
  if (score >= 350) return "Bright Beginner";
  return "First Note";
}

function getStreak(sessions) {
  const days = [...new Set(sessions.map((session) => toDateKey(new Date(session.date))))].sort().reverse();
  if (!days.length) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let cursor = new Date(today);
  let streak = 0;

  if (days[0] !== toDateKey(cursor)) {
    cursor.setDate(cursor.getDate() - 1);
    if (days[0] !== toDateKey(cursor)) return 0;
  }

  for (const day of days) {
    if (day !== toDateKey(cursor)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(isoDate) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function renderPieces() {
  els.pieces.innerHTML = pieces
    .map((piece) => {
      const sessions = pieceSessions(state, piece.id);
      const mastery = masteryForPiece(state, piece.id);
      const activeClass = piece.id === state.selectedPiece ? " active" : "";
      return `
        <button class="piece-button${activeClass}" type="button" data-piece="${piece.id}">
          <span class="piece-icon" style="background:${piece.color}">${piece.label}</span>
          <span>
            <span class="piece-name">${piece.title}</span>
            <span class="piece-meta">${mastery}% mastery - ${sessions.length} runs</span>
          </span>
        </button>
      `;
    })
    .join("");

  document.querySelectorAll("[data-piece]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPiece = button.dataset.piece;
      saveState();
      render();
    });
  });
}

function renderSelectedPiece() {
  const piece = pieces.find((item) => item.id === state.selectedPiece) || pieces[0];
  const mastery = masteryForPiece(state, piece.id);
  const stars = Math.min(5, Math.floor(mastery / 20));
  els.selectedComposer.textContent = `MTB Level 3 - Piece ${piece.label}`;
  els.selectedTitle.textContent = piece.title;
  els.pieceLevel.textContent = `${stars} star${stars === 1 ? "" : "s"}`;
  els.masteryText.textContent = `${mastery}%`;
  els.masteryBar.style.width = `${mastery}%`;
}

function renderStats() {
  const score = getTotalScore();
  const best = pieces
    .map((piece) => ({ title: piece.title, mastery: masteryForPiece(state, piece.id) }))
    .sort((a, b) => b.mastery - a.mastery)[0];

  els.totalScore.textContent = score;
  els.heroRank.textContent = getRank(score);
  els.streakDays.textContent = `${getStreak(state.sessions)} day${getStreak(state.sessions) === 1 ? "" : "s"}`;
  els.sessionCount.textContent = state.sessions.length;
  els.bestPiece.textContent = best && best.mastery > 0 ? best.title : "Start playing";
}

function renderBadges() {
  els.badges.innerHTML = badgeRules
    .map((badge) => {
      const unlocked = badge.test(state);
      return `
        <div class="badge${unlocked ? " unlocked" : ""}">
          ${badge.name}
          <span>${badge.detail}</span>
        </div>
      `;
    })
    .join("");
}

function renderHistory() {
  const selectedSessions = pieceSessions(state, state.selectedPiece).slice(-8).reverse();
  if (!selectedSessions.length) {
    els.history.innerHTML = `<div class="history-item"><p>No practice saved for this piece yet.</p></div>`;
    return;
  }

  els.history.innerHTML = selectedSessions
    .map((session) => `
      <div class="history-item">
        <strong><span>${session.score} pts</span><span>${formatDate(session.date)}</span></strong>
        <p>${session.minutes} min - ${session.mistakes} mistakes - ${session.mood}</p>
        ${session.note ? `<p>${escapeHtml(session.note)}</p>` : ""}
      </div>
    `)
    .join("");
}

function render() {
  renderPieces();
  renderSelectedPiece();
  renderStats();
  renderBadges();
  renderHistory();
  renderSyncStatus();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

els.practiceForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const session = {
    id: crypto.randomUUID(),
    pieceId: state.selectedPiece,
    performance: Number(els.performance.value),
    mistakes: Math.max(0, Number(els.mistakes.value) || 0),
    minutes: Math.max(1, Number(els.minutes.value) || 1),
    mood: els.mood.value,
    note: els.note.value.trim(),
    date: new Date().toISOString(),
  };
  session.score = scoreSession(session);
  state.sessions.push(session);
  els.note.value = "";
  saveState();
  render();
  const piece = pieces.find((item) => item.id === session.pieceId);
  els.rewardBox.textContent = `${piece.title}: ${session.score} points saved. ${session.mistakes <= 2 ? "Careful playing bonus earned." : "Try for fewer mistakes next run."}`;
  syncToGithub("Practice saved. Syncing to GitHub...");
});

els.clearPiece.addEventListener("click", () => {
  state.sessions = state.sessions.filter((session) => session.pieceId !== state.selectedPiece);
  saveState();
  render();
  els.rewardBox.textContent = "This piece history was cleared.";
});

els.resetAll.addEventListener("click", () => {
  if (typeof els.confirmDialog.showModal === "function") {
    els.confirmDialog.showModal();
  } else if (confirm("Reset all progress?")) {
    resetAll();
  }
});

els.confirmDialog.addEventListener("close", () => {
  if (els.confirmDialog.returnValue === "reset") resetAll();
});

function resetAll() {
  state = cloneInitialState();
  saveState();
  render();
  els.rewardBox.textContent = "Progress reset on this device.";
}

els.connectSync.addEventListener("click", () => {
  els.githubToken.value = syncConfig.token || "";
  if (typeof els.syncDialog.showModal === "function") {
    els.syncDialog.showModal();
  } else {
    const token = prompt("GitHub token");
    if (token) connectGithub(token);
  }
});

els.syncForm.addEventListener("submit", (event) => {
  if (event.submitter?.value !== "connect") return;
  event.preventDefault();
  connectGithub(els.githubToken.value.trim());
  els.syncDialog.close();
});

els.disconnectSync.addEventListener("click", () => {
  syncConfig = { token: "" };
  saveSyncConfig();
  renderSyncStatus("Disconnected. Local progress is still saved on this device.");
});

els.syncNow.addEventListener("click", () => {
  syncToGithub("Syncing with GitHub...");
});

function connectGithub(token) {
  if (!token) {
    renderSyncStatus("Token missing. Sync was not connected.");
    return;
  }
  syncConfig = { token };
  saveSyncConfig();
  syncToGithub("Connected. Syncing with GitHub...");
}

function renderSyncStatus(message) {
  if (message) {
    els.syncStatus.textContent = message;
    return;
  }
  els.syncStatus.textContent = syncConfig.token
    ? "Connected. Saves will sync to GitHub."
    : "Not connected. Saves stay on this device.";
}

async function syncToGithub(message) {
  if (!syncConfig.token || syncInFlight) {
    renderSyncStatus(syncConfig.token ? "Sync already running." : "Not connected. Connect GitHub to sync devices.");
    return;
  }

  syncInFlight = true;
  renderSyncStatus(message);

  try {
    const remote = await fetchRemoteProgress();
    const merged = mergeProgress(state, remote.data);
    const latestRemote = await writeRemoteProgress(merged, remote.sha);
    state = mergeProgress(merged, latestRemote.data || merged);
    saveState();
    render();
    renderSyncStatus(`Synced ${state.sessions.length} sessions to GitHub.`);
  } catch (error) {
    renderSyncStatus(`Sync failed: ${error.message}`);
  } finally {
    syncInFlight = false;
  }
}

async function fetchRemoteProgress() {
  const response = await fetch(githubContentsUrl(), {
    headers: githubHeaders(),
  });

  if (response.status === 404) {
    return { data: cloneInitialState(), sha: null };
  }

  if (!response.ok) {
    throw new Error(`GitHub read returned ${response.status}`);
  }

  const payload = await response.json();
  return {
    data: JSON.parse(decodeBase64(payload.content || "")),
    sha: payload.sha,
  };
}

async function writeRemoteProgress(progress, sha, attempt = 1) {
  const body = {
    message: `Update Piano Quest progress ${new Date().toISOString()}`,
    content: encodeBase64(JSON.stringify(progress, null, 2)),
    branch: githubSync.branch,
  };
  if (sha) body.sha = sha;

  const response = await fetch(githubContentsUrl(), {
    method: "PUT",
    headers: githubHeaders(),
    body: JSON.stringify(body),
  });

  if (response.status === 409 && attempt <= 2) {
    const remote = await fetchRemoteProgress();
    const merged = mergeProgress(progress, remote.data);
    return writeRemoteProgress(merged, remote.sha, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`GitHub write returned ${response.status}`);
  }

  return { data: progress };
}

function mergeProgress(local, remote) {
  const remoteState = remote && Array.isArray(remote.sessions) ? remote : cloneInitialState();
  const byId = new Map();
  [...normalizeSessions(remoteState.sessions), ...normalizeSessions(local.sessions)].forEach((session) => {
    const existing = byId.get(session.id);
    if (!existing || new Date(session.date) >= new Date(existing.date)) {
      byId.set(session.id, session);
    }
  });

  const selectedPiece = local.updatedAt && remoteState.updatedAt && new Date(remoteState.updatedAt) > new Date(local.updatedAt)
    ? remoteState.selectedPiece
    : local.selectedPiece;

  return {
    selectedPiece: selectedPiece || pieces[0].id,
    updatedAt: new Date().toISOString(),
    sessions: [...byId.values()].sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

function githubContentsUrl() {
  return `https://api.github.com/repos/${githubSync.owner}/${githubSync.repo}/contents/${githubSync.path}?ref=${githubSync.branch}`;
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${syncConfig.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function encodeBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64(value) {
  return decodeURIComponent(escape(atob(value.replace(/\n/g, ""))));
}

els.timerMinutes.addEventListener("input", () => {
  if (timer.running) return;
  timer.remaining = Number(els.timerMinutes.value) * 60;
  renderTimer();
});

els.timerToggle.addEventListener("click", () => {
  if (timer.running) {
    stopTimer();
    return;
  }
  timer.running = true;
  els.timerToggle.setAttribute("title", "Pause timer");
  els.timerToggle.setAttribute("aria-label", "Pause timer");
  els.timerIcon.innerHTML = `<path d="M8 5h3v14H8zM13 5h3v14h-3z" />`;
  timer.interval = setInterval(() => {
    timer.remaining -= 1;
    if (timer.remaining <= 0) {
      timer.remaining = 0;
      stopTimer();
      els.rewardBox.textContent = "Timer finished. Save your practice run to collect points.";
    }
    renderTimer();
  }, 1000);
});

function stopTimer() {
  timer.running = false;
  clearInterval(timer.interval);
  els.timerToggle.setAttribute("title", "Start timer");
  els.timerToggle.setAttribute("aria-label", "Start timer");
  els.timerIcon.innerHTML = `<path d="M8 5v14l11-7z" />`;
}

function renderTimer() {
  const minutes = Math.floor(timer.remaining / 60);
  const seconds = String(timer.remaining % 60).padStart(2, "0");
  els.timerDisplay.textContent = `${minutes}:${seconds}`;
}

renderTimer();
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      renderSyncStatus("Offline install is unavailable in this browser.");
    });
  });
}

if (syncConfig.token) {
  syncToGithub("Loading latest GitHub progress...");
}
