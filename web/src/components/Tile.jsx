import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar.jsx'

/**
 * variant: 'spotlight' (o telao) ou 'thumb' (miniatura da lateral)
 * Anel: verde quando fala, azul quando e o foco atual, cinza no resto.
 * O video e sempre mudo aqui: o som passa pelo AudioOut, que permite ganho
 * acima de 100% e nao esbarra no bloqueio de autoplay.
 */
export default function Tile({ card, variant, focused, speaking, onFocus, onVolume }) {
  const ref = useRef(null)
  const [blocked, setBlocked] = useState(false)
  const { stream, person, self, kind } = card

  useEffect(() => {
    const el = ref.current
    if (!el || !stream) return
    if (el.srcObject !== stream) el.srcObject = stream
    el.play().then(() => setBlocked(false)).catch(() => setBlocked(true))
  }, [stream])

  function expandir(e) {
    e.stopPropagation()
    const alvo = ref.current?.parentElement
    if (!alvo) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else alvo.requestFullscreen?.().catch(() => {})
  }

  function menu(e) {
    if (!onVolume) return
    e.preventDefault()
    onVolume({ x: e.clientX, y: e.clientY })
  }

  const anel = speaking ? 'is-speaking' : focused ? 'is-focused' : ''

  return (
    <div
      className={`tile tile--${variant} ${anel} ${self && stream ? 'is-live' : ''} ${kind === 'camera' ? 'is-camera' : ''} ${kind === 'camera' && self ? 'is-mirror' : ''}`}
      onClick={onFocus}
      onContextMenu={menu}
      role={onFocus ? 'button' : undefined}
      tabIndex={onFocus ? 0 : undefined}
      onKeyDown={e => onFocus && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus())}
      aria-label={stream ? `Transmissao de ${person.name}` : person.name}
    >
      <span className="tile-name">
        {person.name}{self ? ' (voce)' : ''}
      </span>

      {stream ? (
        <video ref={ref} autoPlay playsInline muted />
      ) : (
        <div className="tile-idle">
          <Avatar user={person} size={variant === 'spotlight' ? 'avatar-xl' : 'avatar-lg'} />
          {variant === 'spotlight' && <span className="muted">Nao esta transmitindo</span>}
        </div>
      )}

      {blocked && (
        <button
          className="tile-unblock"
          onClick={e => { e.stopPropagation(); ref.current?.play().then(() => setBlocked(false)).catch(() => {}) }}
        >
          Clique para exibir
        </button>
      )}

      {stream && variant === 'spotlight' && (
        <div className="tile-actions">
          <button className="tile-btn" onClick={expandir}>Tela cheia</button>
        </div>
      )}
    </div>
  )
}
