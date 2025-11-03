<template>
  <v-container>
    <h2 class="mb-2">Collection Healthcheck</h2>

    <!-- Global run button with progress indicator -->
    <div class="d-flex align-center mb-4" style="gap:12px;">
      <v-btn
        color="primary"
        variant="elevated"
        :loading="running"
        :disabled="running"
        @click="runAllChecks"
      >
        {{ buttonLabel }}
      </v-btn>
      <div v-if="running" class="d-flex align-center" style="gap:8px; min-width:16em;">
        <span style="color:#555;">{{ progressText }}</span>
      </div>
    </div>

    <!-- Show accordion only after health checks have been run at least once -->
    <v-expansion-panels v-if="hasAnyRun" multiple>
      <v-expansion-panel
        v-for="sec in sections"
        :key="sec.key"
        eager
      >
        <v-expansion-panel-title>
          <div class="d-flex align-center justify-space-between w-100">
            <div class="d-flex align-center">
              <!-- fixed-width wrapper for status icon + number -->
              <div style="min-width:8em; display:flex; align-items:center;">
                <!-- Problems indicator: show '?' with help icon until checks are run -->
                <v-icon
                  class="mr-1"
                  :color="hasRun[sec.key] ? (problems[sec.key] > 0 ? 'error' : 'success') : 'grey'"
                >
                  {{ hasRun[sec.key]
                    ? (problems[sec.key] > 0 ? 'mdi-alert-circle' : 'mdi-check-circle')
                    : 'mdi-help-circle-outline' }}
                </v-icon>
                <span
                  :style="{
                    color: hasRun[sec.key]
                      ? (problems[sec.key] > 0 ? '#d32f2f' : '#2e7d32')
                      : '#757575',
                    fontWeight: 600,
                    marginRight: '0.5em'
                  }"
                >
                  {{ hasRun[sec.key] ? problems[sec.key] : '?' }}
                </span>
              </div>
              <!-- section icon + title -->
              <v-icon :icon="sec.icon" class="mr-2" />
              <span class="font-weight-medium">{{ sec.title }}</span>
            </div>
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text eager>
          <component
            :is="sec.component"
            @update:problems="(n) => updateProblems(sec.key, n)"
            @unit-progress="onUnitProgress"
            @unit-done="onUnitDone(sec.key)"
            :ref="el => setSectionRef(sec.key, el)"
          />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-container>
</template>

