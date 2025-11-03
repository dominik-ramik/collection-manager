<template>
  <v-container>
    <v-alert
      v-if="isMemorized"
      type="success"
      variant="tonal"
      class="mb-4"
    >
      Using memorized Symbiota credentials<span v-if="appStore.symbiota?.token?.user"> ({{ appStore.symbiota.token.user }})</span>.
      <v-btn
        class="ml-3"
        color="primary"
        size="small"
        variant="flat"
        @click="discardCredentials"
      >
        Use different credentials
      </v-btn>
    </v-alert>
    <SymbiotaAuthForm
      v-if="!isMemorized"
      :loading="loading"
      :error="error"
      @submit="fetchCollection"
      v-model:username="username"
      v-model:password="password"
    />
  </v-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import settings from './settings.json'
import SymbiotaAuthForm from './SymbiotaAuthForm.vue'

const appStore = useAppStore()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const isMemorized = computed(() => !!appStore.symbiota?.authenticated)

async function fetchCollection() {
  error.value = ''
  loading.value = true
  // Only store credentials and mark data source as ready
  try {
    appStore.setSymbiotaToken({ user: username.value, pass: password.value })
    appStore.ready.dataSources['symbiota'] = true
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function discardCredentials() {
  // Clear stored credentials and mark DS as not ready so the form reappears
  appStore.clearSymbiotaToken?.()
  appStore.ready.dataSources['symbiota'] = false
  username.value = ''
  password.value = ''
  error.value = ''
}
</script>
