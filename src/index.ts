import { createServer, Server, TLSSocket } from 'tls'
import { URL } from 'url'
import truncate from 'truncate-utf8-bytes'
import { match } from 'path-to-regexp'
import { PassThrough } from 'stream'
import { GeminiRequest, GeminiResponse } from './gemini'
import { parseTitanUrlParams, TitanRequest } from './titan'
import { AnyMiddlewareDefinition, isGeminiCompatibleMiddleware, isTitanCompatibleMiddleware, matchesRoute, Middleware, TitanRouteDefinition } from './route'

export * from './middleware'
export { GeminiRequest, GeminiResponse, TitanRequest, Middleware }

const DEFAULT_GEMINI_PORT = 1965
const MAX_URL_SIZE_IN_BYTES = 1024

export class GeminiServer {
  private server: Server
  private middleware: Array<AnyMiddlewareDefinition> = []

  private async applyMiddleware<T>(
    handlers: Middleware<T>[],
    req: T,
    res: GeminiResponse,
    socket: TLSSocket,
  ) {
    for (const handle of handlers) {
      const response = await handle(req, res)

      if (response) {
        res.send(response)
        break
      } else if (res.handled) {
        break
      }
    }

    if (!res.handled) {
      res.sendStatus(51, 'Not found.')
    }

    socket.write(res.header)
    res.pipe(socket)
  }

  private handleGeminiRequest(
    url: URL,
    socket: TLSSocket,
  ) {
    const req = new GeminiRequest(url, socket.getPeerCertificate())
    const res = new GeminiResponse()

    const handlers = this.middleware
      .filter(isGeminiCompatibleMiddleware)
      .filter(matchesRoute(req))
      .flatMap(route => route.handlers)

    this.applyMiddleware(handlers, req, res, socket)
  }

  private async handleTitanRequest(
    url: URL,
    socket: TLSSocket,
    stream: PassThrough,
  ) {
    const parsed = parseTitanUrlParams(url)
    const { size: targetSize } = parsed.params

    console.log(parsed)

    if (!targetSize) {
      socket.write('50 Size must be greater than 0 bytes.\r\n')
      socket.destroy()

      return
    }

    let bodySize = 0

    stream.on('data', data => {
      bodySize += Buffer.from(data).byteLength

      if (bodySize === targetSize) {
        stream.end()
      }
    })

    const req = new TitanRequest({
      ...parsed.params,
      size: targetSize,
      url: parsed.url,
      data: stream,
      cert: socket.getPeerCertificate(),
    })
    const res = new GeminiResponse()

    console.log(req)

    const handlers = this.middleware
      .filter(isTitanCompatibleMiddleware)
      .filter(matchesRoute(req))
      .flatMap(route => route.handlers)

    this.applyMiddleware(handlers, req, res, socket)
  }

  constructor(options: {
    cert: string | Buffer;
    key: string | Buffer;
  }) {
    this.server = createServer({
      key: options.key,
      cert: options.cert,
      requestCert: true,
      rejectUnauthorized: false,
    }, socket => {
      socket.setEncoding('utf-8')

      let receivedUrl = ''
      let requestReceived = false

      socket.on('data', async data => {
        if (requestReceived) {
          return
        }

        receivedUrl += String(data)

        if (receivedUrl.includes('\r\n')) {
          const [requestUrl, leftoverChunks] = receivedUrl.split('\r\n')
          const url = new URL(
            truncate(requestUrl, MAX_URL_SIZE_IN_BYTES),
          )

          switch (url.protocol) {
            case 'gemini:': {
              requestReceived = true
              this.handleGeminiRequest(url, socket)
              break
            }
            case 'titan:': {
              requestReceived = true

              const bodyStream = new PassThrough()

              bodyStream.pause()
              bodyStream.write(leftoverChunks)
              socket.pipe(bodyStream)

              this.handleTitanRequest(url, socket, bodyStream)
              break
            }
            default: {
              socket.write("59 Invalid protocol.\r\n")
              socket.destroy()
            }
          }
        }
      })
    })
  }

  listen(callback: () => void, port = DEFAULT_GEMINI_PORT) {
    this.server.listen(port, callback)
  }

  use(path: string, ...handlers: Middleware[]): void
  use(...handlers: Middleware[]): void
  use(arg: string | Middleware, ...rest: Middleware[]) {
    const path = typeof arg === 'string' ? arg : '(.*)'
    const handlers = typeof arg === 'string' ? rest : [arg, ...rest]

    this.middleware.push({
      match: match(path, { encode: encodeURI, decode: decodeURIComponent }),
      handlers,
      isWildcard: path === '(.*)',
      protocol: 'all',
    })
  }

  get(path: string, ...handlers: Middleware<GeminiRequest>[]): void {
    this.middleware.push({
      match: match(path, { encode: encodeURI, decode: decodeURIComponent }),
      handlers,
      isWildcard: path === '(.*)',
      protocol: 'gemini',
    })
  }

  put(path: string, ...handlers: Middleware<TitanRequest>[]): void {
    this.middleware.push({
      match: match(path, { encode: encodeURI, decode: decodeURIComponent }),
      handlers,
      isWildcard: path === '(.*)',
      protocol: 'titan',
    })
  }
}
