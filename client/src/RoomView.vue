<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from "vue";
import { io, Socket } from "socket.io-client";
import { Room, RoomEvent, Track } from "livekit-client";
import { sb } from "./supabase";
import Avatar from "./Avatar.vue";
import { ACHIEVEMENTS } from "./progress";
import { SOUNDS, playSound } from "./soundboard";

const props = defineProps<{ user: any; roomCode: string; initialSettings?: any }>();
const emit = defineEmits<{ leave: [] }>();

const SERVER = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const pid = props.user.id;

const joined = ref(false);
const state = ref<any>(null);
const messages = ref<any[]>([]);
const chatText = ref("");
const error = ref("");
const micOn = ref(false);
const sharing = ref(false);
const screenCount = ref(0);
const voiceReady = ref(false);
const audioBox = ref<HTMLElement | null>(null);
const screenBox = ref<HTMLElement | null>(null);
const chatBox = ref<HTMLElement | null>(null);
const inviteOpen = ref(false);
const inviteList = ref<any[]>([]);
const invited = ref<string[]>([]);
const pollQ = ref("");
const pollOpts = ref(["", ""]);
const pollSecs = ref(20);
const pollForm = ref(false);
const notice = ref("");
let noticeTimer: any = null;
function showNotice(m: string) {
  notice.value = m;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = ""), 4000);
}
const canPoll = computed(
  () => !!me.value && !me.value.spectator && (isHost.value || isJudge.value) && !state.value?.poll?.open
);
const myPollVoted = computed(() => (state.value?.poll?.voters || []).includes(pid));
const canPollVote = computed(
  () => !!state.value?.poll?.open && !!me.value && !me.value.spectator && !myPollVoted.value
);
function createPoll() {
  const options = pollOpts.value.map((o) => o.trim()).filter(Boolean);
  if (!pollQ.value.trim() || options.length < 2) {
    showNotice("اكتب السؤال وخيارين على الأقل");
    return;
  }
  socket?.emit("poll_create", { question: pollQ.value.trim(), options, seconds: pollSecs.value });
  pollQ.value = "";
  pollOpts.value = ["", ""];
  pollForm.value = false;
}
function votePoll(i: number) {
  socket?.emit("poll_vote", i);
}
function closePoll() {
  socket?.emit("poll_close");
}
function gm(action: string) {
  socket?.emit("gm", action);
}
function kick(p: any) {
  if (confirm("استبعاد " + p.name + "؟")) socket?.emit("kick_player", p.id);
}
function mute(id: string) {
  socket?.emit("mute_player", id);
}
function report(id: string) {
  socket?.emit("report", id);
}
const reactions = ref<any[]>([]);
const myMission = ref<any>(null);
const volume = ref(Number(localStorage.getItem("pv_vol") ?? "0.7"));
const soundMuted = ref(localStorage.getItem("pv_smute") === "1");
const TEAM_LABELS = ["الفريق أ", "الفريق ب", "الفريق ج"];
function teamName(i: number) {
  return TEAM_LABELS[i] || "";
}
function sendSound(id: string) {
  socket?.emit("sound", id);
}
watch(volume, (v) => localStorage.setItem("pv_vol", String(v)));
watch(soundMuted, (v) => localStorage.setItem("pv_smute", v ? "1" : "0"));
const rewards = ref<any>(null);
const REACTION_LIST = ["🎉", "🤔", "💀", "👍", "👎", "😂", "😮", "👏", "🔥", "😡", "❤️"];
function sendReaction(e: string) {
  socket?.emit("reaction", e);
}
function achName(k: string) {
  return ACHIEVEMENTS.find((a) => a.key === k)?.name || k;
}
watch(
  () => state.value?.phase,
  (ph) => {
    if (ph === "lobby" || ph === "defense") rewards.value = null;
    if (ph === "lobby") myMission.value = null;
  }
);

let socket: Socket | null = null;
let lk: Room | null = null;
let voiceStarted = false;

const roleNames: Record<string, string> = {
  judge: "القاضي",
  defendant: "المتهم",
  witness: "الشاهد",
  juror: "محلّف",
  player: "لاعب",
  spectator: "مشاهد"
};
const roleIcons: Record<string, string> = {
  judge: "👨‍⚖️",
  defendant: "🧑‍💼",
  witness: "🕵️",
  juror: "👤",
  player: "👤",
  spectator: "👁️"
};
const roleTasks: Record<string, string> = {
  judge: "أدِر الجلسة واسمع الدفاع، ولو في اعتراض قرر إعادة التصويت.",
  defendant: "دافع عن نفسك قدام المحكمة.",
  witness: "قول اللي تعرفه عن القضية.",
  juror: "اسمع الدفاع كويس وصوّت بعد ما يخلص."
};
const phaseNames: Record<string, string> = {
  lobby: "الانتظار",
  defense: "الدفاع",
  voting: "التصويت",
  result: "النتيجة",
  ended: "انتهت اللعبة"
};

