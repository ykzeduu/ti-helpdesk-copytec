import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import Enter from './pages/Enter.jsx'
import Lobby from './pages/Lobby.jsx'
import Room from './pages/Room.jsx'

export default function App() {
  const [who, setWho] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.session()
      .then(({ who }) => setWho(who))
      .catch(() => setWho(null))
      .finally(() => setReady(true))
  }, [])

  if (!ready) {
    return <div className="gate"><p className="eyebrow">Carregando</p></div>
  }

  const guard = element => (who ? element : <Navigate to="/entrar" replace />)

  return (
    <Routes>
      <Route path="/entrar" element={who ? <Navigate to="/" replace /> : <Enter onEnter={setWho} />} />
      <Route path="/" element={guard(<Lobby who={who} onWho={setWho} />)} />
      <Route path="/sala/:code" element={guard(<Room who={who} />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
