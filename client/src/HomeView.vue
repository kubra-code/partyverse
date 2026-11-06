<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { sb } from "./supabase";
import Avatar from "./Avatar.vue";
import MessagesView from "./MessagesView.vue";
import CreateEventView from "./CreateEventView.vue";
import SeasonView from "./SeasonView.vue";
import AvatarStudio from "./AvatarStudio.vue";
import TournamentsView from "./TournamentsView.vue";
import { ACHIEVEMENTS, TITLES, FRAMES, levelFromXp, xpForLevel, isUnlocked } from "./progress";

const props = defineProps<{ profile: any }>();
const emit = defineEmits<{ enter: [code: string, settings?: any]; reload: [] }>();

const uid = props.profile.id;
const tab = ref("home");
const friends = ref<any[]>([]);
const incoming = ref<any[]>([]);
const outgoing = ref<any[]>([]);
const notes = ref<any[]>([]);
const allRows = ref<any[]>([]);
const searchText = ref("");
const msg = ref("");
const code = ref(localStorage.getItem("pv_last_room") || "");
const newName = ref(props.profile.username);
const achKeys = ref<string[]>([]);
const seasonXp = ref(0);
const seasonTier = computed(() => Math.min(8, Math.floor(seasonXp.value / 100)));
async function loadSeason() {
  const { data } = await sb.rpc("my_season_xp");
  seasonXp.value = Number(data || 0);
}
const lbMode = ref<"weekly" | "all">("weekly");
const lbRows = ref<any[]>([]);
const games = ref<any[]>([]);
const replay = ref<any>(null);
let timer: any = null;

const xp = computed(() => props.profile.xp || 0);
const level = computed(() => levelFromXp(xp.value));
const xpPct = computed(() => {
  const base = xpForLevel(level.value);
  const next = xpForLevel(level.value + 1);
  return Math.min(100, Math.max(0, Math.round(((xp.value - base) / (next - base)) * 100)));
});
const xpToNext = computed(() => xpForLevel(level.value + 1) - xp.value);
const onlineFriends = computed(() => friends.value.filter((f) => f.online));
const onlineCount = computed(() => onlineFriends.value.length);
const unread = computed(() => notes.value.filter((n) => !n.read).length);
const recentInvites = computed(() =>
  notes.value.filter((n) => n.type === "invite" && Date.now() - new Date(n.created_at).getTime() < 15 * 60 * 1000)
);
const navItems = computed(() => [
  { k: "home", l: "🏠 الرئيسية", b: 0 },
  { k: "friends", l: "👥 الأصدقاء", b: incoming.value.length },
  { k: "notifications", l: "🔔 الإشعارات", b: unread.value },
  { k: "leaderboard", l: "🏆 الترتيب", b: 0 },
  { k: "history", l: "📜 السجل", b: 0 },
  { k: "season", l: "🎫 الموسم", b: 0 },
  { k: "studio", l: "🎨 الاستوديو", b: 0 },
  { k: "tournaments", l: "🏅 البطولات", b: 0 },
  { k: "inventory", l: "🎒 المقتنيات", b: 0 },
  { k: "messages", l: "💬 الرسائل", b: 0 },
  { k: "profile", l: "👤 الملف", b: 0 }
]);

function noteText(n: any) {
  const who = n.from ? n.from.username : "لاعب";
  if (n.type === "friend_request") return `${who} بعتلك طلب صداقة`;
  if (n.type === "friend_accepted") return `${who} قبل طلب صداقتك`;
  return `${who} دعاك لغرفة ${n.room_code}`;
}
function timeOf(t: string | number) {
  return new Date(t).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}
function dateOf(t: string) {
  return new Date(t).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}
function resultAr(r: string) {
  return r === "win" ? "فوز" : r === "loss" ? "خسارة" : "تعادل";
}
function verdictAr(v: string) {
  return v === "guilty" ? "مذنب" : v === "innocent" ? "بريء" : "تعادل";
}
function achName(k: string) {
  return ACHIEVEMENTS.find((a) => a.key === k)?.name || k;
}

