import { useEffect, useRef } from 'react'
import { audioCtx } from '../lib/audio.js'

/**
 * Toca o audio de um stream com ganho ajustavel de 0 a 200%.
 * O elemento <audio> fica mudo de proposito: ele existe so porque o Chrome
 * nao entrega audio de WebRTC ao Web Audio sem um elemento de midia preso
 * ao stream. O som de verdade sai pelo no de ganho.
 */
export default function AudioOut({ stream, volume = 1, enabled = true }) {
  const elRef = useRef(null)
  const gainRef = useRef(null)
  const volRef = useRef(volume)
  volRef.current = volume

  useEffect(() => {
    if (!stream || !enabled) return

    const el = elRef.current
    if (el) {
      if (el.srcObject !== stream) el.srcObject = stream
      el.muted = true
      el.play().catch(() => {})
    }

    const ctx = audioCtx()
    if (!ctx) return

    let src, gain
    try {
      src = ctx.createMediaStreamSource(stream)
      gain = ctx.createGain()
      gain.gain.value = volRef.current
      src.connect(gain).connect(ctx.destination)
      gainRef.current = gain
    } catch {
      return
    }

    return () => {
      try { src.disconnect(); gain.disconnect() } catch { /* ja desconectado */ }
      gainRef.current = null
    }
  }, [stream, enabled])

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume
  }, [volume])

  if (!enabled) return null
  return <audio ref={elRef} />
}
