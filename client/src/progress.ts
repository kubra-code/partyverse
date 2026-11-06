export const levelFromXp = (xp: number) => Math.floor(Math.sqrt((xp || 0) / 50)) + 1;
export const xpForLevel = (l: number) => 50 * (l - 1) * (l - 1);

type Unlock = { level?: number; ach?: string; tier?: number };

export const ACHIEVEMENTS = [
  { key: "first_game", name: "أول لعبة", desc: "العب أول لعبة" },
  { key: "ten_games", name: "لاعب مخضرم", desc: "العب 10 ألعاب" },
  { key: "first_win", name: "أول فوز", desc: "اكسب أول لعبة" },
  { key: "five_wins", name: "بطل", desc: "اكسب 5 ألعاب" },
  { key: "detective", name: "أفضل محقق", desc: "وافق حكم المحكمة في 10 جولات" },
  { key: "judge_5", name: "أفضل حكم", desc: "اشتغل حكم في 5 جولات" },
  { key: "cleared_3", name: "البريء", desc: "اتبرّأ كمتهم 3 مرات" }
];

export const TITLES: { key: string; hint: string; unlock: Unlock }[] = [
  { key: "", hint: "من غير لقب", unlock: {} },
  { key: "لاعب جديد", hint: "متاح للكل", unlock: {} },
  { key: "محقق", hint: "المستوى 3", unlock: { level: 3 } },
  { key: "خبير المحكمة", hint: "المستوى 5", unlock: { level: 5 } },
  { key: "أسطورة", hint: "المستوى 10", unlock: { level: 10 } },
  { key: "قاضي نزيه", hint: "إنجاز أفضل حكم", unlock: { ach: "judge_5" } },
  { key: "البريء", hint: "إنجاز البريء", unlock: { ach: "cleared_3" } },
  { key: "نجم الموسم", hint: "الموسم: المستوى 4", unlock: { tier: 4 } },
  { key: "خصم عنيد", hint: "الموسم: المستوى 7", unlock: { tier: 7 } },
  { key: "بطل الموسم", hint: "الموسم: المستوى 8", unlock: { tier: 8 } }
];

export const FRAMES: { key: string; name: string; hint: string; cls: string; unlock: Unlock }[] = [
  { key: "", name: "من غير إطار", hint: "", cls: "", unlock: {} },
  { key: "bronze", name: "برونزي", hint: "المستوى 3", cls: "ring-2 ring-amber-700", unlock: { level: 3 } },
  { key: "silver", name: "فضي", hint: "المستوى 5", cls: "ring-2 ring-slate-300", unlock: { level: 5 } },
  { key: "gold", name: "ذهبي", hint: "المستوى 8", cls: "ring-2 ring-yellow-400", unlock: { level: 8 } },
  {
    key: "neon",
    name: "نيون",
    hint: "إنجاز أول فوز",
    cls: "ring-2 ring-violet-500 shadow-lg shadow-violet-500/50",
    unlock: { ach: "first_win" }
  },
  { key: "teal", name: "فيروزي", hint: "الموسم: المستوى 2", cls: "ring-2 ring-teal-400", unlock: { tier: 2 } },
  { key: "rose", name: "وردي", hint: "الموسم: المستوى 5", cls: "ring-2 ring-rose-500", unlock: { tier: 5 } },
  { key: "sky", name: "سماوي", hint: "الموسم: المستوى 7", cls: "ring-2 ring-sky-400", unlock: { tier: 7 } },
  {
    key: "legend",
    name: "أسطوري",
    hint: "الموسم: المستوى 8",
    cls: "ring-4 ring-yellow-300 shadow-lg shadow-yellow-300/50",
    unlock: { tier: 8 }
  }
];

export function frameClass(key?: string) {
  return FRAMES.find((f) => f.key === key)?.cls || "";
}

export function isUnlocked(u: Unlock, level: number, ach: string[], tier = 0) {
  return (
    (u.level ? level >= u.level : true) && (u.ach ? ach.includes(u.ach) : true) && (u.tier ? tier >= u.tier : true)
  );
}

export const STUDIO_FACES: { k: string; u: Unlock }[] = [
  { k: "😀", u: {} },
  { k: "😎", u: {} },
  { k: "🤠", u: {} },
  { k: "🥸", u: {} },
  { k: "🤓", u: {} },
  { k: "🧐", u: { level: 2 } },
  { k: "👽", u: { level: 3 } },
  { k: "🤖", u: { level: 5 } },
  { k: "🐱", u: { tier: 1 } },
  { k: "🦊", u: { tier: 3 } }
];
export const STUDIO_HATS: { k: string; u: Unlock }[] = [
  { k: "", u: {} },
  { k: "🎩", u: {} },
  { k: "🧢", u: {} },
  { k: "🎓", u: { level: 2 } },
  { k: "⛑️", u: { level: 4 } },
  { k: "🎧", u: { tier: 3 } },
  { k: "👑", u: { tier: 6 } }
];
export const STUDIO_BGS = ["#334155", "#7c3aed", "#0f766e", "#b45309", "#be123c", "#1d4ed8"];

export const SEASON_REWARDS = [
  { tier: 1, text: "وجه 🐱 في الاستوديو" },
  { tier: 2, text: "إطار فيروزي" },
  { tier: 3, text: "وجه 🦊 وسماعات 🎧 في الاستوديو" },
  { tier: 4, text: "لقب «نجم الموسم»" },
  { tier: 5, text: "إطار وردي" },
  { tier: 6, text: "تاج 👑 في الاستوديو" },
  { tier: 7, text: "إطار سماوي + لقب «خصم عنيد»" },
  { tier: 8, text: "إطار أسطوري + لقب «بطل الموسم»" }
];