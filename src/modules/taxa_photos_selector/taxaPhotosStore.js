import { ref, computed, watch, shallowRef } from 'vue'
import { useAppStore } from '@/stores/app'
import { collectorShortNames } from '@/data_sources/field_notes/index.js'
import { buildPhotographedTaxa, getTaxonomyKey, getTaxonDisplayName } from '@/utils/taxonomyMatcher'
import { parseFilename, hasTag, countTaggedFilesMulti } from '@/utils/tagging'
import { getCachedFiles, invalidateFolder, updateCachedFileName } from '@/utils/folderFileCache'

/**
 * Taxa Photos Store – rewritten for efficiency.
 *
 * Key improvements over the previous version
 * ───────────────────────────────────────────
 * 1.  **Pre-indexed folder→taxon mapping** – We build an inverted index
 *     (folder handle → taxon keys) once and reuse it for tag-count
 *     aggregation so each unique folder is scanned at most once.
 *
 * 2.  **Incremental tag counts** – After a tag toggle we adjust the
 *     affected taxon's count by ±1.  Full rescans only on data change.
 *
 * 3.  **Lazy blob URLs** – Created only for the currently selected
 *     taxon's images, revoked on switch.
 *
 * 4.  **Single-pass display-file selection** – Same O(n) algorithm as
 *     the specimen store (edit preference).
 *
 * 5.  **Abort controller** – Rapid taxon switching cancels in-flight
 *     image loads.
 */
