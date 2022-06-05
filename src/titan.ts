import { PassThrough } from 'stream'
import { PeerCertificate } from 'tls'
import { URL } from 'url'
import { BaseRequest } from './request'

export class TitanRequest extends BaseRequest {
  size: number;
  mime: string;
  token?: string
  data: PassThrough;

  constructor(options: {
    url: URL;
    size: number;
    mime?: string;
    token?: string;
    data: PassThrough;
    cert: PeerCertificate
  }) {
    super(options.url, options.cert)

    this.size = options.size
    this.mime = options.mime ?? 'text/gemini'
    this.token = options.token
    this.data = options.data
  }
}

export interface ParsedTitanUrl {
  url: URL;
  params: {
    size?: number;
    mime: string;
    token?: string;
  };
}

export const parseTitanUrlParams = (url: URL): ParsedTitanUrl => {
  const [requestUrl, ...rawParams] = url.toString().split(';')

  const params = Object.fromEntries(
    rawParams.map(param => {
      const [key, value] = param.split('=')

      return [key, value]
    }),
  )

  return {
    url: new URL(requestUrl),
    params: {
      size: Number.parseInt(params.size, 10),
      mime: params.mime ?? 'text/gemini',
      token: params.token,
    },
  }
}
