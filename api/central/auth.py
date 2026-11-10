"""Login da Central Engenharia Gol.

A senha continua conferida na tabela `usuarios` (PBKDF2, como no Streamlit),
então ninguém precisa recadastrar senha. Depois disso:

- com FIREBASE_SERVICE_ACCOUNT definido, a API devolve um custom token do
  Firebase Auth; o site entra com signInWithCustomToken e manda o ID token
  do Firebase em cada chamada;
- sem ele (desenvolvimento e testes), a API assina o próprio token com
  SESSAO_SEGREDO.

Em toda chamada o nível de acesso é lido de novo da tabela `usuarios`: um
perfil alterado ou um usuário removido vale na hora.
"""
import base64
import hashlib
import hmac
import json
import os
import threading
import time

from fastapi import Header, HTTPException

from .base import L, Usuario

_FIREBASE = None
_trava = threading.Lock()
DURACAO_TOKEN_LOCAL = 12 * 3600


def firebase():
    """App do Firebase Admin, ou None quando a API roda sem Firebase."""
    global _FIREBASE
    credencial = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not credencial:
        return None
    with _trava:
        if _FIREBASE is None:
            import firebase_admin
            from firebase_admin import credentials
            _FIREBASE = firebase_admin.initialize_app(
                credentials.Certificate(json.loads(credencial))
            )
    return _FIREBASE


def _segredo():
    segredo = os.environ.get("SESSAO_SEGREDO")
    if not segredo:
        raise HTTPException(500, "Defina SESSAO_SEGREDO ou FIREBASE_SERVICE_ACCOUNT na API.")
    return segredo.encode()


def _b64(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).decode().rstrip("=")


def _de_b64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def token_local(usuario: str) -> str:
    corpo = _b64(json.dumps({"u": usuario, "exp": int(time.time()) + DURACAO_TOKEN_LOCAL}).encode())
    assinatura = _b64(hmac.new(_segredo(), corpo.encode(), hashlib.sha256).digest())
    return f"{corpo}.{assinatura}"


def ler_token_local(token: str) -> str | None:
    try:
        corpo, assinatura = token.split(".")
    except ValueError:
        return None
    esperado = _b64(hmac.new(_segredo(), corpo.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(esperado, assinatura):
        return None
    dados = json.loads(_de_b64(corpo))
    if dados.get("exp", 0) < time.time():
        return None
    return dados.get("u")


def uid_firebase(usuario: str) -> str:
    # O uid do Firebase não muda se o login mudar de maiúsculas/minúsculas.
    return "u_" + usuario.strip().casefold()


def entrar(usuario: str, senha: str) -> dict:
    registro = L.autenticar_usuario(usuario or "", senha or "")
    if not registro:
        raise HTTPException(401, "Usuário ou senha inválidos.")
    resposta = {
        "usuario": registro["usuario"],
        "nome": registro["nome"],
        "nivel": registro["nivel_acesso"],
    }
    app = firebase()
    if app:
        from firebase_admin import auth as fb_auth
        token = fb_auth.create_custom_token(
            uid_firebase(registro["usuario"]),
            {"usuario": registro["usuario"]},
            app=app,
        )
        resposta.update(modo="firebase", token=token.decode() if isinstance(token, bytes) else token)
    else:
        resposta.update(modo="local", token=token_local(registro["usuario"]))
    return resposta


_cache_usuarios: dict[str, tuple[float, Usuario | None]] = {}


def _usuario_do_banco(login: str) -> Usuario | None:
    agora = time.monotonic()
    guardado = _cache_usuarios.get(login.casefold())
    if guardado and agora - guardado[0] < 30:
        return guardado[1]
    with L.conectar_banco() as conn:
        registro = conn.execute(
            "SELECT usuario, nome, nivel_acesso FROM usuarios WHERE lower(usuario) = lower(?)",
            (login,),
        ).fetchone()
    usuario = (
        Usuario(registro["usuario"], registro["nome"], int(registro["nivel_acesso"]))
        if registro else None
    )
    _cache_usuarios[login.casefold()] = (agora, usuario)
    return usuario


def esquecer_usuario(login: str):
    _cache_usuarios.pop(safe_casefold(login), None)


def safe_casefold(texto):
    return (texto or "").strip().casefold()


def usuario_atual(authorization: str = Header(default="")) -> Usuario:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Entre de novo para continuar.")
    token = authorization[7:].strip()
    app = firebase()
    login = None
    if app:
        from firebase_admin import auth as fb_auth
        try:
            dados = fb_auth.verify_id_token(token, app=app)
            login = dados.get("usuario")
        except Exception:
            login = None
    else:
        login = ler_token_local(token)
    if not login:
        raise HTTPException(401, "Sua sessão expirou. Entre de novo.")
    usuario = _usuario_do_banco(login)
    if not usuario:
        raise HTTPException(401, "Usuário não encontrado. Entre de novo.")
    return usuario
