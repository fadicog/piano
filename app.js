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
const soundConfigKey = "pianoQuestSoundV1";
const githubSync = {
  owner: "fadicog",
  repo: "piano",
  branch: "main",
  path: "data/progress.json",
};
let state = loadState();
let syncConfig = loadSyncConfig();
let soundOn = loadSoundSetting();
let syncInFlight = false;
let audioContext = null;
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
  soundToggle: document.querySelector("#soundToggle"),
  soundIcon: document.querySelector("#soundIcon"),
  playTune: document.querySelector("#playTune"),
  miniKeys: document.querySelector("#miniKeys"),
  questMessage: document.querySelector("#questMessage"),
  dailyQuest: document.querySelector("#dailyQuest"),
  funStage: document.querySelector(".fun-stage"),
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

function loadSoundSetting() {
  return localStorage.getItem(soundConfigKey) !== "off";
}

function saveSoundSetting() {
  localStorage.setItem(soundConfigKey, soundOn ? "on" : "off");
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
  els.questMessage.textContent = getQuestMessage(piece.title, mastery);
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
  els.dailyQuest.textContent = getDailyQuest();
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
  renderSoundState();
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
  playRewardSound(session);
  celebrate(session.score);
  syncToGithub("Practice saved. Syncing to GitHub...");
});

els.clearPiece.addEventListener("click", () => {
  state.sessions = state.sessions.filter((session) => session.pieceId !== state.selectedPiece);
  saveState();
  render();
  els.rewardBox.textContent = "This piece history was cleared.";
  playTone(196, 0.16, "triangle", 0.06);
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
  playTone(174.61, 0.18, "sine", 0.06);
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
  playTone(329.63, 0.12, "sine", 0.05);
  syncToGithub("Syncing with GitHub...");
});

els.soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  saveSoundSetting();
  renderSoundState();
  if (soundOn) playMelody([261.63, 329.63, 392, 523.25], 0.08);
});

els.playTune.addEventListener("click", () => {
  playMelody([261.63, 293.66, 329.63, 392, 329.63, 523.25], 0.12);
  pulseStage();
});

els.miniKeys.addEventListener("click", (event) => {
  const key = event.target.closest("[data-note]");
  if (!key) return;
  key.classList.add("active-key");
  setTimeout(() => key.classList.remove("active-key"), 160);
  playTone(Number(key.dataset.note), 0.2, "sine", 0.09);
});

function renderSoundState() {
  els.soundToggle.classList.toggle("sound-on", soundOn);
  els.soundToggle.classList.toggle("sound-off", !soundOn);
  els.soundToggle.setAttribute("aria-label", soundOn ? "Turn sound off" : "Turn sound on");
  els.soundToggle.setAttribute("title", soundOn ? "Turn sound off" : "Turn sound on");
  els.soundIcon.innerHTML = soundOn
    ? `<path d="M4 10v4h4l5 5V5l-5 5H4zM17 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" />`
    : `<path d="M4 10v4h4l5 5V5l-5 5H4zM18 9l4 4M22 9l-4 4" />`;
}

function getQuestMessage(title, mastery) {
  if (mastery >= 80) return `${title} is nearly stage ready`;
  if (mastery >= 50) return `${title} is growing stronger`;
  if (mastery >= 20) return `${title} has a bright start`;
  return `Begin the ${title} quest`;
}

function getDailyQuest() {
  const today = toDateKey(new Date());
  const todaySessions = state.sessions.filter((session) => toDateKey(new Date(session.date)) === today);
  const todayMinutes = todaySessions.reduce((sum, session) => sum + session.minutes, 0);
  const todayCleanRuns = todaySessions.filter((session) => session.mistakes <= 2).length;

  if (todayCleanRuns >= 1) return "Daily quest complete: careful ears unlocked.";
  if (todayMinutes >= 10) return "Daily quest complete: 10 minute practice.";
  if (todayMinutes > 0) return `${10 - todayMinutes} more minutes to finish today's quest.`;
  return "Play any piece for 10 minutes.";
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration = 0.15, type = "sine", volume = 0.08, delay = 0) {
  if (!soundOn || (!window.AudioContext && !window.webkitAudioContext)) return;
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime + delay;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.type = type;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playMelody(notes, step = 0.11) {
  notes.forEach((note, index) => playTone(note, step * 0.9, "sine", 0.07, index * step));
}

function playRewardSound(session) {
  const tune = session.mistakes <= 2
    ? [523.25, 659.25, 783.99, 1046.5]
    : [329.63, 392, 493.88];
  playMelody(tune, 0.12);
}

function celebrate(score) {
  pulseStage();
  const colors = ["#ff4f9a", "#ffd84d", "#28c7b7", "#4e80ff", "#5ac85a"];
  const count = Math.min(28, Math.max(12, Math.round(score / 5)));
  for (let index = 0; index < count; index += 1) {
    const spark = document.createElement("span");
    spark.className = "spark";
    spark.style.left = `${15 + Math.random() * 70}vw`;
    spark.style.top = `${65 + Math.random() * 22}vh`;
    spark.style.background = colors[index % colors.length];
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 950);
  }
}

function pulseStage() {
  els.funStage.classList.remove("celebrate");
  void els.funStage.offsetWidth;
  els.funStage.classList.add("celebrate");
}

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
    playTone(220, 0.12, "triangle", 0.05);
    return;
  }
  playMelody([261.63, 392], 0.1);
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
      playMelody([392, 493.88, 587.33, 783.99], 0.16);
      celebrate(80);
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
