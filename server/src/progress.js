import { createClient } from "@supabase/supabase-js";

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

export const levelFromXp = (xp) => Math.floor(Math.sqrt((xp || 0) / 50)) + 1;

const ACH = [
  { key: "first_game", test: (p) => p.games_played >= 1 },
  { key: "ten_games", test: (p) => p.games_played >= 10 },
  { key: "first_win", test: (p) => p.wins >= 1 },
  { key: "five_wins", test: (p) => p.wins >= 5 },
  { key: "detective", test: (p) => p.rounds_won >= 10 },
  { key: "judge_5", test: (p) => p.judge_rounds >= 5 },
  { key: "cleared_3", test: (p) => p.defendant_cleared >= 3 }
];

function evaluate(pid, rounds) {
  let won = 0, lost = 0, played = 0, judge = 0, cleared = 0, xp = 0;
  for (const r of rounds) {
    const role = r.roles[pid];
    if (!role) continue;
    played++;
    if (r.missions && r.missions[pid]) xp += 5;
    if (role === "judge") judge++;
    let out = null;
    if (role === "defendant") {
      if (r.verdict === "innocent") { out = "win"; cleared++; }
      else if (r.verdict === "guilty") out = "loss";
    } else if (r.votes[pid] && r.verdict !== "tie") {
      out = r.votes[pid] === r.verdict ? "win" : "loss";
    }
    if (out === "win") { won++; xp += 10; }
    else { if (out === "loss") lost++; xp += 3; }
  }
  const result = won > lost ? "win" : lost > won ? "loss" : "draw";
  xp += 20 + (result === "win" ? 15 : 0);
  return { won, lost, played, judge, cleared, xp, result };
}

export async function awardGame({ roomCode, title, caseTitle, history, log, rounds, players }) {
  if (!admin) return {};
  const results = new Map();
  for (const p of players) {
    const r = evaluate(p.id, rounds);
    if (r.played > 0) results.set(p.id, r);
  }
  const ids = [...results.keys()];
  if (ids.length === 0) return {};

  const { data: profs, error: e1 } = await admin
    .from("profiles")
    .select("id, xp, games_played, wins, losses, draws, rounds_won, rounds_lost, judge_rounds, defendant_cleared")
    .in("id", ids);
  if (e1) throw e1;
  const { data: owned } = await admin.from("user_achievements").select("user_id, key").in("user_id", ids);
  const ownedMap = new Map();
  (owned || []).forEach((o) => {
    if (!ownedMap.has(o.user_id)) ownedMap.set(o.user_id, new Set());
    ownedMap.get(o.user_id).add(o.key);
  });

  const summary = players
    .filter((p) => results.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, result: results.get(p.id).result, xp: results.get(p.id).xp }));
  const { data: game, error: e2 } = await admin
    .from("games")
    .insert({ room_code: roomCode, title, case_title: caseTitle || null, rounds: history, log, players: summary })
    .select("id")
    .single();
  if (e2) throw e2;

  const rewards = {};
  const gpRows = [];
  for (const prof of profs || []) {
    const r = results.get(prof.id);
    const next = {
      xp: prof.xp + r.xp,
      games_played: prof.games_played + 1,
      wins: prof.wins + (r.result === "win" ? 1 : 0),
      losses: prof.losses + (r.result === "loss" ? 1 : 0),
      draws: prof.draws + (r.result === "draw" ? 1 : 0),
      rounds_won: prof.rounds_won + r.won,
      rounds_lost: prof.rounds_lost + r.lost,
      judge_rounds: prof.judge_rounds + r.judge,
      defendant_cleared: prof.defendant_cleared + r.cleared
    };
    await admin.from("profiles").update(next).eq("id", prof.id);
    const have = ownedMap.get(prof.id) || new Set();
    const newAch = ACH.filter((a) => !have.has(a.key) && a.test(next)).map((a) => a.key);
    if (newAch.length) {
      await admin.from("user_achievements").insert(newAch.map((key) => ({ user_id: prof.id, key })));
    }
    rewards[prof.id] = {
      xp: r.xp,
      level: levelFromXp(next.xp),
      levelUp: levelFromXp(next.xp) > levelFromXp(prof.xp),
      newAch,
      result: r.result
    };
    gpRows.push({ game_id: game.id, user_id: prof.id, xp_gained: r.xp, result: r.result });
  }
  if (gpRows.length) await admin.from("game_players").insert(gpRows);
  return rewards;
}