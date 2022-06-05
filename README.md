```
 /\_/\
( o.o )  s p a c e c a t
 > ^ <
```

# spacecat

Another [Gemini](https://gemini.circumlunar.space/) server, written in Node.js.

Features:

- Command line interface
- Express-style routing and middleware
- Static site middleware
- Authentication middleware
- Titan support, with middleware for token/cert-based authentication

Why another Gemini sever? Because learning is fun!

- [Quick Start](#quick-start)
- [Usage](#usage)
  - [Routes](#routes)
  - [Middleware](#middleware)
  - [Titan](#titan)
- [Requests](#requests)
  - [Titan Requests](#titan-requests)
- [Responses](#responses)
- [Middleware](#middleware-1)
  - [staticMiddleware](#staticmiddleware)
  - [requireToken](#requiretoken)
  - [requireCert](#requireCert)
  - [titanOnly](#titanOnly)
- [Full CLI Usage](#full-cli-usage)
- [Local Development](#local-development)
- [License](#license)

## Quick Start

```bash
npm i -g spacecat

# Point spacecat to a Gemini site and your server certs
spacecat ./site --cart ./cert.pem --key ./key.pem
```

## Usage

Instead of using the CLI, you can also set up your own routing. The API is similar to Express:

```ts
import { createReadStream, createWriteStream } from 'fs'
import { GeminiServer } from 'spacecat'
import streamToPromise from 'stream-to-promise'

const server = new GeminiServer({
  key: readFileSync('./key.pem'),
  cert: readFileSync('./cert.pem'),
})

// Global middleware
server.use(req => console.log(req.url))

// Gemini route
server.get('/posts', (req, res) => {
  return createReadStream('./posts.gmi')
})

// Gemini route with a parameter
server.get('/posts/:id', (req, res) => {
  return createReadStream(`./posts/${req.params.id}.gmi`)
})

// Titan route
server.put('/posts/:id', async (req, res) => {
  const writeStream = createWriteStream(`./posts/${req.params.id}.gmi`)

  req.data.pipe(writeStream)
  await streamToPromise(writeStream)

  res.redirect(`gemini://example.com/posts/${req.params.id}`)
})

server.listen(() => {
  console.log('> Listening')
})
```

### Routes

Create a route with `.get()`:

```ts
server.get('/path', (req, res) => {
  return '# Hello World'
})
```

Routes use the [path-to-regexp](https://www.npmjs.com/package/path-to-regexp) library, same as
Express, so you can do things like:

```ts
server.get('/posts/:id', (req, res) => {
  return `# Post #${req.params.id}`
})
```

A handler can return a string, Buffer, or readable stream, all of which are assumed to be Gemtext
(`text/gemini`). To use a different MIME type, you can call `req.send()`:

```ts
server.get('/path', (req, res) => {
  res.send('Plain text', 'text/plain')
})
```

You can return other statuses with `req.sendStatus()`:

```ts
server.get('/old', (req, res) => {
  res.sendStatus(30, 'gemini://example.com/new')
})
```

Note that once you've set a status, the server will close the connection once the response has
been sent.

A few commonly-used responses have dedicated methods:

- `res.redirect(url)`
- `res.requestInput(prompt)`
- `res.requestCert([prompt])`

### Middleware

A route can include any amount of middleware before the main request handler:

```ts
const requireInput = (req, res) => {
  if (req.query === '') {
    res.requestInput('Enter a value.')
  }
}

server.get('/input', requireInput, (req, res) => {
  // ...
})
```

Middleware functions can be sync or async. Unlike Express, there's no `next` parameter passed to
the middleware. If a handler returns a value or sets a response status, then the request stops there.
Otherwise, the server will move on to the next handler.

Middleware can also be applied with `.use()`:

```ts
// Applies to all requests
server.use(middlewareA, middlewareB)

// Applies to specific routes
server.use('/posts/(.*)', middlewareA, middlewareB)
```

### Titan

[Titan](https://transjovian.org:1965/page/Titan) is a complimentary protocol to Gemini. While Gemini
is for reading pages, Titan is for writing pages.

To create a Titan route, use `.put()`. This example takes the data from a Titan request and writes
it to a file:

```ts
import streamToPromise from 'stream-to-promise'

server.put('/page', async (req, res) => {
  const writeStream = createWriteStream('./page.gmi')

  // Write the incoming request to a file
  req.data.pipe(writeStream)

  // Wait until the file is written to fully
  await streamToPromise(writeStream)

  // Redirect to the page we just updated
  res.redirect('gemini://example.com/page')
})
```

When handling a Titan request, the `res` object is the same, but the `req` object is different;
refer to the API documentation below.

## Requests

Gemini requests have this shape:

```ts
interface GeminiRequest {
  url: URL;
  // Client certificate included in the request
  cert: PeerCertificate | null;
  // Params extracted from the route
  params: object;
  // The part of the URL after the `?`
  query: string;
}
```

The `PeerCertificate` object is created by Node.js's `tls` library.

### Titan Requests

Titan requests have this shape:

```ts
interface TitanRequest {
  url: URL;
  cert: PeerCertificate | null;
  // Mime type of the provided file
  mime: string;
  // Token provided in request
  token?: string;
  // Stream of provided file
  data: PassThrough
}
```

## Responses

Besides the various `.send()` methods detailed earlier, the `GeminiResponse` class also includes
these computed properties:

- `handled`: boolean indicating if a status code has been set yet
- `header`: string of response header

## Middleware

### staticMiddleware

Enables serving of static files. This is the middleware the CLI uses.

```ts
import { staticMiddleware } from 'spacecat'

server.use(staticMiddleware('./site'))
```

Features:

- Pretty URLs; the request `/home` is assumed to be `/home.gmi`
- Will first try to load an `index.gmi`

Optionally, you can also turn on Titan support for your static pages, allowing any of them to
be edited.

```ts
server.use(staticMiddleware('./site', {
  titan: true,
}))
```

Most likely, you will want to authenticate Titan requests. You can do this the usual Gemini way,
with a client certificate, or the Titan way, by reading the `token` parameter sent with the request.

When authenticating with a client cert, the server will compare the SHA256 fingerprint of the client
cert with the value provided to the middleware. This means exactly one client certificate is
allowed write access.

In the below example, the `titanOnly` function narrows the scope of the auth middleware so it only
applies to Titan requests. This means your site is still publicly accessible, but can only be
written to by an authenticated user.

```js
import {
  staticMiddleware,
  titanOnly,
  requireToken,
  requireCert,
} from 'spacecat'

// Method 1: client cert
server.use(
  titanOnly(requireCert({ fingerprint256: '...' })),
  staticMiddleware('./site', { titan: true }),
)

// Method 2: token
server.use(
  titanOnly(requireToken('correct horse battery staple')),
  staticMiddleware('./site', { titan: true }),
)
```

### requireToken

Only applies to Titan requests. Sends status 50 if a token is not provided or if it does not match
the one required by the server.

```ts
server.use(requireToken('password here'))
```

### requireCert

Sends status 60 if the client does not provide a certificate. Optionally, a specific cert fingerprint
can be set that the server will check for, returning status 61 if it doesn't match.

```ts
// Require any cert
server.use(requireCert())

// Require a specific cert
server.use(requireCert({
  fingerprint256: '...',
}))
```

### titanOnly

Not a middleware function, but a wrapper that will only invoke the given middleware for Titan
requests. Basically it saves you an `if` request.

```ts
const logTitanOnly = titanOnly(req => {
  console.log(`Titan request: ${req.url}`)
})

server.use(logTitanOnly)
```

### createPage

Add an endpoint to create pages through Titan. Pairs well with `staticMiddleware`.

```ts
server.use('/new', createPage('./public'))
```

How it works:

- The client first requests the `/new` route through Gemini
- The server asks for input, which is the full path of the file as it will live in the static
  directory. Examples:
  - `posts/post.gmi` will be accessible at `/posts/post`
  - `files/file.txt` will be accessible at `/files/file.txt`
  - The path is always interpreted as relative to the root of your static directory
- The client then sends a Titan request containing the contents of the file

## Full CLI Usage

```
Usage
  $ spacecat <dir>

Options
  --cert,  -c  Path to server certificate
  --key,   -k  Path to server key
  --port,  -p  Port to bind to (default: 1965)
  --titan, -t  Allow editing pages with Titan (default: false)

Example
  $ spacecat ./public --cert ./cert.pem --key ./key.pem
```

In conjunction with the `--titan` flag, you can set one of these environment variables to
authenticate Titan requests:

- `TITAN_REQUIRE_TOKEN`: require a token
- `TITAN_REQUIRE_CERT_FINGERPRINT`: require a client cert with the given SHA256 fingerprint

## Local Development

Run `npm test` to start a test server with various features enabled; see `test/test.ts`.

You'll need to generate a certificate for the server first:

```bash
openssl req -x509 -newkey rsa:4096 -keyout test/key.pem -out test/cert.pem -days 365 -nodes -subj '/CN=localhost'
```

## License

MIT &copy; [Geoff Kimball](https://geoffkimball.com)

ASCII cat found here: <https://www.asciiart.eu/animals/cats>