async function loadAll() {
  const { data: fs } = await sb.from("friendships").select("*").or(`requester.eq.${uid},addressee.eq.${uid}`);
  const rows = fs || [];
  allRows.value = rows;
  const { data: ns } = await sb
    .from("notifications")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(30);
  const ids = new Set<string>();
  rows.forEach((r: any) => {
    ids.add(r.requester);
    ids.add(r.addressee);
  });
  (ns || []).forEach((n: any) => n.from_user && ids.add(n.from_user));
  ids.delete(uid);
  const map = new Map<string, any>();
  if (ids.size) {
    const { data: ps } = await sb
      .from("profiles")
      .select("id, username, avatar_url, last_seen, frame, title")
      .in("id", [...ids]);
    (ps || []).forEach((p: any) => map.set(p.id, p));
  }
  const now = Date.now();
  const decorate = (p: any) => p && { ...p, online: !!p.last_seen && now - new Date(p.last_seen).getTime() < 60000 };
  friends.value = rows
    .filter((r: any) => r.status === "accepted")
    .map((r: any) => ({ fid: r.id, ...decorate(map.get(r.requester === uid ? r.addressee : r.requester)) }))
    .filter((f: any) => f.id);
  incoming.value = rows
    .filter((r: any) => r.status === "pending" && r.addressee === uid)
    .map((r: any) => ({ fid: r.id, ...decorate(map.get(r.requester)) }))
    .filter((f: any) => f.id);
  outgoing.value = rows
    .filter((r: any) => r.status === "pending" && r.requester === uid)
    .map((r: any) => ({ fid: r.id, ...decorate(map.get(r.addressee)) }))
    .filter((f: any) => f.id);
  notes.value = (ns || []).map((n: any) => ({ ...n, from: map.get(n.from_user) }));
}

async function loadAch() {
  const { data } = await sb.from("user_achievements").select("key").eq("user_id", uid);
  achKeys.value = (data || []).map((r: any) => r.key);
}
async function loadLb() {
  if (lbMode.value === "weekly") {
    const { data } = await sb.rpc("weekly_leaderboard");
    lbRows.value = (data || []).map((r: any) => ({ ...r, score: Number(r.weekly_xp) }));
  } else {
    const { data } = await sb
      .from("profiles")
      .select("id, username, avatar_url, title, frame, xp")
      .order("xp", { ascending: false })
      .limit(50);
    lbRows.value = (data || []).map((r: any) => ({ ...r, score: r.xp }));
  }
}
async function loadGames() {
  const { data } = await sb
    .from("game_players")
    .select("xp_gained, result, created_at, games(id, title, case_title, room_code, rounds, log, players, ended_at)")
    .eq("user_id", uid)
    .order("created_at", { ascending: false })
    .limit(20);
  games.value = (data || []).filter((r: any) => r.games);
}
function setLb(m: "weekly" | "all") {
  lbMode.value = m;
  loadLb();
}

async function openTab(t: string) {
  tab.value = t;
  msg.value = "";
  if (t === "notifications") {
    await sb.from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);
    await loadAll();
  }
  if (t === "leaderboard") loadLb();
  if (t === "history") loadGames();
  if (t === "inventory" || t === "profile") loadAch();
  if (t === "season" || t === "inventory" || t === "studio") loadSeason();
}

function quickJoin() {
  const c = code.value.trim();
  if (!c) {
    msg.value = "اكتب كود الغرفة";
    return;
  }
  emit("enter", c);
}
function createRoom() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let c = "";
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  emit("enter", c);
}
async function joinInvite(n: any) {
  await sb.from("notifications").update({ read: true }).eq("id", n.id);
  emit("enter", n.room_code);
}

