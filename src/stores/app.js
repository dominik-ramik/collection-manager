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
  },
})
