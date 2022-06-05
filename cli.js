#!/usr/bin/env node

const fs = require('fs')
const meow = require('meow')
const boxen = require('boxen')
const chalk = require('chalk')
const wrapAnsi = require('wrap-ansi')
const {
  GeminiServer,
  GeminiRequest,
  staticMiddleware,
  titanOnly,
  requireToken,
  requireCert,
  createPage,
} = require('./dist')

const cli = meow(`
  Usage
    $ spacecat <dir>

  Options
    --cert,  -c  Path to server certificate
    --key,   -k  Path to server key
    --port,  -p  Port to bind to (default: 1965)
    --titan, -t  Allow editing pages with Titan (default: false)
    --new,   -n

  Example
    $ spacecat ./public --cert ./cert.pem --key ./key.pem
    > Listening on port 1965
`, {
  flags: {
    cert: {
      type: 'string',
      alias: 'c',
    },
    key: {
      type: 'string',
      alias: 'k',
    },
    port: {
      type: 'number',
      alias: 'p',
      default: 1965,
    },
    titan: {
      type: 'boolean',
      alias: 't',
      default: false,
    },
  }
})

const [baseDir] = cli.input

if (!baseDir) {
  cli.showHelp()
}

if (!cli.flags.cert || !cli.flags.key) {
  const message = wrapAnsi(
    chalk.red('ERROR: Must provide server certificate/key with the --cert and --key flags.'),
    45,
  )

  console.error(
    boxen(message, {
      title: 'spacecat',
      titleAlignment: 'center',
      padding: 1,
      borderStyle: 'classic',
      borderColor: 'red',
    })
  )
  process.exit(2)
}

const server = new GeminiServer({
  cert: fs.readFileSync(cli.flags.cert),
  key: fs.readFileSync(cli.flags.key),
})

// Logging
server.use((req, res) => {
  const { protocol } = req.url
  const urlRest = req.url.toString().replace(`${protocol}`, '')

  if (req instanceof GeminiRequest) {
    process.stdout.write(chalk.cyan(`→ ${protocol}`) + urlRest)
  } else {
    process.stdout.write(chalk.magenta(`→ ${protocol}`) + urlRest)
  }

  res.on('close', () => {
    process.stdout.write(chalk.gray(` » ${res.header}`))
  })
})

// Authentication
if (process.env.TITAN_REQUIRE_TOKEN) {
  server.use(titanOnly(requireToken(process.env.TITAN_REQUIRE_TOKEN)))
}

if (process.env.TITAN_REQUIRE_CERT_FINGERPRINT) {
  server.use(titanOnly(requireCert({
    fingerprint256: process.env.TITAN_REQUIRE_CERT_FINGERPRINT,
  })))
}

// Static
server.use(staticMiddleware(baseDir, {
  titan: cli.flags.titan,
}))

server.listen(() => {
  const message = boxen(chalk.cyan(`> Listening on port ${cli.flags.port}`), {
    title: 'spacecat',
    titleAlignment: 'center',
    padding: 1,
    borderStyle: 'classic',
    borderColor: 'cyan',
  })

  console.log(`\n${message}\n`)
}, cli.flags.port)
