"""Gráficos da frota: os dados que a tela desenha (as contas são as do app.py)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .auth import usuario_atual
from . import shim_streamlit
from .base import L, Usuario, ativar, exigir_nivel, mensagens, para_json

rotas = APIRouter(prefix="/api")


@rotas.get("/graficos")
def graficos(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, *L.PAGINAS["graficos"][3])
    frota = L.montar_resumo_frota()
    validas = frota[(frota["Peso básico (kgf)"] > 0) & (frota["C.G. (% MAC)"] > 0)].copy()
    # A mediana é por modelo: filtrar modelos na tela não muda quem está fora do padrão.
    validas["Conferir"] = L.motivos_fora_do_padrao(validas) if not validas.empty else []
    modelos = [m for m in L.CORES_MODELOS if m in set(validas["Modelo"])]
    modelos += sorted(set(validas["Modelo"]) - set(modelos))
    historico = L.montar_historico_frota()
    variacao = L.variacao_desde_pesagem_anterior(historico) if not historico.empty else None
    linhas_frota = validas.rename(columns={
        "Aeronave": "aeronave", "Modelo": "modelo", "Pesagem": "pesagem",
        "Revisão": "revisao", "Data da pesagem": "data",
        "Peso básico (kgf)": "peso", "C.G. (% MAC)": "cg", "Conferir": "conferir",
    })
    return para_json({
        "frota": linhas_frota,
        "sem_celulas": int(len(frota) - len(validas)),
        "modelos": modelos,
        "cores": {m: L.CORES_MODELOS.get(m, "#8A8F98") for m in modelos},
        "historico": historico if not historico.empty else [],
        "variacao": variacao if variacao is not None else [],
        "peso_maximo_pouso": L.PESO_MAXIMO_POUSO,
        "limite_variacao_peso": L.LIMITE_VARIACAO_PESO,
        "limite_variacao_cg": L.LIMITE_VARIACAO_CG,
    })


@rotas.post("/graficos/atualizar")
def atualizar(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    L.invalidar_cache_fichas()
    return {"ok": True}


class PedidoTela(BaseModel):
    valores: dict = {}


@rotas.post("/graficos/tela")
def tela(pedido: PedidoTela, u: Usuario = Depends(usuario_atual)):
    """A tela de gráficos do app.py gravada como árvore de blocos.

    Assim os gráficos (Altair), as contas e os textos continuam exatamente os
    do app.py; o site só desenha a árvore e devolve os valores dos campos.
    """
    ativar(u)
    exigir_nivel(u, *L.PAGINAS["graficos"][3])
    with shim_streamlit.gravar_tela(pedido.valores) as t:
        try:
            L.tela_graficos()
        except shim_streamlit.StopException:
            pass
    return para_json({"blocos": t.arvore, "mensagens": mensagens()})
