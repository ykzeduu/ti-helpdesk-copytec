# Sinal

Compartilhamento de tela em salas de até 6 pessoas, com áudio. O vídeo vai direto
de um navegador para o outro por WebRTC — o servidor só serve a aplicação e faz a
sinalização, então o custo de banda no Render é praticamente zero.

## O que está pronto

- Entrada só com o nome: sem senha, sem e-mail, sem confirmação
- Criar sala com código de 8 caracteres (`H29FB231`), com ou sem senha
- Lista de salas ativas em tempo real e busca direta por código
- Compartilhar até 2 telas simultâneas por pessoa (monitores ou janelas diferentes)
- Câmera, com perfil próprio: 720p30 a 2,5 Mbps, independente das telas
- 1080p a 60 fps com bitrate que se ajusta ao número de espectadores
- Microfone com liga/desliga
- Volume por pessoa de 0 a 200%, no botão direito sobre qualquer quadro
- Som da transmissão sai apenas do telão; as miniaturas ficam sempre mudas
- Avatar de iniciais com cor derivada do nome

## Como rodar na sua máquina

**1. Banco no Neon.** O schema é aplicado sozinho quando o servidor sobe. A única
tabela é `rooms`.

**2. Variáveis de ambiente.**

```bash
cp server/.env.example server/.env
# preencha DATABASE_URL e JWT_SECRET (gere com: openssl rand -hex 32)
```

**3. Instale as dependências** (uma vez só, a partir da pasta `sinal`):

```bash
npm install --prefix server
npm install --prefix web
```

**4. Suba os dois processos** (em terminais separados, os dois a partir da pasta `sinal`):

```bash
npm run dev:server   # porta 3000
npm run dev:web      # porta 5173, com proxy para o 3000
```

O `.env` fica em `server/.env`, mas os comandos rodam da raiz — o `dotenv` acha o
arquivo porque o npm executa o script já dentro da pasta `server`.

Abra `http://localhost:5173`, digite um nome e pronto.

## Deploy no Render

O `render.yaml` já está pronto. Conecte o repositório, o Render lê ele sozinho e
preenche o `JWT_SECRET` automaticamente. Você só precisa colar a `DATABASE_URL` e as
três variáveis de TURN.

**Não use o plano gratuito.** Ele hiberna depois de 15 minutos parado e derruba a
conexão WebSocket, o que quebra a sala. O `render.yaml` já pede o plano Starter.

O front e o back rodam no mesmo serviço: o build gera `web/dist` e o Express serve
esses arquivos. Um serviço só, US$ 7/mês.

## TURN — não pule esta parte

Sem um servidor TURN, entre 15% e 25% das conexões não fecham. Acontece com CGNAT de
operadora (comum em fibra residencial no Brasil) e em rede corporativa. A sala abre, as
pessoas aparecem, e o vídeo simplesmente nunca começa.

O Render não expõe UDP, então não dá para rodar coturn lá. Use um serviço externo e
preencha `TURN_URL`, `TURN_USERNAME` e `TURN_CREDENTIAL`:

- **Cloudflare Calls** — franquia gratuita generosa, é por onde eu começaria
- **Metered** — 50 GB grátis por mês
- **Twilio Network Traversal** — pago por GB, mas muito estável

## O que a entrada por nome significa na prática

Qualquer pessoa pode digitar qualquer nome, inclusive o seu. Não existe conta, então
não existe como provar quem é quem. Para o seu caso — pessoas que já se conhecem
combinando um código de sala — isso não é problema.

O que continua protegendo o acesso é a **senha da sala**: ela é verificada no servidor
com bcrypt, tanto na entrada pela lista quanto por código direto. Salas com a opção
"mostrar na lista" desmarcada só são alcançáveis por quem tem o código.

Se um dia isso deixar de bastar, o caminho mais curto é voltar a ter contas de verdade
— o `session.js` já emite um id estável por pessoa, então seria só ancorar esse id numa
tabela `users`.

## Limites conhecidos

- **Máximo de 6 pessoas** (`MAX_PEERS`). É malha ponto a ponto: quem transmite envia
  uma cópia do vídeo para cada espectador, então o upload cresce junto com a sala. Com
  6 pessoas e uma transmissão a 7 Mbps são uns 35 Mbps de subida. Dá para subir o
  número, mas o gargalo deixa de ser banda e passa a ser processador: o navegador
  codifica o vídeo uma vez para cada conexão. Acima de 8, o caminho certo é um SFU
  (LiveKit auto-hospedado numa VPS, já que o Render não expõe UDP).
- **Captura de tela não funciona no navegador do celular.** É limitação do
  `getDisplayMedia`, não dá para contornar. Assistir funciona normalmente.
- **Salas se apagam sozinhas quando a última pessoa sai.** Nada de lixo acumulando no
  banco. Salas criadas mas nunca usadas somem após 30 minutos, por um faxineiro que
  roda a cada 5 minutos. Salas com gente dentro nunca são tocadas.

## Administração

Defina `ADMIN_PASSWORD` para habilitar dois botões no saguão: **Fechar** ao lado de
cada sala (derruba todo mundo e apaga o registro) e **Limpar banco** no topo (fecha
tudo e zera a tabela). Sem essa variável, as rotas respondem 503 e os botões não
funcionam — que é o comportamento certo para quem clonar o projeto.

A senha vive só no servidor. O navegador manda o que foi digitado e o servidor compara
em tempo constante; ela nunca aparece no código que vai para o cliente.

## Mapa dos arquivos

```
server/
  schema.sql          uma tabela só: rooms
  src/index.js        Express + Socket.IO, serve o web/dist em produção
  src/session.js      emite e valida a identidade (nome) em cookie assinado
  src/rooms.js        criar, listar e buscar salas
  src/signaling.js    autentica o socket e repassa ofertas/candidatos ICE
  src/presence.js     quem está em qual sala (memória, não banco)
  src/ice.js          monta a lista de STUN/TURN

web/
  src/lib/useMesh.js  o coração: negociação WebRTC, captura de tela, microfone
  src/pages/Enter.jsx tela de entrada, um campo só
  src/pages/Lobby.jsx criar sala, buscar por código, trocar de nome
  src/pages/Room.jsx  grade de transmissões e controles
```

Sobre o áudio: o elemento `<video>` é sempre mudo e o som passa por um nó de ganho do
Web Audio (`components/AudioOut.jsx`). Isso resolve duas coisas de uma vez — o navegador
não bloqueia o autoplay de mídia muda, e o ganho permite passar de 100%, o que o
elemento de vídeo sozinho não faz (o `volume` dele vai só até 1).

O arquivo que vale a pena ler com calma é `useMesh.js`. Ele usa o padrão de
*perfect negotiation*: quando os dois lados tentam renegociar ao mesmo tempo — o que
acontece toda vez que alguém liga o microfone no meio de um compartilhamento — um dos
dois desfaz a própria oferta e aceita a do outro. A escolha de quem cede é feita
comparando os IDs de socket, então é sempre determinística.
