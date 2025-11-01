<template>
  <div style="position:relative;">
    <div v-if="loading" class="mt-4">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <div v-else class="d-flex flex-wrap" style="gap: 1em; position:relative;">
      <div
        v-for="(img, idx) in images"
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
          v-if="isEditFile(img.name) || hasTag(img.name, 's')"
        >
          <v-btn
            size="large"
            color="purple"
            variant="flat"
            style="width:auto;min-width:6em;min-height:3em;display:flex;align-items:center;justify-content:center;"
            :disabled="false"
            :title="isEditFile(img.name) ? (img._hover ? 'Revert to original' : 'Selected (edited)') : (img._hover ? 'click to make a copy for editing' : 'selected')"
            @mouseenter="img._hover = true"
            @mouseleave="img._hover = false"
            @click.stop="isEditFile(img.name) ? $emit('showRevertDialog', img) : $emit('editIconClick', img)"
          >
            <template #prepend>
              <v-icon style="font-size:1.5em;line-height:1;">
                {{ isEditFile(img.name)
                  ? (img._hover ? 'mdi-trash-can-outline' : 'mdi-image-edit')
                  : 'mdi-image-edit-outline'
                }}
              </v-icon>
            </template>
            <span style="font-size:0.8em; font-weight:500;">
              {{
                isEditFile(img.name)
                  ? (img._hover ? 'Revert to original' : 'Selected (edited)')
                  : (img._hover ? 'click to make a copy for editing' : 'selected')
              }}
            </span>
          </v-btn>
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
    <div v-if="!images.length && !loading" class="mt-4">
      <v-alert type="info" dense>No images found in this folder.</v-alert>
    </div>
  </div>
</template>
<script setup>
import { hasTag, isEditFile } from '@/utils/tagging'
import { ref, reactive, computed, nextTick, watch } from 'vue'
const props = defineProps(['images', 'loading', 'matchedTaxon', 'selectedType'])

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

// Track last hovered thumbnail index to avoid stale refs after click/tag update
let lastHoveredIdx = null

const MAG_SIZE = 15 * 15 * 1.5 // 50% bigger horizontally and vertically
const MAG_RADIUS = MAG_SIZE / 2
const MAG_PADDING = 16
const SCALE = 0.5

function onThumbnailMouseMove(e, idx, img) {
  lastHoveredIdx = idx
  updateMagnifier(e, idx, img)
}

function updateMagnifier(e, idx, img) {
  // Defensive: always get the latest ref for the hovered thumbnail
  // Fix: always use the latest images array and idx, do not rely on stale refs
  // If the image was replaced (e.g. after tagging), get the ref by name
  let vImgWrapper = imgRefs.value[idx]?.$el
  // If the ref is missing or not matching the image name, search for the correct ref by name
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
  // Calculate offset for scaled image
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

// Helper: check if the ref matches the image name
function isImgRefMatching(vImgWrapper, img) {
  // Defensive: check if the ref's <img> src matches the image url
  const realImg = vImgWrapper.querySelector('img')
  if (!realImg) return false
  // Compare src and alt
  return realImg.src === img.url && realImg.alt === img.name
}

// Helper: find the correct ref by image name
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

// If images array is updated (e.g. after tagging), ensure magnifier ref is refreshed for the last hovered thumbnail
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
</style>
