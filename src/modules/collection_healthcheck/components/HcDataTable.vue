<template>
  <v-data-table
    v-model:sort-by="sortBy"
    :headers="normalizedHeaders"
    :items="items"
    :items-per-page="itemsPerPage"
    :multi-sort="multiSort"
    :must-sort="mustSort"
    class="text-body-2"
    density="compact"
  >
    <!-- render selected fields as HTML -->
    <template
      v-for="field in htmlFields"
      :key="`html-${field}`"
      v-slot:[`item.${field}`]="{ item }"
    >
      <span v-html="item[field]" />
    </template>
  </v-data-table>
</template>

<script setup>
const props = defineProps({
  headers: { type: Array, required: true },   // [{ title, key|value, sortable? }]
  items: { type: Array, required: true },     // array of objects with fields from headers
  itemsPerPage: { type: Number, default: 10 },
  defaultSort: { type: [Array, Object], default: () => [] }, // [{ key, order: 'asc'|'desc' }]
  multiSort: { type: Boolean, default: true },
  mustSort: { type: Boolean, default: false },
  htmlFields: { type: Array, default: () => [] }, // fields to render as HTML
})

// Normalize headers: ensure key is present (fallback to value) and sortable defaults to true
const normalizedHeaders = computed(() =>
  (props.headers || []).map(h => ({
    ...h,
    key: h.key ?? h.value, // support both Vuetify 2-style 'value' and Vuetify 3-style 'key'
    sortable: h.sortable !== false,
  }))
)

// Local sort state for v-data-table
const sortBy = ref(Array.isArray(props.defaultSort) ? props.defaultSort : (props.defaultSort ? [props.defaultSort] : []))
</script>
