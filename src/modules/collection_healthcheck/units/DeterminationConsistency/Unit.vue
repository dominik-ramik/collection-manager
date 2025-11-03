<template>
  <div>
    <v-alert type="success" variant="tonal" class="mb-2">
      No problems detected. This is a placeholder UI for Determination consistency.
    </v-alert>
    <div style="color:#666;">
      Future checks will verify taxonomy and determination consistency across data sources.
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

// Emit initial dummy problems count
const emit = defineEmits(['update:problems'])
onMounted(() => emit('update:problems', 0))
</script>