const me = computed(() => state.value?.players.find((p: any) => p.id === pid));
const isHost = computed(() => state.value?.hostId === pid);
const isJudge = computed(() => me.value?.role === "judge");
const activePlayers = computed(() => (state.value?.players || []).filter((p: any) => !p.spectator));
const spectators = computed(() => (state.value?.players || []).filter((p: any) => p.spectator));
const canEditSettings = computed(
  () => isHost.value && (state.value?.phase === "lobby" || state.value?.phase === "ended")
);
const canVote = computed(
  () =>
    state.value?.phase === "voting" &&
    me.value &&
    !me.value.spectator &&
    me.value.role !== "defendant" &&
    !me.value.hasVoted
);
const myObjected = computed(() => (state.value?.objectors || []).includes(pid));
const canObject = computed(
  () =>
    state.value?.phase === "result" &&
    me.value &&
    !me.value.spectator &&
    !isJudge.value &&
    !myObjected.value &&
    !state.value?.revoteUsed
);
const canRevote = computed(
  () =>
    state.value?.phase === "result" &&
    isJudge.value &&
    !state.value?.revoteUsed &&
    (state.value?.objectors || []).length > 0
);
const myTask = computed(() =>
  state.value?.phase === "defense" && me.value && !me.value.spectator ? roleTasks[me.value.role] || "" : ""
);
const summary = computed(() => {
  const h = state.value?.history || [];
  return {
    guilty: h.filter((x: any) => x.verdict === "guilty").length,
    innocent: h.filter((x: any) => x.verdict === "innocent").length,
    tie: h.filter((x: any) => x.verdict === "tie").length
  };
});
const logReversed = computed(() => [...(state.value?.log || [])].reverse());
const timeText = computed(() => {
  const t = state.value?.timeLeft ?? 0;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
});
const verdictText = computed(() => verdictAr(state.value?.result?.verdict));
const modeText = computed(() => (state.value?.settings.voteMode === "open" ? "علني" : "سري"));

function verdictAr(v: string) {
  return v === "guilty" ? "مذنب" : v === "innocent" ? "بريء" : "تعادل";
}
function timeOf(at: number) {
  return new Date(at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}
function nameOf(id: string) {
  return state.value?.players.find((p: any) => p.id === id)?.name || "؟";
}

function join() {
  socket = io(SERVER);
  socket.on("notice", (m: string) => showNotice(m));
  socket.on("mission", (m: any) => (myMission.value = m));
  socket.on("sound", (s: any) => {
    if (!soundMuted.value) playSound(s.id, volume.value);
  });
  socket.on("kicked", () => {
    alert("تم استبعادك من الغرفة");
    emit("leave");
  });
  socket.on("reaction", (r: any) => {
    const item = { id: String(r.at) + r.from, emoji: r.emoji, name: nameOf(r.from) };
    reactions.value.push(item);
    setTimeout(() => (reactions.value = reactions.value.filter((x) => x.id !== item.id)), 3000);
  });
  socket.on("rewards", (r: any) => {
    rewards.value = r && r[pid] ? r[pid] : null;
  });
  socket.on("connect", async () => {
    const { data } = await sb.auth.getSession();
    socket!.emit("join_room", { roomId: props.roomCode, token: data.session?.access_token, settings: props.initialSettings });
  });
  socket.on("state", (s: any) => {
    state.value = s;
    if (!joined.value) {
      joined.value = true;
      connectVoice();
    }
  });
  socket.on("chat", async (m: any) => {
    messages.value.push(m);
    await nextTick();
    if (chatBox.value) chatBox.value.scrollTop = chatBox.value.scrollHeight;
  });
  socket.on("error_msg", (m: string) => {
    error.value = m;
  });
}

async function connectVoice() {
  if (voiceStarted) return;
  voiceStarted = true;
  try {
    const res = await fetch(
      `${SERVER}/voice-token?room=${encodeURIComponent(props.roomCode)}&name=${encodeURIComponent(
        props.user.username
      )}&pid=${encodeURIComponent(pid)}`
    );
    const { token, url } = await res.json();
    lk = new Room();
    lk.on(RoomEvent.TrackSubscribed, (track, pub) => {
      if (track.kind === Track.Kind.Audio) {
        audioBox.value?.appendChild(track.attach());
      } else if (track.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare) {
        const el = track.attach();
        el.className = "w-full rounded-xl bg-black";
        screenBox.value?.appendChild(el);
        screenCount.value++;
      }
    });
    lk.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
      if (track.kind === Track.Kind.Video) screenCount.value = Math.max(0, screenCount.value - 1);
    });
    lk.on(RoomEvent.LocalTrackUnpublished, (pub) => {
      if (pub.source === Track.Source.ScreenShare) sharing.value = false;
    });
    await lk.connect(url, token);
    voiceReady.value = true;
  } catch (e) {
    console.error(e);
    error.value = "فشل الاتصال بالصوت: " + (e && (e as any).message ? (e as any).message : e);
  }
}

