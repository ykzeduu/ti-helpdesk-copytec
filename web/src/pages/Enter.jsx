import { useState } from 'react'
import { api } from '../api.js'

export default function Enter({ onEnter }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { who } = await api.identify(name)
      onEnter(who)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-mark"><i className="dot" /><span>SINAL</span></div>
        <h1>Como voce quer aparecer?</h1>
        <p className="sub">
          Esse e o nome que os outros veem na sala. Nao precisa de senha nem e-mail.
        </p>

        {error && <div className="notice notice-error">{error}</div>}

        <div className="field">
          <label htmlFor="name">Seu nome</label>
          <input
            id="name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: Rafael"
            maxLength={32}
            autoFocus
            required
          />
        </div>

        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Entrando...' : 'Continuar'}
        </button>
      </form>
    </div>
  )
}
