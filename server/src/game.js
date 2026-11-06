import { randomCase } from "./cases.js";
import { awardGame, levelFromXp } from "./progress.js";
import { saveReport } from "./reports.js";
import { checkText, normalize } from "./moderation.js";
import { pickMission, evaluateMission, publicMission, trackChat, trackHand, trackReaction } from "./missions.js";

export const rooms = new Map();

const RESULT_SECONDS = 15;
const MIN_PLAYERS = 3;
const MAX_LIMIT = 12;
const GRACE_MS = 10000;
const MIN_GAME_MS = 40000;
const AUTO_MUTE_MS = 60000;
const LONG_MUTE_MS = 300000;
const MAX_STRIKES = 3;
const VOTE_OPTIONS = [10, 20, 30, 45, 60];
const DEFENSE_OPTIONS = [30, 60, 90, 120];
const ROUNDS_OPTIONS = [1, 2, 3, 4, 5];
const REACTIONS = ["🎉", "🤔", "💀", "👍", "👎", "😂", "😮", "👏", "🔥", "😡", "❤️"];
const VERDICT_AR = { guilty: "مذنب", innocent: "بريء", tie: "تعادل" };

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const activePlayers = (room) => [...room.players.values()].filter((p) => !p.spectator);
const nameByRole = (room, role) => {
  const p = activePlayers(room).find((x) => x.role === role);
  return p ? p.name : "-";
};

function addLog(room, text) {
  room.log.push({ at: Date.now(), text });
  if (room.log.length > 100) room.log.shift();
}

function sanitizeSettings(s, cur, min) {
  s = s || {};
  const wanted = parseInt(s.maxPlayers, 10) || cur.maxPlayers;
  const vs = parseInt(s.voteSeconds, 10);
  const ds = parseInt(s.defenseSeconds, 10);
  const tr = parseInt(s.totalRounds, 10);
  return {
    title: typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 30) : cur.title,
    description: typeof s.description === "string" ? s.description.trim().slice(0, 200) : cur.description,
    rules: typeof s.rules === "string" ? s.rules.trim().slice(0, 500) : cur.rules,
    maxPlayers: Math.min(MAX_LIMIT, Math.max(min, wanted)),
    allowSpectators: !!s.allowSpectators,
    voteMode: s.voteMode === "open" ? "open" : "secret",
    voteSeconds: VOTE_OPTIONS.includes(vs) ? vs : cur.voteSeconds,
    defenseSeconds: DEFENSE_OPTIONS.includes(ds) ? ds : cur.defenseSeconds,
    totalRounds: ROUNDS_OPTIONS.includes(tr) ? tr : cur.totalRounds,
    teams: [0, 2, 3].includes(parseInt(s.teams, 10)) ? parseInt(s.teams, 10) : cur.teams || 0,
    judgeMode: s.judgeMode === "host" ? "host" : "random",
    judgeId: typeof s.judgeId === "string" ? s.judgeId : ""
  };
}

export function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      hostId: null,
      settings: {
        title: "قاعة المحكمة",
        description: "",
        rules: "",
        maxPlayers: 8,
        allowSpectators: false,
        voteMode: "secret",
        voteSeconds: 20,
        defenseSeconds: 60,
        totalRounds: 3,
        judgeMode: "random",
        judgeId: ""
      },
      players: new Map(),
      phase: "lobby",
      round: 0,
      totalRounds: 3,
      caseData: null,
      timeLeft: 0,
      paused: false,
      votes: new Map(),
      objections: new Set(),
      revoteUsed: false,
      result: null,
      log: [],
      history: [],
      roundData: new Map(),
      startedAt: 0,
      awarded: false,
      poll: null,
      pollTimer: null,
      chatLog: [],
      reports: new Map(),
      reported: new Set(),
      banned: new Set(),
      next: null,
      timer: null
    });
  }
  return rooms.get(roomId);
}

const TEAM_NAMES = ["الفريق أ", "الفريق ب", "الفريق ج"];

function teamsState(room) {
  const n = room.settings.teams || 0;
  if (!n || room.phase === "lobby") return [];
  const pts = new Array(n).fill(0);
  for (const rd of room.roundData.values()) {
    if (rd.points) rd.points.forEach((v, i) => (pts[i] += v));
  }
  return TEAM_NAMES.slice(0, n).map((name, i) => ({
    id: i,
    name,
    points: pts[i],
    members: activePlayers(room).filter((p) => p.team === i).map((p) => p.id)
  }));
}

