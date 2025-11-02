import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { collectorShortNames } from '@/data_sources/field_notes/index.js'
import { buildPhotographedTaxa, getTaxonomyKey, getTaxonDisplayName } from '@/utils/taxonomyMatcher'
import { parseFilename, hasTag, countTaggedFiles } from '@/utils/tagging'

export function useTaxaPhotos() {
  const appStore = useAppStore()

  const selectedType = ref('photographed')
  const photographedTaxa = ref([])
  const taxaWithoutPhotos = ref([])
  const selectedTaxon = ref(null)
  const selectedTaxonKey = ref(null)
  const aggregatedImages = ref([])
  const loadingImages = ref(false)
  const tagCounts = ref({})

  // Snackbar state
  const snackbar = ref({
    show: false,
    message: '',
    color: 'success',
    timeout: 3500,
  })

  function showSnackbar(message, color = 'success', timeout = 3500) {
    snackbar.value.message = message
    snackbar.value.color = color
    snackbar.value.timeout = timeout
    snackbar.value.show = true
  }

  // Build taxa lists when data is ready
  watch(
    () => [
      appStore.checklistData,
      appStore.fieldNotesData,
      appStore.specimensPhotosFolderResult?.matching
    ],
    async ([checklist, fieldNotes, matchedFolders]) => {
      if (checklist && fieldNotes && matchedFolders) {
        // One entry per CHECKLIST record with aggregated folders
        photographedTaxa.value = buildPhotographedTaxa(
          checklist,
          fieldNotes,
          matchedFolders,
          collectorShortNames
        )

        // Taxa without photos: checklist taxa that have no matching field notes entries
        const checklistTaxa = (checklist || []).map(x => x.taxonomy || x)
        const fnTaxKeys = new Set((fieldNotes || [])
          .filter(fn => fn?.taxonomy)
          .map(fn => getTaxonomyKey(fn.taxonomy))
        )
        taxaWithoutPhotos.value = checklistTaxa.filter(t => !fnTaxKeys.has(getTaxonomyKey(t)))

        await computeAllTagCounts()
      }
    },
    { immediate: true, deep: true }
  )

  const currentTaxaList = computed(() =>
    selectedType.value === 'photographed'
      ? photographedTaxa.value
      : taxaWithoutPhotos.value
  )

  // Add: reset state when switching type (fix ReferenceError)
  function onTypeChange(val) {
    selectedType.value = val
    selectedTaxon.value = null
    selectedTaxonKey.value = null
    aggregatedImages.value = []
  }

  function taxonKeyOf(taxon) {
    return getTaxonomyKey((taxon.taxonomy || taxon))
  }

  function taxonDisplayName(taxon) {
    return getTaxonDisplayName((taxon.taxonomy || taxon))
  }

  async function computeAllTagCounts() {
    // reset before recomputing to avoid stale entries
    tagCounts.value = {}
    for (const taxon of photographedTaxa.value) {
      const key = taxonKeyOf(taxon)
      let tCount = 0
      let sCount = 0
      
      // Iterate folders attached to this taxon
      for (const folder of (taxon.folders || [])) {
        const files = []
        for await (const entry of folder.handle.values()) {
          if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
            if (hasTag(entry.name, 's')) {
              files.push({ name: entry.name, handle: entry })
            }
          }
        }
        // files contains only 's'-tagged files
        sCount += files.length
        tCount += countTaggedFiles(files, 't')
      }
      
      tagCounts.value[key] = { s: sCount, t: tCount }
    }
  }

  function getTagCount(taxon, letter) {
    const key = taxonKeyOf(taxon)
    return tagCounts.value[key]?.[letter] || 0
  }

  async function selectTaxon(taxon) {
    selectedTaxon.value = taxon
    selectedTaxonKey.value = taxonKeyOf(taxon)
    aggregatedImages.value = []
    loadingImages.value = true

    try {
      if (selectedType.value === 'without_photos') {
        // No images to load for taxa without photos
        loadingImages.value = false
        return
      }

      const allImages = []
      for (const folder of (taxon.folders || [])) {
        const files = []
        for await (const entry of folder.handle.values()) {
          if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
            files.push({ name: entry.name, handle: entry })
          }
        }
        // Filter to only s-tagged images
        const sTaggedFiles = files.filter(f => hasTag(f.name, 's'))
        // Prefer edit files
        const displayFiles = preferEditFiles(sTaggedFiles)
        // Add specimen metadata to each image
        for (const file of displayFiles) {
          const imgFile = await file.handle.getFile()
          allImages.push({
            name: file.name,
            url: URL.createObjectURL(imgFile),
            handle: file.handle,
            // Use specimen label from folder meta (correct for aggregated folders)
            specimenMeta: {
              initials: folder?.specimenMeta?.initials || '',
              number: folder?.specimenMeta?.number || '',
              accletter: folder?.specimenMeta?.accletter || '',
            }
          })
        }
      }
      aggregatedImages.value = allImages.sort((a, b) => a.name.localeCompare(b.name))
    } catch (e) {
      aggregatedImages.value = []
      showSnackbar('Failed to load images: ' + e.message, 'error')
    } finally {
      loadingImages.value = false
    }
  }

  function preferEditFiles(files) {
    const displayFiles = []
    const seenBases = new Set()
    
    files.sort((a, b) => a.name.localeCompare(b.name))
    
    for (const file of files) {
      const parsed = parseFilename(file.name)
      const baseKey = parsed.base + parsed.ext
      
      if (parsed.edit) {
        displayFiles.push(file)
        seenBases.add(baseKey)
      } else if (!seenBases.has(baseKey)) {
        const hasEdit = files.some(f => {
          const p = parseFilename(f.name)
          return p.base === parsed.base && p.edit && p.ext === parsed.ext
        })
        if (!hasEdit) {
          displayFiles.push(file)
          seenBases.add(baseKey)
        }
      }
    }
    
    return displayFiles
  }

  // Refresh currently displayed thumbnails for the selected taxon (used on module switch)
  async function refreshCurrentTaxonImages() {
    if (selectedType.value !== 'photographed') return
    if (!selectedTaxon.value) return
    await selectTaxon(selectedTaxon.value)
  }

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
    computeAllTagCounts,
    refreshCurrentTaxonImages, // expose
  }
}

export const taxaPhotosStore = useTaxaPhotos()
