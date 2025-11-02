<template>
  <div style="position:relative;">
    <!-- Optional built-in header bar with separate sub-containers -->
    <v-toolbar
      v-if="enableFilterSwitch || taxonomy"
      flat
      density="compact"
      class="thumbbar"
      style="margin:0 0 6px 0; padding:0;"
      color="transparent"
    >
      <v-toolbar-items v-if="enableFilterSwitch">
        <!-- Chip wrapper (configurable appearance) -->
        <v-chip
          :class="['switch-chip', 'px-3', 'py-1', 'd-flex', 'align-center', headerChipClass]"
          label
          :size="headerChipSize"
          :color="headerChipColor"
          :variant="headerChipVariant"
        >
          <v-switch
            v-model="showTaggedOnly"
            :color="headerChipColor"
            density="compact"
            class="v-switch--sm"
            hide-details
            label="Show only selected pictures"
            style="width:auto; min-width:0;"
          />
        </v-chip>
      </v-toolbar-items>

      <v-toolbar-items v-if="taxonomy" class="ml-2">
        <!-- Taxon info chip (uses same configurable appearance) -->
        <v-chip
          :class="['taxon-chip', 'px-3', 'py-1', 'd-flex', 'align-center', headerChipClass]"
          label
          :size="headerChipSize"
          :color="headerChipColor"
          :variant="headerChipVariant"
          prepend-icon="mdi-leaf"
        >
          <strong>{{ taxonomy.group || 'Unknown group' }}</strong>
          <span style="color:#666; margin:0 0.3em;">/</span>
          <strong>{{ taxonomy.family || 'Unknown family' }}</strong>
          <span style="color:#666; margin:0 0.3em;">/</span>
          <strong>{{ taxonomy.subspecies || taxonomy.species || 'Species not specified' }}</strong>
        </v-chip>
      </v-toolbar-items>
    </v-toolbar>

    <div v-if="loading" class="mt-4">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <div v-else class="d-flex flex-wrap" style="gap: 1em; position:relative;">
      <div
        v-for="(img, idx) in displayedImages"
        :key="img.name"
        class="thumbnail-box"
        :style="{
          width: '24em',
          height: '16em',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafafa',
          position: 'relative'
        }"
        @mousemove="e => onThumbnailMouseMove(e, idx, img)"
        @mouseleave="onImgMouseLeave"
        @click="$emit('thumbnailClick', img)"
      >
        <!-- Unified overlay icon button -->
        <div
          style="position:absolute;top:0.5em;left:0.5em;z-index:2;"
          v-if="isEditFile(img.name) || hasTag(img.name, tagLetter)"
        >
          <v-btn
            size="large"
            :color="badgeColor"
            variant="flat"
            style="width:auto;min-width:6em;min-height:3em;display:flex;align-items:center;justify-content:center;"
            :disabled="false"
            :title="getButtonTitle(img)"
            @mouseenter="img._hover = true"
            @mouseleave="img._hover = false"
            @click.stop="handleButtonClick(img)"
          >
            <template #prepend>
              <v-icon style="font-size:1.5em;line-height:1;">
                {{ getButtonIcon(img) }}
              </v-icon>
            </template>
            <span style="font-size:0.8em; font-weight:500;">
              {{ getButtonText(img) }}
            </span>
          </v-btn>
        </div>
        
        <!-- Specimen inset tag (bottom right) -->
        <div
          v-if="showSpecimenTag && getSpecimenLabel"
          style="position:absolute;bottom:0.5em;right:0.5em;z-index:2;"
        >
          <v-chip
            size="default"
            variant="flat"
            color="red-darken-1"
            style="font-weight:600;"
          >
            {{ getSpecimenLabel(img) }}
          </v-chip>
        </div>
        
        <v-img
          :src="img.url"
          :alt="img.name"
          width="100%"
          height="100%"
          :cover="false"
          style="object-fit:contain;"
          ref="imgRefs"
        />
      </div>
      <!-- Spacer after last thumbnail -->
      <div style="width:100%; height:20em;"></div>
    </div>
    
    <!-- Magnifier floating box -->
    <div
      v-if="magnifier.visible && magnifier.img"
      :style="magnifierStyle"
      class="magnifier-box"
    >
      <img
        :src="magnifier.img.url"
        :alt="magnifier.img.name"
        :style="{
          width: (magnifier.imgNaturalWidth * 0.5) + 'px',
          height: (magnifier.imgNaturalHeight * 0.5) + 'px',
          position: 'absolute',
          left: (-magnifier.offsetXScaled) + 'px',
          top: (-magnifier.offsetYScaled) + 'px',
          pointerEvents: 'none',
          userSelect: 'none'
        }"
        draggable="false"
      />
    </div>
    
    <div v-if="!displayedImages.length && !loading" class="mt-4">
      <v-alert type="info" dense>
        <slot name="empty-state">
          No images found.
        </slot>
      </v-alert>
    </div>
  </div>