function missionsState(room) {
  if (room.phase !== "result" && room.phase !== "ended") return [];
  const rd = room.roundData.get(room.round);
  return rd && rd.missionList ? rd.missionList : [];
}

function assignTeams(room) {
  const n = room.settings.teams || 0;
  const list = shuffle(activePlayers(room));
  list.forEach((p, i) => (p.team = n ? i % n : -1));
  if (n) {
    addLog(
      room,
      TEAM_NAMES.slice(0, n)
        .map((nm, i) => `${nm}: ` + list.filter((p) => p.team === i).map((p) => p.name).join("، "))
        .join(" | ")
    );
  }
}

function assignMissions(io, room) {
  const list = activePlayers(room);
  for (const p of list) {
    p.mission = pickMission(p, list);
    io.to(p.socketId).emit("mission", publicMission(p));
  }
}

function evalRound(room, rd, verdict) {
  const n = room.settings.teams || 0;
  const pts = new Array(n).fill(0);
  const list = [];
  rd.missions = {};
  for (const p of activePlayers(room)) {
    const role = rd.roles[p.id];
    if (!role) continue;
    const m = p.mission;
    if (m) {
      evaluateMission(m, room.votes, verdict);
      rd.missions[p.id] = !!m.done;
      list.push({ id: p.id, name: p.name, text: m.text, done: !!m.done });
    }
    let win = false;
    if (role === "defendant") win = verdict === "innocent";
    else if (room.votes.get(p.id) && verdict !== "tie") win = room.votes.get(p.id) === verdict;
    if (n && p.team >= 0 && p.team < n) {
      if (win) pts[p.team] += 2;
      if (m && m.done) pts[p.team] += 1;
    }
  }
  rd.points = pts;
  rd.missionList = list;
}

function logTeamWinner(room) {
  const t = teamsState(room);
  if (!t.length) return;
  const max = Math.max(...t.map((x) => x.points));
  const w = t.filter((x) => x.points === max);
  addLog(room, w.length === 1 ? `الفريق الفائز: ${w[0].name} (${max} نقطة)` : "تعادل بين الفرق");
}

export function publicState(room) {
  const open = room.settings.voteMode === "open";
  const poll = room.poll;
  return {
    id: room.id,
    hostId: room.hostId,
    settings: room.settings,
    phase: room.phase,
    paused: room.paused,
    round: room.round,
    totalRounds: room.totalRounds,
    caseData: room.caseData,
    timeLeft: room.timeLeft,
    result: room.result,
    votedCount: room.votes.size,
    objectors: [...room.objections],
    revoteUsed: room.revoteUsed,
    log: room.log,
    history: room.history,
    teams: teamsState(room),
    missions: missionsState(room),
    poll: poll
      ? {
          question: poll.question,
          options: poll.options,
          open: poll.open,
          timeLeft: poll.timeLeft,
          votedCount: poll.votes.size,
          voters: [...poll.votes.keys()],
          counts: poll.open ? null : poll.counts,
          by: poll.by
        }
      : null,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      title: p.title,
      frame: p.frame,
      level: levelFromXp(p.xp),
      team: p.team,
      role: p.role,
      spectator: p.spectator,
      handRaised: p.handRaised,
      micOn: p.micOn,
      connected: p.connected,
      hasVoted: room.votes.has(p.id),
      vote: open ? room.votes.get(p.id) || null : null
    }))
  };
}

export function broadcast(io, room) {
  io.to(room.id).emit("state", publicState(room));
}

