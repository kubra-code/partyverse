<script setup lang="ts">
import { ref } from "vue";

const emit = defineEmits<{ create: [code: string, settings: any]; cancel: [] }>();

const f = ref({
  title: "",
  description: "",
  maxPlayers: 8,
  totalRounds: 3,
  defenseSeconds: 60,
  voteMode: "secret",
  voteSeconds: 20,
  allowSpectators: false,
  teams: 0,
  rules: ""
});
const err = ref("");

function submit() {
  if (!f.value.title.trim()) {
    err.value = "اكتب اسم الفعالية";
    return;
  }
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  emit("create", code, { ...f.value, title: f.value.title.trim(), judgeMode: "random", judgeId: "" });
}
</script>

<template>
  <div class="space-y-3 rounded-xl bg-slate-900 p-4">
    <div class="text-lg font-bold">إنشاء فعالية جديدة</div>

    <label class="block">
      <span class="text-sm text-slate-400">اسم الفعالية</span>
      <input v-model="f.title" maxlength="30" class="mt-1 w-full rounded-lg bg-slate-800 p-3 outline-none" />
    </label>
    <label class="block">
      <span class="text-sm text-slate-400">وصف الفعالية</span>
      <input v-model="f.description" maxlength="200" class="mt-1 w-full rounded-lg bg-slate-800 p-3 outline-none" />
    </label>

    <div class="grid grid-cols-2 gap-3">
      <label class="block">
        <span class="text-sm text-slate-400">عدد اللاعبين</span>
        <select v-model.number="f.maxPlayers" class="mt-1 w-full rounded-lg bg-slate-800 p-3">
          <option v-for="n in 10" :key="n" :value="n + 2">{{ n + 2 }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-sm text-slate-400">عدد الجولات</span>
        <select v-model.number="f.totalRounds" class="mt-1 w-full rounded-lg bg-slate-800 p-3">
          <option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <label class="block">
        <span class="text-sm text-slate-400">وقت الدفاع</span>
        <select v-model.number="f.defenseSeconds" class="mt-1 w-full rounded-lg bg-slate-800 p-3">
          <option v-for="s in [30, 60, 90, 120]" :key="s" :value="s">{{ s }} ثانية</option>
        </select>
      </label>
      <label class="block">
        <span class="text-sm text-slate-400">مدة التصويت</span>
        <select v-model.number="f.voteSeconds" class="mt-1 w-full rounded-lg bg-slate-800 p-3">
          <option v-for="s in [10, 20, 30, 45, 60]" :key="s" :value="s">{{ s }} ثانية</option>
        </select>
      </label>
    </div>

    <label class="block">
      <span class="text-sm text-slate-400">طريقة التصويت</span>
      <select v-model="f.voteMode" class="mt-1 w-full rounded-lg bg-slate-800 p-3">
        <option value="secret">سري</option>
        <option value="open">علني</option>
      </select>
    </label>

    <label class="block">
      <span class="text-sm text-slate-400">عدد الفرق</span>
      <select v-model.number="f.teams" class="mt-1 w-full rounded-lg bg-slate-800 p-3">
        <option :value="0">من غير فرق</option>
        <option :value="2">فريقين</option>
        <option :value="3">3 فرق</option>
      </select>
    </label>

    <label class="flex items-center justify-between">
      <span>السماح بالمشاهدين</span>
      <input v-model="f.allowSpectators" type="checkbox" />
    </label>

    <label class="block">
      <span class="text-sm text-slate-400">قوانين الفعالية (اختياري)</span>
      <textarea v-model="f.rules" maxlength="500" rows="3" class="mt-1 w-full rounded-lg bg-slate-800 p-3 outline-none"></textarea>
    </label>

    <p v-if="err" class="text-sm text-red-400">{{ err }}</p>
    <div class="flex gap-2">
      <button class="flex-1 rounded-lg bg-violet-600 p-3 font-bold hover:bg-violet-500" @click="submit">
        إنشاء ودخول الغرفة
      </button>
      <button class="rounded-lg bg-slate-800 px-4" @click="emit('cancel')">إلغاء</button>
    </div>
  </div>
</template>