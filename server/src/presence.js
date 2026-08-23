export const MAX_PEERS = Number(process.env.MAX_PEERS || 4)

const rooms = new Map()

export function peersIn(code) {
  return rooms.get(code) || new Map()
}

export function countIn(code) {
  return peersIn(code).size
}

export function addPeer(code, socketId, who) {
  if (!rooms.has(code)) rooms.set(code, new Map())
  // A ordem importa: 'id' e sempre o id do socket, nunca o da identidade.
  rooms.get(code).set(socketId, { ...who, identity: who.id, id: socketId, sharing: [] })
}

// Mesma pessoa reconectando: devolve o socket antigo para ser derrubado.
export function staleSocketFor(code, identity, exceptSocketId) {
  for (const peer of peersIn(code).values()) {
    if (peer.identity === identity && peer.id !== exceptSocketId) return peer.id
  }
  return null
}

export function removePeer(code, socketId) {
  const room = rooms.get(code)
  if (!room) return
  room.delete(socketId)
  if (room.size === 0) rooms.delete(code)
}

export function setSharing(code, socketId, streams) {
  const peer = rooms.get(code)?.get(socketId)
  if (peer) peer.sharing = streams
}

export function liveRoomCodes() {
  return [...rooms.keys()]
}

export function snapshot(code) {
  return [...peersIn(code).values()]
}

export function clearRoom(code) {
  rooms.delete(code)
}
