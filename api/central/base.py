"""Peças comuns da API: o app.py carregado, o usuário da requisição e o JSON."""
import datetime
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from fastapi import HTTPException

from . import legado, shim_streamlit

L = legado.carregar()


@dataclass
class Usuario:
    usuario: str
    nome: str
    nivel: int


def ativar(usuario: Usuario | None):
    """Prepara o st.session_state que as funções do app.py esperam."""
    dados = {}
    if usuario:
        dados = {
            "usuario_logado": True,
            "usuario_id": usuario.usuario,
            "nome_usuario": usuario.nome,
            "nivel_acesso": usuario.nivel,
        }
    shim_streamlit.iniciar_requisicao(dados)
    atualizar_globais()


def atualizar_globais():
    """Variáveis que o app.py monta uma vez ao abrir; aqui valem por requisição."""
    L.df_historico = L.carregar_dados_banco()
    tipos = dict(L.carregar_tipos_aeronave())
    tipos.update(L.carregar_aeronaves_cadastradas())
    L.dict_tipos_aeronave.clear()
    L.dict_tipos_aeronave.update(tipos)


def presets():
    base = {categoria: list(valores) for categoria, valores in L.PRESETS.items()}
    lopa, config = L.carregar_presets_lopa()
    base["lopa"], base["config_lopa"] = list(lopa), list(config)
    for categoria, valores in L.carregar_opcoes_cadastradas().items():
        existentes = {v.casefold() for v in base.setdefault(categoria, [])}
        for valor in valores:
            if valor.casefold() not in existentes:
                base[categoria].append(valor)
                existentes.add(valor.casefold())
    return base


def exigir(condicao, mensagem="Seu perfil não tem acesso a esta ação.", status=403):
    if not condicao:
        raise HTTPException(status_code=status, detail=mensagem)


def exigir_nivel(usuario: Usuario, *niveis):
    exigir(usuario.nivel in niveis)


def para_json(valor):
    """Converte DataFrames, datas, NaN e numpy em JSON simples."""
    if isinstance(valor, pd.DataFrame):
        return [para_json(linha) for linha in valor.to_dict("records")]
    if isinstance(valor, pd.Series):
        return para_json(valor.to_dict())
    if isinstance(valor, dict):
        return {str(chave): para_json(item) for chave, item in valor.items()}
    if isinstance(valor, (list, tuple, set)):
        return [para_json(item) for item in valor]
    if isinstance(valor, (bytes, bytearray, memoryview)):
        return None
    if isinstance(valor, (pd.Timestamp, datetime.datetime, datetime.date)):
        if pd.isna(valor):
            return None
        return valor.isoformat()
    if isinstance(valor, np.generic):
        valor = valor.item()
    if isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor)):
        return None
    if valor is pd.NaT or valor is pd.NA:
        return None
    return valor


def mensagens():
    return shim_streamlit.mensagens_da_requisicao()