</template>

<script setup>
import { hasTag, isEditFile, hasBothTags } from '@/utils/tagging'
import { ref, reactive, computed, watch } from 'vue'

const props = defineProps({
  images: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  tagLetter: { type: String, required: true },
  badgeColor: { type: String, default: 'purple' },
  allowEdit: { type: Boolean, default: true },
  showSpecimenTag: { type: Boolean, default: false },
  getSpecimenLabel: { type: Function, default: null },
  // Built-in filter switch
  enableFilterSwitch: { type: Boolean, default: false },
  filterDefaultTaggedOnly: { type: Boolean, default: false },
  // Optional taxonomy info to show on the right of the switch
  taxonomy: { type: Object, default: null },
  // Header chip styling (applied to BOTH switch chip and taxon chip)
  headerChipColor: { type: String, default: 'primary' },
  headerChipVariant: { type: String, default: 'tonal' },
  headerChipSize: { type: String, default: 'large' },
  headerChipClass: { type: String, default: '' },
})

const emit = defineEmits(['thumbnailClick', 'editIconClick', 'showRevertDialog'])

const imgRefs = ref([])

const magnifier = reactive({
  visible: false,
  img: null,
  offsetX: 0,
  offsetY: 0,
  offsetXScaled: 0,
  offsetYScaled: 0,
  imgNaturalWidth: 0,
  imgNaturalHeight: 0,
  mouseX: 0,
  mouseY: 0,
  position: 'right',
})

let lastHoveredIdx = null

const MAG_SIZE = 15 * 15 * 1.5
const MAG_RADIUS = MAG_SIZE / 2
const MAG_PADDING = 16
const SCALE = 0.5

function onThumbnailMouseMove(e, idx, img) {
  lastHoveredIdx = idx
  updateMagnifier(e, idx, img)
}

function updateMagnifier(e, idx, img) {
  let vImgWrapper = imgRefs.value[idx]?.$el
  if (!vImgWrapper || !isImgRefMatching(vImgWrapper, img)) {
    vImgWrapper = findImgRefByName(img.name)
  }
  if (!vImgWrapper) return
  
  const realImg = vImgWrapper.querySelector('img')
  if (!realImg || !realImg.complete) return
  
  const rect = realImg.getBoundingClientRect()
  const mouseX = e.clientX - rect.left
  const mouseY = e.clientY - rect.top
  const naturalWidth = realImg.naturalWidth
  const naturalHeight = realImg.naturalHeight
  const displayWidth = rect.width
  const displayHeight = rect.height
  const scaleX = naturalWidth / displayWidth
  const scaleY = naturalHeight / displayHeight
  
  const offsetX = Math.max(0, Math.min(naturalWidth - MAG_RADIUS / SCALE, mouseX * scaleX - MAG_RADIUS / SCALE))
  const offsetY = Math.max(0, Math.min(naturalHeight - MAG_RADIUS / SCALE, mouseY * scaleY - MAG_RADIUS / SCALE))
  
  magnifier.visible = true
  magnifier.img = img
  magnifier.imgNaturalWidth = naturalWidth
  magnifier.imgNaturalHeight = naturalHeight
  magnifier.mouseX = mouseX
  magnifier.mouseY = mouseY
  magnifier.offsetX = offsetX
  magnifier.offsetY = offsetY
  magnifier.offsetXScaled = offsetX * SCALE
  magnifier.offsetYScaled = offsetY * SCALE
}

function isImgRefMatching(vImgWrapper, img) {
  const realImg = vImgWrapper.querySelector('img')
  if (!realImg) return false
  return realImg.src === img.url && realImg.alt === img.name
}

function findImgRefByName(name) {
  for (const refObj of imgRefs.value) {
    const vImgWrapper = refObj?.$el
    if (!vImgWrapper) continue
    const realImg = vImgWrapper.querySelector('img')
    if (realImg && realImg.alt === name) {
      return vImgWrapper
    }
  }
  return null
}

