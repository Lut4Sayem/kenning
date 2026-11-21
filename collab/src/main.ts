import { loadConfig } from './config.js'
import { log } from './log.js'
import { createServer } from './server.js'

const config = loadConfig(process.env)
await createServer(config).listen()
log('listening', { port: config.port })
