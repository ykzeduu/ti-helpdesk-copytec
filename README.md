# Sistema de Chamados de TI - Help Desk

Projeto desenvolvido para a Atividade Extensionista II (Tecnologia Aplicada à
Inclusão Digital) do curso de Análise e Desenvolvimento de Sistemas - UNINTER.

Sistema de abertura e acompanhamento de chamados para a equipe de TI,
com controle de acesso por usuário e painel administrativo.

## Estrutura de dados

- **Usuário**: nome, ID funcional, computador, setor, senha (armazenada
  com hash), telefone e login de rede. Pode ou não ter permissão de
  administrador.
- **Chamado**: nome, ID e setor do solicitante preenchidos automaticamente
  a partir do usuário logado; urgência e problema relatado são inseridos
  manualmente no momento da abertura.
- **Admin**: área exclusiva para cadastrar novos usuários (e outros
  administradores).
- **Histórico**: lista os chamados do usuário logado. Administradores
  visualizam e podem concluir os chamados de todos os usuários.

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
automaticamente um administrador padrão:

- **Login de rede:** admin
- **Senha:** admin123

Recomenda-se cadastrar os usuários reais e trocar/remover esse acesso
padrão antes de usar em produção.

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
    ├── dashboard.html
    ├── form_chamado.html
    ├── historico.html
    ├── usuarios.html
    └── form_usuario.html
```
