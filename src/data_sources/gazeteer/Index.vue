<template>
  <v-container>
    <div class="d-flex align-center" style="gap: 0.75em;">
      <v-icon icon="mdi-check-circle" color="success" />
      <span>Gazeteer loaded — {{ count }} entries</span>
    </div>
  </v-container>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import gazeteerJson from './gazeteer.json'

const appStore = useAppStore()

const count = computed(() => appStore.gazeteerData?.length ?? 0)

onMounted(() => {
  appStore.gazeteerData = gazeteerJson
  appStore.ready.dataSources['gazeteer'] = true
})
</script>
