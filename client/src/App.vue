<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { sb } from "./supabase";
import AuthView from "./AuthView.vue";
import HomeView from "./HomeView.vue";
import RoomView from "./RoomView.vue";

const loading = ref(true);
const session = ref<any>(null);
const profile = ref<any>(null);
const room = ref<string>(localStorage.getItem("pv_room") || "");
const roomSettings = ref<any>(null);
let beat: any = null;

async function loadProfile() {
  if (!session.value) {
    profile.value = null;
    return;
  }
  const uid = session.value.user.id;
  let { data } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (!data) {
    const base = (session.value.user.email || "player").split("@")[0].slice(0, 16);
    const r = await sb
      .from("profiles")
      .insert({ id: uid, username: base + "_" + Math.random().toString(36).slice(2, 5) })
      .select()
      .single();
    data = r.data;
  }
  profile.value = data;
}

async function heartbeat() {
  if (!session.value) return;
  await sb.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", session.value.user.id);
}

onMounted(async () => {
  const { data } = await sb.auth.getSession();
  session.value = data.session;
  await loadProfile();
  loading.value = false;
  sb.auth.onAuthStateChange((_e, s) => {
    session.value = s;
    setTimeout(loadProfile, 0);
  });
  beat = setInterval(heartbeat, 20000);
  heartbeat();
});
onBeforeUnmount(() => clearInterval(beat));
watch(session, (s) => {
  if (s) heartbeat();
});

function enter(code: string, settings?: any) {
  room.value = code;
  roomSettings.value = settings || null;
  localStorage.setItem("pv_room", code);
  localStorage.setItem("pv_last_room", code);
}
function exitRoom() {
  room.value = "";
  roomSettings.value = null;
  localStorage.removeItem("pv_room");
}
</script>

<template>
  <div v-if="loading" class="flex min-h-screen items-center justify-center bg-slate-950 text-white">
    جاري التحميل...
  </div>
  <AuthView v-else-if="!session" />
  <RoomView
    v-else-if="room && profile"
    :key="room"
    :user="profile"
    :room-code="room"
    :initial-settings="roomSettings"
    @leave="exitRoom"
  />
  <HomeView v-else-if="profile" :profile="profile" @enter="enter" @reload="loadProfile" />
  <div v-else class="flex min-h-screen items-center justify-center bg-slate-950 text-white">جاري التحميل...</div>
</template>