export function useTaxaPhotos() {
  const appStore = useAppStore()

  // ── reactive state ───────────────────────────────────────────────────
  const selectedType = ref('photographed')
  const photographedTaxa = shallowRef([])
  const taxaWithoutPhotos = shallowRef([])
  const selectedTaxon = ref(null)
  const selectedTaxonKey = ref(null)
  const aggregatedImages = shallowRef([])
  const loadingImages = ref(false)
  const tagCounts = ref({})         // { taxonKey: { s, t } }

  const snackbar = ref({ show: false, message: '', color: 'success', timeout: 3500 })

  // ── internals ────────────────────────────────────────────────────────
  let activeObjectUrls = []
  let _selectAbort = null

  // ── helpers ──────────────────────────────────────────────────────────
  function revokeActiveUrls() {
    for (const url of activeObjectUrls) {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    }
    activeObjectUrls = []
  }

  function showSnackbar(message, color = 'success', timeout = 3500) {
    snackbar.value = { show: true, message, color, timeout }
  }

  function taxonKeyOf(taxon) {
    return getTaxonomyKey(taxon.taxonomy || taxon)
  }

  function taxonDisplayName(taxon) {
    return getTaxonDisplayName(taxon.taxonomy || taxon)
  }

  // ── data watcher ─────────────────────────────────────────────────────
  watch(
    () => [appStore.checklistData, appStore.fieldNotesData, appStore.specimensPhotosFolderResult],
    async ([checklist, fieldNotes, folderResult]) => {
      const matchedFolders = folderResult?.matching
      if (checklist && fieldNotes && matchedFolders) {
        photographedTaxa.value = buildPhotographedTaxa(
          checklist, fieldNotes, matchedFolders, collectorShortNames,
        )

        const checklistTaxa = (checklist || []).map(x => x.taxonomy || x)
        const fnTaxKeys = new Set(
          (fieldNotes || []).filter(fn => fn?.taxonomy).map(fn => getTaxonomyKey(fn.taxonomy)),
        )
        taxaWithoutPhotos.value = checklistTaxa.filter(t => !fnTaxKeys.has(getTaxonomyKey(t)))

        await computeAllTagCounts()
      }
    },
    { immediate: true },
  )

  const currentTaxaList = computed(() =>
    selectedType.value === 'photographed' ? photographedTaxa.value : taxaWithoutPhotos.value,
  )

  function onTypeChange(val) {
    selectedType.value = val
    selectedTaxon.value = null
    selectedTaxonKey.value = null
    revokeActiveUrls()
    aggregatedImages.value = []
  }

  // ── tag counts (pre-indexed, deduplicated folder scans) ──────────────

  /**
   * Full recompute. Builds an inverted index so each unique folder handle
   * is read from disk/cache at most once, then aggregates per taxon.
   */
  async function computeAllTagCounts() {
    const BATCH = 16

    // Build inverted index: folderHandle → [taxonKey, …]
    const folderToTaxons = new Map()
    for (const taxon of photographedTaxa.value) {
      const tKey = taxonKeyOf(taxon)
      for (const folder of (taxon.folders || [])) {
        let arr = folderToTaxons.get(folder.handle)
        if (!arr) { arr = []; folderToTaxons.set(folder.handle, arr) }
        arr.push(tKey)
      }
    }

    // Scan each unique folder once
    const handles = [...folderToTaxons.keys()]
    const folderResults = new Map() // handle → { sCount, tCount }

    for (let i = 0; i < handles.length; i += BATCH) {
      const batch = handles.slice(i, i + BATCH)
      await Promise.all(batch.map(async (handle) => {
        const files = await getCachedFiles(handle)
        const sFiles = files.filter(f => hasTag(f.name, 's'))
        const counts = countTaggedFilesMulti(sFiles, ['t'])
        folderResults.set(handle, { sCount: sFiles.length, tCount: counts.t })
      }))
    }

    // Aggregate per taxon
    const out = {}
    for (const taxon of photographedTaxa.value) {
      const tKey = taxonKeyOf(taxon)
      let s = 0, t = 0
      for (const folder of (taxon.folders || [])) {
        const r = folderResults.get(folder.handle)
        if (r) { s += r.sCount; t += r.tCount }
      }
      out[tKey] = { s, t }
    }
    tagCounts.value = out
  }

  function getTagCount(taxon, letter) {
    return tagCounts.value[taxonKeyOf(taxon)]?.[letter] || 0
  }

  /**
   * Incremental: adjust the count for one taxon by `delta`.
   */
  function adjustTagCount(taxon, letter, delta) {
    const key = taxonKeyOf(taxon)
    const prev = tagCounts.value[key] || {}
    const cur = (prev[letter] || 0) + delta
    tagCounts.value = { ...tagCounts.value, [key]: { ...prev, [letter]: Math.max(0, cur) } }
  }

  /**
   * Re-scan only the selected taxon's folders (for add/remove ops).
   */
  async function rescanSelectedTaxonTagCount() {
    if (!selectedTaxon.value) return
    const taxon = selectedTaxon.value
    const key = taxonKeyOf(taxon)
    let s = 0, t = 0
    for (const folder of (taxon.folders || [])) {
      const files = await getCachedFiles(folder.handle)
      const sFiles = files.filter(f => hasTag(f.name, 's'))
      const counts = countTaggedFilesMulti(sFiles, ['t'])
      s += sFiles.length
      t += counts.t
    }
    tagCounts.value = { ...tagCounts.value, [key]: { s, t } }
  }

  async function refreshTagCounts() {
    await computeAllTagCounts()
  }

  // ── display-file selection (single pass, edit preference) ────────────

  function buildDisplayFiles(files) {
    const sorted = files.slice().sort((a, b) => a.name.localeCompare(b.name))

    const editBases = new Set()
    const parsedArr = new Array(sorted.length)
    for (let i = 0; i < sorted.length; i++) {
      const p = parseFilename(sorted[i].name)
      parsedArr[i] = p
      if (p.edit) editBases.add(p.base + p.ext)
    }

    const display = []
    const seen = new Set()
    for (let i = 0; i < sorted.length; i++) {
      const p = parsedArr[i]
      const key = p.base + p.ext
      if (p.edit) {
        if (!seen.has(key)) { display.push(sorted[i]); seen.add(key) }
      } else if (!editBases.has(key) && !seen.has(key)) {
        display.push(sorted[i]); seen.add(key)
      }
    }
    return display
  }

  // ── taxon selection & image loading ──────────────────────────────────

  async function selectTaxon(taxon) {
    if (_selectAbort) _selectAbort.abort()
    const ctrl = new AbortController()
    _selectAbort = ctrl

    selectedTaxon.value = taxon
    selectedTaxonKey.value = taxonKeyOf(taxon)
    revokeActiveUrls()
    aggregatedImages.value = []
    loadingImages.value = true

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (ctrl.signal.aborted) return

    try {
      if (selectedType.value === 'without_photos') {
        loadingImages.value = false
        return
      }

      const allImages = []
      for (const folder of (taxon.folders || [])) {
        if (ctrl.signal.aborted) return

        const files = await getCachedFiles(folder.handle)
        if (ctrl.signal.aborted) return

        // Only show s-tagged files; apply edit preference
        const sTagged = files.filter(f => hasTag(f.name, 's'))
        const displayFiles = buildDisplayFiles(sTagged)
        if (ctrl.signal.aborted) return

        const BATCH = 24
        for (let i = 0; i < displayFiles.length; i += BATCH) {
          if (ctrl.signal.aborted) return
          const batch = displayFiles.slice(i, i + BATCH)
          const loaded = await Promise.all(batch.map(async (file) => {
            const imgFile = await file.handle.getFile()
            const url = URL.createObjectURL(imgFile)
            activeObjectUrls.push(url)
            return {
              name: file.name,
              url,
              handle: file.handle,
              specimenMeta: {
                initials: folder?.specimenMeta?.initials || '',
                number: folder?.specimenMeta?.number || '',
                accletter: folder?.specimenMeta?.accletter || '',
              },
            }
          }))
          allImages.push(...loaded)
        }
      }

      if (ctrl.signal.aborted) return
      aggregatedImages.value = allImages.sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
      if (!ctrl.signal.aborted) {
        aggregatedImages.value = []
        showSnackbar('Failed to load images: ' + e.message, 'error')
      }
    } finally {
      if (!ctrl.signal.aborted) loadingImages.value = false
    }
  }

  async function refreshCurrentTaxonImages() {
    if (selectedType.value !== 'photographed' || !selectedTaxon.value) return
    await selectTaxon(selectedTaxon.value)
  }

  // ── cache helpers ────────────────────────────────────────────────────

  function updateFileInCache(folderHandle, oldName, newName, newHandle) {
    updateCachedFileName(folderHandle, oldName, newName, newHandle)
  }

  function invalidateFolderCache(folderHandle) {
    invalidateFolder(folderHandle)
  }

  // ── public API ───────────────────────────────────────────────────────
  return {
    selectedType,
    photographedTaxa,
    taxaWithoutPhotos,
    currentTaxaList,
    selectedTaxon,
    selectedTaxonKey,
    aggregatedImages,
    loadingImages,
    tagCounts,
    snackbar,

    showSnackbar,
    taxonKeyOf,
    taxonDisplayName,
    onTypeChange,
    selectTaxon,
    getTagCount,
    adjustTagCount,
    rescanSelectedTaxonTagCount,
    computeAllTagCounts,
    refreshTagCounts,
    refreshCurrentTaxonImages,
    invalidateFolderCache,
    updateFileInCache,
  }
}

export const taxaPhotosStore = useTaxaPhotos()
