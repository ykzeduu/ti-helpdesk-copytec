"""
Sistema de Chamados de TI - Help Desk
Atividade Extensionista II - UNINTER

Estrutura:
- Usuario: nome, ID funcional, computador, setor, senha (hash), telefone,
  login de rede, e se é administrador.
- Chamados: dados do usuário vêm automaticamente do login (nome, ID, setor,
  telefone); urgência e problema relatado são inseridos manualmente.
- Admin: tela exclusiva para administradores cadastrarem novos usuários.
- Histórico: lista os chamados do usuário logado (admin vê todos).
"""

from flask import Flask, render_template, request, redirect, url_for, flash, session
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import sqlite3
import os

app = Flask(__name__)
app.secret_key = "ti-helpdesk-uninter-2026"

DB_PATH = os.path.join(os.path.dirname(__file__), "helpdesk.db")


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
            status TEXT NOT NULL DEFAULT 'Aberto',
            data_abertura TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        )
    """)

    existe_admin = cur.execute("SELECT COUNT(*) FROM usuarios WHERE is_admin = 1").fetchone()[0]
    if existe_admin == 0:
        cur.execute("""
            INSERT INTO usuarios (nome, id_funcional, computador, setor, senha_hash, telefone, login_rede, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        """, (
            "Administrador TI",
            "ADM001",
            "TI-ADMIN-01",
            "Tecnologia da Informação",
            generate_password_hash("admin123"),
            "-",
            "admin",
        ))

    conn.commit()
    conn.close()


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
            return redirect(url_for("dashboard"))

        flash("Login de rede ou senha incorretos.")
    return render_template("login.html")


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
        abertos = conn.execute("SELECT COUNT(*) FROM chamados WHERE status = 'Aberto'").fetchone()[0]
        total_usuarios = conn.execute("SELECT COUNT(*) FROM usuarios").fetchone()[0]
        meus_chamados = conn.execute("SELECT COUNT(*) FROM chamados").fetchone()[0]
    else:
        abertos = conn.execute(
            "SELECT COUNT(*) FROM chamados WHERE status = 'Aberto' AND usuario_id = ?",
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
        conn.execute("""
            INSERT INTO chamados (usuario_id, nome, id_funcional, setor, telefone, urgencia, problema)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            usuario["id"], usuario["nome"], usuario["id_funcional"],
            usuario["setor"], usuario["telefone"], urgencia, problema,
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
    conn = get_conn()
    if session["is_admin"]:
        chamados = conn.execute(
            "SELECT * FROM chamados ORDER BY data_abertura DESC"
        ).fetchall()
    else:
        chamados = conn.execute(
            "SELECT * FROM chamados WHERE usuario_id = ? ORDER BY data_abertura DESC",
            (session["usuario_id"],)
        ).fetchall()
    conn.close()
    return render_template("historico.html", chamados=chamados)


@app.route("/chamados/concluir/<int:id>")
@login_requerido
@admin_requerido
def concluir_chamado(id):
    conn = get_conn()
    conn.execute("UPDATE chamados SET status = 'Concluído' WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    flash("Chamado marcado como concluído.")
    return redirect(url_for("historico"))


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
    if request.method == "POST":
        nome = request.form["nome"]
        id_funcional = request.form["id_funcional"]
        computador = request.form["computador"]
        setor = request.form["setor"]
        senha = request.form["senha"]
        telefone = request.form["telefone"]
        login_rede = request.form["login_rede"]
        is_admin = 1 if request.form.get("is_admin") else 0

        conn = get_conn()
        try:
            conn.execute("""
                INSERT INTO usuarios (nome, id_funcional, computador, setor, senha_hash, telefone, login_rede, is_admin)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                nome, id_funcional, computador, setor,
                generate_password_hash(senha), telefone, login_rede, is_admin,
            ))
            conn.commit()
            flash("Usuário cadastrado com sucesso!")
            return redirect(url_for("listar_usuarios"))
        except sqlite3.IntegrityError:
            flash("Já existe um usuário com esse ID funcional ou login de rede.")
        finally:
            conn.close()

    return render_template("form_usuario.html")


@app.route("/admin/usuarios/excluir/<int:id>")
@login_requerido
@admin_requerido
def excluir_usuario(id):
    if id == session["usuario_id"]:
        flash("Você não pode excluir o próprio usuário logado.")
        return redirect(url_for("listar_usuarios"))
    conn = get_conn()
    conn.execute("DELETE FROM usuarios WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    flash("Usuário removido.")
    return redirect(url_for("listar_usuarios"))


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
