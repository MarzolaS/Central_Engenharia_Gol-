"""API da Central Engenharia Gol (FastAPI).

Rodar localmente:
    DATABASE_URL=postgresql://... SESSAO_SEGREDO=... uvicorn central.main:app --reload
"""
import os
import traceback

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import auth
from .base import L, Usuario, ativar
from .shim_streamlit import StopException

app = FastAPI(title="Central Engenharia Gol", version="1.0")

origens = [o.strip() for o in os.environ.get("ORIGENS_PERMITIDAS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origens,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(PermissionError)
def erro_permissao(_req: Request, erro: PermissionError):
    return JSONResponse({"detail": str(erro)}, status_code=403)


@app.exception_handler(StopException)
def erro_parou(_req: Request, _erro):
    return JSONResponse({"detail": "A ação foi interrompida."}, status_code=400)


@app.exception_handler(ValueError)
def erro_valor(_req: Request, erro: ValueError):
    return JSONResponse({"detail": str(erro)}, status_code=400)


@app.exception_handler(Exception)
def erro_geral(_req: Request, erro: Exception):
    traceback.print_exc()
    L.st.cache_data.clear()
    return JSONResponse(
        {"detail": "Algo deu errado e nada foi perdido do que já estava salvo. "
                   f"Tente de novo; se continuar, envie este detalhe à Engenharia: "
                   f"{type(erro).__name__}: {erro}"},
        status_code=500,
    )


@app.get("/api/saude")
def saude():
    return {"ok": True}


class Login(BaseModel):
    usuario: str
    senha: str


@app.post("/api/login")
def login(pedido: Login):
    ativar(None)
    return auth.entrar(pedido.usuario, pedido.senha)


# Páginas e áreas do site: mesma regra de PAGINAS/GRUPOS_MENU/AREAS do app.py.
@app.get("/api/sessao")
def sessao(u: Usuario = Depends(auth.usuario_atual)):
    ativar(u)
    areas = []
    for area, dados in L.AREAS.items():
        grupos = []
        for grupo, paginas in L.GRUPOS_MENU.get(area, []):
            visiveis = [
                {"id": p, "titulo": L.PAGINAS[p][0]}
                for p in paginas if L.pagina_permitida(p, u.nivel)
            ]
            if visiveis:
                grupos.append({"titulo": grupo, "paginas": visiveis})
        if grupos:
            areas.append({"id": area, **{k: dados[k] for k in ("titulo", "descricao", "icone", "menu")}, "grupos": grupos})
    return {
        "usuario": u.usuario,
        "nome": u.nome,
        "nivel": u.nivel,
        "perfil": L.PERFIS.get(u.nivel, "—"),
        "areas": areas,
        "permissoes": {
            "emitir": L.pode_emitir(),
            "gerou_aprovou": L.pode_preencher_gerou_aprovou(),
            "editar_plantao": L.pode_editar_plantao(),
            "configurar_plantao": L.pode_configurar_plantao(),
            "configurar_time": L.pode_configurar_time(),
            "editar_pintura": L.pode_editar_pintura(),
            "excluir_pintura": L.pode_excluir_pintura(),
            "atualizar_srs": L.pode_atualizar_consulta_srs(),
        },
    }


from .rotas_ficha import rotas as rotas_ficha  # noqa: E402

app.include_router(rotas_ficha)

for nome in ("rotas_graficos", "rotas_agenda", "rotas_time", "rotas_pintura", "rotas_srs"):
    try:
        modulo = __import__(f"central.{nome}", fromlist=["rotas"])
    except ModuleNotFoundError as erro:
        if erro.name != f"central.{nome}":
            raise
        continue
    app.include_router(modulo.rotas)
