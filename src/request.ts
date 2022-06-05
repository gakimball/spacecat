import { PeerCertificate } from 'tls'

export class BaseRequest {
  url: URL
  cert: PeerCertificate | null = null

  /** Portion of the request after the `?`. This is an empty string if no query was passed. */
  query: string

  /**
   * Parameters extracted from the request path.
   *
   * @example
   * ```
   * server.get('/posts/:id', (req, res) => {
   *   res.send(`You asked for post ${req.params.id}`)
   * })
   * ```
   */
  params: object = {}

  readonly isGemini: boolean = true

  constructor(url: URL, cert: PeerCertificate) {
    this.url = url
    this.query = decodeURIComponent(url.search.replace(/^\?/, ''))

    if ('fingerprint' in cert) {
      this.cert = cert
    }
  }
}
