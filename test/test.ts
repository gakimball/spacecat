import { readFileSync, createReadStream } from 'fs'
import { createPage, GeminiServer, staticMiddleware } from '../src'

const server = new GeminiServer({
  cert: readFileSync('./cert.pem'),
  key: readFileSync('./key.pem'),
})

server.use((req, res) => {
  process.stdout.write(`> ${req.url.toString()}`)

  res.on('end', () => process.stdout.write(` ${res.header}\n`))
})

server.get('/get/string', () => '# Hi I\'m string')

server.get('/get/buffer', () => Buffer.from('# Hi I\'m buffer'))

server.get('/get/stream', () => createReadStream('./stream.gmi'))

server.get('/titan', (req, res) => createReadStream('./editable.gmi'))

server.put('/titan', async (req, res) => 'Thank you')

server.use('/new', createPage('./static'))

server.use(staticMiddleware('./static'))

server.listen(() => {
  console.log('> Listening')
})
