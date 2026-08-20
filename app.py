"""
Sistema de Chamados de TI - Help Desk
Atividade Extensionista II - UNINTER

Estrutura:
- Usuario: nome, ID funcional (gerado automaticamente em sequência, ex:
  0001, 0002...), computador, setor, senha (hash), telefone, login de rede
  e se é administrador. Toda conta nova começa com a senha padrão 1234 e
  é obrigada a trocá-la no primeiro login. O próprio usuário pode editar
  seus dados de perfil (exceto ID funcional e login de rede).
- Chamados: dados do usuário vêm automaticamente do login (nome, ID, setor,
  telefone); urgência, problema relatado e uma imagem opcional são
  inseridos manualmente. O administrador edita o chamado, escreve uma
  observação técnica e finaliza com um dos três status: Pendente,
  Concluído ou Cancelado.
- Admin: tela exclusiva para cadastrar usuários e resetar senhas (volta
  para 1234 e força troca no próximo login).
- Histórico: lista os chamados do usuário logado (admin vê todos e edita).
  Por padrão mostra apenas os chamados Pendentes; um filtro permite ver
  Concluídos ou Cancelados.
"""

from flask import Flask, render_template, request, redirect, url_for, flash, session
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from functools import wraps
import sqlite3
import os
import uuid

app = Flask(__name__)
app.secret_key = "ti-helpdesk-uninter-2026"

DB_PATH = os.path.join(os.path.dirname(__file__), "helpdesk.db")
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "static", "uploads")
EXTENSOES_PERMITIDAS = {"png", "jpg", "jpeg", "gif", "webp"}

SENHA_PADRAO = "1234"
STATUS_CHAMADO = ["Pendente", "Concluído", "Cancelado"]

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            id_funcional TEXT NOT NULL UNIQUE,
            computador TEXT,
            setor TEXT NOT NULL,
            senha_hash TEXT NOT NULL,
            senha_provisoria INTEGER NOT NULL DEFAULT 1,
            telefone TEXT,
            login_rede TEXT NOT NULL UNIQUE,
            is_admin INTEGER NOT NULL DEFAULT 0
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chamados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            id_funcional TEXT NOT NULL,
            setor TEXT NOT NULL,
            telefone TEXT,
            urgencia TEXT NOT NULL,
            problema TEXT NOT NULL,
            imagem TEXT,
            observacao_tecnica TEXT,
            status TEXT NOT NULL DEFAULT 'Pendente',
            data_abertura TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        )
    """)

    existe_admin = cur.execute("SELECT COUNT(*) FROM usuarios WHERE is_admin = 1").fetchone()[0]
    if existe_admin == 0:
        cur.execute("""
            INSERT INTO usuarios (nome, id_funcional, computador, setor, senha_hash, senha_provisoria, telefone, login_rede, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            "Administrador TI",
            proximo_id_funcional(cur),
            "TI-ADMIN-01",
            "Tecnologia da Informação",
            generate_password_hash("admin123"),
            0,
            "-",
            "admin",
        ))

    conn.commit()
    conn.close()


def proximo_id_funcional(cur):
    """Gera o próximo ID funcional em sequência: 0001, 0002, 0003..."""
    maior = cur.execute("SELECT id_funcional FROM usuarios ORDER BY id DESC LIMIT 1").fetchone()
    if maior is None:
        return "0001"
    try:
        proximo = int(maior["id_funcional"]) + 1
    except (ValueError, TypeError):
        proximo = cur.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0] + 1
    return str(proximo).zfill(4)


def extensao_permitida(nome_arquivo):
    return "." in nome_arquivo and nome_arquivo.rsplit(".", 1)[1].lower() in EXTENSOES_PERMITIDAS