<script setup>
import { reactive, computed, watch, onMounted, ref, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import SpecimenPhotosFoldersUnit from './units/SpecimenPhotosFolders/Unit.vue'
import DeterminationConsistencyUnit from './units/DeterminationConsistency/Unit.vue'
import FieldNotesIntegrityUnit from './units/FieldNotesIntegrity/Unit.vue'
import ChecklistUnit from './units/Checklist/Unit.vue' // added
import symbiotaSettings from '@/modules/symbiota_manager/settings.json'
import { getDbConfig } from '@/modules/symbiota_manager/dbConfig.js'

const appStore = useAppStore()

// Track problems per section
const problems = reactive({
  specimenPhotosFolders: 0,
  determinationConsistency: 0,
  fieldNotesIntegrity: 0,
  checklist: 0, // added
})

// New: track whether a section has been explicitly run
const hasRun = reactive({
  fieldNotesIntegrity: false,
  specimenPhotosFolders: false,
  determinationConsistency: false,
  checklist: false, // added
})

// New: derived flags and button label
const hasAnyRun = computed(() =>
  hasRun.fieldNotesIntegrity || hasRun.specimenPhotosFolders || hasRun.determinationConsistency
)
const buttonLabel = computed(() => (hasAnyRun.value ? 'Re-run health checks' : 'Run health checks'))

function updateProblems(key, count) {
  problems[key] = Number.isFinite(count) ? count : 0
}

// Register sections
const sections = [
  {
    key: 'fieldNotesIntegrity',
    title: 'Field notes integrity',
    icon: 'mdi-notebook-check',
    component: FieldNotesIntegrityUnit,
  },
  {
    key: 'determinationConsistency',
    title: 'Symbiota integrity', // renamed
    icon: 'mdi-file-search-outline',
    component: DeterminationConsistencyUnit,
  },
  {
    key: 'checklist',
    title: 'Checklist integrity',
    icon: 'mdi-format-list-checks',
    component: ChecklistUnit,
  },
  {
    key: 'specimenPhotosFolders',
    title: 'Specimen photos folders',
    icon: 'mdi-folder-image',
    component: SpecimenPhotosFoldersUnit,
  },
]

// Auto-fetch Symbiota data when Healthcheck opens if DS is ready and data not loaded
const symbiotaReady = computed(() => !!appStore.ready.dataSources['symbiota'])
const symbiotaLoaded = computed(() => Array.isArray(appStore.symbiotaCollectionData) && appStore.symbiotaCollectionData.length > 0)

async function fetchSymbiotaCollection() {
  try {
    const dbConfig = await getDbConfig()
    const apiUrl = symbiotaSettings.settings.apiEndpoint + 'get_collection'
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ db: dbConfig })
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || `HTTP error ${response.status}`)
    }
    const data = await response.json()
    appStore.symbiotaCollectionData = Array.isArray(data) ? data : []
  } catch (e) {
    appStore.setError('Failed to fetch Symbiota data: ' + e.message)
  }
}

watch(symbiotaReady, async (ready) => {
  if (ready && !symbiotaLoaded.value) {
    await fetchSymbiotaCollection()
  }
}, { immediate: true })

onMounted(async () => {
  if (symbiotaReady.value && !symbiotaLoaded.value) {
    await fetchSymbiotaCollection()
  }
})

/* Global run button state + progress */
const running = ref(false)
const progressText = ref('')

const sectionRefs = reactive({}) // key -> component instance
function setSectionRef(key, el) {
  sectionRefs[key] = el
}
function onUnitProgress(msg) {
  if (typeof msg === 'string') progressText.value = msg
}
function onUnitDone(key) {
  return () => {
    hasRun[key] = true
  }
}

// New: ensure a section component is mounted before invoking runChecks
async function ensureSectionMounted(key, maxTries = 6) {
  for (let i = 0; i < maxTries; i++) {
    if (sectionRefs[key]) return
    await nextTick()
  }
}

async function tryRunSection(key, label) {
  progressText.value = `Running: ${label}...`
  await ensureSectionMounted(key)
  const comp = sectionRefs[key]
  if (comp && typeof comp.runChecks === 'function') {
    try {
      await comp.runChecks()
    } catch {
      /* unit errors should be surfaced inside the unit itself */
    }
  }
  hasRun[key] = true
}

async function runAllChecks() {
  running.value = true
  try {
    if (!hasAnyRun.value) {
      hasRun.fieldNotesIntegrity = true
      hasRun.specimenPhotosFolders = true
      hasRun.determinationConsistency = true
      hasRun.checklist = true // added
      await nextTick(); await nextTick()
    }
    // Ensure refs exist even if panels are collapsed
    await ensureSectionMounted('fieldNotesIntegrity')
    await tryRunSection('fieldNotesIntegrity', 'Field notes integrity')
    await ensureSectionMounted('determinationConsistency')
    await tryRunSection('determinationConsistency', 'Symbiota integrity')
    await ensureSectionMounted('checklist')
    await tryRunSection('checklist', 'Checklist')
    await ensureSectionMounted('specimenPhotosFolders')
    await tryRunSection('specimenPhotosFolders', 'Specimen photos folders')
    progressText.value = 'All checks finished.'
  } finally {
    // Let users see "finished" briefly
    setTimeout(() => { running.value = false; progressText.value = '' }, 600)
  }
}
</script>
