<template>
  <div style="width:15em; background:#f5f5f5; border-right:1px solid #ddd; height:100vh; display:flex; flex-direction:column;">
    <div style="flex:1; min-height:0; overflow-y:auto;">
      <v-list nav style="height:100%;">
        <v-list-item
          v-for="item in folders"
          :key="folderKeyOf(item)"
          :value="item"
          :active="folderKeyOf(item) === selectedFolderKey"
          :color="folderKeyOf(item) === selectedFolderKey ? 'primary' : undefined"
          @click="$emit('select', item)"
          :data-folder-key="folderKeyOf(item)"
          style="cursor:pointer; position:relative;"
        >
          <v-list-item-title>{{ item.folderName }}</v-list-item-title>
          <template #append>
            <span v-if="getTagCount(item, 's') > 0"
              class="tag-count-badge"
              style="background: var(--v-theme-secondary); color:#fff; border-radius:8px; font-size:0.85em; padding:2px 8px; margin-left:8px; position:absolute; right:12px; top:50%; transform:translateY(-50%);"
            >
              {{ getTagCount(item, 's') }}
            </span>
          </template>
        </v-list-item>
      </v-list>
    </div>
  </div>
</template>
<script setup>
defineProps(['folders', 'selectedFolderKey', 'getTagCount'])
const folderKeyOf = folder => folder?.fullPath || folder?.folderName || ''
</script>