export function joinRoom(io, socket, { roomId, name, pid, avatar, title, frame, xp, settings }) {
  if (!roomId || typeof pid !== "string" || !pid) return socket.emit("error_msg", "بيانات ناقصة");
  const isNew = !rooms.has(roomId);
  const room = getRoom(roomId);
  if (isNew && settings) room.settings = sanitizeSettings(settings, room.settings, MIN_PLAYERS);
  if (room.banned.has(pid)) return socket.emit("error_msg", "تم استبعادك من الغرفة");
  const cleanAvatar = typeof avatar === "string" && avatar.length < 60000 ? avatar : "";
  const player = room.players.get(pid);
  if (player) {
    clearTimeout(player.leaveTimer);
    player.socketId = socket.id;
    player.connected = true;
    player.name = name || player.name;
    player.avatar = cleanAvatar || player.avatar;
    player.title = title || "";
    player.frame = frame || "";
    player.xp = xp || 0;
  } else {
    const full = activePlayers(room).length >= room.settings.maxPlayers;
    let spectator = false;
    if (room.phase !== "lobby" || full) {
      if (!room.settings.allowSpectators) {
        return socket.emit("error_msg", room.phase !== "lobby" ? "اللعبة بدأت بالفعل" : "الغرفة كاملة");
      }
      spectator = true;
    }
    room.players.set(pid, {
      id: pid,
      socketId: socket.id,
      name: name || "لاعب",
      avatar: cleanAvatar,
      title: title || "",
      frame: frame || "",
      xp: xp || 0,
      role: spectator ? "spectator" : "player",
      spectator,
      handRaised: false,
      micOn: false,
      connected: true,
      lastReaction: 0,
      team: -1,
      mission: null,
      strikes: 0,
      mutedUntil: 0,
      sent: [],
      lastText: "",
      lastTextAt: 0,
      leaveTimer: null
    });
    if (!room.hostId && !spectator) room.hostId = pid;
    addLog(room, `${name || "لاعب"} ${spectator ? "دخل كمشاهد" : "دخل الغرفة"}`);
  }
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.pid = pid;
  const mine = room.players.get(pid);
  if (mine && mine.mission) socket.emit("mission", publicMission(mine));
  broadcast(io, room);
}

function removePlayer(io, room, pid) {
  const p = room.players.get(pid);
  addLog(room, `${p ? p.name : "لاعب"} خرج من الغرفة`);
  room.players.delete(pid);
  room.votes.delete(pid);
  room.objections.delete(pid);
  if (room.players.size === 0) {
    clearInterval(room.timer);
    clearInterval(room.pollTimer);
    rooms.delete(room.id);
    return;
  }
  if (room.hostId === pid) {
    const next = activePlayers(room)[0] || [...room.players.values()][0];
    room.hostId = next.id;
    addLog(room, `${next.name} بقى الهوست`);
  }
  broadcast(io, room);
}

export function leaveRoom(io, socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room) return;
  const player = room.players.get(socket.data.pid);
  if (!player || player.socketId !== socket.id) return;
  player.connected = false;
  broadcast(io, room);
  player.leaveTimer = setTimeout(() => removePlayer(io, room, player.id), GRACE_MS);
}

export function toggleHand(io, socket) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  if (!p) return;
  p.handRaised = !p.handRaised;
  if (p.handRaised && trackHand(p)) io.to(p.socketId).emit("mission", publicMission(p));
  broadcast(io, room);
}

export function setMic(io, socket, on) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  if (!p) return;
  p.micOn = !!on;
  broadcast(io, room);
}

export function reaction(io, socket, emoji) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  if (!p || !REACTIONS.includes(emoji)) return;
  const now = Date.now();
  if (now - p.lastReaction < 800) return;
  p.lastReaction = now;
  io.to(room.id).emit("reaction", { from: p.id, emoji, at: now });
  if (trackReaction(p)) io.to(p.socketId).emit("mission", publicMission(p));
}

export function updateSettings(io, socket, s) {
  const room = rooms.get(socket.data.roomId);
  if (!room) return;
  if (room.hostId !== socket.data.pid) return socket.emit("error_msg", "بس الهوست يغيّر الإعدادات");
  if (room.phase !== "lobby" && room.phase !== "ended") return socket.emit("error_msg", "مينفعش تغيّر الإعدادات أثناء اللعبة");
  const min = Math.max(MIN_PLAYERS, activePlayers(room).length);
  room.settings = sanitizeSettings(s, room.settings, min);
  broadcast(io, room);
}

/* ---------- الشات والمودريشن ---------- */

