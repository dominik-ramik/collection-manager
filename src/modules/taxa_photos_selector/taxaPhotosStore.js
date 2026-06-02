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
 * 1.  **Eager ArrayBuffer blobs** – File bytes are read into RAM before
 *     createObjectURL so the browser paints without a FSAA round-trip.
 *
 * 2.  **Look-ahead precache** – After selecting a taxon the next
 *     PRECACHE_AHEAD taxa are loaded in the background so sequential
 *     navigation is nearly instant.  Memory is bounded to
 *     (1 active + PRECACHE_AHEAD) taxa; stale entries are revoked.
 *
 * 3.  **Pre-indexed folder→taxon mapping** – We build an inverted index
 *     (folder handle → taxon keys) once and reuse it for tag-count
 *     aggregation so each unique folder is scanned at most once.
 *
 * 4.  **Incremental tag counts** – After a tag toggle we adjust the
 *     affected taxon's count by ±1.  Full rescans only on data change.
 *
 * 5.  **Single-pass display-file selection** – Same O(n) algorithm as
 *     the specimen store (edit preference).
 *
 * 6.  **Abort controller** – Rapid taxon switching cancels in-flight
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

  // ── image precache ────────────────────────────────────────────────────
  const _precache = new Map()       // taxonKey → { images, urls }  (resolved)
  const _precacheAborts = new Map() // taxonKey → AbortController   (in-flight)
  const PRECACHE_AHEAD = 3

  // ── helpers ──────────────────────────────────────────────────────────
  function revokeActiveUrls() {
    for (const url of activeObjectUrls) {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    }
    activeObjectUrls = []
  }

  function _revokePrecacheEntry(key) {
    const entry = _precache.get(key)
    if (entry) {
      for (const u of entry.urls) try { URL.revokeObjectURL(u) } catch {}
      _precache.delete(key)
    }
    const ctrl = _precacheAborts.get(key)
    if (ctrl) { ctrl.abort(); _precacheAborts.delete(key) }
  }

  function _clearPrecache() {
    for (const key of [..._precache.keys()]) _revokePrecacheEntry(key)
    for (const [key, ctrl] of [..._precacheAborts.entries()]) {
      ctrl.abort(); _precacheAborts.delete(key)
    }
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
    _clearPrecache()
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

  // ── image precache helpers ────────────────────────────────────────────────

  // Load all s-tagged images for a taxon (aggregated); returns { images, urls } or null
  async function _loadImagesForTaxon(taxon, signal) {
    try {
      const allImages = []
      const allUrls = []
      for (const folder of (taxon.folders || [])) {
        if (signal?.aborted) {
          for (const u of allUrls) try { URL.revokeObjectURL(u) } catch {}
          return null
        }
        const files = await getCachedFiles(folder.handle)
        if (signal?.aborted) {
          for (const u of allUrls) try { URL.revokeObjectURL(u) } catch {}
          return null
        }
        const sTagged = files.filter(f => hasTag(f.name, 's'))
        const displayFiles = buildDisplayFiles(sTagged)
        const BATCH = 24
        for (let i = 0; i < displayFiles.length; i += BATCH) {
          if (signal?.aborted) {
            for (const u of allUrls) try { URL.revokeObjectURL(u) } catch {}
            return null
          }
          const batch = displayFiles.slice(i, i + BATCH)
          const loaded = await Promise.all(batch.map(async (file) => {
            const imgFile = await file.handle.getFile()
            const buf = await imgFile.arrayBuffer()
            const blob = new Blob([buf], { type: imgFile.type || 'image/jpeg' })
            const url = URL.createObjectURL(blob)
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
          if (signal?.aborted) {
            for (const img of loaded) try { URL.revokeObjectURL(img.url) } catch {}
            for (const u of allUrls) try { URL.revokeObjectURL(u) } catch {}
            return null
          }
          for (const img of loaded) { allUrls.push(img.url); allImages.push(img) }
        }
      }
      return { images: allImages.sort((a, b) => a.name.localeCompare(b.name)), urls: allUrls }
    } catch {
      return null
    }
  }

  function _precacheNextTaxa(currentTaxon) {
    const list = currentTaxaList.value
    const idx = list.findIndex(t => taxonKeyOf(t) === taxonKeyOf(currentTaxon))
    const wantedKeys = new Set()
    for (let i = idx + 1; i <= idx + PRECACHE_AHEAD && i < list.length; i++) {
      wantedKeys.add(taxonKeyOf(list[i]))
    }
    // Evict entries outside the look-ahead window
    for (const key of [..._precache.keys(), ..._precacheAborts.keys()]) {
      if (!wantedKeys.has(key)) _revokePrecacheEntry(key)
    }
    // Start background loads for not-yet-cached entries
    for (let i = idx + 1; i <= idx + PRECACHE_AHEAD && i < list.length; i++) {
      const taxon = list[i]
      const key = taxonKeyOf(taxon)
      if (_precache.has(key) || _precacheAborts.has(key)) continue
      if (selectedType.value === 'without_photos') continue
      const ctrl = new AbortController()
      _precacheAborts.set(key, ctrl)
      _loadImagesForTaxon(taxon, ctrl.signal).then(result => {
        _precacheAborts.delete(key)
        if (result) _precache.set(key, result)
      })
    }
  }

  // ── taxon selection & image loading ──────────────────────────────────

  async function selectTaxon(taxon) {
    if (_selectAbort) _selectAbort.abort()
    const ctrl = new AbortController()
    _selectAbort = ctrl

    const key = taxonKeyOf(taxon)
    // Abort any in-flight precache for this key (we'll load it ourselves)
    const precacheCtrl = _precacheAborts.get(key)
    if (precacheCtrl) { precacheCtrl.abort(); _precacheAborts.delete(key) }

    selectedTaxon.value = taxon
    selectedTaxonKey.value = key
    revokeActiveUrls()
    aggregatedImages.value = []

    if (selectedType.value === 'without_photos') {
      loadingImages.value = false
      return
    }

    // ── Precache hit: instant display ──────────────────────────────────
    const cached = _precache.get(key)
    if (cached) {
      _precache.delete(key)
      activeObjectUrls = cached.urls
      aggregatedImages.value = cached.images
      loadingImages.value = false
      _precacheNextTaxa(taxon)
      return
    }

    // ── Cache miss: load with progress ─────────────────────────────────
    loadingImages.value = true
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    if (ctrl.signal.aborted) return

    try {
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
            const buf = await imgFile.arrayBuffer()
            const blob = new Blob([buf], { type: imgFile.type || 'image/jpeg' })
            const url = URL.createObjectURL(blob)
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
      _precacheNextTaxa(taxon)
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
    _clearPrecache()
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
