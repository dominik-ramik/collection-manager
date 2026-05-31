<template>
  <!-- ...existing main area content only, no layout divs... -->
  <div v-if="selectedFolder">
    <!-- Keep unmatched warning; taxon header is now rendered by ThumbnailGrid when available -->
    <div v-if="selectedType === 'matched' && !matchedTaxon" class="mb-2">
      <v-alert
        type="warning"
        dense
        class="py-1 px-2"
        style="display: inline-block; vertical-align: middle"
      >
        No matching field notes entry found for this folder. Make sure that the
        folder name is using correct initials and number.
      </v-alert>
    </div>

    <ThumbnailGrid
      :images="images"
      :loading="loadingImages"
      tag-letter="s"
      badge-color="purple"
      :allow-edit="true"
      :show-specimen-tag="false"
      :enable-filter-switch="true"
      :filter-default-tagged-only="false"
      :taxonomy="
        selectedType === 'matched' && matchedTaxon
          ? matchedTaxon.taxonomy
          : null
      "
      :toggle-handler="toggleSpecimenTag"
      @edit-icon-click="onEditIconClick"
      @show-revert-dialog="showRevertDialog"
      :current-folder-path="selectedFolder ? (selectedFolder.fullPath || selectedFolder.folderName) : ''"
    />
    <!-- Indication if no selected files but folder has files -->
    <!-- <div v-if="showSelectedOnly && !selectedImages.length && images.length > 0" class="mt-2 mb-2">
      <v-alert type="info" dense>
        This folder contains images, but none are marked as selected. Switch to 'All files' to view them.
      </v-alert>
    </div> -->

    <!-- Confirmation dialog for revert -->
    <v-dialog v-model="showConfirmRevert" max-width="400">
      <v-card>
        <v-card-title>Confirm revert</v-card-title>
        <v-card-text>
          Are you sure you want to remove the edited version and revert to the
          original file?<br />
          <span style="font-size: 0.95em; color: #666"
            >The original file will be kept. This action cannot be undone.</span
          >
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="grey" @click="showConfirmRevert = false">Cancel</v-btn>
          <v-btn color="red" @click="doRevertEdit">Delete edited version</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <!-- Dialog for edited file must be selected -->
    <v-dialog v-model="showEditMustBeSelectedDialog" max-width="400">
      <v-card>
        <v-card-title>Edited files must be selected</v-card-title>
        <v-card-text>
          Edited files must always be marked as selected.<br />
          If you wish to unselect this file, please revert it to the original
          version first.<br />
          <span style="font-size: 0.95em; color: #666"
            >This prevents ambiguities such as edited but not selected
            files.</span
          >
          <div style="margin-top: 1em;">
            In folder:
            <span
              v-if="selectedFolder"
              style="
                margin-top: 1em;
                padding: 0.5em;
                background: #f5f5f5;
                border-radius: 4px;
                font-family: monospace;
                font-size: 0.85em;
                color: #555;
                word-break: break-all;
              "
            >
              {{ selectedFolder.fullPath || selectedFolder.folderName }}
            </span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="showEditMustBeSelectedDialog = false"
            >OK</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
    <!-- Confirmation dialog for removing 's' tag from dual-tagged file -->
    <v-dialog v-model="showDualTagRemovalDialog" max-width="500">
      <v-card>
        <v-card-title>Remove selection and taxon tags?</v-card-title>
        <v-card-text>
          This image is currently marked as both a
          <strong>representative specimen photo</strong> and a
          <strong>representative taxon photo</strong>.<br /><br />
          If you remove the specimen selection, it will also be unmarked as a
          representative taxon photo.<br /><br />
          <strong>Do you want to remove both tags from this image?</strong>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="grey" @click="showDualTagRemovalDialog = false"
            >Cancel</v-btn
          >
          <v-btn color="red" @click="confirmDualTagRemoval"
            >Remove both tags</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <div v-if="!images.length && !loadingImages" class="mt-4">
      <v-alert type="info" dense>No images found in this folder.</v-alert>
    </div>
  </div>
  <div v-else>
    <h2>Select a folder from the menu</h2>
    <div style="margin-top: 0.5em; color: #666; font-size: 1.05em">
      <em
        >You can use <strong>Tab</strong> to quickly jump to the next folder
        without selected photos.</em
      >
    </div>
  </div>
  <v-snackbar
    v-model="snackbar.show"
    :color="snackbar.color"
    :timeout="snackbar.timeout"
  >
    {{ snackbar.message }}
  </v-snackbar>
