<template>
  <v-btn
    variant="elevated"
    color="primary"
    style="font-weight:600;"
    :prepend-icon="isOn ? 'mdi-database-check' : 'mdi-database-cog'"
    @click="toggle"
  >
    Data sources
  </v-btn>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

const moduleName = computed(() => route.params.name)
const isOn = computed(() => !!appStore.forceDsForModule?.[moduleName.value])

function toggle() {
  if (!moduleName.value) return
  appStore.toggleDataSourcesForModule(moduleName.value)
}
</script>
