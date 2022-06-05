import mime from 'mime'

export const getMimeType = (filePath: string) => {
  // The library we're using doesn't have text/gemini in its database
  if (filePath.endsWith('.gmi')) {
    return 'text/gemini'
  }

  return mime.getType(filePath) ?? 'application/octet-stream'
}

export const sanitizePath = (filePath: string) => (
  filePath
    .split('/')
    .filter(v => v !== '.' && v !== '..')
    .join('/')
    .replace(/\/$/, '')
)
