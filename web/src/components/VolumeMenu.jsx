import { useEffect, useRef } from 'react'
import { VOL_MAX } from '../lib/audio.js'

export default function VolumeMenu({ x, y, name, volume, onChange, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const fora = e => { if (!ref.current?.contains(e.target)) onClose() }
    const tecla = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [onClose])

  const pct = Math.round(volume * 100)

  return (
    <div
      ref={ref}
      className="volmenu"
      style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 150) }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="volmenu-name">{name}</span>
        <span className={`volmenu-pct ${pct > 100 ? 'is-hot' : ''}`}>{pct}%</span>
      </div>

      <input
        type="range"
        min={0}
        max={VOL_MAX * 100}
        step={5}
        value={pct}
        onChange={e => onChange(Number(e.target.value) / 100)}
        aria-label={`Volume de ${name}`}
        autoFocus
      />

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => onChange(0)}>Mudo</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onChange(1)}>100%</button>
        <button className="btn btn-ghost btn-sm" onClick={() => onChange(2)}>200%</button>
      </div>

      {pct > 100 && <p className="tiny" style={{ marginTop: 8 }}>Acima de 100% pode distorcer.</p>}
    </div>
  )
}
