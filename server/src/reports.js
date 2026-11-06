import { createClient } from "@supabase/supabase-js";

const admin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    : null;

export async function saveReport(r) {
  if (!admin) return;
  try {
    const { error } = await admin.from("reports").insert({
      reporter: r.reporter,
      target: r.target,
      room_code: r.roomCode,
      message: r.message,
      reason: r.reason
    });
    if (error) console.error("report failed:", error.message);
  } catch (e) {
    console.error("report failed:", e && e.message ? e.message : e);
  }
}