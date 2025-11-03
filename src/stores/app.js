// Utilities
import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    modules: [],
    dataSources: [],
    ready: {
      modules: {},
      dataSources: {},
    },
    symbiota: {
      token: null,
      authenticated: false,
    },
    activeModule: null,
    errorDialog: false,
    errorMessage: '',
    folderHandle: null,
    fieldNotesData: null,
    symbiotaCollectionData: null,
    checklistData: null, // Add checklist data
    specimensPhotosFolderResult: null,
    modulesObj: {}, // Add for storing loaded module objects
    // New: force showing data sources per module (moduleName => true)
    forceDsForModule: {},
  }),
  actions: {
    setModules (mods) {
      this.modules = mods
      for (const m of mods) {
        this.ready.modules[m.name] = false
      }
    },
    setDataSources (ds) {
      this.dataSources = ds
      for (const d of ds) {
        this.ready.dataSources[d.name] = false
      }
    },
    setActiveModule (name) {
      this.activeModule = name
    },
    setError (msg) {
      this.errorMessage = msg
      this.errorDialog = true
    },
    setSymbiotaToken(token) {
      // Accept token as object or string
      let tokenObj = token
      if (typeof token === 'string') {
        try {
          tokenObj = JSON.parse(token)
        } catch {
          tokenObj = { user: '', pass: '' }
        }
      }
      this.symbiota.token = tokenObj
      this.symbiota.authenticated = !!(tokenObj && tokenObj.user && tokenObj.pass)
      // Do NOT store credentials in localStorage anymore
    },
    clearSymbiotaToken() {
      this.symbiota.token = null
      this.symbiota.authenticated = false
    },
    // New: helpers to control data source UI per module
    showDataSourcesForModule (name) {
      if (!name) return
      this.forceDsForModule = { ...this.forceDsForModule, [name]: true }
    },
    hideDataSourcesForModule (name) {
      if (!name) return
      const next = { ...this.forceDsForModule }
      delete next[name]
      this.forceDsForModule = next
    },
    toggleDataSourcesForModule (name) {
      if (!name) return
      const isOn = !!this.forceDsForModule?.[name]
      if (isOn) this.hideDataSourcesForModule(name)
      else this.showDataSourcesForModule(name)
    },
  },
})
