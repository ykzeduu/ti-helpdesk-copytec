import { Router } from 'express'
import crypto from 'node:crypto'
import { q } from './db.js'
import { liveRoomCodes } from './presence.js'

const SENHA = process.env.ADMIN_PASSWORD || ''

// Comparacao de tempo constante: nao entrega o tamanho da senha pelo relogio.
function senhaConfere(enviada) {
  if (!SENHA) return false
  const a = Buffer.from(String(enviada || ''))
  const b = Buffer.from(SENHA)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export function criarRotasAdmin(io) {
  const router = Router()

  router.use((req, res, next) => {
    if (!SENHA) {
      return res.status(503).json({ error: 'Administracao desativada: ADMIN_PASSWORD nao esta configurada.' })
    }
    if (!senhaConfere(req.body?.password)) {
      return res.status(403).json({ error: 'Senha de administrador incorreta.' })
    }
    next()
  })

  // Fecha uma sala: avisa, derruba todo mundo e apaga o registro.
  router.post('/rooms/:code/close', async (req, res) => {
    const code = String(req.params.code || '').toUpperCase().trim()

    const { rowCount } = await q('delete from rooms where code = $1', [code])
    if (rowCount === 0) return res.status(404).json({ error: 'Nenhuma sala com esse codigo.' })

    io.to(code).emit('room-closed')
    io.in(code).disconnectSockets(true)

    res.json({ ok: true, code })
  })

  // Zera o banco: fecha tudo que esta aberto e apaga todas as salas.
  router.post('/purge', async (req, res) => {
    for (const code of liveRoomCodes()) {
      io.to(code).emit('room-closed')
      io.in(code).disconnectSockets(true)
    }
    const { rowCount } = await q('delete from rooms')
    res.json({ ok: true, removidas: rowCount })
  })

  return router
}
