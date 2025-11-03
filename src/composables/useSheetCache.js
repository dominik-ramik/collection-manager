import { ref } from 'vue'
import sheetReader from '@/utils/sheetReader'

// Simple IndexedDB helpers
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('collection-manager', 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('sheets')) {
        db.createObjectStore('sheets', { keyPath: 'name' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(name) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sheets', 'readonly')
    const store = tx.objectStore('sheets')
    const req = store.get(name)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(record) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sheets', 'readwrite')
    const store = tx.objectStore('sheets')
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(name) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sheets', 'readwrite')
    const store = tx.objectStore('sheets')
    const req = store.delete(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

/**
 * useSheetCache
 * Params:
 * - sourceName: string key for this DS ('field_notes' | 'checklist' | ...)
 * - storeField: appStore field name to assign data into ('fieldNotesData' | 'checklistData')
 * - settings: the DS settings.json object (contains .settings.sheetName and .settings.data)
 * - getPostprocessor: async () => function | null
 */
export function useSheetCache({ sourceName, storeField, settings, getPostprocessor }) {
  const fileName = ref('')
  const error = ref('')
  const sheetData = ref([])
  const loading = ref(false)
  const usingCache = ref(false)
  const cacheMeta = ref(null) // { fileName, timestamp }
  // New: keep appStore reference after init
  let appStoreRef = null

  async function init(appStore) {
    appStoreRef = appStore
    try {
      const cached = await idbGet(sourceName)
      if (cached && Array.isArray(cached.data)) {
        sheetData.value = cached.data
        cacheMeta.value = { fileName: cached.fileName || '', timestamp: cached.timestamp || Date.now() }
        fileName.value = cached.fileName || '(cached sheet)'
        usingCache.value = true
        // set store + mark ready
        appStore[storeField] = cached.data
        appStore.ready.dataSources[sourceName] = true
      }
    } catch (e) {
      console.warn(`[${sourceName}] Failed to read cache`, e)
    }
  }

  function repick() {
    usingCache.value = false
    error.value = ''
    fileName.value = ''
    sheetData.value = []
    // New: mark DS as not ready and clear store field
    if (appStoreRef) {
      appStoreRef.ready.dataSources[sourceName] = false
      appStoreRef[storeField] = null
    }
  }

  async function onFileChange(event, appStore) {
    error.value = ''
    let inputFile = null
    if (event?.target?.files?.length > 0) inputFile = event.target.files[0]
    if (!(inputFile instanceof File) || !inputFile.name.toLowerCase().endsWith('.xlsx')) {
      error.value = 'Failed to read sheet: Please select a valid .xlsx file.'
      fileName.value = ''
      return
    }
    fileName.value = inputFile.name
    loading.value = true
    try {
      const buffer = await inputFile.arrayBuffer()
      let postprocessor = null
      const postName = settings?.settings?.dataPostprocessor
      if (postName && typeof getPostprocessor === 'function') {
        const fn = await getPostprocessor()
        if (typeof fn === 'function') postprocessor = fn
      }
      const result = await sheetReader.readSheet(
        buffer,
        settings.settings.sheetName,
        settings.settings.data,
        postprocessor
      )
      sheetData.value = result
      usingCache.value = false
      cacheMeta.value = { fileName: inputFile.name, timestamp: Date.now() }

      // Save to IndexedDB
      await idbPut({
        name: sourceName,
        fileName: inputFile.name,
        timestamp: Date.now(),
        data: result,
      })

      // Update store and mark ready
      appStore[storeField] = result
      appStore.ready.dataSources[sourceName] = true
    } catch (e) {
      error.value = 'Failed to read sheet: ' + (e?.message || e)
      fileName.value = ''
    } finally {
      loading.value = false
    }
  }

  async function clearCache() {
    try {
      await idbDelete(sourceName)
      if (usingCache.value) {
        usingCache.value = false
        fileName.value = ''
        sheetData.value = []
        // New: also mark DS not ready and clear store when clearing cache in-use
        if (appStoreRef) {
          appStoreRef.ready.dataSources[sourceName] = false
          appStoreRef[storeField] = null
        }
      }
    } catch (e) {
      console.warn(`[${sourceName}] Failed to clear cache`, e)
    }
  }

  return {
    fileName,
    error,
    sheetData,
    loading,
    usingCache,
    cacheMeta,
    init,
    repick,
    onFileChange,
    clearCache,
  }
}
