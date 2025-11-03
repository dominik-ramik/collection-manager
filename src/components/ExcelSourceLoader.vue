<template>
  <div>
    <v-alert
      v-if="usingCache"
      :color="black"
      variant="tonal"
      class="mb-3"
      style=""
    >
      {{ cacheText }}
      <span v-if="fileName"> ({{ fileName }})</span>.
      <br/>
      <span
        v-if="cacheTimestamp"
        style="margin-left:8px; font-size:0.9em;"
      >
        Cached at {{ new Date(cacheTimestamp).toLocaleString() }}
      </span>
      <br/>
      <v-btn
        class="mt-3"
        color="primary"
        size="default"
        variant="flat"
        @click="repick?.()"
      >
        Pick different file
      </v-btn>
    </v-alert>

    <p v-if="!usingCache">{{ selectHelpText }}</p>
    <div v-if="!usingCache" class="d-flex align-center" style="gap:8px;">
      <v-btn
        color="primary"
        :disabled="disabled"
        :loading="loading"
        @click="() => fileInput?.click()"
      >
        {{ pickLabel }}
      </v-btn>
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx"
        style="display:none"
        @change="onFileInputChange"
      />
    </div>

    <div v-if="fileName && !usingCache" class="mt-4">
      <v-icon color="success" class="mr-2">mdi-check-circle</v-icon>
      <span>{{ loadedPrefix }} <strong>{{ fileName }}</strong></span>
    </div>

    <div v-if="error" class="mt-4">
      <v-alert type="error">{{ error }}</v-alert>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  usingCache: { type: Boolean, default: false },
  fileName: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  error: { type: String, default: '' },
  cacheText: { type: String, default: 'Using cached data from previous session' },
  selectHelpText: { type: String, default: 'Select an Excel (.xlsx) file.' },
  pickLabel: { type: String, default: 'Pick XLSX file' },
  loadedPrefix: { type: String, default: 'Loaded file:' },
  repick: { type: Function, default: null },
  onFileChange: { type: Function, default: null },
  cacheTimestamp: { type: [Number, String], default: null },
})

const fileInput = ref(null)
function onFileInputChange(e) {
  props.onFileChange?.(e)
}
</script>