export function chat(io, socket, text) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  if (!p || typeof text !== "string") return;
  text = text.trim().slice(0, 300);
  if (!text) return;
  const now = Date.now();
  if (p.mutedUntil > now) {
    return socket.emit("notice", `انت مكتوم لمدة ${Math.ceil((p.mutedUntil - now) / 1000)} ثانية`);
  }
  p.sent = p.sent.filter((t) => now - t < 5000);
  if (p.sent.length >= 5) return socket.emit("notice", "بطّئ شوية، رسايلك كتير");
  const norm = normalize(text);
  if (norm === p.lastText && now - p.lastTextAt < 10000) {
    return socket.emit("notice", "الرسالة دي اتبعتت قبل كده");
  }
  if (checkText(text)) {
    p.strikes += 1;
    if (p.strikes >= MAX_STRIKES) {
      p.strikes = 0;
      p.mutedUntil = now + AUTO_MUTE_MS;
      addLog(room, `${p.name} اتكتم دقيقة بسبب ألفاظ ممنوعة`);
      broadcast(io, room);
      return socket.emit("notice", "اتكتمت دقيقة بسبب الألفاظ الممنوعة");
    }
    return socket.emit("notice", `رسالتك فيها ألفاظ ممنوعة (تحذير ${p.strikes} من ${MAX_STRIKES})`);
  }
  p.sent.push(now);
  if (trackChat(p, text)) io.to(p.socketId).emit("mission", publicMission(p));
  p.lastText = norm;
  p.lastTextAt = now;
  const msg = { id: `${now}-${Math.random().toString(36).slice(2, 7)}`, from: p.id, text, at: now };
  room.chatLog.push(msg);
  if (room.chatLog.length > 60) room.chatLog.shift();
  io.to(room.id).emit("chat", msg);
}

export function report(io, socket, msgId) {
  const room = rooms.get(socket.data.roomId);
  const me = room && room.players.get(socket.data.pid);
  if (!me) return;
  const msg = room.chatLog.find((m) => m.id === msgId);
  if (!msg || msg.from === me.id) return;
  const key = `${me.id}:${msg.id}`;
  if (room.reported.has(key)) return socket.emit("notice", "بلّغت عن الرسالة دي قبل كده");
  room.reported.add(key);
  saveReport({ reporter: me.id, target: msg.from, roomCode: room.id, message: msg.text, reason: "chat" });
  socket.emit("notice", "تم إرسال البلاغ");
  const target = room.players.get(msg.from);
  if (!target) return;
  let set = room.reports.get(target.id);
  if (!set) {
    set = new Set();
    room.reports.set(target.id, set);
  }
  set.add(me.id);
  const need = activePlayers(room).length <= 4 ? 2 : 3;
  if (set.size >= need) {
    set.clear();
    target.mutedUntil = Date.now() + LONG_MUTE_MS;
    addLog(room, `${target.name} اتكتم 5 دقايق بعد بلاغات من اللاعبين`);
    broadcast(io, room);
  }
}

export function mutePlayer(io, socket, targetId) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.hostId !== socket.data.pid) return;
  const target = room.players.get(targetId);
  if (!target || target.id === room.hostId) return;
  target.mutedUntil = Date.now() + LONG_MUTE_MS;
  addLog(room, `الهوست كتم ${target.name} من الشات 5 دقايق`);
  socket.emit("notice", `تم كتم ${target.name}`);
  broadcast(io, room);
}

export function kickPlayer(io, socket, targetId) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.hostId !== socket.data.pid) return;
  const target = room.players.get(targetId);
  if (!target || target.id === room.hostId) return;
  room.banned.add(target.id);
  clearTimeout(target.leaveTimer);
  const s = io.sockets.sockets.get(target.socketId);
  if (s) {
    s.emit("kicked");
    s.leave(room.id);
    s.data.roomId = null;
  }
  addLog(room, `الهوست استبعد ${target.name}`);
  removePlayer(io, room, target.id);
}

/* ---------- التايمر والجولات ---------- */

function startTimer(io, room) {
  clearInterval(room.timer);
  room.timer = setInterval(() => {
    room.timeLeft -= 1;
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.next();
    } else {
      broadcast(io, room);
    }
  }, 1000);
}

function runPhase(io, room, phase, seconds, next) {
  clearInterval(room.timer);
  room.phase = phase;
  room.timeLeft = seconds;
  room.next = next;
  room.paused = false;
  broadcast(io, room);
  startTimer(io, room);
}

function assignRoles(room) {
  let ids = shuffle(activePlayers(room).map((p) => p.id));
  const fixed = room.settings.judgeMode === "host" ? room.settings.judgeId : null;
  if (fixed && ids.includes(fixed)) ids = [fixed, ...ids.filter((id) => id !== fixed)];
  ids.forEach((id, i) => {
    const p = room.players.get(id);
    p.role = i === 0 ? "judge" : i === 1 ? "defendant" : i === 2 ? "witness" : "juror";
  });
}

