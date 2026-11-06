<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { sb } from "./supabase";

const props = defineProps<{ uid: string }>();
const emit = defineEmits<{ enter: [code: string] }>();

const list = ref<any[]>([]);
const sel = ref<any>(null);
const players = ref<any[]>([]);
const matches = ref<any[]>([]);
const names = ref<Record<string, string>>({});
const newName = ref("");
const newSize = ref(4);
const msg = ref("");
let timer: any = null;

const isCreator = computed(() => !!sel.value && sel.value.creator === props.uid);
const joinedMe = computed(() => players.value.some((p) => p.user_id === props.uid));
const totalRounds = computed(() => (sel.value ? Math.round(Math.log2(sel.value.size)) : 0));
const roundList = computed(() => Array.from({ length: totalRounds.value }, (_, i) => i + 1));
const standings = computed(() => {
  if (!sel.value || sel.value.status !== "finished") return [];
  const fin = matches.value.find((m) => m.round === totalRounds.value);
  if (!fin) return [];
  const out = [
    { place: "🥇 البطل", id: fin.winner },
    { place: "🥈 الوصيف", id: fin.p1 === fin.winner ? fin.p2 : fin.p1 }
  ];
  if (totalRounds.value >= 2) {
    matches.value
      .filter((m) => m.round === totalRounds.value - 1)
      .forEach((m) => out.push({ place: "🥉 نصف النهائي", id: m.p1 === m.winner ? m.p2 : m.p1 }));
  }
  return out;
});

function statusAr(s: string) {
  return s === "open" ? "مفتوحة للتسجيل" : s === "running" ? "شغالة" : "انتهت";
}
function roundName(r: number) {
  const left = totalRounds.value - r;
  return left === 0 ? "النهائي" : left === 1 ? "نصف النهائي" : "ربع النهائي";
}
function nm(id: string | null) {
  return id ? names.value[id] || "؟" : "—";
}
function matchesOf(r: number) {
  return matches.value.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
}
function code5() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

async function loadList() {
  const { data } = await sb.from("tournaments").select("*").order("created_at", { ascending: false }).limit(20);
  list.value = data || [];
}

async function loadDetail(id: string) {
  const { data: t } = await sb.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (!t) {
    sel.value = null;
    return;
  }
  sel.value = t;
  const { data: ps } = await sb.from("tournament_players").select("*").eq("tournament_id", id).order("joined_at");
  const { data: ms } = await sb.from("tournament_matches").select("*").eq("tournament_id", id);
  players.value = ps || [];
  matches.value = ms || [];
  const ids = new Set<string>();
  players.value.forEach((p) => ids.add(p.user_id));
  matches.value.forEach((m) => [m.p1, m.p2, m.winner].forEach((x) => x && ids.add(x)));
  if (ids.size) {
    const { data: prof } = await sb.from("profiles").select("id, username").in("id", [...ids]);
    const map: Record<string, string> = {};
    (prof || []).forEach((p: any) => (map[p.id] = p.username));
    names.value = map;
  }
}

function open(t: any) {
  msg.value = "";
  loadDetail(t.id);
}
function back() {
  sel.value = null;
  msg.value = "";
  loadList();
}

async function create() {
  const n = newName.value.trim();
  if (!n) {
    msg.value = "اكتب اسم البطولة";
    return;
  }
  const { data, error } = await sb.from("tournaments").insert({ creator: props.uid, name: n, size: newSize.value }).select().single();
  if (error || !data) {
    msg.value = "حصل خطأ";
    return;
  }
  await sb.from("tournament_players").insert({ tournament_id: data.id, user_id: props.uid });
  newName.value = "";
  await loadList();
  open(data);
}

async function join() {
  if (players.value.length >= sel.value.size) {
    msg.value = "البطولة كاملة";
    return;
  }
  const { error } = await sb.from("tournament_players").insert({ tournament_id: sel.value.id, user_id: props.uid });
  if (error) msg.value = "مقدرتش أسجلك";
  await loadDetail(sel.value.id);
}
async function leave() {
  await sb.from("tournament_players").delete().eq("tournament_id", sel.value.id).eq("user_id", props.uid);
  await loadDetail(sel.value.id);
}

async function start() {
  const t = sel.value;
  if (players.value.length !== t.size) {
    msg.value = `محتاجين ${t.size} لاعبين بالظبط`;
    return;
  }
  const ids = players.value.map((p) => p.user_id).sort(() => Math.random() - 0.5);
  const rows: any[] = [];
  for (let r = 1; r <= totalRounds.value; r++) {
    const count = t.size / Math.pow(2, r);
    for (let s = 0; s < count; s++) {
      rows.push({
        tournament_id: t.id,
        round: r,
        slot: s,
        room_code: code5(),
        p1: r === 1 ? ids[s * 2] : null,
        p2: r === 1 ? ids[s * 2 + 1] : null
      });
    }
  }
  const { error } = await sb.from("tournament_matches").insert(rows);
  if (error) {
    msg.value = "حصل خطأ";
    return;
  }
  await sb.from("tournaments").update({ status: "running" }).eq("id", t.id);
  await loadDetail(t.id);
}

