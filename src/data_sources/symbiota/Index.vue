<template>
  <v-container>
    <SymbiotaAuthForm
      :loading="loading"
      :error="error"
      @submit="fetchCollection"
      v-model:username="username"
      v-model:password="password"
    />
  </v-container>
</template>

<script setup>
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import settings from './settings.json'
import SymbiotaAuthForm from './SymbiotaAuthForm.vue'

const appStore = useAppStore()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

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
</script>