async function toggleMic() {
  if (!lk) return;
  try {
    const next = !micOn.value;
    await lk.localParticipant.setMicrophoneEnabled(next);
    micOn.value = next;
    socket?.emit("set_mic", next);
  } catch (e) {
    error.value = "مش قادر يفتح المايك، اسمح للمتصفح بالوصول للميكروفون";
  }
}

async function toggleShare() {
  if (!lk) return;
  try {
    const next = !sharing.value;
    await lk.localParticipant.setScreenShareEnabled(next);
    sharing.value = next;
  } catch (e) {
    sharing.value = false;
  }
}

async function toggleInvite() {
  inviteOpen.value = !inviteOpen.value;
  if (!inviteOpen.value) return;
  const { data: fs } = await sb
    .from("friendships")
    .select("*")
    .eq("status", "accepted")
    .or(`requester.eq.${pid},addressee.eq.${pid}`);
  const ids = (fs || []).map((r: any) => (r.requester === pid ? r.addressee : r.requester));
  if (!ids.length) {
    inviteList.value = [];
    return;
  }
  const { data: ps } = await sb.from("profiles").select("id, username, avatar_url, last_seen").in("id", ids);
  inviteList.value = (ps || []).map((p: any) => ({
    ...p,
    online: !!p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 60000
  }));
}
async function invite(p: any) {
  await sb.from("notifications").insert({ user_id: p.id, type: "invite", from_user: pid, room_code: props.roomCode });
  invited.value.push(p.id);
}

function toggleHand() {
  socket?.emit("toggle_hand");
}
function setSetting(key: string, value: any) {
  socket?.emit("update_settings", { ...state.value.settings, [key]: value });
}
function leave() {
  emit("leave");
}
function startGame() {
  error.value = "";
  socket?.emit("start_game");
}
function skipPhase() {
  socket?.emit("skip_phase");
}
function vote(v: string) {
  socket?.emit("cast_vote", v);
}
function objectVerdict() {
  socket?.emit("objection");
}
function requestRevote() {
  socket?.emit("revote");
}
function sendChat() {
  if (!chatText.value.trim()) return;
  socket?.emit("chat", chatText.value);
  chatText.value = "";
}

onMounted(join);
onBeforeUnmount(() => {
  socket?.disconnect();
  lk?.disconnect();
});
</script>