function onImgMouseLeave() {
  magnifier.visible = false
  magnifier.img = null
  lastHoveredIdx = null
}

watch(() => props.images, (newImages, oldImages) => {
  if (magnifier.visible && lastHoveredIdx !== null && newImages[lastHoveredIdx]) {
    magnifier.visible = false
    magnifier.img = null
  }
})

const magnifierStyle = computed(() => ({
  position: 'fixed',
  width: MAG_SIZE + 'px',
  height: MAG_SIZE + 'px',
  border: '2px solid #000',
  borderRadius: '12px',
  background: '#fff',
  boxShadow: '0 0 0 12px rgba(0,0,0,0.18), 0 12px 64px 0 rgba(0,0,0,0.95), 0 2em 3em -1em rgba(0,0,0,0.85)',
  zIndex: 100,
  overflow: 'hidden',
  pointerEvents: 'none',
  right: magnifier.position === 'right' ? MAG_PADDING + 'px' : 'auto',
  left: magnifier.position === 'left' ? MAG_PADDING + 'px' : 'auto',
  bottom: MAG_PADDING + 'px',
}))

function getButtonIcon(img) {
  if (!props.allowEdit) {
    return 'mdi-check-circle'
  }
  return isEditFile(img.name)
    ? (img._hover ? 'mdi-trash-can-outline' : 'mdi-image-edit')
    : 'mdi-image-edit-outline'
}

function getButtonText(img) {
  if (!props.allowEdit) {
    return 'Selected'
  }
  // Check for dual tags (s and t) - show "(taxon)" augmentation
  const isDualTagged = hasBothTags(img.name, 's', 't')
  
  if (isEditFile(img.name)) {
    return img._hover ? 'Revert to original' : (isDualTagged ? 'Selected (edited, taxon)' : 'Selected (edited)')
  }
  return img._hover ? 'Click to make a copy for editing' : (isDualTagged ? 'Selected (taxon)' : 'Selected')
}

function getButtonTitle(img) {
  if (!props.allowEdit) {
    return 'Selected for taxon'
  }
  const isDualTagged = hasBothTags(img.name, 's', 't')
  
  if (isEditFile(img.name)) {
    return img._hover ? 'Revert to original' : (isDualTagged ? 'Selected (edited, taxon)' : 'Selected (edited)')
  }
  return img._hover ? 'Click to make a copy for editing' : (isDualTagged ? 'Selected (taxon)' : 'Selected')
}

function handleButtonClick(img) {
  if (!props.allowEdit) {
    // For taxa selector, clicking does nothing (toggle is on thumbnail)
    return
  }
  if (isEditFile(img.name)) {
    emit('showRevertDialog', img)
  } else {
    emit('editIconClick', img)
  }
}

// Switch state and filtered list
const showTaggedOnly = ref(!!props.filterDefaultTaggedOnly)
const displayedImages = computed(() => {
  if (!props.enableFilterSwitch) return props.images
  if (!showTaggedOnly.value) return props.images
  return (props.images || []).filter(img => hasTag(img.name, props.tagLetter))
})
</script>

<style scoped>
.magnifier-box {
  transition: left 0.2s, right 0.2s;
  box-shadow:
    0 0 0 12px rgba(0,0,0,0.18),
    0 12px 64px 0 rgba(0,0,0,0.95),
    0 2em 3em -1em rgba(0,0,0,0.85);
  border: 2px solid #000;
}
/* Small switch style */
.v-switch--sm {
  font-size: 0.85em;
  min-height: 1.4em;
  --v-switch-thumb-size: 16px;
  --v-switch-track-height: 12px;
  --v-switch-label-font-size: 0.9em;
}
/* Make both chips look consistent */
.taxon-chip {
  font-weight: 300;
  letter-spacing: 0.2px;
  font-size: 1.05em;
  color: rgba(0, 0, 0, 0.92);
}
/* Tighten the toolbar's horizontal padding and ensure vertical centering */
.thumbbar :deep(.v-toolbar__content) {
  padding-left: 0;
  padding-right: 0;
  align-items: center;
}

/* Make the switch text dark on tonal chip background */
.switch-chip :deep(.v-selection-control__label) {
  color: rgba(0, 0, 0, 0.92);
  font-weight: 600;
}
</style>
