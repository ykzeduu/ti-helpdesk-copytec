import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMesh, PERFIS } from '../lib/useMesh.js'
import { useSpeaking } from '../lib/useSpeaking.js'
import Avatar from '../components/Avatar.jsx'
import Tile from '../components/Tile.jsx'
import AudioOut from '../components/AudioOut.jsx'
import VolumeMenu from '../components/VolumeMenu.jsx'
import StatsPanel from '../components/StatsPanel.jsx'

const ROTULO = {
  new: 'aguardando',
  connecting: 'conectando',
  connected: 'conectado',
  disconnected: 'caiu',
  failed: 'falhou',
  closed: 'fechado'
}

export default function Room({ who }) {
  const { code } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [password, setPassword] = useState(location.state?.password || '')
  const [askPassword, setAskPassword] = useState(false)
  const [fatal, setFatal] = useState('')
  const [copied, setCopied] = useState(false)
  const [focusKey, setFocusKey] = useState(null)
  const [volumes, setVolumes] = useState({})
  const [volMenu, setVolMenu] = useState(null)
  const [verStats, setVerStats] = useState(false)

  const mesh = useMesh({
    code,
    password,
    onFatal: message => {
      if (/senha/i.test(message)) {
        setAskPassword(true)
        setFatal(password ? message : '')
      } else {
        setFatal(message)
      }
    }
  })

  const {
    peers, remote, screens, micOn, micStream, notice, setNotice,
    startShare, stopShare, toggleMic, sharing, perfil, setPerfil, nativa, setNativa,
    startCamera, stopCamera, cameraOn, telas, kinds, coletarStats
  } = mesh

  // Um cartao por transmissao. Quem nao transmite entra como avatar.
  const cards = useMemo(() => {
    const list = []

    if (screens.length > 0) {
      screens.forEach(s => list.push({ key: `eu:${s.id}`, stream: s.stream, kind: s.kind, person: who, self: true }))
    } else {
      list.push({ key: 'eu', stream: null, kind: null, person: who, self: true })
    }

    for (const peer of peers) {
      const videos = Object.values(remote[peer.id] || {}).filter(s => s.getVideoTracks().length > 0)
      if (videos.length > 0) {
        videos.forEach(s => list.push({
          key: `${peer.id}:${s.id}`, stream: s, kind: kinds[s.id] || 'screen', person: peer, self: false
        }))
      } else {
        list.push({ key: peer.id, stream: null, kind: null, person: peer, self: false })
      }
    }
    return list
  }, [screens, peers, remote, who, kinds])

  // Foco: o que a pessoa escolheu; senao a primeira transmissao ativa.
  const focused = cards.find(c => c.key === focusKey) || cards.find(c => c.stream) || cards[0]

  useEffect(() => {
    if (focusKey && !cards.some(c => c.key === focusKey)) setFocusKey(null)
  }, [cards, focusKey])

  // Microfones: o seu e o de cada participante, para acender o anel verde.
  const audioSources = useMemo(() => {
    const list = []
    if (micStream) list.push({ id: 'eu', stream: micStream })
    for (const peer of peers) {
      for (const s of Object.values(remote[peer.id] || {})) {
        if (s.getVideoTracks().length === 0) list.push({ id: peer.id, stream: s })
      }
    }
    return list
  }, [micStream, peers, remote])

  const volumeDe = id => (volumes[id] === undefined ? 1 : volumes[id])
  const ajustar = (id, v) => setVolumes(prev => ({ ...prev, [id]: v }))

  const falando = useSpeaking(audioSources)
  const estaFalando = card => falando.has(card.self ? 'eu' : card.person.id)

  // Microfones de todo mundo tocam sempre.
  const voices = useMemo(() => {
    const list = []
    for (const peer of peers) {
      for (const s of Object.values(remote[peer.id] || {})) {
        if (s.getVideoTracks().length === 0) list.push({ key: `${peer.id}:${s.id}`, stream: s, personId: peer.id })
      }
    }
    return list
  }, [peers, remote])

  const leave = () => navigate('/', { replace: true })

  function copyCode() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }

  if (fatal && !askPassword) {
    return (
      <div className="gate">
        <div className="gate-card">
          <p className="eyebrow">Sala {code}</p>
          <h1 style={{ margin: '6px 0 10px' }}>Nao deu para entrar</h1>
          <p className="sub">{fatal}</p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={leave}>Voltar para as salas</button>
        </div>
      </div>
    )
  }

  if (askPassword) {
    return (
      <div className="gate">
        <form
          className="gate-card"
          onSubmit={e => {
            e.preventDefault()
            setAskPassword(false)
            setFatal('')
            setPassword(e.target.elements.p.value)
          }}
        >
          <p className="eyebrow">Sala {code}</p>
          <h1 style={{ margin: '6px 0 10px' }}>Esta sala pede senha</h1>
          {fatal && <div className="notice notice-error">{fatal}</div>}
          <div className="field">
            <label htmlFor="p">Senha da sala</label>
            <input id="p" name="p" type="password" autoFocus required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }}>Entrar</button>
          <p className="swap"><a href="#" onClick={e => { e.preventDefault(); leave() }}>Voltar para as salas</a></p>
        </form>
      </div>
    )
  }

  const esquerda = cards.filter((_, i) => i % 2 === 0)
  const direita = cards.filter((_, i) => i % 2 === 1)

  const rail = (lista, lado) => (
    <aside className={`rail rail--${lado}`}>
      {lista.map(c => (
        <Tile
          key={c.key}
          card={c}
          variant="thumb"
          focused={c.key === focused?.key}
          speaking={estaFalando(c)}
          onFocus={() => setFocusKey(c.key)}
          onVolume={pos => setVolMenu({ ...pos, id: c.self ? 'eu' : c.person.id, name: c.person.name })}
        />
      ))}
    </aside>
  )

  return (
    <div className="room">
      <header className="room-head">
        {sharing && <span className="tally"><i className="bulb" />No ar</span>}
        <div className="title">
          <h3>{mesh.room?.name || 'Conectando...'}</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="chip" onClick={copyCode} title="Copiar codigo">
              <span className="code">{code}</span>
              <span>{copied ? 'copiado' : 'copiar'}</span>
            </button>
            <span className="chip">
              <i className={`led ${mesh.status === 'joined' ? 'on' : ''}`} />
              {peers.length + 1}{mesh.capacity ? ` de ${mesh.capacity}` : ''}
            </span>
            {peers.map(p => (
              <span className="chip" key={p.id} title={`Conexao com ${p.name}: ${p.link}`}>
                <i className={`led ${p.link === 'connected' ? 'on' : p.link === 'failed' ? 'bad' : ''}`} />
                {p.name}: {ROTULO[p.link] || p.link}
              </span>
            ))}
          </div>
        </div>
        <div className="roster">
          <Avatar user={who} />
          {peers.map(p => <Avatar key={p.id} user={p} />)}
        </div>
      </header>

      {notice && (
        <div style={{ padding: '12px 18px 0' }}>
          <div className="notice notice-error" style={{ marginBottom: 0 }}>
            {notice} <a href="#" onClick={e => { e.preventDefault(); setNotice('') }}>dispensar</a>
          </div>
        </div>
      )}

      <main className="stage">
        {rail(esquerda, 'esq')}

        <section className="spotlight">
          {focused ? (
            <Tile
              card={focused}
              variant="spotlight"
              focused
              speaking={estaFalando(focused)}
              onVolume={pos => setVolMenu({ ...pos, id: focused.self ? 'eu' : focused.person.id, name: focused.person.name })}
            />
          ) : (
            <div className="empty">Ninguem na sala ainda.</div>
          )}
        </section>

        {rail(direita, 'dir')}
      </main>

      {voices.map(v => (
        <AudioOut key={v.key} stream={v.stream} volume={volumeDe(v.personId)} />
      ))}

      {/* Som de transmissao: so o telao. Miniaturas ficam sempre mudas. */}
      {focused?.stream && !focused.self && (
        <AudioOut
          key={`palco:${focused.key}`}
          stream={focused.stream}
          volume={volumeDe(focused.person.id)}
        />
      )}

      {volMenu && (
        <VolumeMenu
          x={volMenu.x}
          y={volMenu.y}
          name={volMenu.name}
          volume={volumeDe(volMenu.id)}
          onChange={v => ajustar(volMenu.id, v)}
          onClose={() => setVolMenu(null)}
        />
      )}

      <footer className="dock">
        <div className="dock-main">
          <button className={`btn ${micOn ? '' : 'btn-ghost'}`} onClick={toggleMic}>
            {micOn ? 'Microfone ligado' : 'Ligar microfone'}
          </button>
          <button className={`btn ${cameraOn ? '' : 'btn-ghost'}`} onClick={cameraOn ? stopCamera : startCamera}>
            {cameraOn ? 'Camera ligada' : 'Ligar camera'}
          </button>
          <button className="btn btn-primary" onClick={startShare} disabled={telas.length >= mesh.maxShares}>
            Compartilhar tela
          </button>
          {telas.map((s, i) => (
            <button key={s.id} className="btn btn-ghost" onClick={() => stopShare(s.id)}>
              Parar tela {i + 1}
            </button>
          ))}
          <button className="btn btn-danger" onClick={leave}>Sair da sala</button>
        </div>

        <div className="dock-quality">
          <button className={`btn btn-sm ${verStats ? '' : 'btn-ghost'}`} onClick={() => setVerStats(v => !v)}>
            Diagnostico
          </button>
          {Object.entries(PERFIS).map(([chave, p]) => (
            <button
              key={chave}
              className={`btn btn-sm ${perfil === chave ? '' : 'btn-ghost'}`}
              onClick={() => setPerfil(chave)}
              title={p.dica}
            >
              {p.rotulo}
            </button>
          ))}
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={nativa} onChange={e => setNativa(e.target.checked)} style={{ width: 'auto' }} />
            <span className="tiny">Resolucao nativa</span>
          </label>
        </div>
      </footer>

      {verStats && <StatsPanel coletar={coletarStats} onClose={() => setVerStats(false)} />}
    </div>
  )
}
