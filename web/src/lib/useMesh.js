import { useCallback, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { api } from '../api.js'

const MAX_SHARES = 2

export const PERFIS = {
  nitidez: {
    rotulo: 'Nitidez',
    dica: 'Texto, codigo, planilhas. Segura a resolucao e cede quadros.',
    contentHint: 'detail',
    degradationPreference: 'maintain-resolution',
    fps: 30,
    teto: 20_000_000
  },
  movimento: {
    rotulo: 'Movimento',
    dica: 'Jogos e video. Segura os 60 fps e cede resolucao.',
    contentHint: 'motion',
    degradationPreference: 'maintain-framerate',
    fps: 60,
    teto: 15_000_000
  }
}

// Camera nao precisa de bitrate de tela: 720p30 fluido resolve.
const PERFIL_CAMERA = {
  contentHint: 'motion',
  degradationPreference: 'balanced',
  fps: 30,
  teto: 2_500_000
}

// Cada espectador recebe uma copia propria do video. Repartimos o teto de
// upload entre eles para nao estourar a banda de quem transmite.
function bitrateFor(viewers, perfil) {
  const per = (perfil.teto * 3) / Math.max(1, viewers)
  return Math.round(Math.min(perfil.teto, Math.max(2_500_000, per)))
}

function tuneSender(sender, viewers, perfil) {
  if (!sender || sender.track?.kind !== 'video') return
  const params = sender.getParameters()
  if (!params.encodings || params.encodings.length === 0) params.encodings = [{}]
  params.encodings[0].maxBitrate = bitrateFor(viewers, perfil)
  params.encodings[0].maxFramerate = perfil.fps
  // Sem camadas temporais: numa sala pequena elas so consomem bits que
  // poderiam estar virando nitidez.
  params.encodings[0].scalabilityMode = 'L1T1'
  params.degradationPreference = perfil.degradationPreference

  sender.setParameters(params).catch(() => {
    // Navegador antigo pode recusar scalabilityMode. Tenta sem ele.
    const simples = sender.getParameters()
    if (!simples.encodings || simples.encodings.length === 0) simples.encodings = [{}]
    simples.encodings[0].maxBitrate = bitrateFor(viewers, perfil)
    simples.encodings[0].maxFramerate = perfil.fps
    simples.degradationPreference = perfil.degradationPreference
    sender.setParameters(simples).catch(() => {})
  })
}

/**
 * O WebRTC comeca transmitindo perto de 300 kbps e sobe devagar, o que deixa
 * os primeiros segundos borrados. Estes parametros mandam o encoder ja largar
 * em alta e nao descer abaixo de um piso decente.
 */
function turbinarSdp(sdp, { start = 8000, min = 3000, max = 25000 } = {}) {
  try {
    const linhas = sdp.split('\r\n')
    const saida = []
    let emVideo = false

    for (const linha of linhas) {
      if (linha.startsWith('m=')) {
        emVideo = linha.startsWith('m=video')
        saida.push(linha)
        continue
      }
      // b=AS precisa vir logo depois da linha c= da secao de video
      if (emVideo && linha.startsWith('c=')) {
        saida.push(linha)
        saida.push(`b=AS:${max}`)
        continue
      }
      if (emVideo && linha.startsWith('b=AS:')) continue
      if (emVideo && linha.startsWith('a=fmtp:') && !linha.includes('x-google-start-bitrate')) {
        saida.push(`${linha};x-google-start-bitrate=${start};x-google-min-bitrate=${min};x-google-max-bitrate=${max}`)
        continue
      }
      saida.push(linha)
    }
    return saida.join('\r\n')
  } catch {
    return sdp
  }
}

// VP9 comprime tela muito melhor que VP8 na mesma banda, especialmente texto.
function preferirVP9(pc) {
  const caps = RTCRtpSender.getCapabilities?.('video')
  if (!caps) return
  const peso = c => (/VP9/i.test(c.mimeType) ? 0 : /AV1/i.test(c.mimeType) ? 1 : /H264/i.test(c.mimeType) ? 2 : 3)
  const ordenados = [...caps.codecs].sort((a, b) => peso(a) - peso(b))
  for (const t of pc.getTransceivers()) {
    if (t.sender?.track?.kind === 'video' && t.setCodecPreferences) {
      try { t.setCodecPreferences(ordenados) } catch { /* navegador antigo */ }
    }
  }
}

export function useMesh({ code, password, onFatal }) {
  const [status, setStatus] = useState('connecting')
  const [room, setRoom] = useState(null)
  const [peers, setPeers] = useState([])
  const [remote, setRemote] = useState({})
  const [kinds, setKinds] = useState({})
  const [screens, setScreens] = useState([])
  const [micOn, setMicOn] = useState(false)
  const [micStream, setMicStream] = useState(null)
  const [notice, setNotice] = useState('')
  const [perfil, setPerfilState] = useState('nitidez')
  const [nativa, setNativa] = useState(true)

  const socketRef = useRef(null)
  const pcsRef = useRef(new Map())
  const selfRef = useRef(null)
  const iceRef = useRef([])
  const micRef = useRef(null)
  const screensRef = useRef(new Map())
  const perfilRef = useRef(PERFIS.nitidez)
  const fatalRef = useRef(onFatal)
  fatalRef.current = onFatal

  const send = useCallback((to, data) => {
    socketRef.current?.emit('signal', { to, data })
  }, [])

  const announceShares = useCallback(() => {
    const streams = [...screensRef.current.entries()].map(([id, item]) => ({ id, kind: item.kind }))
    socketRef.current?.emit('sharing', { streams })
  }, [])

  const retune = useCallback(() => {
    const viewers = pcsRef.current.size
    const daCamera = new Set()
    for (const item of screensRef.current.values()) {
      if (item.kind === 'camera') item.stream.getVideoTracks().forEach(t => daCamera.add(t.id))
    }
    for (const { pc } of pcsRef.current.values()) {
      pc.getSenders().forEach(sd => {
        if (!sd.track) return
        tuneSender(sd, viewers, daCamera.has(sd.track.id) ? PERFIL_CAMERA : perfilRef.current)
      })
    }
  }, [])

  // Trocar de perfil vale na hora para bitrate e prioridade; a resolucao da
  // captura so muda quando a pessoa reinicia o compartilhamento.
  const setPerfil = useCallback(chave => {
    const escolhido = PERFIS[chave]
    if (!escolhido) return
    perfilRef.current = escolhido
    setPerfilState(chave)
    for (const item of screensRef.current.values()) {
      if (item.kind === 'camera') continue
      const video = item.stream.getVideoTracks()[0]
      if (video) video.contentHint = escolhido.contentHint
    }
    retune()
  }, [retune])

  const dropPeer = useCallback(peerId => {
    const entry = pcsRef.current.get(peerId)
    if (entry) {
      entry.pc.onnegotiationneeded = null
      entry.pc.onicecandidate = null
      entry.pc.ontrack = null
      entry.pc.close()
      pcsRef.current.delete(peerId)
    }
    setPeers(prev => prev.filter(p => p.id !== peerId))
    setRemote(prev => {
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const createPeer = useCallback(peerId => {
    if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId)

    const pc = new RTCPeerConnection({ iceServers: iceRef.current, bundlePolicy: 'max-bundle' })
    const entry = { pc, polite: (selfRef.current || '') > peerId, makingOffer: false, ignoreOffer: false }
    pcsRef.current.set(peerId, entry)

    const viewers = pcsRef.current.size
    if (micRef.current) {
      micRef.current.getTracks().forEach(t => pc.addTrack(t, micRef.current))
    }
    for (const item of screensRef.current.values()) {
      const perfilDoItem = item.kind === 'camera' ? PERFIL_CAMERA : perfilRef.current
      item.stream.getTracks().forEach(t => tuneSender(pc.addTrack(t, item.stream), viewers, perfilDoItem))
    }
    preferirVP9(pc)

    pc.onnegotiationneeded = async () => {
      try {
        entry.makingOffer = true
        const oferta = await pc.createOffer()
        oferta.sdp = turbinarSdp(oferta.sdp)
        await pc.setLocalDescription(oferta)
        send(peerId, { description: pc.localDescription })
      } catch (err) {
        console.error('[mesh] falha ao criar oferta', err)
      } finally {
        entry.makingOffer = false
      }
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send(peerId, { candidate })
    }

    pc.ontrack = ({ streams }) => {
      const stream = streams[0]
      if (!stream) return
      setRemote(prev => ({
        ...prev,
        [peerId]: { ...(prev[peerId] || {}), [stream.id]: stream }
      }))
      stream.addEventListener('removetrack', () => {
        if (stream.getTracks().length > 0) return
        setRemote(prev => {
          const forPeer = { ...(prev[peerId] || {}) }
          delete forPeer[stream.id]
          return { ...prev, [peerId]: forPeer }
        })
      })
    }

    pc.onconnectionstatechange = () => {
      setPeers(prev => prev.map(p => (p.id === peerId ? { ...p, link: pc.connectionState } : p)))
      if (pc.connectionState === 'connected') retune()
      if (pc.connectionState === 'failed') pc.restartIce()
    }

    retune()
    return entry
  }, [send, retune])

  const handleSignal = useCallback(async ({ from, data }) => {
    const entry = pcsRef.current.get(from) || createPeer(from)
    const { pc } = entry

    try {
      if (data.description) {
        const offerCollision =
          data.description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable')

        entry.ignoreOffer = !entry.polite && offerCollision
        if (entry.ignoreOffer) return

        await pc.setRemoteDescription(data.description)
        if (data.description.type === 'offer') {
          const resposta = await pc.createAnswer()
          resposta.sdp = turbinarSdp(resposta.sdp)
          await pc.setLocalDescription(resposta)
          send(from, { description: pc.localDescription })
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate)
        } catch (err) {
          if (!entry.ignoreOffer) throw err
        }
      }
    } catch (err) {
      console.error('[mesh] erro de sinalizacao', err)
    }
  }, [createPeer, send])

  useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        const { iceServers } = await api.ice()
        if (!alive) return
        iceRef.current = iceServers
      } catch {
        iceRef.current = [{ urls: 'stun:stun.l.google.com:19302' }]
      }

      const socket = io({ withCredentials: true, transports: ['websocket', 'polling'] })
      socketRef.current = socket

      socket.on('connect_error', () => {
        if (alive) fatalRef.current?.('Nao consegui abrir a conexao. Entre de novo.')
      })

      socket.emit('join', { code, password }, res => {
        if (!alive) return
        if (res?.error) return fatalRef.current?.(res.error)

        selfRef.current = res.selfId
        setRoom(res.room)
        setStatus('joined')
        setPeers(res.peers.map(p => ({ ...p, link: 'new' })))
        res.peers.forEach(p => createPeer(p.id))
      })

      socket.on('peer-joined', peer => {
        setPeers(prev => (prev.some(p => p.id === peer.id) ? prev : [...prev, { ...peer, link: 'new' }]))
        createPeer(peer.id)
        announceShares()
      })

      socket.on('peer-left', ({ id }) => dropPeer(id))
      socket.on('room-closed', () => fatalRef.current?.('Esta sala foi fechada pelo administrador.'))
      socket.on('signal', handleSignal)

      socket.on('peer-sharing', ({ id, streams }) => {
        const streamIds = streams.map(s => s.id)
        setPeers(prev => prev.map(p => (p.id === id ? { ...p, sharing: streams } : p)))
        setKinds(prev => {
          const next = { ...prev }
          for (const s of streams) next[s.id] = s.kind
          return next
        })
        setRemote(prev => {
          const forPeer = prev[id]
          if (!forPeer) return prev
          const kept = {}
          for (const [streamId, stream] of Object.entries(forPeer)) {
            const isScreen = stream.getVideoTracks().length > 0
            if (!isScreen || streamIds.includes(streamId)) kept[streamId] = stream
          }
          return { ...prev, [id]: kept }
        })
      })
    })()

    return () => {
      alive = false
      socketRef.current?.emit('leave')
      socketRef.current?.disconnect()
      pcsRef.current.forEach(({ pc }) => pc.close())
      pcsRef.current.clear()
      micRef.current?.getTracks().forEach(t => t.stop())
      screensRef.current.forEach(item => item.stream.getTracks().forEach(t => t.stop()))
      screensRef.current.clear()
    }
  }, [code, password, createPeer, dropPeer, handleSignal, announceShares])

  // O que o encoder esta realmente fazendo. qualityLimitationReason e a
  // informacao mais util aqui: diz se o freio e CPU, banda ou nada.
  const coletarStats = useCallback(async () => {
    const linhas = []
    for (const [peerId, { pc }] of pcsRef.current) {
      let report
      try { report = await pc.getStats() } catch { continue }

      report.forEach(r => {
        if (r.type !== 'outbound-rtp' || r.kind !== 'video') return
        const codec = r.codecId ? report.get(r.codecId) : null
        linhas.push({
          peerId,
          ssrc: r.ssrc,
          bytesSent: r.bytesSent || 0,
          timestamp: r.timestamp,
          largura: r.frameWidth,
          altura: r.frameHeight,
          fps: r.framesPerSecond,
          codec: codec?.mimeType?.replace('video/', '') || '?',
          encoder: r.encoderImplementation || '?',
          freio: r.qualityLimitationReason || 'none'
        })
      })
    }
    return linhas
  }, [])

  const stopShare = useCallback(streamId => {
    const item = screensRef.current.get(streamId)
    if (!item) return
    const stream = item.stream

    const tracks = stream.getTracks()
    for (const { pc } of pcsRef.current.values()) {
      pc.getSenders()
        .filter(s => s.track && tracks.includes(s.track))
        .forEach(s => pc.removeTrack(s))
    }
    tracks.forEach(t => t.stop())
    screensRef.current.delete(streamId)
    setScreens(prev => prev.filter(s => s.id !== streamId))
    announceShares()
  }, [announceShares])

  // Coloca um stream no ar para todo mundo que ja esta conectado.
  const publicar = useCallback((stream, kind, label) => {
    const video = stream.getVideoTracks()[0]
    if (video) {
      video.contentHint = kind === 'camera' ? PERFIL_CAMERA.contentHint : perfilRef.current.contentHint
      video.addEventListener('ended', () => stopShare(stream.id))
    }

    screensRef.current.set(stream.id, { stream, kind, label })
    setScreens(prev => [...prev, { id: stream.id, stream, kind, label }])
    setNotice('')

    const viewers = pcsRef.current.size
    const perfilDoItem = kind === 'camera' ? PERFIL_CAMERA : perfilRef.current
    for (const { pc } of pcsRef.current.values()) {
      stream.getTracks().forEach(t => tuneSender(pc.addTrack(t, stream), viewers, perfilDoItem))
      preferirVP9(pc)
    }
    announceShares()
  }, [announceShares, stopShare])

  const startShare = useCallback(async () => {
    const telas = [...screensRef.current.values()].filter(i => i.kind === 'screen').length
    if (telas >= MAX_SHARES) {
      setNotice(`Voce ja esta transmitindo ${MAX_SHARES} telas. Pare uma para abrir outra.`)
      return
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNotice('Este navegador nao consegue capturar tela. Use Chrome, Edge ou Firefox no computador.')
      return
    }

    let stream
    try {
      const escolhido = perfilRef.current
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: nativa
          ? { frameRate: { ideal: escolhido.fps } }
          : { frameRate: { ideal: escolhido.fps }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        setNotice('Nao consegui capturar a tela. Verifique a permissao do navegador.')
      }
      return
    }

    publicar(stream, 'screen', stream.getVideoTracks()[0]?.label || 'Sua tela')

    if (stream.getAudioTracks().length === 0) {
      setNotice('Transmitindo sem som. Para levar o audio junto, marque "Compartilhar audio" na janela de selecao do navegador.')
    }
  }, [nativa, publicar])

  const startCamera = useCallback(async () => {
    const jaTem = [...screensRef.current.values()].some(i => i.kind === 'camera')
    if (jaTem) {
      setNotice('Sua camera ja esta no ar.')
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setNotice('Este navegador nao consegue acessar a camera.')
      return
    }

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'user'
        }
      })
    } catch (err) {
      setNotice(
        err.name === 'NotAllowedError'
          ? 'Permissao de camera negada. Libere no cadeado ao lado do endereco.'
          : err.name === 'NotFoundError'
            ? 'Nenhuma camera encontrada neste computador.'
            : 'Nao consegui abrir a camera.'
      )
      return
    }

    publicar(stream, 'camera', 'Sua camera')
  }, [publicar])

  const stopCamera = useCallback(() => {
    for (const [id, item] of screensRef.current) {
      if (item.kind === 'camera') stopShare(id)
    }
  }, [stopShare])

  const toggleMic = useCallback(async () => {
    if (micRef.current) {
      const track = micRef.current.getAudioTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        setMicOn(track.enabled)
      }
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      micRef.current = stream
      setMicStream(stream)
      setMicOn(true)
      for (const { pc } of pcsRef.current.values()) {
        stream.getTracks().forEach(t => pc.addTrack(t, stream))
      }
    } catch {
      setNotice('Nao consegui abrir o microfone. Verifique a permissao do navegador.')
    }
  }, [])

  return {
    status, room, peers, remote, screens, micOn, notice,
    setNotice, startShare, stopShare, toggleMic, startCamera, stopCamera, coletarStats,
    perfil, setPerfil, nativa, setNativa, micStream,
    capacity: room?.capacity || null, kinds,
    sharing: screens.some(s => s.kind === 'screen'),
    cameraOn: screens.some(s => s.kind === 'camera'),
    telas: screens.filter(s => s.kind === 'screen'),
    maxShares: MAX_SHARES
  }
}
