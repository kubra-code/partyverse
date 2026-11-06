<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from "vue";
import { sb } from "./supabase";
import Avatar from "./Avatar.vue";

const props = defineProps<{ uid: string; friends: any[] }>();

const selected = ref<any>(null);
const msgs = ref<any[]>([]);
const text = ref("");
const err = ref("");
const unread = ref<Record<string, number>>({});
const box = ref<HTMLElement | null>(null);
let timer: any = null;

function timeOf(t: string) {
  return new Date(t).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

async function loadUnread() {
  const { data } = await sb.from("messages").select("sender").eq("receiver", props.uid).eq("read", false);
  const m: Record<string, number> = {};
  (data || []).forEach((r: any) => (m[r.sender] = (m[r.sender] || 0) + 1));
  unread.value = m;
}

async function loadConv() {
  if (!selected.value) return;
  const f = selected.value.id;
  const { data } = await sb
    .from("messages")
    .select("*")
    .or(`and(sender.eq.${props.uid},receiver.eq.${f}),and(sender.eq.${f},receiver.eq.${props.uid})`)
    .order("created_at", { ascending: true })
    .limit(100);
  const before = msgs.value.length;
  msgs.value = data || [];
  if ((data || []).some((r: any) => r.receiver === props.uid && !r.read)) {
    await sb.from("messages").update({ read: true }).eq("receiver", props.uid).eq("sender", f).eq("read", false);
    loadUnread();
  }
  if (msgs.value.length !== before) {
    await nextTick();
    if (box.value) box.value.scrollTop = box.value.scrollHeight;
  }
}

async function tick() {
  await loadUnread();
  await loadConv();
}

function pick(f: any) {
  selected.value = f;
  msgs.value = [];
  err.value = "";
  loadConv();
}

async function send() {
  const body = text.value.trim();
  if (!body || !selected.value) return;
  const { error } = await sb.from("messages").insert({ sender: props.uid, receiver: selected.value.id, body });
  if (error) {
    err.value = "مقدرتش أبعت الرسالة، ممكن صديقك مقفل الرسائل";
    return;
  }
  text.value = "";
  err.value = "";
  loadConv();
}

onMounted(() => {
  tick();
  timer = setInterval(tick, 4000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="grid gap-3 md:grid-cols-3">
    <div class="rounded-xl bg-slate-900 p-3">
      <div class="mb-2 font-bold">الأصدقاء</div>
      <div v-if="!friends.length" class="text-sm text-slate-400">ضيف أصدقاء الأول</div>
      <button
        v-for="f in friends"
        :key="f.id"
        class="flex w-full items-center gap-2 rounded-lg p-2 text-right"
        :class="selected && selected.id === f.id ? 'bg-slate-800' : ''"
        @click="pick(f)"
      >
        <Avatar :src="f.avatar_url" :frame="f.frame" size="h-8 w-8" />
        <span class="flex-1 truncate">{{ f.username }}</span>
        <span v-if="unread[f.id]" class="rounded-full bg-red-600 px-2 text-xs">{{ unread[f.id] }}</span>
      </button>
    </div>

    <div class="flex h-96 flex-col rounded-xl bg-slate-900 p-3 md:col-span-2">
      <div v-if="!selected" class="m-auto text-slate-400">اختار صديق عشان تبدأ المحادثة</div>
      <template v-else>
        <div class="mb-2 font-bold">{{ selected.username }}</div>
        <div ref="box" class="flex-1 space-y-2 overflow-y-auto">
          <div v-for="m in msgs" :key="m.id" class="flex" :class="m.sender === uid ? 'justify-start' : 'justify-end'">
            <div class="max-w-[75%] rounded-xl px-3 py-2 text-sm" :class="m.sender === uid ? 'bg-violet-700' : 'bg-slate-800'">
              <div>{{ m.body }}</div>
              <div class="text-left text-[10px] text-slate-300">{{ timeOf(m.created_at) }}</div>
            </div>
          </div>
        </div>
        <p v-if="err" class="mt-1 text-sm text-red-400">{{ err }}</p>
        <div class="mt-2 flex gap-2">
          <input
            v-model="text"
            maxlength="500"
            placeholder="اكتب رسالة"
            class="flex-1 rounded-lg bg-slate-800 p-2 outline-none"
            @keyup.enter="send"
          />
          <button class="rounded-lg bg-violet-600 px-3" @click="send">إرسال</button>
        </div>
      </template>
    </div>
  </div>
</template>