<template>
  <div>
    <v-btn
      color="primary"
      variant="text"
      style="background: #fff; color: #43a047"
      @click="onExportClick"
    >
      Export taxa photos
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
          <v-btn color="primary" @click="showExportWarningDialog = false"
            >OK</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showExportSpinnerDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Exporting taxa photos</v-card-title>
        <v-card-text>
          <div class="d-flex align-center">
            <v-progress-circular indeterminate color="primary" class="mr-2" />
            <span>{{ exportProgressText }}</span>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog v-model="showExportDoneDialog" max-width="420">
      <v-card>
        <v-card-title>Export complete</v-card-title>
        <v-card-text>
          {{ exportDoneText }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showExportDoneDialog = false"
            >Close</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
import { ref } from "vue";
import * as XLSX from "xlsx";
import { taxaPhotosStore } from "./taxaPhotosStore";
import { useAppStore } from "@/stores/app";
import { parseFilename, hasTag } from "@/utils/tagging";
import { getTaxonomyKey } from "@/utils/taxonomyMatcher";

const appStore = useAppStore();

const { photographedTaxa, showSnackbar } = taxaPhotosStore;

const showExportWarningDialog = ref(false);
const showExportSpinnerDialog = ref(false);
const showExportDoneDialog = ref(false);
const exportProgressText = ref("");
const exportDoneText = ref("");

function normalizeFolderName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]+/g, "_");
}

function getScientificNameFromTaxonomy(tax) {
  return tax?.subspecies || tax?.species || "";
}

function preferEditForBase(files, base, ext) {
  // Find edit and original variants for a given base/ext in a folder’s files
  let edit = null;
  let orig = null;
  for (const f of files) {
    const p = parseFilename(f.name);
    if (p.base === base && p.ext === ext) {
      if (p.edit) edit = f;
      else orig = f;
    }
  }
  return edit || orig;
}

