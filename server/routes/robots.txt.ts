export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  // Editing sessions and the API are private and short-lived.
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /edit/',
    'Disallow: /api/',
    '',
    `Sitemap: ${siteOrigin(event)}/sitemap.xml`,
    '',
  ].join('\n')
})
