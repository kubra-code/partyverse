import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import {
  joinRoom,
  leaveRoom,
  startGame,
  skipPhase,
  castVote,
  toggleHand,
  setMic,
  updateSettings,
  objection,
  revote,
  reaction,
  chat,
  report,
  mutePlayer,
  kickPlayer,
  gmAction,
  createPoll,
  votePoll,
  endPoll
} from "./game.js";
import { sound } from "./extras.js";

const PORT = process.env.PORT || 3001;
const ORIGIN = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());

async function authUser(token) {
  if (!token || typeof token !== "string") return null;
  try {
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data || !data.user) return null;
    const { data: prof } = await sb
      .from("profiles")
      .select("username, avatar_url, title, frame, xp")
      .eq("id", data.user.id)
      .single();
    return {
      id: data.user.id,
      name: (prof && prof.username) || "لاعب",
      avatar: (prof && prof.avatar_url) || "",
      title: (prof && prof.title) || "",
      frame: (prof && prof.frame) || "",
      xp: (prof && prof.xp) || 0
    };
  } catch (e) {
    return null;
  }
}

const app = express();
app.use(cors({ origin: ORIGIN }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/voice-token", async (req, res) => {
  const { room, name, pid } = req.query;
  if (!room || !name) return res.status(400).json({ error: "room and name required" });
  try {
    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity: String(pid || `${name}-${Math.random().toString(36).slice(2, 7)}`),
      name: String(name)
    });
    at.addGrant({ roomJoin: true, room: String(room), canPublish: true, canSubscribe: true });
    res.json({ token: await at.toJwt(), url: process.env.LIVEKIT_URL });
  } catch (e) {
    res.status(500).json({ error: "token failed" });
  }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: ORIGIN } });

io.on("connection", (socket) => {
  socket.on("join_room", async (data) => {
    data = data || {};
    const u = await authUser(data.token);
    if (!u) return socket.emit("error_msg", "سجّل دخول الأول");
    joinRoom(io, socket, {
      roomId: String(data.roomId || ""),
      name: u.name,
      pid: u.id,
      avatar: u.avatar,
      title: u.title,
      frame: u.frame,
      xp: u.xp,
      settings: data.settings
    });
  });
  socket.on("start_game", () => startGame(io, socket));
  socket.on("skip_phase", () => skipPhase(io, socket));
  socket.on("cast_vote", (vote) => castVote(io, socket, vote));
  socket.on("toggle_hand", () => toggleHand(io, socket));
  socket.on("set_mic", (on) => setMic(io, socket, on));
  socket.on("update_settings", (s) => updateSettings(io, socket, s));
  socket.on("objection", () => objection(io, socket));
  socket.on("revote", () => revote(io, socket));
  socket.on("reaction", (emoji) => reaction(io, socket, emoji));
  socket.on("chat", (text) => chat(io, socket, text));
  socket.on("report", (id) => report(io, socket, id));
  socket.on("mute_player", (id) => mutePlayer(io, socket, id));
  socket.on("kick_player", (id) => kickPlayer(io, socket, id));
  socket.on("gm", (action) => gmAction(io, socket, action));
  socket.on("poll_create", (d) => createPoll(io, socket, d));
  socket.on("poll_vote", (i) => votePoll(io, socket, i));
  socket.on("poll_close", () => endPoll(io, socket));
  socket.on("sound", (id) => sound(io, socket, id));
  socket.on("disconnect", () => leaveRoom(io, socket));
});

server.listen(PORT, () => console.log(`Server running on :${PORT}`));