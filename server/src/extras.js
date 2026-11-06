import { rooms } from "./game.js";

const SOUND_IDS = ["ding", "buzzer", "applause", "drum", "siren", "fanfare"];

export function sound(io, socket, id) {
  const room = rooms.get(socket.data.roomId);
  const p = room && room.players.get(socket.data.pid);
  if (!p || p.spectator || !SOUND_IDS.includes(id)) return;
  const now = Date.now();
  if (now - (p.lastSound || 0) < 3000) return socket.emit("notice", "استنى 3 ثواني بين المؤثرات");
  p.lastSound = now;
  io.to(room.id).emit("sound", { from: p.id, id });
}