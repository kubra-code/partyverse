<script setup lang="ts">
import { frameClass } from "./progress";
defineProps<{ src?: string | null; size?: string; frame?: string }>();
</script>

<template>
  <img v-if="src" :src="src" class="rounded-full object-cover" :class="[size || 'h-10 w-10', frameClass(frame)]" />
  <div
    v-else
    class="flex items-center justify-center rounded-full bg-slate-800"
    :class="[size || 'h-10 w-10', frameClass(frame)]"
  >
    👤
  </div>
</template>