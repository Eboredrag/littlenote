import fsDriver from 'unstorage/drivers/fs'

// Mount upload storage at runtime so the same folder is used for files and for folder cleanup.
export default defineNitroPlugin(() => {
  useStorage().mount('uploads', fsDriver({ base: uploadsDir() }))
})