async function addFriend() {
  msg.value = "";
  const text = searchText.value.trim();
  if (!text) return;
  const { data: p } = await sb.from("profiles").select("id, username").eq("username", text).maybeSingle();
  if (!p) {
    msg.value = "مفيش لاعب بالاسم ده";
    return;
  }
  if (p.id === uid) {
    msg.value = "ده انت";
    return;
  }
  if (allRows.value.some((r) => r.requester === p.id || r.addressee === p.id)) {
    msg.value = "في طلب أو صداقة موجودة بالفعل";
    return;
  }
  const { error } = await sb.from("friendships").insert({ requester: uid, addressee: p.id });
  if (error) {
    msg.value = "حصل خطأ: " + error.message;
    return;
  }
  await sb.from("notifications").insert({ user_id: p.id, type: "friend_request", from_user: uid });
  searchText.value = "";
  msg.value = "اتبعت طلب الصداقة";
  loadAll();
}
async function accept(f: any) {
  await sb.from("friendships").update({ status: "accepted" }).eq("id", f.fid);
  await sb.from("notifications").insert({ user_id: f.id, type: "friend_accepted", from_user: uid });
  loadAll();
}
async function removeRow(f: any) {
  await sb.from("friendships").delete().eq("id", f.fid);
  loadAll();
}

async function equip(field: "title" | "frame", value: string) {
  await sb.from("profiles").update({ [field]: value }).eq("id", uid);
  emit("reload");
}

