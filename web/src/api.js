async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })

  let data = {}
  try { data = await res.json() } catch { /* resposta sem corpo */ }
  if (!res.ok) throw new Error(data.error || 'Nao consegui falar com o servidor.')
  return data
}

export const api = {
  identify: name => call('POST', '/api/session', { name }),
  session: () => call('GET', '/api/session'),
  signOut: () => call('POST', '/api/session/logout'),
  listRooms: () => call('GET', '/api/rooms'),
  findRoom: code => call('GET', `/api/rooms/${code}`),
  createRoom: body => call('POST', '/api/rooms', body),
  ice: () => call('GET', '/api/ice'),
  closeRoom: (code, password) => call('POST', `/api/admin/rooms/${code}/close`, { password }),
  purge: password => call('POST', '/api/admin/purge', { password })
}
