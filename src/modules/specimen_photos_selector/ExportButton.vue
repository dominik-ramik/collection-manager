<template>
  <div>
    <v-btn
      color="primary"
      variant="text"
      style="background:#fff; color:#43a047;"
      @click="onExportClick"
    >
      Export specimen photos
    </v-btn>
    <!-- Export dialogs -->
    <v-dialog v-model="showExportWarningDialog" max-width="400">
      <v-card>
        <v-card-title>Export folder must be empty</v-card-title>
        <v-card-text>
          The selected folder is not empty.<br />
          Please choose an empty folder for export.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showExportWarningDialog = false">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="showExportSpinnerDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Exporting specimen photos</v-card-title>
        <v-card-text>
          <div class="d-flex align-center">
            <v-progress-circular indeterminate color="primary" class="mr-2" />
            <span>{{ exportProgressText }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>
    <v-dialog v-model="showExportDoneDialog" max-width="400">
      <v-card>
        <v-card-title>Export complete</v-card-title>
        <v-card-text>
          {{ exportDoneText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showExportDoneDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <!-- Skipped specimens dialog -->
    <v-dialog v-model="showSkippedDialog" max-width="600">
      <v-card>
        <v-card-title>Skipped Specimens</v-card-title>
        <v-card-text>
          <div>
            <strong>The following specimens were skipped because their initials and specimen number weren't found in the Field Notes:</strong>
            <ul style="padding-left: 1.5em; margin-top: 0.5em; max-height: 180px; overflow-y: auto;">
              <li v-for="spec in skippedSpecimens" :key="spec.initials + '-' + spec.number + '-' + (spec.accletter || '')">
                <span>
                  <strong>Initials:</strong> {{ spec.initials }},
                  <strong>Number:</strong> {{ spec.number }}
                  <strong v-if="spec.accletter">, Accletter:</strong> <span v-if="spec.accletter">{{ spec.accletter || '-' }}</span>
                </span>
              </li>
            </ul>
            <div style="margin-top:1em;">
              <strong>Accepted collector initials:</strong>
              <ul style="padding-left: 1.5em; margin-top: 0.5em; max-height: 270px; overflow-y: auto;">
                <li v-for="(short, name) in collectorShortNames" :key="short">
                  <span>
                    <strong>{{ short }}</strong>: {{ name }}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showSkippedDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { specimenPhotosStore } from './specimenPhotosStore'
import * as XLSX from 'xlsx'
import { parseFilename, hasTag } from '@/utils/tagging'
import { collectorShortNames } from '@/data_sources/field_notes/index.js'
import { useAppStore } from '@/stores/app'

// Use shared store for folder and images state
const {
  matchedFolders,
} = specimenPhotosStore

const showExportWarningDialog = ref(false)
const showExportSpinnerDialog = ref(false)
const showExportDoneDialog = ref(false)
const exportProgressText = ref('')
const exportDoneText = ref('')
const showExportExcelDialog = ref(false)
const exportExcelRows = ref([])

// New: dialog for skipped specimens
const showSkippedDialog = ref(false)
const skippedSpecimens = ref([])

// Use only the correct headers for Excel export
const exportExcelHeaders = [
  'id',
  'collector.name',
  'collector.number',
  'scientificName',
  'type',
  'images'
]

function getCollectorFullName(initials) {
  for (const [name, short] of Object.entries(collectorShortNames)) {
    if (short === initials) return name
  }
  return initials
}
function getScientificName(initials, number, accletter) {
  // Use Pinia store instead of require()
  const appStore = useAppStore()
  const fieldNotes = appStore.fieldNotesData || []
  let collectorName = null
  for (const [name, short] of Object.entries(collectorShortNames)) {
    if (short === initials) {
      collectorName = name
      break
    }
  }
  if (!collectorName) return null
  const match = fieldNotes.find(item =>
    item?.specimenNumber?.name === collectorName &&
    String(item?.specimenNumber?.number) === String(number) &&
    ((item?.specimenNumber?.accletter ?? '') === (accletter ?? ''))
  )
  const tax = match?.taxonomy || {}
  if (tax.subspecies) {
    return `${tax.subspecies}`
  } else if (tax.species) {
    return `${tax.species}`
  } else if (tax.family) {
    return tax.family
  } else if (tax.group) {
    return tax.group
  }
  return null
}

async function onExportClick() {
  try {
    const exportFolder = await window.showDirectoryPicker()
    let hasFiles = false
    for await (const entry of exportFolder.values()) {
      if (entry.kind === 'file' || entry.kind === 'directory') {
        hasFiles = true
        break
      }
    }
    if (hasFiles) {
      showExportWarningDialog.value = true
      return
    }
    showExportSpinnerDialog.value = true
    exportProgressText.value = 'Preparing...'
    const folders = specimenPhotosStore.matchedFolders.value.filter(f => f.hasImages)
    const foldersWithSelected = []
    let totalFiles = 0
    for (const folder of folders) {
      const files = []
      for await (const entry of folder.handle.values()) {
        if (entry.kind === 'file' && /\.(jpe?g)$/i.test(entry.name)) {
          files.push({ name: entry.name, handle: entry })
        }
      }
      const selectedCount = files.filter(f => hasTag(f.name, 's')).length
      if (selectedCount > 0) {
        foldersWithSelected.push({ ...folder, files })
        totalFiles += selectedCount
      }
    }
    let copiedFiles = 0
    const excelRows = []
    const skipped = []
    for (const folder of foldersWithSelected) {
      const meta = folder.specimenMeta || {}
      let folderName = (meta.initials || '').toLowerCase() + (meta.number || '')
      if (meta.accletter) folderName += meta.accletter
      const id = (meta.initials || '').toLowerCase() + (meta.number || '') + (meta.accletter || '')
      const sciName = getScientificName(meta.initials, meta.number, meta.accletter)
      if (!sciName) {
        // Skip this specimen, add to skipped list
        skipped.push({
          initials: meta.initials,
          number: meta.number,
          accletter: meta.accletter,
        })
        continue
      }
      const subfolder = await exportFolder.getDirectoryHandle(folderName, { create: true })
      for (const file of folder.files) {
        if (!hasTag(file.name, 's')) continue
        let srcFile = file
        const editFile = folder.files.find(f => {
          const p = parseFilename(f.name)
          const baseP = parseFilename(file.name)
          return p.base === baseP.base && p.edit && p.ext === baseP.ext
        })
        if (editFile) srcFile = editFile
        const parsed = parseFilename(srcFile.name)
        const exportName = parsed.base + parsed.ext
        const srcBlob = await srcFile.handle.getFile()
        const destHandle = await subfolder.getFileHandle(exportName, { create: true })
        const writable = await destHandle.createWritable()
        await writable.write(await srcBlob.arrayBuffer())
        await writable.close()
        copiedFiles++
        exportProgressText.value = `Exporting (${copiedFiles} / ${totalFiles})...`
      }
      excelRows.push({
        id,
        'collector.name': getCollectorFullName(meta.initials),
        'collector.number': (meta.number + (meta.accletter || '')) || '',
        'scientificName': sciName,
        'type': 'Specimen',
        'images': folderName
      })
    }
    const worksheet = XLSX.utils.json_to_sheet(excelRows, { header: exportExcelHeaders })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'specimens')
    XLSX.writeFile(workbook, 'specimens.xlsx')
    exportExcelRows.value = excelRows
    showExportExcelDialog.value = true
    showExportSpinnerDialog.value = false
    exportDoneText.value = `Exported ${copiedFiles} specimen photo${copiedFiles === 1 ? '' : 's'} to "${exportFolder.name}".`
    showExportDoneDialog.value = true
    // Show skipped specimens dialog if any were skipped
    if (skipped.length > 0) {
      skippedSpecimens.value = skipped
      showSkippedDialog.value = true
    }
  } catch (e) {
    // Only show error if it's not an abort
    if (e && e.name === 'AbortError') {
      // User cancelled, do nothing
      return
    }
    showExportSpinnerDialog.value = false
    showExportWarningDialog.value = false
    showExportDoneDialog.value = true
    exportDoneText.value = 'Export failed: ' + (e.message || e)
  }
}
</script>
