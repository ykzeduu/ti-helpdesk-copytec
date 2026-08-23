import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import Avatar from '../components/Avatar.jsx'

export default function Lobby({ who, onWho }) {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [search, setSearch] = useState('')
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [adminPw, setAdminPw] = useState('')
  const [aviso, setAviso] = useState('')

  const refresh = useCallback(() => {
    api.listRooms().then(({ rooms }) => setRooms(rooms)).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  function enter(room) {
    if (room.locked) setDialog({ kind: 'senha', room })
    else navigate(`/sala/${room.code}`)
  }

  async function lookup(e) {
    e.preventDefault()
    setError('')
    setFound(null)
    const code = search.toUpperCase().trim()
    if (!code) return
    try {
      const { room } = await api.findRoom(code)
      setFound(room)
    } catch (err) {
      setError(err.message)
    }
  }

  async function signOut() {
    await api.signOut().catch(() => {})
    onWho(null)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="who">
          <Avatar user={who} />
          <div>
            <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{who.name}</div>
            <div className="tiny">e assim que os outros te veem</div>
          </div>
        </div>
        <div className="row">
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'limpar' })}>Limpar banco</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: 'nome' })}>Trocar nome</button>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sair</button>
        </div>
      </header>

      {aviso && <div className="notice notice-ok">{aviso}</div>}

      <p className="eyebrow">Salas</p>
      <h1 style={{ margin: '6px 0 24px' }}>Onde voce quer transmitir?</h1>

      <div className="split">
        <div className="card">
          <h3>Criar uma sala</h3>
          <p className="muted" style={{ margin: '6px 0 16px' }}>
            Geramos um codigo de 8 caracteres para voce passar para quem vai entrar.
          </p>
          <button className="btn btn-primary" onClick={() => setDialog({ kind: 'criar' })}>Criar sala</button>
        </div>

        <div className="card">
          <h3>Entrar por codigo</h3>
          <p className="muted" style={{ margin: '6px 0 16px' }}>
            Funciona mesmo para salas que nao aparecem na lista.
          </p>
          <form className="searchbar" onSubmit={lookup}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="H29FB231" maxLength={8} aria-label="Codigo da sala" />
            <button className="btn">Buscar</button>
          </form>
          {error && <p className="tiny" style={{ color: '#ff9a91' }}>{error}</p>}
          {found && <RoomRow room={found} onEnter={enter} onClose={r => setDialog({ kind: 'fechar', room: r })} />}
        </div>
      </div>

      <div className="spread" style={{ marginBottom: 12 }}>
        <p className="eyebrow">Salas ativas agora</p>
        <span className="tiny">{rooms.length} aberta{rooms.length === 1 ? '' : 's'}</span>
      </div>

      {rooms.length === 0 ? (
        <div className="empty">Nenhuma sala aberta. Crie uma e passe o codigo para quem vai assistir.</div>
      ) : (
        rooms.map(room => <RoomRow key={room.code} room={room} onEnter={enter} onClose={r => setDialog({ kind: 'fechar', room: r })} />)
      )}

      {dialog?.kind === 'criar' && (
        <CreateDialog onClose={() => setDialog(null)} onDone={code => navigate(`/sala/${code}`)} />
      )}
      {dialog?.kind === 'senha' && (
        <PasswordDialog
          room={dialog.room}
          onClose={() => setDialog(null)}
          onDone={password => navigate(`/sala/${dialog.room.code}`, { state: { password } })}
        />
      )}
      {dialog?.kind === 'fechar' && (
        <AdminDialog
          titulo={`Fechar "${dialog.room.name}"`}
          descricao="Todo mundo que estiver dentro sai na hora e o registro da sala e apagado. Nao da para desfazer."
          acao="Fechar sala"
          senhaInicial={adminPw}
          onClose={() => setDialog(null)}
          onConfirm={async senha => {
            await api.closeRoom(dialog.room.code, senha)
            setAdminPw(senha)
            setAviso(`Sala ${dialog.room.code} fechada.`)
            setFound(null)
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog?.kind === 'limpar' && (
        <AdminDialog
          titulo="Limpar banco"
          descricao="Fecha todas as salas abertas e apaga todos os registros. Nao da para desfazer."
          acao="Apagar tudo"
          senhaInicial={adminPw}
          onClose={() => setDialog(null)}
          onConfirm={async senha => {
            const r = await api.purge(senha)
            setAdminPw(senha)
            setAviso(`${r.removidas} sala(s) apagada(s).`)
            setFound(null)
            setDialog(null)
            refresh()
          }}
        />
      )}
      {dialog?.kind === 'nome' && (
        <NameDialog who={who} onClose={() => setDialog(null)} onSaved={w => { onWho(w); setDialog(null) }} />
      )}
    </div>
  )
}

function RoomRow({ room, onEnter, onClose }) {
  const full = room.people >= room.capacity
  return (
    <div className="room-row">
      <div className="meta">
        <div className="name">{room.name}</div>
        <div className="detail">
          <span className="code">{room.code}</span>
          <span>{room.people}/{room.capacity}</span>
          {room.locked && <span>com senha</span>}
          {room.owner && <span>por {room.owner}</span>}
        </div>
      </div>
      <button className="btn btn-sm" onClick={() => onEnter(room)} disabled={full}>
        {full ? 'Cheia' : 'Entrar'}
      </button>
      {onClose && (
        <button className="btn btn-ghost btn-sm" onClick={() => onClose(room)} title="Fechar a sala e apagar o registro">
          Fechar
        </button>
      )}
    </div>
  )
}

function Dialog({ title, children, onClose }) {
  return (
    <div className="modal-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="card modal">
        <div className="spread" style={{ marginBottom: 16 }}>
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CreateDialog({ onClose, onDone }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [listed, setListed] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { room } = await api.createRoom({ name, password, listed })
      onDone(room.code)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Criar sala" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="notice notice-error">{error}</div>}
        <div className="field">
          <label htmlFor="rn">Nome da sala</label>
          <input id="rn" value={name} onChange={e => setName(e.target.value)} placeholder="Reuniao de quinta" />
        </div>
        <div className="field">
          <label htmlFor="rp">Senha (opcional)</label>
          <input id="rp" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Deixe vazio para sala aberta" />
        </div>
        <label className="row" style={{ marginBottom: 18, cursor: 'pointer' }}>
          <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} style={{ width: 'auto' }} />
          <span className="muted">Mostrar na lista de salas ativas</span>
        </label>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Criando...' : 'Criar e entrar'}
        </button>
      </form>
    </Dialog>
  )
}

function PasswordDialog({ room, onClose, onDone }) {
  const [password, setPassword] = useState('')
  return (
    <Dialog title={room.name} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); onDone(password) }}>
        <p className="muted" style={{ marginBottom: 16 }}>Esta sala pede senha para entrar.</p>
        <div className="field">
          <label htmlFor="sp">Senha da sala</label>
          <input id="sp" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus required />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }}>Entrar</button>
      </form>
    </Dialog>
  )
}

