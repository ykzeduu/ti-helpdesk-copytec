// Um contexto de audio para toda a aplicacao. Criar um por stream estoura o
// limite do navegador e gasta CPU a toa.
let ctx = null

export function audioCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export const VOL_PADRAO = 1
export const VOL_MAX = 2
