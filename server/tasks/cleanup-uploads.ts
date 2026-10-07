export default defineTask({
  meta: { name: 'cleanup-uploads', description: 'Delete uploads past their 30-minute lifetime' },
  async run() {
    return { result: { removed: await cleanupExpiredUploads() } }
  },
})
