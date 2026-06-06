<template>
  <v-container fluid class="pa-4">
    <!-- Search box + clear all -->
    <div class="d-flex align-center mb-3" style="gap: 8px;">
      <v-text-field
        v-model="searchQuery"
        label="Search place names"
        prepend-inner-icon="mdi-magnify"
        clearable
        variant="outlined"
        density="compact"
        hide-details
        class="flex-grow-1"
      />
      <v-text-field
        v-model="coordInput"
        label="Distance from (lat, lon or DMS)"
        prepend-inner-icon="mdi-crosshairs-gps"
        :error="coordInput && !parsedCoord"
        clearable
        variant="outlined"
        density="compact"
        hide-details
        class="flex-grow-1"
      />
      <v-btn
        variant="tonal"
        style="height: 40px;"
        :disabled="!hasAnyInput"
        @click="clearAll"
      >Clear all</v-btn>
    </div>

    <!-- Select filters — all on one line -->
    <div class="d-flex align-center" style="gap: 8px;">
      <v-select
        v-for="fd in filterDefs"
        :key="fd.key"
        v-model="activeFilters[fd.key]"
        :label="fd.label"
        :items="fd.options"
        multiple
        chips
        closable-chips
        variant="outlined"
        density="compact"
        hide-details
        clearable
        class="flex-grow-1"
      />
    </div>

    <v-divider class="my-3" />

    <div class="d-flex align-center mb-2" style="gap: 0.5em;">
      <span class="text-caption text-medium-emphasis">
        {{ tableItems.length }} result{{ tableItems.length !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- Results table -->
    <v-data-table
      :headers="tableHeaders"
      :items="tableItems"
      density="compact"
      :items-per-page="50"
    >
      <template #item.distance="{ item }">
        <span class="text-body-2">{{ item.distance }}</span>
      </template>

      <template #item.primaryName="{ item }">
        <span class="font-weight-medium">{{ item.names[0] }}</span>
        <span v-if="item.names.length > 1" class="text-caption text-medium-emphasis ml-1">
          ({{ item.names.slice(1).join(', ') }})
        </span>
      </template>

      <template #item.coordinates="{ item }">
        <div class="d-flex align-center" style="gap: 4px;">
          <v-btn
            prepend-icon="mdi-map-marker"
            size="small"
            variant="tonal"
            color="primary"
            tag="a"
            :href="googleMapsUrl(item)"
            target="_blank"
            rel="noopener noreferrer"
          >{{ formatCoord(item.latitude) }}, {{ formatCoord(item.longitude) }}</v-btn>
          <v-btn
            icon="mdi-content-copy"
            size="small"
            variant="tonal"
            color="primary"
            title="Copy coordinates"
            @click="copyCoords(item)"
          />
        </div>
      </template>
    </v-data-table>
  </v-container>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import Fuse from 'fuse.js'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

const gazeteerData = computed(() => appStore.gazeteerData || [])

// ── Search ──────────────────────────────────────────────────────────────────

const searchQuery = ref('')

const fuseIndex = computed(() => {
  const data = gazeteerData.value
  if (!data.length) return null
  return new Fuse(data, {
    keys: ['names'],
    threshold: 0.35,
    includeScore: false,
  })
})

const searchResults = computed(() => {
  const q = searchQuery.value?.trim()
  if (!q) return gazeteerData.value
  return fuseIndex.value?.search(q).map(r => r.item) ?? gazeteerData.value
})

// ── Chip filters ─────────────────────────────────────────────────────────────

const activeFilters = reactive({
  province: [],
  island: [],
  featureClass: [],
  featureType: [],
})

const hasActiveFilters = computed(() =>
  Object.values(activeFilters).some(a => a.length > 0)
)

const hasAnyInput = computed(() =>
  !!searchQuery.value?.trim() || !!coordInput.value?.trim() || hasActiveFilters.value
)

function clearFilters() {
  for (const key of Object.keys(activeFilters)) {
    activeFilters[key] = []
  }
}

function clearAll() {
  searchQuery.value = ''
  coordInput.value = ''
  clearFilters()
}

function getFilterValue(item, key) {
  if (key === 'province') return item.location?.[1] ?? ''
  if (key === 'island') return item.location?.[2] ?? ''
  return item[key] ?? ''
}

// Filter chip options derived from the full dataset
const filterDefs = computed(() => {
  const data = gazeteerData.value
  const unique = (arr) => [...new Set(arr.filter(Boolean))].sort()
  return [
    { key: 'province',     label: 'Province',      options: unique(data.map(d => d.location?.[1])) },
    { key: 'island',       label: 'Island',        options: unique(data.map(d => d.location?.[2])) },
    { key: 'featureClass', label: 'Feature Class', options: unique(data.map(d => d.featureClass)) },
    { key: 'featureType',  label: 'Feature Type',  options: unique(data.map(d => d.featureType)) },
  ]
})

// ── Final result set (search ∩ filters) ──────────────────────────────────────

const filteredResults = computed(() => {
  let results = searchResults.value
  for (const [key, selected] of Object.entries(activeFilters)) {
    if (!selected.length) continue
    results = results.filter(item => selected.includes(getFilterValue(item, key)))
  }
  return results
})

// Flatten location fields so v-data-table can sort on them
const tableItems = computed(() =>
  filteredResults.value.map(item => ({
    ...item,
    primaryName: item.names[0] ?? '',
    province: item.location?.[1] ?? '',
    island: item.location?.[2] ?? '',
    distance: parsedCoord.value
      ? haversineKm(
          parsedCoord.value.lat, parsedCoord.value.lon,
          parseFloat(formatCoord(item.latitude)),
          parseFloat(formatCoord(item.longitude))
        ).toFixed(1) + ' km'
      : null,
  }))
)

// ── Table ────────────────────────────────────────────────────────────────────

const tableHeaders = computed(() => [
  { title: 'Coordinates',   key: 'coordinates',   sortable: false },
  { title: 'Name(s)',       key: 'primaryName',   sortable: true },
  ...(parsedCoord.value ? [{ title: 'Distance', key: 'distance', sortable: true }] : []),
  { title: 'Province',      key: 'province',      sortable: true },
  { title: 'Island',        key: 'island',        sortable: true },
  { title: 'Feature Class', key: 'featureClass',  sortable: true },
  { title: 'Feature Type',  key: 'featureType',   sortable: true },
])

// ── Coordinate input & distance ─────────────────────────────────────────────

const coordInput = ref('')

function parseCoord(raw) {
  if (!raw?.trim()) return null

  // Decimal: "12.345, -67.89" or "12.345 -67.89"
  const decimal = raw.match(/^\s*(-?\d+\.?\d*)\s*[,\s]\s*(-?\d+\.?\d*)\s*$/)
  if (decimal) {
    const lat = parseFloat(decimal[1])
    const lon = parseFloat(decimal[2])
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon }
  }

  // DMS: 12°34'56"N 67°89'01"E  (also accepts ° ' " or d m s separators)
  const dms = raw.match(
    /^\s*(\d+)[°d]\s*(\d+)['\'m]\s*([\d.]+)["s]?\s*([NS])\s+(\d+)[°d]\s*(\d+)['\'m]\s*([\d.]+)["s]?\s*([EW])\s*$/i
  )
  if (dms) {
    const toDec = (deg, min, sec, dir) => {
      const v = parseFloat(deg) + parseFloat(min) / 60 + parseFloat(sec) / 3600
      return /[SW]/i.test(dir) ? -v : v
    }
    const lat = toDec(dms[1], dms[2], dms[3], dms[4])
    const lon = toDec(dms[5], dms[6], dms[7], dms[8])
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon }
  }

  return null
}

const parsedCoord = computed(() => parseCoord(coordInput.value))

function haversineKm(lat1, lon1, lat2, lon2) {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return NaN
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCoord(value) {
  return (value ?? '').replace(',', '.')
}

function googleMapsUrl(item) {
  const lat = formatCoord(item.latitude)
  const lng = formatCoord(item.longitude)
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function copyCoords(item) {
  const text = `${formatCoord(item.latitude)}, ${formatCoord(item.longitude)}`
  navigator.clipboard.writeText(text)
}
</script>