</template>

<script setup>
import { specimenPhotosStore } from "./specimenPhotosStore";
import ThumbnailGrid from "@/components/PhotoSelector/ThumbnailGrid.vue";
import { watch, computed, ref, onMounted, onActivated, onBeforeUnmount } from "vue";
import { useAppStore } from "@/stores/app";
import {
  parseFilename,
  isEditFile,
  hasTag,
  hasBothTags,
  toggleTagLetter,
  removeTag,
  countTaggedFilesMulti,
  createEditCopy,
  propagateTagToEdit,
} from "@/utils/tagging";
import {
  getCachedFiles,
  updateCachedFileName,
  addCachedFile,
} from "@/utils/folderFileCache";

const appStore = useAppStore();

const {
  selectedType,
  sortedFolders,
  selectedFolder,
  selectedFolderKey,
  images,
  loadingImages,
  tagCounts,
  getTagCount,
  adjustTagCount,
  rescanSelectedFolderTagCount,
  selectFolder,
  snackbar,
  showSnackbar,
  folderKeyOf,
  matchedFolders,
  unmatchedFolders,
  refreshSelectedFolderImages,
  invalidateFolderCache,
  updateFileInCache,
} = specimenPhotosStore;

// --- File rename helper: writes new file, removes old, updates cache surgically ---
async function renameFileInFolder(folderHandle, oldName, newName) {
  let oldFileHandle, file;
  try {
    oldFileHandle = await folderHandle.getFileHandle(oldName);
    file = await oldFileHandle.getFile();
  } catch (e) {
    throw new Error(`File "${oldName}" not found.`);
  }
  const newFileHandle = await folderHandle.getFileHandle(newName, {
    create: true,
  });
  const writable = await newFileHandle.createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  if (oldName !== newName) {
    try {
      await folderHandle.removeEntry(oldName);
    } catch (e) {
      /* ignore */
    }
    // Surgical cache update instead of full invalidation
    updateCachedFileName(folderHandle, oldName, newName, newFileHandle);
  }
  return newFileHandle;
}

// --- In-place image update helper ---
async function updateImageInPlace(img, oldName, newName, folderHandle) {
  const newFileHandle = await folderHandle.getFileHandle(newName);
  const updatedFile = await newFileHandle.getFile();
  const url = URL.createObjectURL(updatedFile);
  const updatedImg = {
    ...img,
    name: newName,
    url,
    handle: newFileHandle,
  };
  const idx = images.value.findIndex((i) => i.name === oldName);
  if (idx !== -1) {
    const newImages = [...images.value];
    newImages[idx] = updatedImg;
    images.value = newImages;
  }
  return updatedImg;
}

const showDualTagRemovalDialog = ref(false);
const pendingDualTagRemoval = ref(null);

async function toggleSpecimenTag(img) {
  const folderHandle = selectedFolder.value.handle;
  const oldName = img.name;
  const parsed = parseFilename(oldName);

  if (parsed.edit && hasTag(img.name, "s")) {
    showEditMustBeSelectedDialog.value = true;
    return null;
  }

  if (hasBothTags(oldName, "s", "t") && hasTag(oldName, "s")) {
    pendingDualTagRemoval.value = img;
    showDualTagRemovalDialog.value = true;
    return null;
  }

  try {
    const newName = toggleTagLetter(img.name, "s");
    await renameFileInFolder(folderHandle, img.name, newName);
    await propagateTagToEdit(folderHandle, newName, "s");

    await updateImageInPlace(img, oldName, newName, folderHandle);

    // Incremental: adjust by ±1 instead of re-scanning all files
    const wasSelected = hasTag(oldName, "s");
    adjustTagCount(selectedFolder.value, "s", wasSelected ? -1 : 1);

    const selected = hasTag(newName, "s");
    return {
      selected,
      message: selected ? "Image selected" : "Selection removed",
      color: "success",
    };
  } catch (e) {
    throw new Error("File operation failed: " + e.message);
  }
}