async function setWinner(m: any, w: string) {
  if (m.winner || !w) return;
  const { error } = await sb.from("tournament_matches").update({ winner: w }).eq("id", m.id);
  if (error) {
    msg.value = "حصل خطأ";
    return;
  }
  if (m.round < totalRounds.value) {
    const next = matches.value.find((x) => x.round === m.round + 1 && x.slot === Math.floor(m.slot / 2));
    if (next) {
      await sb.from("tournament_matches").update(m.slot % 2 === 0 ? { p1: w } : { p2: w }).eq("id", next.id);
    }
  } else {
    await sb.from("tournaments").update({ status: "finished", winner: w }).eq("id", sel.value.id);
  }
  await loadDetail(sel.value.id);
}

onMounted(() => {
  loadList();
  timer = setInterval(() => (sel.value ? loadDetail(sel.value.id) : loadList()), 8000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="space-y-4">
    <div v-if="!sel" class="space-y-4">
      <div class="space-y-2 rounded-xl bg-slate-900 p-4">
        <div class="font-bold">إنشاء بطولة</div>
        <div class="flex gap-2">
          <input
            v-model="newName"
            maxlength="40"
            placeholder="اسم البطولة"
            class="flex-1 rounded-lg bg-slate-800 p-3 outline-none"
          />
          <select v-model.number="newSize" class="rounded-lg bg-slate-800 p-3">
            <option :value="4">4 لاعبين</option>
            <option :value="8">8 لاعبين</option>
          </select>
          <button class="rounded-lg bg-violet-600 px-4 font-bold" @click="create">إنشاء</button>
        </div>
        <p v-if="msg" class="text-sm text-yellow-400">{{ msg }}</p>
      </div>

      <div class="space-y-2 rounded-xl bg-slate-900 p-4">
        <div class="font-bold">البطولات</div>
        <div v-if="!list.length" class="text-sm text-slate-400">مفيش بطولات لسه</div>
        <button
          v-for="t in list"
          :key="t.id"
          class="flex w-full justify-between rounded-lg bg-slate-800 p-3 text-right"
          @click="open(t)"
        >
          <span class="font-bold">{{ t.name }}</span>
          <span class="text-sm text-slate-400">{{ t.size }} لاعبين • {{ statusAr(t.status) }}</span>
        </button>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div class="flex items-center justify-between rounded-xl bg-slate-900 p-4">
        <div>
          <div class="text-lg font-bold">🏅 {{ sel.name }}</div>
          <div class="text-sm text-slate-400">{{ sel.size }} لاعبين • {{ statusAr(sel.status) }}</div>
        </div>
        <button class="rounded-lg bg-slate-800 px-3 py-2 text-sm" @click="back">رجوع</button>
      </div>

      <p v-if="msg" class="text-sm text-yellow-400">{{ msg }}</p>

      <div v-if="sel.status === 'open'" class="space-y-2 rounded-xl bg-slate-900 p-4">
        <div class="font-bold">المسجلين ({{ players.length }}/{{ sel.size }})</div>
        <div v-for="p in players" :key="p.user_id" class="text-sm">{{ nm(p.user_id) }}</div>
        <div class="flex gap-2">
          <button v-if="!joinedMe" class="rounded-lg bg-violet-600 px-4 py-2 font-bold" @click="join">سجّل</button>
          <button v-else class="rounded-lg bg-slate-800 px-4 py-2" @click="leave">إلغاء التسجيل</button>
          <button v-if="isCreator" class="rounded-lg bg-green-600 px-4 py-2 font-bold" @click="start">ابدأ البطولة</button>
        </div>
      </div>

      <div v-if="sel.status !== 'open'" class="space-y-3">
        <div v-for="r in roundList" :key="r" class="space-y-2 rounded-xl bg-slate-900 p-4">
          <div class="font-bold">{{ roundName(r) }}</div>
          <div v-for="m in matchesOf(r)" :key="m.id" class="space-y-2 rounded-lg bg-slate-800 p-3">
            <div class="flex justify-between">
              <span :class="m.winner && m.winner === m.p1 ? 'font-bold text-green-400' : ''">{{ nm(m.p1) }}</span>
              <span class="text-slate-500">ضد</span>
              <span :class="m.winner && m.winner === m.p2 ? 'font-bold text-green-400' : ''">{{ nm(m.p2) }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-slate-400">غرفة: {{ m.room_code }}</span>
              <button
                v-if="m.p1 && m.p2 && !m.winner"
                class="rounded-lg bg-violet-600 px-3 py-1"
                @click="emit('enter', m.room_code)"
              >
                ادخل الغرفة
              </button>
              <template v-if="isCreator && m.p1 && m.p2 && !m.winner">
                <button class="rounded-lg bg-slate-700 px-3 py-1" @click="setWinner(m, m.p1)">فاز {{ nm(m.p1) }}</button>
                <button class="rounded-lg bg-slate-700 px-3 py-1" @click="setWinner(m, m.p2)">فاز {{ nm(m.p2) }}</button>
              </template>
            </div>
          </div>
        </div>
      </div>

      <div v-if="standings.length" class="space-y-1 rounded-xl bg-slate-900 p-4">
        <div class="font-bold">الترتيب النهائي</div>
        <div v-for="(s, i) in standings" :key="i" class="flex justify-between text-sm">
          <span>{{ s.place }}</span>
          <span>{{ nm(s.id) }}</span>
        </div>
      </div>

      <div v-if="sel.status === 'running' && !isCreator" class="text-xs text-slate-500">
        منظم البطولة هو اللي بيسجل الفايز في كل مباراة.
      </div>
    </div>
  </div>
</template>