def salvar_imagem(arquivo):
    """Salva a imagem enviada com um nome único e retorna o nome do arquivo salvo (ou None)."""
    if not arquivo or arquivo.filename == "":
        return None
    if not extensao_permitida(arquivo.filename):
        flash("Formato de imagem não suportado. Use png, jpg, jpeg, gif ou webp.")
        return None
    extensao = secure_filename(arquivo.filename).rsplit(".", 1)[1].lower()
    nome_unico = f"{uuid.uuid4().hex}.{extensao}"
    arquivo.save(os.path.join(UPLOAD_FOLDER, nome_unico))
    return nome_unico


def login_requerido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "usuario_id" not in session:
            flash("Faça login para continuar.")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


def admin_requerido(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            flash("Acesso restrito ao administrador.")
            return redirect(url_for("dashboard"))
        return f(*args, **kwargs)
    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        login_rede = request.form["login_rede"]
        senha = request.form["senha"]

        conn = get_conn()
        usuario = conn.execute(
            "SELECT * FROM usuarios WHERE login_rede = ?", (login_rede,)
        ).fetchone()
        conn.close()

        if usuario and check_password_hash(usuario["senha_hash"], senha):
            session["usuario_id"] = usuario["id"]
            session["nome"] = usuario["nome"]
            session["is_admin"] = bool(usuario["is_admin"])

            if usuario["senha_provisoria"]:
                session["troca_obrigatoria"] = True
                return redirect(url_for("trocar_senha"))

            return redirect(url_for("dashboard"))

        flash("Login de rede ou senha incorretos.")
    return render_template("login.html")


@app.route("/trocar-senha", methods=["GET", "POST"])
@login_requerido
def trocar_senha():
    obrigatoria = session.get("troca_obrigatoria", False)

    if request.method == "POST":
        senha_atual = request.form["senha_atual"]
        nova_senha = request.form["nova_senha"]
        confirmar_senha = request.form["confirmar_senha"]

        conn = get_conn()
        usuario = conn.execute(
            "SELECT * FROM usuarios WHERE id = ?", (session["usuario_id"],)
        ).fetchone()

        if not check_password_hash(usuario["senha_hash"], senha_atual):
            flash("Senha atual incorreta.")
        elif nova_senha != confirmar_senha:
            flash("A nova senha e a confirmação não coincidem.")
        elif len(nova_senha) < 4:
            flash("A nova senha deve ter pelo menos 4 caracteres.")
        elif nova_senha == SENHA_PADRAO:
            flash("Escolha uma senha diferente da senha padrão.")
        else:
            conn.execute(
                "UPDATE usuarios SET senha_hash = ?, senha_provisoria = 0 WHERE id = ?",
                (generate_password_hash(nova_senha), usuario["id"]),
            )
            conn.commit()
            conn.close()
            session.pop("troca_obrigatoria", None)
            flash("Senha alterada com sucesso!")
            return redirect(url_for("dashboard"))

        conn.close()

    return render_template("trocar_senha.html", obrigatoria=obrigatoria)


@app.route("/logout")
def logout():
    session.clear()
    flash("Você saiu do sistema.")
    return redirect(url_for("login"))


@app.route("/")
@login_requerido
def dashboard():
    conn = get_conn()
    if session["is_admin"]:
        abertos = conn.execute(
            "SELECT COUNT(*) FROM chamados WHERE status = 'Pendente'"
        ).fetchone()[0]
        total_usuarios = conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
        meus_chamados = conn.execute("SELECT COUNT(*) FROM chamados").fetchone()[0]
    else:
        abertos = conn.execute(
            "SELECT COUNT(*) FROM chamados WHERE status = 'Pendente' AND usuario_id = ?",
            (session["usuario_id"],)
        ).fetchone()[0]
        total_usuarios = None
        meus_chamados = conn.execute(
            "SELECT COUNT(*) FROM chamados WHERE usuario_id = ?", (session["usuario_id"],)
        ).fetchone()[0]
    conn.close()
    return render_template(
        "dashboard.html",
        abertos=abertos,
        total_usuarios=total_usuarios,
        meus_chamados=meus_chamados,
    )


@app.route("/chamados/novo", methods=["GET", "POST"])
@login_requerido
def novo_chamado():
    conn = get_conn()
    usuario = conn.execute(
        "SELECT * FROM usuarios WHERE id = ?", (session["usuario_id"],)
    ).fetchone()

    if request.method == "POST":
        urgencia = request.form["urgencia"]
        problema = request.form["problema"]
        imagem = salvar_imagem(request.files.get("imagem"))

        conn.execute("""
            INSERT INTO chamados (usuario_id, nome, id_funcional, setor, telefone, urgencia, problema, imagem)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            usuario["id"], usuario["nome"], usuario["id_funcional"],
            usuario["setor"], usuario["telefone"], urgencia, problema, imagem,
        ))
        conn.commit()
        conn.close()
        flash("Chamado aberto com sucesso!")
        return redirect(url_for("historico"))

    conn.close()
    return render_template("form_chamado.html", usuario=usuario)


@app.route("/historico")
@login_requerido
def historico():
    filtro = request.args.get("status", "Pendente")
    if filtro not in STATUS_CHAMADO and filtro != "Todos":
        filtro = "Pendente"

    conn = get_conn()
    if session["is_admin"]:
        if filtro == "Todos":
            chamados = conn.execute(
                "SELECT * FROM chamados ORDER BY data_abertura DESC"
            ).fetchall()
        else:
            chamados = conn.execute(
                "SELECT * FROM chamados WHERE status = ? ORDER BY data_abertura DESC",
                (filtro,)
            ).fetchall()
    else:
        if filtro == "Todos":
            chamados = conn.execute(
                "SELECT * FROM chamados WHERE usuario_id = ? ORDER BY data_abertura DESC",
                (session["usuario_id"],)
            ).fetchall()
        else:
            chamados = conn.execute(
                "SELECT * FROM chamados WHERE usuario_id = ? AND status = ? ORDER BY data_abertura DESC",
                (session["usuario_id"], filtro)
            ).fetchall()
    conn.close()
    return render_template(
        "historico.html",
        chamados=chamados,
        filtro=filtro,
        status_opcoes=STATUS_CHAMADO,
    )


@app.route("/chamados/editar/<int:id>", methods=["GET", "POST"])
@login_requerido
@admin_requerido
def editar_chamado(id):
    conn = get_conn()
    chamado = conn.execute("SELECT * FROM chamados WHERE id = ?", (id,)).fetchone()

    if chamado is None:
        conn.close()
        flash("Chamado não encontrado.")
        return redirect(url_for("historico"))

    if request.method == "POST":
        observacao_tecnica = request.form["observacao_tecnica"]
        status = request.form["status"]

        if status not in STATUS_CHAMADO:
            flash("Status inválido.")
        else:
            conn.execute(
                "UPDATE chamados SET observacao_tecnica = ?, status = ? WHERE id = ?",
                (observacao_tecnica, status, id),
            )
            conn.commit()
            conn.close()
            flash("Chamado atualizado com sucesso!")
            return redirect(url_for("historico"))

    conn.close()
    return render_template("editar_chamado.html", chamado=chamado, status_opcoes=STATUS_CHAMADO)


@app.route("/perfil", methods=["GET", "POST"])
@login_requerido
def perfil():
    conn = get_conn()
    usuario = conn.execute(
        "SELECT * FROM usuarios WHERE id = ?", (session["usuario_id"],)
    ).fetchone()

    if request.method == "POST":
        nome = request.form["nome"]
        computador = request.form["computador"]
        setor = request.form["setor"]
        telefone = request.form["telefone"]

        conn.execute(
            "UPDATE usuarios SET nome = ?, computador = ?, setor = ?, telefone = ? WHERE id = ?",
            (nome, computador, setor, telefone, usuario["id"]),
        )
        conn.commit()
        conn.close()
        session["nome"] = nome
        flash("Perfil atualizado com sucesso!")
        return redirect(url_for("perfil"))

    conn.close()
    return render_template("perfil.html", usuario=usuario)


@app.route("/admin/usuarios")
@login_requerido
@admin_requerido
def listar_usuarios():
    conn = get_conn()
    usuarios = conn.execute("SELECT * FROM usuarios ORDER BY nome").fetchall()
    conn.close()
    return render_template("usuarios.html", usuarios=usuarios)


@app.route("/admin/usuarios/novo", methods=["GET", "POST"])
@login_requerido
@admin_requerido
def novo_usuario():
    conn = get_conn()

    if request.method == "POST":
        nome = request.form["nome"]
        computador = request.form["computador"]
        setor = request.form["setor"]
        telefone = request.form["telefone"]
        login_rede = request.form["login_rede"]
        is_admin = 1 if request.form.get("is_admin") else 0

        cur = conn.cursor()
        id_funcional = proximo_id_funcional(cur)

        try:
            cur.execute("""
                INSERT INTO usuarios (nome, id_funcional, computador, setor, senha_hash, senha_provisoria, telefone, login_rede, is_admin)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
            """, (
                nome, id_funcional, computador, setor,
                generate_password_hash(SENHA_PADRAO), telefone, login_rede, is_admin,
            ))
            conn.commit()
            flash(f"Usuário cadastrado com sucesso! ID funcional: {id_funcional} — senha padrão: {SENHA_PADRAO}")
            return redirect(url_for("listar_usuarios"))
        except sqlite3.IntegrityError:
            flash("Já existe um usuário com esse login de rede.")
        finally:
            conn.close()

    proximo = proximo_id_funcional(conn.cursor())
    conn.close()
    return render_template("form_usuario.html", proximo_id=proximo)


@app.route("/admin/usuarios/resetar-senha/<int:id>")
@login_requerido
@admin_requerido
def resetar_senha(id):
    conn = get_conn()
    conn.execute(
        "UPDATE usuarios SET senha_hash = ?, senha_provisoria = 1 WHERE id = ?",
        (generate_password_hash(SENHA_PADRAO), id),
    )
    conn.commit()
    conn.close()
    flash(f"Senha resetada para o padrão ({SENHA_PADRAO}). O usuário deverá trocá-la no próximo login.")
    return redirect(url_for("listar_usuarios"))


@app.route("/admin/usuarios/alternar-admin/<int:id>")
@login_requerido
@admin_requerido
def alternar_admin(id):
    conn = get_conn()
    usuario = conn.execute("SELECT * FROM usuarios WHERE id = ?", (id,)).fetchone()

    if usuario is None:
        conn.close()
        flash("Usuário não encontrado.")
        return redirect(url_for("listar_usuarios"))

    if id == session["usuario_id"]:
        conn.close()
        flash("Você não pode alterar a própria permissão de administrador.")
        return redirect(url_for("listar_usuarios"))

    if usuario["login_rede"] == "admin":
        conn.close()
        flash("A conta de administrador inicial não pode perder a permissão de admin.")
        return redirect(url_for("listar_usuarios"))

    novo_valor = 0 if usuario["is_admin"] else 1
    conn.execute("UPDATE usuarios SET is_admin = ? WHERE id = ?", (novo_valor, id))
    conn.commit()
    conn.close()
    flash("Permissão de administrador do usuário atualizada com sucesso!")
    return redirect(url_for("listar_usuarios"))


@app.route("/admin/usuarios/excluir/<int:id>")
@login_requerido
@admin_requerido
def excluir_usuario(id):
    if id == session["usuario_id"]:
        flash("Você não pode excluir o próprio usuário logado.")
        return redirect(url_for("listar_usuarios"))

    conn = get_conn()
    usuario = conn.execute("SELECT * FROM usuarios WHERE id = ?", (id,)).fetchone()
    if usuario and usuario["login_rede"] == "admin":
        conn.close()
        flash("A conta de administrador inicial não pode ser excluída.")
        return redirect(url_for("listar_usuarios"))

    conn.execute("DELETE FROM usuarios WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    flash("Usuário removido.")
    return redirect(url_for("listar_usuarios"))


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