async function onExportClick() {
  try {
    if (
      !Array.isArray(appStore.checklistData) ||
      appStore.checklistData.length === 0
    ) {
      showSnackbar("No checklist loaded.", "warning");
      return;
    }
    // Pick export root
    const exportFolder = await window.showDirectoryPicker();
    // Must be empty
    for await (const entry of exportFolder.values()) {
      if (entry.kind === "file" || entry.kind === "directory") {
        showExportWarningDialog.value = true;
        return;
      }
    }

    // Prepare data
    // Map taxKey -> { taxonomy, folderName, photos: [{ exportName, srcHandle, specimenLabel }] }
    const taxExportMap = new Map();
    const folderNameCollision = new Map(); // normalizedName -> count

    showExportSpinnerDialog.value = true;
    exportProgressText.value = "Scanning taxa...";

    // Build exportable photo list from photographed taxa (only t-tagged)
    // Each photographedTaxa entry: { taxonomy, folders }
    let totalPhotos = 0;
    for (const taxEntry of photographedTaxa.value || []) {
      const taxKey = getTaxonomyKey(taxEntry.taxonomy);
      const sciName = getScientificNameFromTaxonomy(taxEntry.taxonomy);
      const baseFolderName = normalizeFolderName(sciName);
      if (!sciName || !baseFolderName) {
        continue;
      }
      // Ensure unique folder name in export root
      let folderName = baseFolderName;
      if (folderNameCollision.has(folderName)) {
        const next = folderNameCollision.get(folderName) + 1;
        folderNameCollision.set(folderName, next);
        folderName = `${baseFolderName}_${next}`;
      } else {
        folderNameCollision.set(folderName, 1);
      }

      const photos = [];
      // Iterate all folders that belong to this taxon
      for (const folder of taxEntry.folders || []) {
        const files = [];
        for await (const entry of folder.handle.values()) {
          if (entry.kind === "file" && /\.(jpe?g)$/i.test(entry.name)) {
            files.push({ name: entry.name, handle: entry });
          }
        }
        // From all files, pick those tagged with 't'
        const tFiles = files.filter((f) => hasTag(f.name, "t"));
        // Group by base/ext to prefer edit
        const seen = new Set();
        for (const f of tFiles) {
          const p = parseFilename(f.name);
          const key = p.base + p.ext;
          if (seen.has(key)) continue;
          seen.add(key);
          const chosen = preferEditForBase(files, p.base, p.ext);
          if (!chosen) continue;
          const chosenParsed = parseFilename(chosen.name);
          const exportName = chosenParsed.base + chosenParsed.ext; // strip tags and edit suffix
          const sMeta = folder?.specimenMeta || {};
          const specimenLabel = `${sMeta.initials || ""} ${sMeta.number || ""}${
            sMeta.accletter || ""
          }`.trim();
          photos.push({
            exportName,
            srcHandle: chosen.handle,
            specimenLabel,
          });
        }
      }

      // Only include taxa with at least one t-selected photo for file export
      if (photos.length > 0) {
        totalPhotos += photos.length;
        taxExportMap.set(taxKey, {
          taxonomy: taxEntry.taxonomy,
          folderName,
          photos: photos.sort((a, b) =>
            a.exportName.localeCompare(b.exportName)
          ),
        });
      } else {
        // Still track taxonomy to produce Excel row with name only
        taxExportMap.set(taxKey, {
          taxonomy: taxEntry.taxonomy,
          folderName, // not used for files (no folder creation)
          photos: [],
        });
      }
    }

    // Copy files to export root, creating taxon folders only for taxa with photos
    exportProgressText.value = "Exporting photos...";
    let copied = 0;
    for (const { folderName, photos } of taxExportMap.values()) {
      if (!photos || photos.length === 0) continue;
      const subdir = await exportFolder.getDirectoryHandle(folderName, {
        create: true,
      });
      for (const ph of photos) {
        const destHandle = await subdir.getFileHandle(ph.exportName, {
          create: true,
        });
        const writable = await destHandle.createWritable();
        const blob = await ph.srcHandle.getFile();
        await writable.write(await blob.arrayBuffer());
        await writable.close();
        copied++;
        exportProgressText.value = `Exporting photos (${copied} / ${totalPhotos})...`;
      }
    }

    // Build Excel with ALL checklist taxa
    exportProgressText.value = "Preparing Excel...";
    const checklist = (appStore.checklistData || []).map(
      (x) => x.taxonomy || x
    );
    // Determine max number of photos across taxa
    let maxPhotos = 0;
    for (const tax of checklist) {
      const key = getTaxonomyKey(tax);
      const photos = taxExportMap.get(key)?.photos || [];
      if (photos.length > maxPhotos) maxPhotos = photos.length;
    }
    // Headers: scientific name, photo1..photoN
    const headers = [
      "scientific name",
      ...Array.from({ length: maxPhotos }, (_, i) => `photo${i + 1}`),
    ];
    const rows = [];
    for (const tax of checklist) {
      const sciName = getScientificNameFromTaxonomy(tax) || "";
      const key = getTaxonomyKey(tax);
      const entry = taxExportMap.get(key);
      const folderName = entry?.folderName || normalizeFolderName(sciName); // for path value
      const photos = entry?.photos || [];
      const row = { "scientific name": sciName };
      for (let i = 0; i < maxPhotos; i++) {
        if (i < photos.length) {
          const p = photos[i];
          row[
            `photo${i + 1}`
          ] = `${folderName}/${p.exportName}|${p.specimenLabel}`;
        } else {
          row[`photo${i + 1}`] = "";
        }
      }
      rows.push(row);
    }

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "taxa");
    XLSX.writeFile(wb, "taxa_photos.xlsx");

    showExportSpinnerDialog.value = false;
    const exportedTaxaCount = Array.from(taxExportMap.values()).filter(
      (v) => v.photos.length > 0
    ).length;
    exportDoneText.value = `Exported ${copied} photo${
      copied === 1 ? "" : "s"
    } across ${exportedTaxaCount} taxon folder${
      exportedTaxaCount === 1 ? "" : "s"
    } to "${exportFolder.name}".`;
    showExportDoneDialog.value = true;
  } catch (e) {
    if (e && e.name === "AbortError") return;
    showExportSpinnerDialog.value = false;
    showExportWarningDialog.value = false;
    showExportDoneDialog.value = true;
    exportDoneText.value = "Export failed: " + (e?.message || e);
  }
}
</script>