async function confirmDualTagRemoval() {
  showDualTagRemovalDialog.value = false;
  const img = pendingDualTagRemoval.value;
  if (!img) return;

  const folderHandle = selectedFolder.value.handle;
  const oldName = img.name;

  try {
    let newName = removeTag(oldName, "s");
    newName = removeTag(newName, "t");

    await renameFileInFolder(folderHandle, oldName, newName);
    await propagateTagToEdit(folderHandle, newName, "s");
    await propagateTagToEdit(folderHandle, newName, "t");

    await updateImageInPlace(img, oldName, newName, folderHandle);
    // Adjust both tag counts by -1
    adjustTagCount(selectedFolder.value, "s", -1);

    showSnackbar("Both specimen and taxon tags removed", "success");
  } catch (e) {
    showSnackbar("File operation failed: " + e.message, "error");
  } finally {
    pendingDualTagRemoval.value = null;
  }
}

async function onEditIconClick(img) {
  const folderHandle = selectedFolder.value.handle;
  if (isEditFile(img.name)) {
    return;
  }
  try {
    await createEditCopy(folderHandle, img.name);
    // Full invalidation needed since a new file was created
    invalidateFolderCache(folderHandle);
    showSnackbar("File prepared for editing.", "success");
    await selectFolder(selectedFolder.value);
    // Re-scan tag count after cache invalidation
    await rescanSelectedFolderTagCount();
  } catch (e) {
    showSnackbar(e.message, "error");
  }
}

const matchedTaxon = computed(() => {
  if (
    selectedType.value !== "matched" ||
    !selectedFolder.value ||
    !selectedFolder.value.specimenMeta
  ) {
    return null;
  }
  const fieldNotes = appStore.fieldNotesData || [];
  const { initials, number, accletter } = selectedFolder.value.specimenMeta;

  return (
    fieldNotes.find(
      (item) =>
        item?.specimenNumber?.initials === initials &&
        String(item?.specimenNumber?.number) === String(number) &&
        (item?.specimenNumber?.accletter ?? "") === (accletter ?? ""),
    ) || null
  );
});

const showConfirmRevert = ref(false);
const revertImgRef = ref(null);
const showEditMustBeSelectedDialog = ref(false);

function showRevertDialog(img) {
  revertImgRef.value = img;
  showConfirmRevert.value = true;
}

async function doRevertEdit() {
  showConfirmRevert.value = false;
  const img = revertImgRef.value;
  if (!img || !isEditFile(img.name)) return;
  const folderHandle = selectedFolder.value.handle;
  try {
    await folderHandle.removeEntry(img.name);
    // Full invalidation since a file was removed
    invalidateFolderCache(folderHandle);
    const cachedFiles = await getCachedFiles(folderHandle);
    const parsed = parseFilename(img.name);
    const originalFile = cachedFiles.find((entry) => {
      const p = parseFilename(entry.name);
      return p.base === parsed.base && !p.edit && p.ext === parsed.ext;
    });
    if (originalFile) {
      img.name = originalFile.name;
      img.handle = originalFile.handle;
      img.url = URL.createObjectURL(await originalFile.handle.getFile());
      images.value = [...images.value].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      showSnackbar(
        "Edited version removed. Original file restored.",
        "success",
      );
    } else {
      images.value = images.value.filter((i) => i !== img);
      showSnackbar(
        "Edited version removed. Original file not found.",
        "warning",
      );
    }
    // Re-scan tag counts after file removal
    await rescanSelectedFolderTagCount();
  } catch (e) {
    showSnackbar("Failed to remove edited version: " + e.message, "error");
  }
}

onMounted(async () => {
  await refreshSelectedFolderImages();
  // Signal module is ready after initial mount/refresh completes
  appStore.setModuleReady?.('specimen_photos_selector', true)
});
onActivated(async () => {
  await refreshSelectedFolderImages();
});

onBeforeUnmount(() => {
  appStore.setModuleReady?.('specimen_photos_selector', false)
})
</script>

<style scoped>
.module-layout {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.module-main {
  flex: 1;
  height: 100%;
  overflow-y: auto;
  background: #fff;
  padding: 2em 2em 2em 2em;
}
</style>
