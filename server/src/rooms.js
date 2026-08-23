import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { q } from './db.js'
import { requireIdentity } from './session.js'
import { countIn, liveRoomCodes, clearRoom, MAX_PEERS } from './presence.js'
import { getIo } from './hub.js'

const router = Router()
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function newCode() {
  return [...crypto.randomBytes(8)].map(b => ALPHABET[b % ALPHABET.length]).join('')
}

router.use(requireIdentity)

// Comparacao em tempo constante: nao vaza o tamanho da senha pelo tempo de resposta.
function senhaConfere(enviada, esperada) {
  const a = crypto.createHash('sha256').update(String(enviada)).digest()
  const b = crypto.createHash('sha256').update(String(esperada)).digest()
  return crypto.timingSafeEqual(a, b)
}

// Freio simples contra tentativa em massa, por sala.
const tentativas = new Map()
function bloqueado(code) {
  const t = tentativas.get(code)
  if (!t) return false
  if (Date.now() > t.ate) { tentativas.delete(code); return false }
  return t.erros >= 5
}
function registrarErro(code) {
  const t = tentativas.get(code) || { erros: 0, ate: 0 }
  t.erros += 1
  t.ate = Date.now() + 10 * 60 * 1000
  tentativas.set(code, t)
}

router.get('/', async (req, res) => {
  const live = liveRoomCodes()
  if (live.length === 0) return res.json({ rooms: [] })

  const { rows } = await q(
    `select code, name, owner_name as owner, password_hash is not null as locked
     from rooms where code = any($1) and listed = true order by created_at desc`,
    [live]
  )

  res.json({ rooms: rows.map(r => ({ ...r, people: countIn(r.code), capacity: MAX_PEERS })) })
})

router.get('/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim()
  const { rows } = await q(
    `select code, name, owner_name as owner, password_hash is not null as locked
     from rooms where code = $1`,
    [code]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Nenhuma sala com esse codigo.' })
  res.json({ room: { ...rows[0], people: countIn(code), capacity: MAX_PEERS } })
})

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim() || `Sala de ${req.who.name}`
  const password = String(req.body?.password || '')
  const listed = req.body?.listed !== false

  if (password && password.length < 4) {
    return res.status(400).json({ error: 'A senha da sala precisa ter pelo menos 4 caracteres.' })
  }

  const hash = password ? await bcrypt.hash(password, 10) : null

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    try {
      const { rows } = await q(
        'insert into rooms (code, name, owner_name, password_hash, listed) values ($1,$2,$3,$4,$5) returning code, name, listed',
        [code, name, req.who.name, hash, listed]
      )
      return res.json({ room: { ...rows[0], locked: !!hash, people: 0, capacity: MAX_PEERS } })
    } catch (err) {
      if (err.code !== '23505') throw err
    }
  }
  res.status(500).json({ error: 'Nao consegui gerar um codigo livre. Tente de novo.' })
})

// Fecha a sala de vez: derruba todo mundo e apaga o registro.
router.post('/:code/close', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim()
  const admin = process.env.ADMIN_PASSWORD

  if (!admin) {
    return res.status(503).json({ error: 'Fechar salas nao esta configurado neste servidor.' })
  }
  if (bloqueado(code)) {
    return res.status(429).json({ error: 'Tentativas demais. Espere 10 minutos.' })
  }
  if (!senhaConfere(req.body?.password || '', admin)) {
    registrarErro(code)
    return res.status(403).json({ error: 'Senha de administrador incorreta.' })
  }

  tentativas.delete(code)

  const { rowCount } = await q('delete from rooms where code = $1', [code])
  if (rowCount === 0) return res.status(404).json({ error: 'Nenhuma sala com esse codigo.' })

  const io = getIo()
  if (io) {
    io.to(code).emit('room-closed')
    const sockets = await io.in(code).fetchSockets()
    for (const s of sockets) s.disconnect(true)
  }
  clearRoom(code)

  res.json({ ok: true, code })
})

export default router
