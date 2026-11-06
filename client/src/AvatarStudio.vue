<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { sb } from "./supabase";
import { STUDIO_FACES, STUDIO_HATS, STUDIO_BGS, isUnlocked } from "./progress";

const props = defineProps<{ uid: string; level: number; tier: number }>();
const emit = defineEmits<{ saved: [] }>();

const cv = ref<HTMLCanvasElement | null>(null);
const face = ref("😀");
const hat = ref("");
const bg = ref(STUDIO_BGS[0]);
const msg = ref("");
const FONT = "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";

function draw() {
  const c = cv.value;
  if (!c) return;
  const g = c.getContext("2d")!;
  g.fillStyle = bg.value;
  g.fillRect(0, 0, 96, 96);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "56px " + FONT;
  g.fillText(face.value, 48, 56);
  if (hat.value) {
    g.font = "34px " + FONT;
    g.fillText(hat.value, 48, 20);
  }
}

async function save() {
  const url = cv.value!.toDataURL("image/jpeg", 0.9);
  const { error } = await sb.from("profiles").update({ avatar_url: url }).eq("id", props.uid);
  msg.value = error ? "حصل خطأ" : "اتحفظت صورتك";
  if (!error) emit("saved");
}

watch([face, hat, bg], draw);
onMounted(draw);
</script>

<template>
  <div class="space-y-4 rounded-xl bg-slate-900 p-4">
    <div class="text-lg font-bold">🎨 استوديو الشخصية</div>
    <canvas ref="cv" width="96" height="96" class="mx-auto h-24 w-24 rounded-full"></canvas>

    <div>
      <div class="mb-1 text-sm text-slate-400">الوجه</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="f in STUDIO_FACES"
          :key="f.k"
          class="rounded-lg bg-slate-800 px-3 py-2 text-2xl disabled:opacity-30"
          :class="face === f.k ? 'ring-2 ring-violet-500' : ''"
          :disabled="!isUnlocked(f.u, level, [], tier)"
          @click="face = f.k"
        >
          {{ f.k }}
        </button>
      </div>
    </div>

    <div>
      <div class="mb-1 text-sm text-slate-400">الإكسسوار</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="h in STUDIO_HATS"
          :key="h.k || 'none'"
          class="rounded-lg bg-slate-800 px-3 py-2 text-2xl disabled:opacity-30"
          :class="hat === h.k ? 'ring-2 ring-violet-500' : ''"
          :disabled="!isUnlocked(h.u, level, [], tier)"
          @click="hat = h.k"
        >
          {{ h.k || '✖' }}
        </button>
      </div>
    </div>

    <div>
      <div class="mb-1 text-sm text-slate-400">الخلفية</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="b in STUDIO_BGS"
          :key="b"
          class="h-9 w-9 rounded-full"
          :class="bg === b ? 'ring-2 ring-white' : ''"
          :style="{ background: b }"
          @click="bg = b"
        ></button>
      </div>
    </div>

    <div class="text-xs text-slate-500">العناصر الباهتة مقفولة، بتتفتح بالمستوى أو بمستوى الموسم.</div>
    <p v-if="msg" class="text-sm text-yellow-400">{{ msg }}</p>
    <button class="w-full rounded-lg bg-violet-600 p-3 font-bold" @click="save">حفظ كصورة بروفايل</button>
  </div>
</template>