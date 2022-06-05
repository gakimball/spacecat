import * as path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import { stat } from 'fs/promises'
import { URL } from 'url'
import mkdirp from 'mkdirp'
import { Middleware } from './route'
import { TitanRequest } from './titan'
import { getMimeType, sanitizePath } from './utils'
import { GeminiRequest, GeminiResponse } from './gemini'
import streamToPromise from 'stream-to-promise'

interface StaticMiddlewareOptions {
  titan?: boolean;
}

const getPossibleStaticPaths = (baseDir: string, url: URL) => {
  const filePath = path.join(baseDir, sanitizePath(url.pathname))

  // Assume a .gmi file if the request has no extension
  if (path.extname(filePath) === '') {
    return [
      path.join(filePath, 'index.gmi'),
      filePath + '.gmi',
    ]
  }

  return [
    filePath,
  ]
}

/**
 * Middleware that serves files within `directory` as a static site. The rules for serving files are
 * as follows:
 *
 * - Requests with extensions will look for a file with that exact filename
 * - Requests without extensions will look for a `.gmi` file
 * - If it exists, an `index.gmi` for the given request is returned
 *
 * @TODO Add automatic directory pages
 */
export const staticMiddleware = (
  /** Base directory. */
  directory: string,
  /** Middleware options. */
  options?: StaticMiddlewareOptions,
): Middleware => {
  const handleGemini = async (req: GeminiRequest, res: GeminiResponse) => {
    const possiblePaths = getPossibleStaticPaths(directory, req.url)

    for (const possiblePath of possiblePaths) {
      try {
        await stat(possiblePath)

        res.send(createReadStream(possiblePath), getMimeType(possiblePath))
      } catch {
        continue
      }
    }
  }

  const handleTitan = async (req: TitanRequest, res: GeminiResponse) => {
    const possiblePaths = getPossibleStaticPaths(directory, req.url)

    for (const possiblePath of possiblePaths) {
      try {
        await stat(possiblePath)

        const writeStream = createWriteStream(possiblePath)

        req.data.pipe(writeStream)

        await Promise.all([
          streamToPromise(req.data),
          streamToPromise(writeStream),
        ])

        const redirectUrl = new URL(req.url.toString())

        redirectUrl.protocol = 'gemini:'

        res.redirect(redirectUrl.toString())
      } catch {
        continue
      }
    }
  }

  return (req, res) => {
    if (req instanceof GeminiRequest) {
      return handleGemini(req, res)
    } else {
      if (options?.titan) {
        return handleTitan(req, res)
      } else {
        res.sendStatus(59, 'Invalid protocol.')
      }
    }
  }
}

/**
 * Wrapper for middleware that only applies it to Titan requests. Gemini requests are
 * passed through.
 */
export const titanOnly = (middleware: Middleware<TitanRequest>): Middleware => (req, res) => {
  if (req instanceof TitanRequest) {
    return middleware(req, res)
  }
}

/** Middleware for Titan requests that require a token to be passed to continue. */
export const requireToken = (token: string) => titanOnly((req, res) => {
  if (!req.token) {
    res.sendStatus(50, 'Must provide a token.')
  } else if (req.token !== token) {
    res.sendStatus(50, 'Invalid token.')
  }
})

/**
 * Middleware that requires a client certificate to continue. Optionally, the middleware can
 * check for a client cert with a specific fingerprint.
 */
export const requireCert = (options?: {
  fingerprint256?: string;
}): Middleware => (req, res) => {
  if (!req.cert) {
    res.requestCert()
    return
  }

  if (options?.fingerprint256 && req.cert.fingerprint256 !== options.fingerprint256) {
    res.sendStatus(61, 'Certificate not authorized.')
    return
  }
}

export const createPage = (directory: string): Middleware => async (req, res) => {
  if (!req.query) {
    res.requestInput('Enter a file path.')

    return
  }

  // Once we have the filename, redirect to Titan
  if (req instanceof GeminiRequest) {
    const redirectUrl = new URL(req.url.toString())

    redirectUrl.protocol = 'titan:'

    res.redirect(redirectUrl)

    return
  }

  const filePath = sanitizePath(req.query)
  const folderPath = path.dirname(filePath)

  // If the filename includes a path, create the path to the file if it doesn't exist
  await mkdirp(path.join(directory, folderPath))

  const writeStream = createWriteStream(
    path.join(directory, filePath),
  )

  req.data.pipe(writeStream)

  await streamToPromise(writeStream)

  // Redirect the user to the file that was just created
  // titan://host/new?file => gemini://host/file
  const redirectUrl = new URL(req.url.toString())

  redirectUrl.protocol = 'gemini:'
  redirectUrl.pathname = filePath
  redirectUrl.search = ''

  if (path.basename(filePath) === 'index.gmi') {
    redirectUrl.pathname = path.dirname(filePath)
  }

  res.redirect(redirectUrl)
}
