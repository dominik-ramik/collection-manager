<template>
  <v-app>
    <!-- Static app bar, does NOT overlay content -->
    <v-app-bar color="green-darken-3" :image="leavesImage" elevation="2" height="64" style="position:static;">
      <template v-slot:image>
        <v-img
          :src="leavesImage"
          gradient="to top right, rgba(27,94,32,.8), rgba(128,208,199,.8)"
        ></v-img>
      </template>
      <v-app-bar-nav-icon @click="drawer = !drawer" />
      <v-toolbar-title>
        Collection Manager<span v-if="currentModuleTitle"> / {{ currentModuleTitle }}</span>
      </v-toolbar-title>
      <div style="flex:1"></div>
      <!-- Render module appBar component if present, with white background -->
      <div v-if="currentModuleObj?.appBar" style="margin-right: 0.5em; margin-left:auto; display:flex; align-items:center; height:100%;">
        <component
          :is="currentModuleObj.appBar"
        />
      </div>
      <!-- New: always show Data Sources button last when a module is shown -->
      <div v-if="currentModuleObj" style="margin-right: 0.5em; display:flex; align-items:center; height:100%;">
        <DataSourcesButton />
      </div>
    </v-app-bar>

    <!-- Main menu drawer -->
    <v-navigation-drawer
      v-model="drawer"
      :permanent="isRootPage"
      :temporary="!isRootPage"
      :scrim="!isRootPage"
      width="260"
      app
      @click:outside="onDrawerOutsideClick"
    >
      <v-list nav>
        <!-- Module items -->
        <v-list-item
          v-for="mod in modules"
          :key="mod.name"
          :to="`/module/${mod.name}`"
          :active="$route.params.name === mod.name"
          link
          @click="onMenuItemClick"
          :color="$route.params.name === mod.name ? 'primary' : undefined"
        >
          <template #prepend>
            <v-icon :icon="mod.icon" class="mr-2" />
          </template>
          <v-list-item-title>{{ mod.title }}</v-list-item-title>
        </v-list-item>
        <!-- Separator -->
        <v-divider class="my-2" />
        <!-- About item -->
        <v-list-item
          to="/about"
          :active="$route.path === '/about'"
          link
          @click="onMenuItemClick"
          :color="$route.path === '/about' ? 'primary' : undefined"
        >
          <template #prepend>
            <v-icon icon="mdi-information-outline" class="mr-2" />
          </template>
          <v-list-item-title>About</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <!-- Router view for module content -->
    <router-view />

    <v-dialog v-model="errorDialog" max-width="400" persistent>
      <v-card>
        <v-card-title>Error</v-card-title>
        <v-card-text>{{ errorMessage }}</v-card-text>
        <v-card-actions>
          <v-btn color="primary" @click="closeError">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRoute } from 'vue-router'
import leavesImage from '@/assets/leaves.jpg'
import DataSourcesButton from '@/components/DataSourcesButton.vue'
const $route = useRoute()
const appStore = useAppStore()
const modules = appStore.modules
const errorDialog = appStore.errorDialog
const errorMessage = appStore.errorMessage

const isRootPage = computed(() => $route.path === '/')
const drawer = ref(isRootPage.value)

watch(
  () => isRootPage.value,
  (root) => {
    // Drawer is open and static only on root page
    drawer.value = root
  },
  { immediate: true }
)

function onMenuItemClick() {
  // Only close drawer if not on root page
  if (!isRootPage.value) {
    drawer.value = false
  }
}

function onDrawerOutsideClick() {
  // Only close drawer if not on root page
  if (!isRootPage.value) {
    drawer.value = false
  }
}

// Compute current module title based on route
const currentModuleTitle = computed(() => {
  if ($route.path.startsWith('/module/')) {
    const modName = $route.params.name
    const mod = modules.find(m => m.name === modName)
    return mod ? mod.title : ''
  }
  return ''
})

// Compute current module object based on route
const currentModuleObj = computed(() => {
  if ($route.path.startsWith('/module/')) {
    const modName = $route.params.name
    const mod = modules.find(m => m.name === modName)
    if (mod) {
      // Dynamically import the module index.js and return its default export
      // Defensive: If not loaded, return null
      try {
        // This assumes modules are already loaded and available in appStore
        // If not, fallback to null
        return appStore.modulesObj?.[modName] || null
      } catch {
        return null
      }
    }
  }
  return null
})

// Update document tab title reactively
watch(
  () => currentModuleTitle.value,
  (title) => {
    document.title = title
      ? `Collection Manager / ${title}`
      : 'Collection Manager'
  },
  { immediate: true }
)

function closeError () {
  appStore.errorDialog = false
}
</script>

<style>
.v-application--wrap {
  min-height: 100vh !important;
}
#main-area {
  margin-top: var(--v-layout-top);
}
</style>
