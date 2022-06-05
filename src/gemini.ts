import { PassThrough, Readable } from 'stream';
import { PeerCertificate } from 'tls'
import { BaseRequest } from './request'

/** An incoming request on the Gemini protocol. */
export class GeminiRequest extends BaseRequest {
  constructor(url: URL, cert: PeerCertificate) {
    super(url, cert)
  }
}

/** An outgoing request on the Gemini protocol. Also returned in response to Titan requests. */
export class GeminiResponse extends PassThrough {
  private status?: number
  private meta?: string

  constructor() {
    super()
  }

  get handled() {
    return this.status !== undefined && this.meta !== undefined
  }

  get header() {
    return `${this.status} ${this.meta}\r\n`
  }

  send(body: string | Buffer | Readable, mime = 'text/gemini') {
    this.status = 20
    this.meta = mime

    if (body instanceof Readable) {
      body.pipe(this)
    } else {
      this.write(body)
      this.end()
    }
  }

  sendStatus(status: number, meta: string) {
    this.status = status
    this.meta = meta
    this.end()
  }

  redirect(url: string | URL) {
    this.sendStatus(30, url.toString())
  }

  requestInput(prompt: string) {
    this.sendStatus(10, prompt)
  }

  requestCert(prompt = 'Certificate required.') {
    this.sendStatus(60, prompt)
  }
}