<template>
  <div dir="rtl" class="min-h-screen bg-slate-950 text-white">
    <div ref="audioBox" class="hidden"></div>
    <div class="pointer-events-none fixed bottom-4 left-4 z-50 space-y-1">
      <div v-for="r in reactions" :key="r.id" class="rounded-full bg-slate-800/90 px-3 py-1 text-sm">
        {{ r.emoji }} {{ r.name }}
      </div>
    </div>

    <div v-if="!joined" class="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6">
      <div v-if="!error" class="text-slate-400">جاري الدخول للغرفة...</div>
      <p v-else class="text-center text-red-400">{{ error }}</p>
      <button class="rounded-lg bg-slate-800 px-4 py-2" @click="leave">رجوع للرئيسية</button>
    </div>

    <div v-else class="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-3">
      <div class="space-y-4 md:col-span-2">
        <div class="flex items-center justify-between rounded-xl bg-slate-900 p-4">
          <div>
            <div class="text-lg font-bold">{{ state.settings.title }} — {{ state.id }}</div>
            <div class="text-sm text-slate-400">
              {{ phaseNames[state.phase] }}
              <span v-if="state.round > 0"> • الجولة {{ state.round }} من {{ state.totalRounds }}</span>
              • {{ activePlayers.length }}/{{ state.settings.maxPlayers }} لاعبين
              <span v-if="spectators.length"> • {{ spectators.length }} مشاهدين</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div v-if="['defense', 'voting', 'result'].includes(state.phase)" class="text-3xl font-mono">
              {{ timeText }}<span v-if="state.paused"> ⏸</span>
            </div>
            <button
              v-if="isHost && ['defense', 'voting', 'result'].includes(state.phase)"
              class="rounded-lg bg-slate-800 px-3 py-2 text-sm"
              @click="skipPhase"
            >
              ⏭ تخطي
            </button>
            <button class="rounded-lg bg-slate-800 px-3 py-2 text-sm" @click="toggleInvite">👥 دعوة</button>
            <button class="rounded-lg bg-slate-800 px-3 py-2 text-sm" @click="leave">خروج</button>
          </div>
        </div>

        <div v-if="inviteOpen" class="rounded-xl bg-slate-900 p-4">
          <div class="mb-2 font-bold">ادعو أصدقاءك</div>
          <div v-if="!inviteList.length" class="text-sm text-slate-400">معندكش أصدقاء لسه</div>
          <div v-for="p in inviteList" :key="p.id" class="flex items-center gap-3 py-1">
            <Avatar :src="p.avatar_url" />
            <span class="flex-1">{{ p.username }}</span>
            <span class="text-xs" :class="p.online ? 'text-green-400' : 'text-slate-500'">
              {{ p.online ? '● متصل' : '○ غير متصل' }}
            </span>
            <button
              class="rounded-lg bg-violet-600 px-3 py-1 text-sm disabled:opacity-50"
              :disabled="invited.includes(p.id)"
              @click="invite(p)"
            >
              {{ invited.includes(p.id) ? 'اتبعتت' : 'دعوة' }}
            </button>
          </div>
        </div>

        <div v-if="notice" class="rounded-xl bg-yellow-900/50 p-3 text-center text-sm text-yellow-200">{{ notice }}</div>

        <div v-if="myMission && state.phase !== 'lobby'" class="rounded-xl bg-slate-900 p-4">
          <div class="text-sm text-slate-400">🕶️ مهمتك السرية</div>
          <div class="font-bold">{{ myMission.text }}</div>
          <div v-if="myMission.done" class="text-sm text-green-400">✅ اتنفذت</div>
        </div>

        <div v-if="state.teams && state.teams.length" class="rounded-xl bg-slate-900 p-4">
          <div class="mb-2 text-sm text-slate-400">الفرق</div>
          <div v-for="t in state.teams" :key="t.id" class="flex justify-between py-1">
            <span>{{ t.name }}: {{ t.members.map(nameOf).join('، ') }}</span>
            <span class="font-bold">{{ t.points }} نقطة</span>
          </div>
        </div>

        <div v-if="state.missions && state.missions.length" class="rounded-xl bg-slate-900 p-4">
          <div class="mb-2 text-sm text-slate-400">نتائج المهام السرية</div>
          <div v-for="m in state.missions" :key="m.id" class="flex justify-between py-1 text-sm">
            <span>{{ m.name }}: {{ m.text }}</span>
            <span>{{ m.done ? '✅' : '❌' }}</span>
          </div>
        </div>

        <div v-if="state.settings.description || state.settings.rules" class="space-y-1 rounded-xl bg-slate-900 p-4">
          <div v-if="state.settings.description" class="text-slate-300">{{ state.settings.description }}</div>
          <div v-if="state.settings.rules" class="text-sm">
            <span class="font-bold text-violet-400">القوانين:</span>
            <span class="whitespace-pre-line text-slate-300"> {{ state.settings.rules }}</span>
          </div>
        </div>

        <div
          v-if="isHost && state.phase !== 'lobby' && state.phase !== 'ended'"
          class="flex flex-wrap gap-2 rounded-xl bg-slate-900 p-3"
        >
          <span class="w-full text-sm text-slate-400">وضع الـ Game Master</span>
          <button v-if="!state.paused" class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="gm('pause')">⏸ إيقاف الوقت</button>
          <button v-else class="rounded-lg bg-green-700 px-3 py-1 text-sm" @click="gm('resume')">▶ استئناف</button>
          <button class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="gm('extend')">➕ 30 ثانية</button>
          <button
            v-if="state.phase === 'result' && !state.revoteUsed"
            class="rounded-lg bg-slate-800 px-3 py-1 text-sm"
            @click="gm('revote')"
          >
            🔁 إعادة التصويت
          </button>
          <button class="rounded-lg bg-red-700 px-3 py-1 text-sm" @click="gm('end')">⏹ إنهاء اللعبة</button>
        </div>

        <div v-if="state.poll" class="space-y-2 rounded-xl bg-slate-900 p-4">
          <div class="flex items-center justify-between">
            <div class="font-bold">📊 {{ state.poll.question }}</div>
            <div v-if="state.poll.open" class="font-mono">{{ state.poll.timeLeft }}s</div>
          </div>
          <div v-for="(o, i) in state.poll.options" :key="i">
            <button
              v-if="canPollVote"
              class="w-full rounded-lg bg-slate-800 p-2 text-right hover:bg-slate-700"
              @click="votePoll(i)"
            >
              {{ o }}
            </button>
            <div v-else class="flex justify-between rounded-lg bg-slate-800 p-2">
              <span>{{ o }}</span>
              <span v-if="state.poll.counts" class="font-bold">{{ state.poll.counts[i] }}</span>
            </div>
          </div>
          <div class="text-xs text-slate-400">
            {{ state.poll.votedCount }} صوّتوا<span v-if="state.poll.open && myPollVoted"> • صوتك اتسجل</span>
          </div>
          <button
            v-if="state.poll.open && (isHost || state.poll.by === pid)"
            class="rounded-lg bg-slate-800 px-3 py-1 text-sm"
            @click="closePoll"
          >
            إنهاء التصويت
          </button>
        </div>

        <div v-if="canPoll" class="rounded-xl bg-slate-900 p-3">
          <button class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="pollForm = !pollForm">📊 إنشاء تصويت</button>
          <div v-if="pollForm" class="mt-3 space-y-2">
            <input v-model="pollQ" maxlength="100" placeholder="السؤال" class="w-full rounded-lg bg-slate-800 p-2 outline-none" />
            <input
              v-for="(o, i) in pollOpts"
              :key="i"
              v-model="pollOpts[i]"
              maxlength="40"
              :placeholder="'الاختيار ' + (i + 1)"
              class="w-full rounded-lg bg-slate-800 p-2 outline-none"
            />
            <div class="flex flex-wrap gap-2">
              <button v-if="pollOpts.length < 5" class="rounded-lg bg-slate-800 px-3 py-1 text-sm" @click="pollOpts.push('')">
                + اختيار
              </button>
              <select v-model.number="pollSecs" class="rounded-lg bg-slate-800 p-1 text-sm">
                <option v-for="s in [10, 20, 30, 45, 60]" :key="s" :value="s">{{ s }} ثانية</option>
              </select>
              <button class="rounded-lg bg-violet-600 px-3 py-1 text-sm font-bold" @click="createPoll">ابدأ</button>
            </div>
          </div>
        </div>

        <div v-show="screenCount > 0" class="space-y-2 rounded-xl bg-slate-900 p-3">
          <div class="text-sm text-slate-400">مشاركة الشاشة</div>
          <div ref="screenBox" class="space-y-2"></div>
        </div>

        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="p in activePlayers"
            :key="p.id"
            class="rounded-xl bg-slate-900 p-3 text-center"
            :class="[p.id === pid ? 'ring-2 ring-violet-500' : '', p.connected ? '' : 'opacity-40']"
          >
            <div class="flex justify-center"><Avatar :src="p.avatar" :frame="p.frame" size="h-14 w-14" /></div>
            
            <div class="font-bold">{{ p.name }}</div>
            <div v-if="state.teams.length && p.team >= 0" class="text-xs text-amber-300">{{ teamName(p.team) }}</div>
            <div class="text-xs text-violet-300">Lv {{ p.level }}<span v-if="p.title"> • {{ p.title }}</span></div>
            <div class="text-sm text-slate-400">{{ roleIcons[p.role] }} {{ roleNames[p.role] }}</div>
            <div class="mt-1 flex justify-center gap-2 text-sm">
              <span>{{ p.micOn ? '🎤' : '🔇' }}</span>
              <span v-if="p.handRaised">✋</span>
              <span v-if="!p.connected">⚠️</span>
              <span v-if="p.id === state.hostId">👑</span>
            </div>
            <div v-if="p.hasVoted && !p.vote" class="text-xs text-green-400">صوّت ✓</div>
            <div v-if="p.vote" class="text-xs" :class="p.vote === 'innocent' ? 'text-green-400' : 'text-red-400'">
              {{ p.vote === 'innocent' ? '👍 بريء' : '👎 مذنب' }}
            </div>
            <div v-if="state.objectors.includes(p.id)" class="text-xs text-yellow-400">معترض</div>
            <button v-if="isHost && p.id !== pid" class="mt-1 text-xs text-red-400" @click="kick(p)">استبعاد</button>
          </div>
        </div>

        <div v-if="spectators.length" class="rounded-xl bg-slate-900 p-3">
          <div class="mb-1 text-sm text-slate-400">المشاهدين</div>
          <div class="flex flex-wrap gap-2 text-sm">
            <span v-for="p in spectators" :key="p.id" class="rounded-full bg-slate-800 px-3 py-1">
              👁️ {{ p.name }} <span v-if="p.handRaised">✋</span>
            </span>
          </div>
        </div>

        <div v-if="state.caseData && state.phase !== 'lobby'" class="rounded-xl bg-slate-900 p-4">
          <div class="text-sm text-slate-400">القضية</div>
          <div class="text-xl font-bold">{{ state.caseData.title }}</div>
          <div class="text-slate-300">{{ state.caseData.description }}</div>
        </div>

        <div v-if="state.phase === 'defense'" class="space-y-1 rounded-xl bg-slate-900 p-4">
          <div>المتهم عنده وقت يدافع عن نفسه!</div>
          <div v-if="myTask" class="text-violet-400">مهمتك: {{ myTask }}</div>
        </div>

        <div v-if="state.phase === 'voting'" class="rounded-xl bg-slate-900 p-4">
          <div class="mb-3 font-bold">
            هل المتهم مذنب؟ (تصويت {{ modeText }}) — {{ state.votedCount }} صوتوا
          </div>
          <div v-if="canVote" class="flex gap-3">
            <button class="flex-1 rounded-lg bg-green-600 p-3 font-bold" @click="vote('innocent')">👍 بريء</button>
            <button class="flex-1 rounded-lg bg-red-600 p-3 font-bold" @click="vote('guilty')">👎 مذنب</button>
          </div>
          <div v-else class="text-slate-400">
            {{ me?.spectator ? 'المشاهدين مش بيصوّتوا' : me?.role === 'defendant' ? 'المتهم مش بيصوّت' : 'تم تسجيل صوتك' }}
          </div>
        </div>

        <div v-if="state.phase === 'result' && state.result" class="space-y-3 rounded-xl bg-slate-900 p-4 text-center">
          <div class="text-2xl font-bold">الحكم: {{ verdictText }}</div>
          <div class="text-slate-300">بريء {{ state.result.innocent }} — مذنب {{ state.result.guilty }}</div>
          <div v-if="state.objectors.length" class="text-sm text-yellow-400">
            الاعتراضات: {{ state.objectors.length }}
          </div>
          <div v-if="state.revoteUsed" class="text-sm text-slate-400">اتعاد التصويت مرة في الجولة دي</div>
          <button v-if="canObject" class="rounded-lg bg-yellow-600 px-4 py-2 font-bold" @click="objectVerdict">
            ✋ اعتراض
          </button>
          <div v-else-if="myObjected" class="text-sm text-slate-400">اعتراضك اتسجل</div>
          <button v-if="canRevote" class="rounded-lg bg-violet-600 px-4 py-2 font-bold" @click="requestRevote">
            🔁 إعادة التصويت (بصلاحية الحكم)
          </button>
        </div>

        <div v-if="state.history.length" class="rounded-xl bg-slate-900 p-4">
          <div class="mb-2 text-sm text-slate-400">نتائج الجولات</div>
          <div v-for="h in state.history" :key="h.round" class="flex justify-between text-sm">
            <span>الجولة {{ h.round }}</span>
            <span>{{ verdictAr(h.verdict) }} (بريء {{ h.innocent }} — مذنب {{ h.guilty }})</span>
          </div>
        </div>

        <div v-if="state.phase === 'ended'" class="space-y-1 rounded-xl bg-slate-900 p-4 text-center">
          <div class="text-xl font-bold">انتهت اللعبة 🎉</div>
          <div class="text-slate-300">
            أحكام مذنب: {{ summary.guilty }} • أحكام بريء: {{ summary.innocent }} • تعادل: {{ summary.tie }}
          </div>
        </div>

        <div v-if="state.phase === 'lobby' || state.phase === 'ended'" class="space-y-3 rounded-xl bg-slate-900 p-4">
          <div class="text-sm text-slate-400">إعدادات الفعالية</div>
          <div v-if="canEditSettings" class="space-y-2">
            <label class="flex items-center justify-between">
              <span>عدد الفرق</span>
              <select
                :value="state.settings.teams || 0"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('teams', Number($event.target.value))"
              >
                <option :value="0">من غير فرق</option>
                <option :value="2">فريقين</option>
                <option :value="3">3 فرق</option>
              </select>
            </label>
            <label class="block">
              <span class="text-sm text-slate-400">وصف الفعالية</span>
              <input
                :value="state.settings.description"
                maxlength="200"
                class="mt-1 w-full rounded-lg bg-slate-800 p-2 outline-none"
                @change="setSetting('description', $event.target.value)"
              />
            </label>
            <label class="block">
              <span class="text-sm text-slate-400">قوانين الفعالية</span>
              <textarea
                :value="state.settings.rules"
                maxlength="500"
                rows="3"
                class="mt-1 w-full rounded-lg bg-slate-800 p-2 outline-none"
                @change="setSetting('rules', $event.target.value)"
              ></textarea>
            </label>
            <label class="flex items-center justify-between gap-3">
              <span>اسم الفعالية</span>
              <input
                :value="state.settings.title"
                maxlength="30"
                class="w-48 rounded-lg bg-slate-800 p-2 outline-none"
                @change="setSetting('title', $event.target.value)"
              />
            </label>
            <label class="flex items-center justify-between">
              <span>أقصى عدد لاعبين</span>
              <select
                :value="state.settings.maxPlayers"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('maxPlayers', Number($event.target.value))"
              >
                <option v-for="n in 10" :key="n" :value="n + 2">{{ n + 2 }}</option>
              </select>
            </label>
            <label class="flex items-center justify-between">
              <span>عدد الجولات</span>
              <select
                :value="state.settings.totalRounds"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('totalRounds', Number($event.target.value))"
              >
                <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }}</option>
              </select>
            </label>
            <label class="flex items-center justify-between">
              <span>وقت الدفاع</span>
              <select
                :value="state.settings.defenseSeconds"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('defenseSeconds', Number($event.target.value))"
              >
                <option v-for="s in [30, 60, 90, 120]" :key="s" :value="s">{{ s }} ثانية</option>
              </select>
            </label>
            <label class="flex items-center justify-between">
              <span>نوع التصويت</span>
              <select
                :value="state.settings.voteMode"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('voteMode', $event.target.value)"
              >
                <option value="secret">سري</option>
                <option value="open">علني</option>
              </select>
            </label>
            <label class="flex items-center justify-between">
              <span>مدة التصويت</span>
              <select
                :value="state.settings.voteSeconds"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('voteSeconds', Number($event.target.value))"
              >
                <option v-for="s in [10, 20, 30, 45, 60]" :key="s" :value="s">{{ s }} ثانية</option>
              </select>
            </label>
            <label class="flex items-center justify-between">
              <span>الحكم</span>
              <select
                :value="state.settings.judgeMode"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('judgeMode', $event.target.value)"
              >
                <option value="random">عشوائي</option>
                <option value="host">أختاره أنا</option>
              </select>
            </label>
            <label v-if="state.settings.judgeMode === 'host'" class="flex items-center justify-between">
              <span>اختار الحكم</span>
              <select
                :value="state.settings.judgeId"
                class="rounded-lg bg-slate-800 p-2"
                @change="setSetting('judgeId', $event.target.value)"
              >
                <option value="">اختار لاعب</option>
                <option v-for="p in activePlayers" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </label>
            <label class="flex items-center justify-between">
              <span>السماح بالمشاهدين</span>
              <input
                type="checkbox"
                :checked="state.settings.allowSpectators"
                @change="setSetting('allowSpectators', $event.target.checked)"
              />
            </label>
          </div>
          <div v-else class="space-y-1 text-slate-300">
            <div>{{ state.settings.title }} • أقصى عدد لاعبين: {{ state.settings.maxPlayers }}</div>
            <div>
              {{ state.settings.totalRounds }} جولات • الدفاع {{ state.settings.defenseSeconds }} ثانية • التصويت
              {{ modeText }}، {{ state.settings.voteSeconds }} ثانية
            </div>
            <div>
              الحكم: {{ state.settings.judgeMode === 'host' ? nameOf(state.settings.judgeId) : 'عشوائي' }} •
              المشاهدين: {{ state.settings.allowSpectators ? 'مسموح' : 'غير مسموح' }}
            </div>
          </div>

          <button
            v-if="isHost"
            class="w-full rounded-lg bg-violet-600 p-3 font-bold hover:bg-violet-500"
            @click="startGame"
          >
            ابدأ اللعبة
          </button>
          <div v-else class="text-center text-slate-400">مستنيين الهوست يبدأ اللعبة</div>
          <div class="text-center text-xs text-slate-500">محتاجين 3 لاعبين على الأقل</div>
        </div>

        <div v-if="rewards && state.phase === 'ended'" class="space-y-1 rounded-xl bg-violet-900/40 p-4 text-center">
          <div class="text-lg font-bold">+{{ rewards.xp }} XP</div>
          <div class="text-sm text-slate-300">
            المستوى {{ rewards.level }}<span v-if="rewards.levelUp"> 🎉 ارتفع مستواك</span>
          </div>
          <div v-for="k in rewards.newAch" :key="k" class="text-sm text-yellow-400">🏆 إنجاز جديد: {{ achName(k) }}</div>
        </div>

        <p v-if="error" class="text-red-400">{{ error }}</p>
      </div>

      <div class="space-y-4">
        <div class="grid grid-cols-3 gap-2">
          <button
            class="rounded-xl p-3 text-sm font-bold"
            :class="micOn ? 'bg-red-600' : 'bg-slate-800'"
            :disabled="!voiceReady"
            @click="toggleMic"
          >
            {{ !voiceReady ? '...' : micOn ? '🎙️ اكتم' : '🎤 مايك' }}
          </button>
          <button
            class="rounded-xl p-3 text-sm font-bold"
            :class="me?.handRaised ? 'bg-yellow-600' : 'bg-slate-800'"
            @click="toggleHand"
          >
            {{ me?.handRaised ? '✋ نزّل' : '✋ ارفع' }}
          </button>
          <button
            class="rounded-xl p-3 text-sm font-bold"
            :class="sharing ? 'bg-red-600' : 'bg-slate-800'"
            :disabled="!voiceReady"
            @click="toggleShare"
          >
            {{ sharing ? '🖥️ وقف' : '🖥️ شاشة' }}
          </button>
        </div>

        <div class="space-y-2 rounded-xl bg-slate-900 p-2">
          <div class="flex items-center gap-2 text-xs text-slate-400">
            <span>🔊</span>
            <input v-model.number="volume" type="range" min="0" max="1" step="0.05" class="flex-1" />
            <label class="flex items-center gap-1"><input v-model="soundMuted" type="checkbox" /> كتم</label>
          </div>
          <div class="flex flex-wrap justify-center gap-1">
            <button
              v-for="s in SOUNDS"
              :key="s.id"
              class="rounded-lg bg-slate-800 px-2 py-1 text-sm"
              :disabled="!me || me.spectator"
              @click="sendSound(s.id)"
            >
              {{ s.label }}
            </button>
          </div>
        </div>

        <div class="flex flex-wrap justify-center gap-1 rounded-xl bg-slate-900 p-2">
          <button
            v-for="e in REACTION_LIST"
            :key="e"
            class="rounded-lg bg-slate-800 px-2 py-1 text-lg"
            @click="sendReaction(e)"
          >
            {{ e }}
          </button>
        </div>

        <div class="flex h-80 flex-col rounded-xl bg-slate-900 p-3">
          <div ref="chatBox" class="flex-1 space-y-1 overflow-y-auto">
            <div v-for="(m, i) in messages" :key="i">
              <span class="font-bold text-violet-400">{{ nameOf(m.from) }}:</span> {{ m.text }}
              <template v-if="m.from !== pid">
                <button class="mr-1 text-xs text-slate-500 hover:text-red-400" title="إبلاغ" @click="report(m.id)">⚑</button>
                <button v-if="isHost" class="text-xs text-slate-500 hover:text-red-400" title="كتم" @click="mute(m.from)">🔇</button>
              </template>
            </div>
          </div>
          <div class="mt-2 flex gap-2">
            <input
              v-model="chatText"
              placeholder="اكتب رسالة"
              class="flex-1 rounded-lg bg-slate-800 p-2 outline-none"
              @keyup.enter="sendChat"
            />
            <button class="rounded-lg bg-violet-600 px-3" @click="sendChat">إرسال</button>
          </div>
        </div>

        <div class="rounded-xl bg-slate-900 p-3">
          <div class="mb-2 text-sm text-slate-400">سجل الفعالية</div>
          <div class="h-56 space-y-1 overflow-y-auto text-sm">
            <div v-for="(l, i) in logReversed" :key="i" class="text-slate-300">
              <span class="text-slate-500">{{ timeOf(l.at) }}</span> {{ l.text }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>