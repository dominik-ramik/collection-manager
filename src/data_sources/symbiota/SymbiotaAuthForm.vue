<template>
  <v-card class="mx-auto my-8" max-width="420" elevation="2">
    <v-card-title>
      <v-icon start class="mr-2">mdi-database</v-icon>
      Symbiota Connection
    </v-card-title>
    <v-card-text>
      <v-form @submit.prevent="$emit('submit')" validate-on="submit">
        <v-text-field
          :model-value="username"
          @update:model-value="val => $emit('update:username', val)"
          label="Username"
          required
          autocomplete="username"
          density="comfortable"
          prepend-inner-icon="mdi-account"
          class="mb-4"
          style="width:100%;"
          color="primary"
          variant="outlined"
        />
        <v-text-field
          :model-value="password"
          @update:model-value="val => $emit('update:password', val)"
          label="Password"
          type="password"
          required
          autocomplete="current-password"
          density="comfortable"
          prepend-inner-icon="mdi-lock"
          class="mb-4"
          style="width:100%;"
          color="primary"
          variant="outlined"
        />
        <div class="d-flex justify-center">
          <v-btn
            color="primary"
            type="submit"
            :loading="loading"
            size="large"
            elevation="1"
          >
            Connect to Symbiota
          </v-btn>
        </div>
        <div v-if="error" class="mt-2">
          <v-alert type="error" dense>{{ error }}</v-alert>
        </div>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<script setup>
const props = defineProps({
  loading: Boolean,
  error: String,
  username: String,
  password: String,
})
const emit = defineEmits(['submit', 'update:username', 'update:password'])
</script>
