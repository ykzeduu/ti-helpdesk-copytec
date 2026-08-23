import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'

const router = Router()
const SECRET = process.env.JWT_SECRET
const isProd = process.env.NODE_ENV === 'production'
const COOKIE = 'sinal_id'

export function readIdentity(token) {
  try {
    const { id, name } = jwt.verify(token, SECRET)
    return { id, name }
  } catch {
    return null
  }
}

export function requireIdentity(req, res, next) {
  const who = readIdentity(req.cookies?.[COOKIE])
  if (!who) return res.status(401).json({ error: 'Diga seu nome antes de continuar.' })
  req.who = who
  next()
}

// Entrar e trocar de nome sao a mesma coisa: emite uma identidade nova.
router.post('/', (req, res) => {
  const name = String(req.body?.name || '').trim().replace(/\s+/g, ' ')

  if (name.length < 2) return res.status(400).json({ error: 'Use um nome com pelo menos 2 letras.' })
  if (name.length > 32) return res.status(400).json({ error: 'Esse nome e comprido demais. Use ate 32 letras.' })

  const existing = readIdentity(req.cookies?.[COOKIE])
  const who = { id: existing?.id || crypto.randomUUID(), name }

  const token = jwt.sign(who, SECRET, { expiresIn: '30d' })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000
  })
  res.json({ who })
})

router.get('/', (req, res) => {
  const who = readIdentity(req.cookies?.[COOKIE])
  if (!who) return res.status(401).json({ error: 'Sem identidade.' })
  res.json({ who })
})

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE)
  res.json({ ok: true })
})

export default router
