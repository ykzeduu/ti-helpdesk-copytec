import { useEffect, useRef, useState } from 'react'
import { audioCtx } from './audio.js'

const LIMIAR = 0.022   // acima disso conta como fala
const SEGURA = 380     // ms que o anel fica aceso depois do som cair

function iguais(a, b) {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

// Recebe [{ id, stream }] e devolve o conjunto de ids falando agora.
export function useSpeaking(sources) {
  const [falando, setFalando] = useState(() => new Set())
  const ctxRef = useRef(null)
  const nosRef = useRef(new Map())

  useEffect(() => {
    if (sources.length === 0) {
      nosRef.current.forEach(n => n.source.disconnect())
      nosRef.current.clear()
      setFalando(new Set())
      return
    }

    const ctx = audioCtx()
    if (!ctx) return
    ctxRef.current = ctx

    const nos = nosRef.current
    const querido = new Set(sources.map(s => s.id))

    for (const [id, n] of nos) {
      if (!querido.has(id)) {
        n.source.disconnect()
        nos.delete(id)
      }
    }

    for (const { id, stream } of sources) {
      if (nos.has(id) || !stream || stream.getAudioTracks().length === 0) continue
      try {
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.4
        source.connect(analyser)
        nos.set(id, { source, analyser, dados: new Uint8Array(analyser.fftSize), ate: 0 })
      } catch {
        // navegador recusou a fonte; segue sem indicador para essa pessoa
      }
    }
  }, [sources])

  useEffect(() => {
    let raf
    const laco = () => {
      const agora = performance.now()
      const proximo = new Set()

      for (const [id, n] of nosRef.current) {
        n.analyser.getByteTimeDomainData(n.dados)
        let soma = 0
        for (let i = 0; i < n.dados.length; i++) {
          const v = (n.dados[i] - 128) / 128
          soma += v * v
        }
        if (Math.sqrt(soma / n.dados.length) > LIMIAR) n.ate = agora + SEGURA
        if (agora < n.ate) proximo.add(id)
      }

      setFalando(anterior => (iguais(anterior, proximo) ? anterior : proximo))
      raf = requestAnimationFrame(laco)
    }

    raf = requestAnimationFrame(laco)
    return () => cancelAnimationFrame(raf)
  }, [])

  return falando
}
