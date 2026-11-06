<script setup lang="ts">
import { computed } from "vue";
import { SEASON_REWARDS } from "./progress";

const props = defineProps<{ xp: number }>();
const tier = computed(() => Math.min(8, Math.floor(props.xp / 100)));
const pct = computed(() => (tier.value >= 8 ? 100 : props.xp % 100));
const seasonName = new Date().toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
</script>

<template>
  <div class="space-y-4 rounded-xl bg-slate-900 p-4">
    <div>
      <div class="text-lg font-bold">🎫 موسم {{ seasonName }}</div>
      <div class="text-sm text-slate-400">
        {{ xp }} XP هذا الموسم • المستوى {{ tier }} من 8 • الموسم بيتجدد أول كل شهر
      </div>
    </div>
    <div class="h-2 rounded-full bg-slate-800">
      <div class="h-2 rounded-full bg-violet-500" :style="{ width: pct + '%' }"></div>
    </div>
    <div v-for="r in SEASON_REWARDS" :key="r.tier" class="flex items-center gap-3 rounded-lg bg-slate-800 p-3">
      <span>{{ tier >= r.tier ? '🔓' : '🔒' }}</span>
      <span class="w-20 text-sm text-slate-400">المستوى {{ r.tier }}</span>
      <span :class="tier >= r.tier ? '' : 'text-slate-500'">{{ r.text }}</span>
    </div>
    <div class="text-xs text-slate-500">المكافآت بتفعّلها من تبويب المقتنيات أو الاستوديو.</div>
  </div>
</template>