function startRound(io, room) {
  room.round += 1;
  room.votes = new Map();
  room.objections = new Set();
  room.revoteUsed = false;
  room.result = null;
  assignRoles(room);
  assignMissions(io, room);
  room.roundData.set(room.round, {
    verdict: null,
    votes: {},
    roles: Object.fromEntries(activePlayers(room).map((p) => [p.id, p.role]))
  });
  addLog(
    room,
    `الجولة ${room.round} من ${room.totalRounds} — القاضي: ${nameByRole(room, "judge")}، المتهم: ${nameByRole(
      room,
      "defendant"
    )}، الشاهد: ${nameByRole(room, "witness")}`
  );
  runPhase(io, room, "defense", room.settings.defenseSeconds, () => startVoting(io, room));
}

function startVoting(io, room) {
  addLog(room, "بدأ التصويت");
  runPhase(io, room, "voting", room.settings.voteSeconds, () => showResult(io, room));
}

function showResult(io, room) {
  let innocent = 0;
  let guilty = 0;
  for (const v of room.votes.values()) v === "innocent" ? innocent++ : guilty++;
  const verdict = guilty > innocent ? "guilty" : innocent > guilty ? "innocent" : "tie";
  room.result = { innocent, guilty, verdict };
  room.history = room.history.filter((h) => h.round !== room.round);
  room.history.push({ round: room.round, verdict, innocent, guilty });
  const rd = room.roundData.get(room.round);
  if (rd) {
    rd.verdict = verdict;
    rd.votes = Object.fromEntries(room.votes);
    evalRound(room, rd, verdict);
  }
  addLog(room, `نتيجة الجولة ${room.round}: ${VERDICT_AR[verdict]} (بريء ${innocent} — مذنب ${guilty})`);
  runPhase(io, room, "result", RESULT_SECONDS, () => {
    if (room.round >= room.totalRounds) finishGame(io, room);
    else startRound(io, room);
  });
}

function finishGame(io, room) {
  logTeamWinner(room);
  room.phase = "ended";
  room.timeLeft = 0;
  room.paused = false;
  addLog(room, "انتهت اللعبة");
  if (room.awarded) return broadcast(io, room);
  room.awarded = true;
  if (Date.now() - room.startedAt < MIN_GAME_MS) {
    addLog(room, "اللعبة قصيرة جدًا، مفيش XP");
    return broadcast(io, room);
  }
  broadcast(io, room);
  const rounds = [...room.roundData.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, d]) => ({ round, ...d }))
    .filter((r) => r.verdict);
  awardGame({
    roomCode: room.id,
    title: room.settings.title,
    caseTitle: room.caseData ? room.caseData.title : null,
    history: room.history,
    log: room.log,
    rounds,
    players: activePlayers(room).map((p) => ({ id: p.id, name: p.name }))
  })
    .then((rewards) => io.to(room.id).emit("rewards", rewards))
    .catch((e) => console.error("award failed:", e && e.message ? e.message : e));
}

export function startGame(io, socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room) return;
  if (room.hostId !== socket.data.pid) return socket.emit("error_msg", "بس الهوست يبدأ اللعبة");
  if (activePlayers(room).length < MIN_PLAYERS) return socket.emit("error_msg", `محتاجين ${MIN_PLAYERS} لاعبين على الأقل`);
  if (room.phase !== "lobby" && room.phase !== "ended") return;
  room.round = 0;
  room.totalRounds = room.settings.totalRounds;
  room.history = [];
  room.roundData = new Map();
  room.startedAt = Date.now();
  room.awarded = false;
  room.caseData = randomCase();
  assignTeams(room);
  addLog(room, `بدأت اللعبة — القضية: ${room.caseData.title}`);
  startRound(io, room);
}

export function skipPhase(io, socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.hostId !== socket.data.pid) return;
  if (!["defense", "voting", "result"].includes(room.phase) || !room.next) return;
  addLog(room, "الهوست نقل الفعالية للمرحلة التالية");
  clearInterval(room.timer);
  room.next();
}

/* ---------- Game Master ---------- */

function doRevote(io, room, text) {
  room.revoteUsed = true;
  room.votes = new Map();
  room.result = null;
  addLog(room, text);
  startVoting(io, room);
}

