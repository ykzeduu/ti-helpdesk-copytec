import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { migrate, q } from './db.js'
import sessionRoutes, { requireIdentity } from './session.js'
import roomRoutes from './rooms.js'
import { attachSignaling } from './signaling.js'
import { criarRotasAdmin } from './admin.js'
import { liveRoomCodes } from './presence.js'
import { setIo } from './hub.js'
import { iceServers } from './ice.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const http = createServer(app)
const io = new Server(http, { maxHttpBufferSize: 1e6 })

app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.get('/api/ice', requireIdentity, (req, res) => res.json({ iceServers: iceServers() }))
app.use('/api/session', sessionRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/admin', criarRotasAdmin(io))

const dist = path.join(here, '..', '..', 'web', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.use((err, req, res, next) => {
  console.error('[erro]', err)
  res.status(500).json({ error: 'Algo quebrou aqui do lado. Tente de novo.' })
})

setIo(io)
attachSignaling(io)

// Rede de seguranca: apaga salas criadas mas nunca usadas. Salas com gente
// dentro nunca sao tocadas, por mais longa que seja a reuniao.
setInterval(() => {
  const vivas = liveRoomCodes()
  q(
    `delete from rooms
     where created_at < now() - interval '30 minutes'
       and not (code = any($1))`,
    [vivas]
  ).catch(() => {})
}, 5 * 60 * 1000)

const PORT = process.env.PORT || 3000

migrate()
  .then(() => http.listen(PORT, () => console.log(`[sinal] ouvindo na porta ${PORT}`)))
  .catch(err => {
    console.error('[db] falha ao aplicar o schema:', err.message)
    process.exit(1)
  })
