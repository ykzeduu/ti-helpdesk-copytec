import { useEffect, useRef, useState } from 'react'

const FREIOS = {
  none: { texto: 'sem limitacao', classe: 'ok' },
  cpu: { texto: 'limitado pelo processador', classe: 'ruim' },
  bandwidth: { texto: 'limitado pela banda', classe: 'ruim' },
  other: { texto: 'limitado por outro motivo', classe: 'ruim' }
}

export default function StatsPanel({ coletar, onClose }) {
  const [linhas, setLinhas] = useState([])
  const anterior = useRef(new Map())

  useEffect(() => {
    let vivo = true

    const tick = async () => {
      const cru = await coletar()
      if (!vivo) return

      const calculadas = cru.map(l => {
        const chave = `${l.peerId}:${l.ssrc}`
        const antes = anterior.current.get(chave)
        let kbps = null

        if (antes && l.timestamp > antes.timestamp) {
          const segundos = (l.timestamp - antes.timestamp) / 1000
          kbps = Math.round(((l.bytesSent - antes.bytesSent) * 8) / segundos / 1000)
        }
        anterior.current.set(chave, { bytesSent: l.bytesSent, timestamp: l.timestamp })
        return { ...l, kbps }
      })

      setLinhas(calculadas)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => { vivo = false; clearInterval(id) }
  }, [coletar])

  return (
    <div className="stats">
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="eyebrow">Qualidade real do envio</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Fechar</button>
      </div>

      {linhas.length === 0 ? (
        <p className="tiny">Nada sendo enviado ainda. Comece a transmitir para ver os numeros.</p>
      ) : (
        <div className="stats-grid">
          {linhas.map(l => {
            const freio = FREIOS[l.freio] || FREIOS.other
            return (
              <div className="stats-item" key={`${l.peerId}:${l.ssrc}`}>
                <div className="stats-linha">
                  <span className="code">{l.largura || '?'}x{l.altura || '?'}</span>
                  <span>{l.fps ? `${Math.round(l.fps)} fps` : '-'}</span>
                  <span className="stats-kbps">{l.kbps != null ? `${(l.kbps / 1000).toFixed(1)} Mbps` : 'medindo...'}</span>
                </div>
                <div className="stats-linha tiny">
                  <span>{l.codec}</span>
                  <span>{l.encoder.includes('External') || /hardware|nvenc|qsv|vaapi/i.test(l.encoder) ? 'hardware' : 'software'}</span>
                  <span className={`stats-freio is-${freio.classe}`}>{freio.texto}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="tiny" style={{ marginTop: 10 }}>
        Uma linha por espectador. Se o freio disser processador, troque para H264 ou baixe
        os quadros. Se disser banda, o teto ja e a sua conexao.
      </p>
    </div>
  )
}
