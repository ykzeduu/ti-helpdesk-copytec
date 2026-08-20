# Sistema de Chamados de TI - Help Desk

Projeto desenvolvido para a Atividade Extensionista II (Tecnologia Aplicada à
Inclusão Digital) do curso de Análise e Desenvolvimento de Sistemas - UNINTER.

Sistema de abertura e acompanhamento de chamados para a equipe de TI,
com controle de acesso por usuário e painel administrativo.

## Estrutura de dados

- **Usuário**: nome, ID funcional (gerado automaticamente em sequência —
  0001, 0002, 0003...), computador, setor, senha (armazenada com hash),
  telefone e login de rede. Pode ou não ter permissão de administrador.
  Toda conta nova começa com a senha padrão `1234` e o usuário é obrigado
  a trocá-la no primeiro login. O próprio usuário pode editar seus dados
  de perfil (nome, computador, setor, telefone) a qualquer momento.
- **Chamado**: nome, ID e setor do solicitante preenchidos automaticamente
  a partir do usuário logado; urgência, problema relatado e uma imagem
  opcional (print de erro, foto do equipamento etc.) são inseridos
  manualmente no momento da abertura. O administrador edita o chamado,
  registra uma observação técnica e finaliza com um dos três status:
  Pendente, Concluído ou Cancelado.
- **Admin**: área exclusiva para cadastrar novos usuários (e outros
  administradores) e resetar senhas (volta para `1234` e força nova
  troca no próximo login).
- **Histórico**: lista os chamados do usuário logado, com filtro por
  status (mostra Pendentes por padrão; Concluídos, Cancelados ou Todos
  ficam a um clique). Administradores visualizam e editam os chamados
  de todos os usuários com o mesmo filtro.

## Tecnologias

- Python 3 + Flask (back-end)
- SQLite (banco de dados)
- Sessão de login com senha criptografada (Werkzeug)
- HTML, CSS e JavaScript (front-end)

## Como executar

```bash
pip install -r requirements.txt
python app.py
```

Acesse `http://localhost:5000`. Na primeira execução, o sistema cria
automaticamente um administrador padrão (ID funcional `0001`) com login
de rede `admin` e senha `admin123`. Recomenda-se trocar essa senha e
cadastrar os administradores reais antes de usar em produção.

## Estrutura do projeto

```
ti-helpdesk/
├── app.py
├── requirements.txt
├── static/
│   └── style.css
└── templates/
    ├── base.html
    ├── login.html
    ├── trocar_senha.html
    ├── dashboard.html
    ├── perfil.html
    ├── form_chamado.html
    ├── editar_chamado.html
    ├── historico.html
    ├── usuarios.html
    └── form_usuario.html
```
