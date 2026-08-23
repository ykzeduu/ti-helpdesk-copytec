import bcrypt from 'bcryptjs'
import * as cookie from 'cookie'
import { q } from './db.js'
import { readIdentity } from './session.js'
import { addPeer, removePeer, setSharing, snapshot, countIn, staleSocketFor, MAX_PEERS } from './presence.js'

export function attachSignaling(io) {
  io.use((socket, next) => {
    const jar = cookie.parse(socket.handshake.headers.cookie || '')
    const who = readIdentity(jar.sinal_id)
    if (!who) return next(new Error('sem identidade'))
    socket.data.who = who
    next()
  })

  io.on('connection', socket => {
    let joined = null

    socket.on('join', async ({ code, password }, ack = () => {}) => {
      code = String(code || '').toUpperCase().trim()
      if (joined) return ack({ error: 'Voce ja esta em uma sala.' })

      const { rows } = await q('select code, name, password_hash from rooms where code = $1', [code])
      const room = rows[0]
      if (!room) return ack({ error: 'Nenhuma sala com esse codigo.' })

      if (room.password_hash) {
        const ok = await bcrypt.compare(String(password || ''), room.password_hash)
        if (!ok) return ack({ error: 'Senha da sala incorreta.' })
      }

      if (countIn(code) >= MAX_PEERS) {
        return ack({ error: `A sala esta cheia (${MAX_PEERS} pessoas).` })
      }

      // A mesma pessoa reconectando nao deve ocupar dois lugares.
      const stale = staleSocketFor(code, socket.data.who.id, socket.id)
      if (stale) {
        removePeer(code, stale)
        io.to(code).emit('peer-left', { id: stale })
        io.sockets.sockets.get(stale)?.disconnect(true)
      }

      joined = code
      socket.join(code)
      addPeer(code, socket.id, socket.data.who)

      const peers = snapshot(code).filter(p => p.id !== socket.id)
      socket.to(code).emit('peer-joined', { ...socket.data.who, id: socket.id, sharing: [] })

      ack({ room: { code: room.code, name: room.name, capacity: MAX_PEERS }, selfId: socket.id, peers })
    })

    socket.on('signal', ({ to, data }) => {
      if (!joined || !to) return
      io.to(to).emit('signal', { from: socket.id, data })
    })

    socket.on('sharing', ({ streams }) => {
      if (!joined) return
      const limpos = Array.isArray(streams)
        ? streams.slice(0, 4).map(s => ({
            id: String(s?.id || ''),
            kind: s?.kind === 'camera' ? 'camera' : 'screen'
          })).filter(s => s.id)
        : []
      setSharing(joined, socket.id, limpos)
      socket.to(joined).emit('peer-sharing', { id: socket.id, streams: limpos })
    })

    socket.on('leave', cleanup)
    socket.on('disconnect', cleanup)

    function cleanup() {
      if (!joined) return
      const code = joined
      joined = null
      removePeer(code, socket.id)
      socket.leave(code)
      socket.to(code).emit('peer-left', { id: socket.id })

      // Ultimo a sair apaga a luz: sala vazia nao fica ocupando o banco.
      if (countIn(code) === 0) {
        q('delete from rooms where code = $1', [code]).catch(() => {})
      }
    }
  })
}
