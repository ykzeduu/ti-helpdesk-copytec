// Cor derivada do nome: a mesma pessoa fica sempre com o mesmo tom.
const TONES = [
  ['#1e3a4d', '#7fd4ff'],
  ['#2b1e4d', '#c2a8ff'],
  ['#4d2a1e', '#ffb08f'],
  ['#1e4d3a', '#7fe8c0'],
  ['#4d1e35', '#ff9fc4'],
  ['#4d451e', '#ffdd80']
]

function toneFor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

export default function Avatar({ user, size = '' }) {
  const name = user?.name || '?'
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const [bg, fg] = toneFor(name)

  return (
    <div className={`avatar ${size}`} title={name} style={{ background: bg, color: fg, borderColor: bg }}>
      {initials}
    </div>
  )
}