function NameDialog({ who, onClose, onSaved }) {
  const [name, setName] = useState(who.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.identify(name)
      onSaved(res.who)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Trocar nome" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="notice notice-error">{error}</div>}
        <div className="row" style={{ marginBottom: 18 }}>
          <Avatar user={{ name }} size="avatar-lg" />
          <p className="muted">A cor vem do nome, entao ela muda junto.</p>
        </div>
        <div className="field">
          <label htmlFor="nn">Seu nome</label>
          <input id="nn" value={name} onChange={e => setName(e.target.value)} maxLength={32} autoFocus required />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
    </Dialog>
  )
}

function AdminDialog({ titulo, descricao, acao, senhaInicial, onClose, onConfirm }) {
  const [senha, setSenha] = useState(senhaInicial || '')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErro('')
    try {
      await onConfirm(senha)
    } catch (err) {
      setErro(err.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={titulo} onClose={onClose}>
      <form onSubmit={submit}>
        {erro && <div className="notice notice-error">{erro}</div>}
        <p className="muted" style={{ marginBottom: 16 }}>{descricao}</p>
        <div className="field">
          <label htmlFor="ap">Senha de administrador</label>
          <input id="ap" type="password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus required />
        </div>
        <button className="btn btn-danger" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Aguarde...' : acao}
        </button>
      </form>
    </Dialog>
  )
}