function pickAvatar(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = async () => {
      const size = 96;
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      const side = Math.min(img.width, img.height);
      c.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      await sb.from("profiles").update({ avatar_url: c.toDataURL("image/jpeg", 0.8) }).eq("id", uid);
      emit("reload");
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}
async function saveName() {
  const n = newName.value.trim();
  if (n.length < 3 || n.length > 20) {
    msg.value = "الاسم من 3 إلى 20 حرف";
    return;
  }
  if (n === props.profile.username) return;
  const { error } = await sb.from("profiles").update({ username: n }).eq("id", uid);
  if (error) msg.value = (error as any).code === "23505" ? "الاسم مستخدم" : error.message;
  else {
    msg.value = "اتحفظ";
    emit("reload");
  }
}
async function setDm(v: string) {
  await sb.from("profiles").update({ dm_policy: v }).eq("id", uid);
  emit("reload");
}
async function logout() {
  localStorage.removeItem("pv_room");
  await sb.auth.signOut();
}

onMounted(() => {
  emit("reload");
  loadAll();
  loadAch();
  loadSeason();
  timer = setInterval(loadAll, 15000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div dir="rtl" class="min-h-screen bg-slate-950 pb-24 text-white">
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:flex-row">
      <!-- Sidebar -->
      <nav class="flex gap-2 overflow-x-auto text-sm font-bold md:w-44 md:shrink-0 md:flex-col">
        <button
          v-for="n in navItems"
          :key="n.k"
          class="whitespace-nowrap rounded-xl p-3 text-right"
          :class="tab === n.k ? 'bg-violet-600' : 'bg-slate-900'"
          @click="openTab(n.k)"
        >
          {{ n.l }}
          <span v-if="n.b" class="mr-1 rounded-full bg-red-600 px-2 text-xs">{{ n.b }}</span>
        </button>
      </nav>

      <!-- Main -->
      <main class="min-w-0 flex-1 space-y-4">
        <!-- الرئيسية -->
        <div v-if="tab === 'home'" class="space-y-4">
          <div class="space-y-3 rounded-xl bg-slate-900 p-4">
            <div class="flex items-center gap-4">
              <Avatar :src="profile.avatar_url" :frame="profile.frame" size="h-16 w-16" />
              <div class="flex-1">
                <div class="text-xl font-bold">{{ profile.username }}</div>
                <div class="text-sm text-slate-400">
                  المستوى {{ level }}<span v-if="profile.title"> • {{ profile.title }}</span> • {{ onlineCount }} من
                  {{ friends.length }} أصدقاء متصلين
                </div>
              </div>
            </div>
            <div>
              <div class="h-2 rounded-full bg-slate-800">
                <div class="h-2 rounded-full bg-violet-500" :style="{ width: xpPct + '%' }"></div>
              </div>
              <div class="mt-1 text-xs text-slate-400">{{ xp }} XP • باقي {{ xpToNext }} للمستوى {{ level + 1 }}</div>
            </div>
          </div>

          <div class="space-y-3 rounded-xl bg-slate-900 p-4">
            <div class="font-bold">دخول سريع للغرفة</div>
            <div class="flex gap-2">
              <input
                v-model="code"
                placeholder="كود الغرفة"
                class="flex-1 rounded-lg bg-slate-800 p-3 outline-none"
                @keyup.enter="quickJoin"
              />
              <button class="rounded-lg bg-violet-600 px-4 font-bold" @click="quickJoin">دخول</button>
            </div>
            <button class="w-full rounded-lg bg-slate-800 p-3" @click="openTab('create')">➕ إنشاء فعالية</button>
            <p v-if="msg" class="text-sm text-yellow-400">{{ msg }}</p>
          </div>

          <div class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">دعوات الفعاليات الجديدة</div>
            <div v-if="!recentInvites.length" class="text-sm text-slate-400">مفيش دعوات جديدة</div>
            <div v-for="n in recentInvites" :key="n.id" class="flex items-center justify-between py-1">
              <span>{{ noteText(n) }}</span>
              <button class="rounded-lg bg-green-600 px-3 py-1 text-sm font-bold" @click="joinInvite(n)">ادخل</button>
            </div>
          </div>

          <div class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">آخر الأنشطة</div>
            <div v-if="!notes.length" class="text-sm text-slate-400">لسه مفيش أنشطة</div>
            <div v-for="n in notes.slice(0, 5)" :key="n.id" class="flex justify-between py-1 text-sm">
              <span>{{ noteText(n) }}</span>
              <span class="text-slate-500">{{ timeOf(n.created_at) }}</span>
            </div>
          </div>
        </div>

        <!-- الأصدقاء -->
        <div v-if="tab === 'friends'" class="space-y-4">
          <div class="space-y-2 rounded-xl bg-slate-900 p-4">
            <div class="font-bold">إضافة صديق</div>
            <div class="flex gap-2">
              <input
                v-model="searchText"
                placeholder="اسم المستخدم بالظبط"
                class="flex-1 rounded-lg bg-slate-800 p-3 outline-none"
                @keyup.enter="addFriend"
              />
              <button class="rounded-lg bg-violet-600 px-4 font-bold" @click="addFriend">إرسال</button>
            </div>
            <p v-if="msg" class="text-sm text-yellow-400">{{ msg }}</p>
          </div>

          <div v-if="incoming.length" class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">طلبات صداقة</div>
            <div v-for="f in incoming" :key="f.fid" class="flex items-center gap-3 py-1">
              <Avatar :src="f.avatar_url" :frame="f.frame" />
              <span class="flex-1">{{ f.username }}</span>
              <button class="rounded-lg bg-green-600 px-3 py-1 text-sm" @click="accept(f)">قبول</button>
              <button class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="removeRow(f)">رفض</button>
            </div>
          </div>

          <div class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">أصدقائي ({{ friends.length }})</div>
            <div v-if="!friends.length" class="text-sm text-slate-400">لسه معندكش أصدقاء</div>
            <div v-for="f in friends" :key="f.fid" class="flex items-center gap-3 py-1">
              <Avatar :src="f.avatar_url" :frame="f.frame" />
              <span class="flex-1">{{ f.username }}</span>
              <span class="text-xs" :class="f.online ? 'text-green-400' : 'text-slate-500'">
                {{ f.online ? '● متصل' : '○ غير متصل' }}
              </span>
              <button class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="removeRow(f)">حذف</button>
            </div>
          </div>

          <div v-if="outgoing.length" class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">طلبات في الانتظار</div>
            <div v-for="f in outgoing" :key="f.fid" class="flex items-center gap-3 py-1">
              <Avatar :src="f.avatar_url" :frame="f.frame" />
              <span class="flex-1">{{ f.username }}</span>
              <button class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="removeRow(f)">إلغاء</button>
            </div>
          </div>
        </div>

        <!-- الإشعارات -->
        <div v-if="tab === 'notifications'" class="rounded-xl bg-slate-900 p-4">
          <div class="mb-2 font-bold">الإشعارات والدعوات</div>
          <div v-if="!notes.length" class="text-sm text-slate-400">مفيش إشعارات</div>
          <div v-for="n in notes" :key="n.id" class="flex items-center gap-3 py-2">
            <Avatar :src="n.from?.avatar_url" :frame="n.from?.frame" />
            <div class="flex-1">
              <div>{{ noteText(n) }}</div>
              <div class="text-xs text-slate-500">{{ timeOf(n.created_at) }}</div>
            </div>
            <button
              v-if="n.type === 'friend_request'"
              class="rounded-lg bg-slate-800 px-3 py-1 text-sm"
              @click="openTab('friends')"
            >
              الأصدقاء
            </button>
            <button
              v-if="n.type === 'invite'"
              class="rounded-lg bg-green-600 px-3 py-1 text-sm font-bold"
              @click="joinInvite(n)"
            >
              ادخل
            </button>
          </div>
        </div>

        <!-- الترتيب -->
        <div v-if="tab === 'leaderboard'" class="space-y-3 rounded-xl bg-slate-900 p-4">
          <div class="flex gap-2">
            <button
              class="flex-1 rounded-lg p-2 font-bold"
              :class="lbMode === 'weekly' ? 'bg-violet-600' : 'bg-slate-800'"
              @click="setLb('weekly')"
            >
              الأسبوعي
            </button>
            <button
              class="flex-1 rounded-lg p-2 font-bold"
              :class="lbMode === 'all' ? 'bg-violet-600' : 'bg-slate-800'"
              @click="setLb('all')"
            >
              الكلي
            </button>
          </div>
          <div v-if="!lbRows.length" class="text-sm text-slate-400">لسه مفيش ترتيب</div>
          <div
            v-for="(r, i) in lbRows"
            :key="r.id"
            class="flex items-center gap-3 rounded-lg p-2"
            :class="r.id === uid ? 'bg-violet-900/40' : ''"
          >
            <span class="w-8 text-center font-bold">{{ i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1 }}</span>
            <Avatar :src="r.avatar_url" :frame="r.frame" />
            <div class="flex-1">
              <div class="font-bold">{{ r.username }}</div>
              <div v-if="r.title" class="text-xs text-slate-400">{{ r.title }}</div>
            </div>
            <span class="font-mono">{{ r.score }} XP</span>
          </div>
        </div>

        <!-- السجل -->
        <div v-if="tab === 'history'" class="space-y-2 rounded-xl bg-slate-900 p-4">
          <div class="font-bold">سجل الفعاليات السابقة</div>
          <div v-if="!games.length" class="text-sm text-slate-400">لسه ماتلعبتش أي لعبة</div>
          <button
            v-for="g in games"
            :key="g.games.id"
            class="flex w-full items-center justify-between rounded-lg bg-slate-800 p-3 text-right"
            @click="replay = g"
          >
            <div>
              <div class="font-bold">{{ g.games.title }}</div>
              <div class="text-xs text-slate-400">{{ g.games.case_title }} • {{ dateOf(g.created_at) }}</div>
            </div>
            <div class="text-left">
              <div :class="g.result === 'win' ? 'text-green-400' : g.result === 'loss' ? 'text-red-400' : 'text-slate-300'">
                {{ resultAr(g.result) }}
              </div>
              <div class="text-xs text-slate-400">+{{ g.xp_gained }} XP</div>
            </div>
          </button>
        </div>

        <!-- المقتنيات -->
        <div v-if="tab === 'inventory'" class="space-y-4">
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">الألقاب</div>
            <div v-for="t in TITLES" :key="t.key || 'none'" class="flex items-center justify-between py-1">
              <div>
                <span>{{ t.key || 'من غير لقب' }}</span>
                <span class="mr-2 text-xs text-slate-500">{{ t.hint }}</span>
              </div>
              <span v-if="profile.title === t.key" class="text-sm text-green-400">مفعّل</span>
              <button
                v-else-if="isUnlocked(t.unlock, level, achKeys, seasonTier)"
                class="rounded-lg bg-violet-600 px-3 py-1 text-sm"
                @click="equip('title', t.key)"
              >
                فعّل
              </button>
              <span v-else class="text-sm text-slate-500">🔒</span>
            </div>
          </div>

          <div class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">إطارات الصورة</div>
            <div v-for="f in FRAMES" :key="f.key || 'none'" class="flex items-center gap-3 py-1">
              <Avatar :src="profile.avatar_url" :frame="f.key" size="h-10 w-10" />
              <div class="flex-1">
                <span>{{ f.name }}</span>
                <span class="mr-2 text-xs text-slate-500">{{ f.hint }}</span>
              </div>
              <span v-if="profile.frame === f.key" class="text-sm text-green-400">مفعّل</span>
              <button
                v-else-if="isUnlocked(f.unlock, level, achKeys, seasonTier)"
                class="rounded-lg bg-violet-600 px-3 py-1 text-sm"
                @click="equip('frame', f.key)"
              >
                فعّل
              </button>
              <span v-else class="text-sm text-slate-500">🔒</span>
            </div>
          </div>

          <div class="rounded-xl bg-slate-900 p-4">
            <div class="mb-2 font-bold">الإنجازات</div>
            <div v-for="a in ACHIEVEMENTS" :key="a.key" class="flex items-center gap-3 py-1">
              <span>{{ achKeys.includes(a.key) ? '🏆' : '🔒' }}</span>
              <div class="flex-1">
                <div :class="achKeys.includes(a.key) ? '' : 'text-slate-500'">{{ a.name }}</div>
                <div class="text-xs text-slate-500">{{ a.desc }}</div>
              </div>
            </div>
          </div>
        </div>

        <MessagesView v-if="tab === 'messages'" :uid="uid" :friends="friends" />
        <SeasonView v-if="tab === 'season'" :xp="seasonXp" />
        <AvatarStudio v-if="tab === 'studio'" :uid="uid" :level="level" :tier="seasonTier" @saved="emit('reload')" />
        <TournamentsView v-if="tab === 'tournaments'" :uid="uid" @enter="(c) => emit('enter', c)" />
        <CreateEventView
          v-if="tab === 'create'"
          @create="(c, s) => emit('enter', c, s)"
          @cancel="openTab('home')"
        />

        <!-- الملف الشخصي -->
        <div v-if="tab === 'profile'" class="space-y-4 rounded-xl bg-slate-900 p-4">
          <label class="mx-auto flex cursor-pointer flex-col items-center gap-2">
            <Avatar :src="profile.avatar_url" :frame="profile.frame" size="h-24 w-24" />
            <span class="text-sm text-violet-400">غيّر الصورة</span>
            <input type="file" accept="image/*" class="hidden" @change="pickAvatar" />
          </label>
          <div class="flex gap-2">
            <input v-model="newName" maxlength="20" class="flex-1 rounded-lg bg-slate-800 p-3 outline-none" />
            <button class="rounded-lg bg-violet-600 px-4 font-bold" @click="saveName">حفظ</button>
          </div>
          <p v-if="msg" class="text-sm text-yellow-400">{{ msg }}</p>

          <div class="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold">{{ profile.games_played }}</div><div class="text-xs text-slate-400">ألعاب</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold text-green-400">{{ profile.wins }}</div><div class="text-xs text-slate-400">فوز</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold text-red-400">{{ profile.losses }}</div><div class="text-xs text-slate-400">خسارة</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold">{{ profile.draws }}</div><div class="text-xs text-slate-400">تعادل</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold">{{ profile.rounds_won }}</div><div class="text-xs text-slate-400">جولات فوز</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold">{{ profile.rounds_lost }}</div><div class="text-xs text-slate-400">جولات خسارة</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold">{{ profile.judge_rounds }}</div><div class="text-xs text-slate-400">جولات كحكم</div></div>
            <div class="rounded-lg bg-slate-800 p-3"><div class="text-xl font-bold">{{ profile.defendant_cleared }}</div><div class="text-xs text-slate-400">تبرئة</div></div>
          </div>

          <div v-if="achKeys.length">
            <div class="mb-1 text-sm text-slate-400">إنجازاتي</div>
            <div class="flex flex-wrap gap-2 text-sm">
              <span v-for="k in achKeys" :key="k" class="rounded-full bg-slate-800 px-3 py-1">🏆 {{ achName(k) }}</span>
            </div>
          </div>

          <label class="flex items-center justify-between rounded-lg bg-slate-800 p-3">
            <span>مين يقدر يبعتلي رسائل</span>
            <select
              :value="profile.dm_policy || 'friends'"
              class="rounded-lg bg-slate-700 p-2"
              @change="setDm($event.target.value)"
            >
              <option value="friends">أصدقائي</option>
              <option value="nobody">محدش</option>
            </select>
          </label>
          <button class="w-full rounded-lg bg-red-600 p-3 font-bold" @click="logout">تسجيل الخروج</button>
        </div>
      </main>

      <!-- Social Panel -->
      <aside class="hidden w-56 shrink-0 space-y-2 lg:block">
        <div class="rounded-xl bg-slate-900 p-3">
          <div class="mb-2 text-sm font-bold">الأصدقاء المتصلين ({{ onlineCount }})</div>
          <div v-if="!onlineFriends.length" class="text-xs text-slate-500">محدش متصل دلوقتي</div>
          <div v-for="f in onlineFriends" :key="f.fid" class="flex items-center gap-2 py-1">
            <Avatar :src="f.avatar_url" :frame="f.frame" size="h-8 w-8" />
            <span class="flex-1 truncate text-sm">{{ f.username }}</span>
            <span class="text-xs text-green-400">●</span>
          </div>
        </div>
      </aside>
    </div>

    <!-- Player Bar -->
    <div class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900 p-3">
      <div class="mx-auto flex max-w-6xl items-center gap-3">
        <Avatar :src="profile.avatar_url" :frame="profile.frame" size="h-10 w-10" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-bold">
            {{ profile.username }} <span class="text-xs text-slate-400">• المستوى {{ level }}</span>
          </div>
          <div class="mt-1 h-1.5 rounded-full bg-slate-800">
            <div class="h-1.5 rounded-full bg-violet-500" :style="{ width: xpPct + '%' }"></div>
          </div>
        </div>
        <span class="text-xs text-green-400">● متصل</span>
      </div>
    </div>

    <!-- Event Replay -->
    <div
      v-if="replay"
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      @click.self="replay = null"
    >
      <div class="w-full max-w-lg space-y-3 rounded-xl bg-slate-900 p-4">
        <div class="flex items-center justify-between">
          <div class="text-lg font-bold">{{ replay.games.title }}</div>
          <button class="rounded-lg bg-slate-800 px-3 py-1" @click="replay = null">✖</button>
        </div>
        <div class="text-sm text-slate-400">القضية: {{ replay.games.case_title }}</div>

        <div>
          <div class="mb-1 text-sm text-slate-400">نتائج الجولات</div>
          <div v-for="h in replay.games.rounds" :key="h.round" class="flex justify-between text-sm">
            <span>الجولة {{ h.round }}</span>
            <span>{{ verdictAr(h.verdict) }} (بريء {{ h.innocent }} — مذنب {{ h.guilty }})</span>
          </div>
        </div>

        <div>
          <div class="mb-1 text-sm text-slate-400">اللاعبين</div>
          <div v-for="p in replay.games.players" :key="p.id" class="flex justify-between text-sm">
            <span>{{ p.name }}</span>
            <span>{{ resultAr(p.result) }} • +{{ p.xp }} XP</span>
          </div>
        </div>

        <div>
          <div class="mb-1 text-sm text-slate-400">الخط الزمني</div>
          <div class="max-h-64 space-y-1 overflow-y-auto text-sm">
            <div v-for="(l, i) in replay.games.log" :key="i" class="text-slate-300">
              <span class="text-slate-500">{{ timeOf(l.at) }}</span> {{ l.text }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>