import { MatchFunction } from 'path-to-regexp'
import { Readable } from 'stream'
import { GeminiRequest, GeminiResponse } from './gemini'
import { BaseRequest } from './request'
import { TitanRequest } from './titan'

type Awaitable<T> = T | Promise<T>

export type Middleware<Req = GeminiRequest | TitanRequest> = (req: Req, res: GeminiResponse) => Awaitable<string | Buffer | Readable | void>

interface BaseMiddlewareDefinition {
  match: MatchFunction;
  isWildcard: boolean;
}

export interface MiddlewareDefinition extends BaseMiddlewareDefinition {
  handlers: Middleware[];
  protocol: 'all';
}

export interface GeminiRouteDefinition extends BaseMiddlewareDefinition {
  protocol: 'gemini';
  handlers: Middleware<GeminiRequest>[]
}

export interface TitanRouteDefinition extends BaseMiddlewareDefinition {
  protocol: 'titan';
  handlers: Middleware<TitanRequest>[];
}

export type AnyMiddlewareDefinition = (
  MiddlewareDefinition
  | GeminiRouteDefinition
  | TitanRouteDefinition
)

export const isGeminiCompatibleMiddleware = (
  middleware: AnyMiddlewareDefinition,
): middleware is MiddlewareDefinition | GeminiRouteDefinition => (
  ['all', 'gemini'].includes(middleware.protocol)
)

export const isTitanCompatibleMiddleware = (
  middleware: AnyMiddlewareDefinition,
): middleware is MiddlewareDefinition | TitanRouteDefinition => (
  ['all', 'titan'].includes(middleware.protocol)
)

export const matchesRoute = (req: BaseRequest) => (middleware: AnyMiddlewareDefinition) => {
  if (middleware.isWildcard) {
    return true
  }

  const match = middleware.match(req.url.pathname)

  if (match) {
    Object.assign(req.params, match.params)

    return true
  }
}
