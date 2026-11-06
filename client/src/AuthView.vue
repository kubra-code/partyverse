<script setup lang="ts">
import { ref } from "vue";
import { sb } from "./supabase";

const mode = ref<"login" | "signup">("login");
const email = ref("");
const password = ref("");
const username = ref("");
const error = ref("");
const info = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  info.value = "";
  if (!email.value.trim() || password.value.length < 6) {
    error.value = "اكتب الإيميل وباسورد 6 حروف على الأقل";
    return;
  }
  busy.value = true;
  if (mode.value === "signup") {
    const u = username.value.trim();
    if (u.length < 3 || u.length > 20) {
      error.value = "اسم المستخدم من 3 إلى 20 حرف";
      busy.value = false;
      return;
    }
    const { data, error: e } = await sb.auth.signUp({
      email: email.value.trim(),
      password: password.value,
      options: { data: { username: u } }
    });
    if (e) error.value = e.message;
    else if (!data.session) info.value = "اتبعتلك إيميل تأكيد، أكّده وبعدها سجّل دخول";
  } else {
    const { error: e } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (e) error.value = "الإيميل أو الباسورد غلط";
  }
  busy.value = false;
}
</script>

<template>
  <div dir="rtl" class="min-h-screen bg-slate-950 text-white">
    <div class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 class="text-center text-4xl font-bold">PARTYVERSE</h1>
      <p class="text-center text-slate-400">Your friends. Your events. Your chaos.</p>

      <input
        v-if="mode === 'signup'"
        v-model="username"
        placeholder="اسم المستخدم"
        class="rounded-lg bg-slate-800 p-3 outline-none"
      />
      <input v-model="email" type="email" placeholder="الإيميل" dir="ltr" class="rounded-lg bg-slate-800 p-3 outline-none" />
      <input
        v-model="password"
        type="password"
        placeholder="الباسورد"
        dir="ltr"
        class="rounded-lg bg-slate-800 p-3 outline-none"
        @keyup.enter="submit"
      />
      <button class="rounded-lg bg-violet-600 p-3 font-bold hover:bg-violet-500" :disabled="busy" @click="submit">
        {{ mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب' }}
      </button>
      <button class="text-sm text-violet-400" @click="mode = mode === 'login' ? 'signup' : 'login'">
        {{ mode === 'login' ? 'معندكش حساب؟ سجّل' : 'عندك حساب؟ سجّل دخول' }}
      </button>
      <p v-if="error" class="text-center text-red-400">{{ error }}</p>
      <p v-if="info" class="text-center text-green-400">{{ info }}</p>
    </div>
  </div>
</template>