export function gmAction(io, socket, action) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.hostId !== socket.data.pid) return;
  const running = ["defense", "voting", "result"].includes(room.phase);
  if (action === "pause" && running && !room.paused) {
    clearInterval(room.timer);
    room.paused = true;
    addLog(room, "الهوست أوقف الوقت");
    broadcast(io, room);
  } else if (action === "resume" && running && room.paused) {
    room.paused = false;
    startTimer(io, room);
    addLog(room, "الهوست استأنف الوقت");
    broadcast(io, room);
  } else if (action === "extend" && running) {
    room.timeLeft = Math.min(room.timeLeft + 30, 300);
    addLog(room, "الهوست زوّد 30 ثانية");
    broadcast(io, room);
  } else if (action === "revote" && room.phase === "result" && !room.revoteUsed) {
    doRevote(io, room, "الهوست أمر بإعادة التصويت");
  } else if (action === "end" && running) {
    clearInterval(room.timer);
    room.paused = false;
    room.phase = "ended";
    room.timeLeft = 0;
    room.awarded = true;
    addLog(room, "الهوست أنهى اللعبة بدري، مفيش XP");
    broadcast(io, room);
  }
}

/* ---------- التصويت والاعتراض ---------- */

export function castVote(io, socket, vote) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.phase !== "voting") return;
  if (vote !== "innocent" && vote !== "guilty") return;
  const me = room.players.get(socket.data.pid);
  if (!me || me.spectator || me.role === "defendant") return;
  if (room.votes.has(me.id)) return;
  room.votes.set(me.id, vote);
  broadcast(io, room);
}

export function objection(io, socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.phase !== "result" || room.revoteUsed) return;
  const me = room.players.get(socket.data.pid);
  if (!me || me.spectator || me.role === "judge") return;
  if (room.objections.has(me.id)) return;
  room.objections.add(me.id);
  addLog(room, `${me.name} اعترض على الحكم`);
  broadcast(io, room);
}

export function revote(io, socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room || room.phase !== "result" || room.revoteUsed) return;
  const me = room.players.get(socket.data.pid);
  if (!me || me.role !== "judge") return;
  if (room.objections.size === 0) return socket.emit("notice", "مفيش اعتراضات");
  doRevote(io, room, "القاضي أمر بإعادة التصويت");
}

/* ---------- Poll Creator ---------- */

function closePoll(io, room) {
  const poll = room.poll;
  if (!poll || !poll.open) return;
  clearInterval(room.pollTimer);
  poll.open = false;
  poll.timeLeft = 0;
  poll.counts = poll.options.map((_, i) => [...poll.votes.values()].filter((v) => v === i).length);
  addLog(
    room,
    `نتيجة التصويت "${poll.question}": ` + poll.options.map((o, i) => `${o} (${poll.counts[i]})`).join("، ")
  );
  broadcast(io, room);
}

export function createPoll(io, socket, data) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  if (!p || p.spectator) return;
  if (room.hostId !== p.id && p.role !== "judge") {
    return socket.emit("notice", "بس الهوست أو الحكم ينشئ تصويت");
  }
  if (room.poll && room.poll.open) return socket.emit("notice", "في تصويت شغال بالفعل");
  data = data || {};
  const question = typeof data.question === "string" ? data.question.trim().slice(0, 100) : "";
  const options = Array.isArray(data.options)
    ? data.options
        .filter((o) => typeof o === "string" && o.trim())
        .map((o) => o.trim().slice(0, 40))
        .slice(0, 5)
    : [];
  if (!question || options.length < 2) return socket.emit("notice", "اكتب السؤال وخيارين على الأقل");
  const secs = parseInt(data.seconds, 10);
  const seconds = VOTE_OPTIONS.includes(secs) ? secs : 20;
  clearInterval(room.pollTimer);
  room.poll = { question, options, votes: new Map(), open: true, timeLeft: seconds, counts: null, by: p.id };
  addLog(room, `${p.name} أنشأ تصويت: ${question}`);
  room.pollTimer = setInterval(() => {
    if (!room.poll || !room.poll.open) return clearInterval(room.pollTimer);
    room.poll.timeLeft -= 1;
    if (room.poll.timeLeft <= 0) closePoll(io, room);
    else broadcast(io, room);
  }, 1000);
  broadcast(io, room);
}

export function votePoll(io, socket, idx) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  const poll = room && room.poll;
  if (!p || p.spectator || !poll || !poll.open) return;
  if (!Number.isInteger(idx) || idx < 0 || idx >= poll.options.length) return;
  if (poll.votes.has(p.id)) return;
  poll.votes.set(p.id, idx);
  broadcast(io, room);
}

export function endPoll(io, socket) {
  const room = rooms.get(socket.data.roomId);
  if (!room || !room.poll || !room.poll.open) return;
  if (room.hostId !== socket.data.pid && room.poll.by !== socket.data.pid) return;
  closePoll(io, room);
}