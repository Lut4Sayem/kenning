import { loadConfig } from './config.js'
import { log } from './log.js'
import { createServer } from './server.js'
import { springApi } from './spring.js'

const config = loadConfig(process.env)
await createServer(config, springApi(config)).listen()
log('listening', { port: config.port })
