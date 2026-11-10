"""Rotas da área Ficha de pesagem: consulta, emissão, edição, aprovação e admin."""
import datetime

import pandas as pd
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from . import ficha
from .auth import esquecer_usuario, usuario_atual
from .base import L, Usuario, ativar, exigir, exigir_nivel, mensagens, para_json, presets

rotas = APIRouter(prefix="/api")
EMISSAO = (L.NIVEL_OPERACAO, L.NIVEL_ADMIN, L.NIVEL_ESPECIALISTA)
safe_str = L.safe_str
chave = L.normalizar_chave_ficha


def _ordenar(valores):
    return sorted(valores, key=lambda v: (L.safe_float(v), v))


def _linha(prefixo, pesagem, revisao):
    linha = L.carregar_linha_ficha(prefixo, pesagem, revisao)
    if linha is None:
        raise HTTPException(404, "A ficha não foi encontrada no banco de dados.")
    return linha.to_dict()


def _df_aero(prefixo):
    df = L.carregar_fichas_prefixo(prefixo)
    if not df.empty:
        df["Pesagem_num"] = pd.to_numeric(df["Pesagem"], errors="coerce").fillna(0)
        df["Revisao_num"] = pd.to_numeric(df["Revisao"], errors="coerce").fillna(0)
    return df


def _colunas(df):
    colunas = [c for c in df.columns if c not in ("Pesagem_num", "Revisao_num")]
    return colunas if colunas else list(L.df_historico.columns)


# --------------------------------------------------------------------------- #
# Consulta
@rotas.get("/fichas")
def listar_fichas(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    df = L.df_historico
    somente_ultimas = u.nivel == L.NIVEL_ENG_OPERACOES
    if somente_ultimas:
        df = L.ultimas_fichas(df)
    fichas = {}
    if not df.empty and {"Prefixo", "Pesagem", "Revisao"}.issubset(df.columns):
        for prefixo, pesagem, revisao in df[["Prefixo", "Pesagem", "Revisao"]].itertuples(index=False):
            if not safe_str(prefixo) or pd.isna(pesagem) or pd.isna(revisao):
                continue
            fichas.setdefault(prefixo, {}).setdefault(safe_str(pesagem), set()).add(safe_str(revisao))
    resposta = {
        "somente_ultimas": somente_ultimas,
        "aeronaves": len(fichas),
        "fichas_emitidas": int(len(df)),
        "arvore": {
            prefixo: [
                {"pesagem": p, "revisoes": _ordenar(revs)}
                for p, revs in sorted(pesagens.items(), key=lambda item: (L.safe_float(item[0]), item[0]))
            ]
            for prefixo, pesagens in sorted(fichas.items())
        },
    }
    if not somente_ultimas:
        aprovacao, correcao = L.listar_fichas_pendentes()
        resposta["aguardando_aprovacao"] = len(aprovacao)
        resposta["devolvidas"] = len(correcao)
    return resposta


@rotas.get("/fichas/{prefixo}/{pesagem}/{revisao}")
def ver_ficha(prefixo: str, pesagem: str, revisao: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    row = _linha(prefixo, pesagem, revisao)
    fluxo = L.buscar_fluxo_ficha(prefixo, pesagem, revisao)
    calculo = ficha.calcular_ficha(prefixo, row)
    return para_json({
        "prefixo": prefixo, "pesagem": chave(pesagem), "revisao": chave(revisao),
        "registro": row,
        "formulario": ficha.formulario_da_ficha(prefixo, row),
        "visualizacao": ficha.visualizacao(prefixo, row),
        "momento_flaps": ficha.momento_flaps_sugerido(prefixo, row),
        "boeing": L.pesagem_boeing(row),
        "info_aeronave": L.dict_tipos_aeronave.get(prefixo, {}),
        "fluxo": fluxo,
        "historico": L.carregar_historico_ficha(prefixo, pesagem, revisao)
        if u.nivel != L.NIVEL_ENG_OPERACOES else None,
        "campos_com_erro": L.carregar_campos_com_erro(prefixo, pesagem, revisao),
        "calculo": {k: v for k, v in calculo.items() if k != "dados_excel"},
        "pode_aprovar": (
            L.pode_emitir()
            and not L.carregar_campos_com_erro(prefixo, pesagem, revisao)
            and fluxo["gerador_usuario"] != u.usuario
        ),
        "eh_emissor": fluxo["gerador_usuario"] == u.usuario,
    })


def _arquivo(prefixo, pesagem, revisao, tipo, dados):
    nome = L.nome_arquivo_ficha(prefixo, pesagem, revisao)
    if tipo == "pdf":
        try:
            conteudo = L.gerar_pdf_por_template(dados, "exemplo_ficha.xlsx")
        except Exception as erro:
            raise HTTPException(500, f"Não foi possível gerar o PDF: {erro}") from erro
        return Response(conteudo, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{nome}.pdf"'})
    conteudo = L.gerar_excel_por_template(dados, "exemplo_ficha.xlsx")
    return Response(
        conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}.xlsx"'},
    )


@rotas.get("/fichas/{prefixo}/{pesagem}/{revisao}/arquivo/{tipo}")
def exportar_ficha(prefixo: str, pesagem: str, revisao: str, tipo: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    row = _linha(prefixo, pesagem, revisao)
    fluxo = L.buscar_fluxo_ficha(prefixo, pesagem, revisao)
    dados = ficha.calcular_ficha(prefixo, row)["dados_excel"]
    dados["assinatura_emissor"] = L.carregar_assinatura_usuario(fluxo["gerador_usuario"])
    dados["assinatura_aprovador"] = L.carregar_assinatura_usuario(fluxo["aprovador_usuario"])
    return _arquivo(prefixo, pesagem, revisao, tipo, dados)


# --------------------------------------------------------------------------- #
# Emissão
@rotas.get("/emissao/aeronaves")
def aeronaves_emissao(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, *EMISSAO)
    validas = sorted(
        str(k) for k in L.dict_tipos_aeronave if str(k) not in ("nan", "None", "")
    )
    devolvidas = [
        {
            "prefixo": f["chave"][0], "pesagem": f["chave"][1], "revisao": f["chave"][2],
            "erros": f["erros"],
        }
        for f in L.listar_fichas_devolvidas_usuario(u.usuario)
    ]
    return para_json({
        "aeronaves": validas,
        "devolvidas": devolvidas,
        "presets": presets(),
        "angulos": list(L.LEVEL_CORRECTION_VALUES),
        "valores_angulo": L.LEVEL_CORRECTION_VALUES,
        "campos_boeing": L.CAMPOS_BOEING_LB,
        "pode_emitir": L.pode_emitir(),
        "max_deducoes": L.MAX_DEDUCTIONS,
        "max_adicoes": L.MAX_ADDITIONS,
    })


@rotas.get("/emissao/contexto/{prefixo}")
def contexto_emissao(prefixo: str, u: Usuario = Depends(usuario_atual)):
    """Base para a Nova ficha: última ficha, numeração sugerida e momento do flap."""
    ativar(u)
    exigir_nivel(u, *EMISSAO)
    df = _df_aero(prefixo)
    info_aero = L.dict_tipos_aeronave.get(prefixo, {})
    resposta = {
        "prefixo": prefixo,
        "info_aeronave": info_aero,
        "fichas": [] if df.empty else [
            {"pesagem": int(p), "revisao": int(r)}
            for p, r in df[["Pesagem_num", "Revisao_num"]].itertuples(index=False)
        ],
    }
    if df.empty:
        resposta.update(ultima=None, base={}, formulario=ficha.formulario_da_ficha(prefixo, {}, False))
    else:
        df = df.sort_values(by=["Pesagem_num", "Revisao_num"])
        ultima = df.iloc[-1].to_dict()
        u_pes, u_rev = int(ultima["Pesagem_num"]), int(ultima["Revisao_num"])
        ultima.pop("Pesagem_num", None)
        ultima.pop("Revisao_num", None)
        resposta.update(
            ultima={"pesagem": u_pes, "revisao": u_rev},
            formulario=ficha.formulario_da_ficha(prefixo, ultima, False),
        )
        pendentes = L.carregar_campos_com_erro(prefixo, u_pes, u_rev)
        if pendentes:
            resposta["aviso_devolvida"] = (
                f"A revisão anterior foi devolvida ao emissor "
                f"({L.buscar_fluxo_ficha(prefixo, u_pes, u_rev)['gerador_nome']}). "
                "Campos a corrigir: " + "; ".join(c["descricao"] for c in pendentes)
            )
    resposta["momento_flaps"] = ficha.momento_flaps_sugerido(
        prefixo, ultima if not df.empty else {}
    )
    resposta["armnose"] = info_aero.get("armnose", 93.0)
    resposta["formulario_vazio"] = ficha.formulario_da_ficha(prefixo, {}, False)
    return para_json(resposta)


class PedidoFicha(BaseModel):
    prefixo: str
    pesagem: int
    revisao: int
    # nova | anterior | correcao | edicao
    modo: str = "nova"
    formulario: dict
    # Ficha que serviu de base (a última, a devolvida ou a editada).
    base_pesagem: int | None = None
    base_revisao: int | None = None
    confirmar_celulas: bool = False


def _montar(pedido: PedidoFicha):
    df = _df_aero(pedido.prefixo)
    base = {}
    if pedido.base_pesagem is not None and pedido.modo != "anterior":
        linha = L.carregar_linha_ficha(pedido.prefixo, pedido.base_pesagem, pedido.base_revisao or 0)
        if linha is not None:
            base = linha.to_dict()
    if pedido.modo in ("edicao", "correcao"):
        momento = ficha.momento_flaps_sugerido(pedido.prefixo, base)
    else:
        momento = ficha.momento_flaps_sugerido(pedido.prefixo, base)
    registro = ficha.montar_registro(
        pedido.prefixo, base, pedido.formulario, momento, _colunas(df),
    )
    registro["Pesagem"] = str(int(pedido.pesagem))
    registro["Revisao"] = str(int(pedido.revisao))
    # Na nova pesagem (número diferente da base), células iguais às da anterior pedem conferência.
    celulas_base = (
        base if pedido.modo == "nova" and base and int(pedido.pesagem) != int(pedido.base_pesagem or 0)
        else None
    )
    aviso = None
    if pedido.modo in ("nova", "anterior"):
        aviso = ficha.aviso_celulas(pedido.prefixo, registro, celulas_base, _colunas(df))
    return df, base, registro, aviso


@rotas.post("/emissao/calcular")
def calcular(pedido: PedidoFicha, u: Usuario = Depends(usuario_atual)):
    """Preview: o Weighing Report da ficha como ela será gravada."""
    ativar(u)
    exigir_nivel(u, *EMISSAO)
    df, _, registro, aviso = _montar(pedido)
    calculo = ficha.calcular_ficha(pedido.prefixo, registro)
    existe = (
        pedido.modo in ("nova", "anterior") and not df.empty
        and ((df["Pesagem_num"] == pedido.pesagem) & (df["Revisao_num"] == pedido.revisao)).any()
    )
    return para_json({
        "calculo": {k: v for k, v in calculo.items() if k != "dados_excel"},
        "aviso_celulas": aviso,
        "ja_existe": bool(existe),
    })


@rotas.post("/emissao/arquivo/{tipo}")
def arquivo_preview(tipo: str, pedido: PedidoFicha, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, *EMISSAO)
    _, _, registro, _ = _montar(pedido)
    dados = ficha.calcular_ficha(pedido.prefixo, registro)["dados_excel"]
    dados["assinatura_emissor"] = L.carregar_assinatura_usuario(u.usuario)
    dados["assinatura_aprovador"] = None
    return _arquivo(pedido.prefixo, pedido.pesagem, pedido.revisao, tipo, dados)


@rotas.post("/emissao/salvar")
def salvar_ficha(pedido: PedidoFicha, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_emitir(), "Seu perfil não pode gerar, alterar ou aprovar fichas.")
    df, _, registro, aviso = _montar(pedido)
    p, r, prefixo = pedido.pesagem, pedido.revisao, pedido.prefixo
    if aviso and not pedido.confirmar_celulas:
        raise HTTPException(409, f"As Células de Carga estão {aviso}. Confira e confirme antes de gerar.")

    if pedido.modo == "correcao":
        alteracoes = L.atualizar_ficha(prefixo, p, r, registro)
        exigir(alteracoes is not None, "Não foi possível localizar a ficha original para salvar a correção.", 404)
        L.registrar_ficha(prefixo, p, r, u.usuario, acao="Corrigida", alteracoes=alteracoes)
        L.limpar_campos_com_erro(prefixo, pedido.base_pesagem, pedido.base_revisao)
        return {"ok": True, "mensagem": f"Ficha {prefixo}, Pesagem {p}, Revisão {r} salva e enviada para aprovação."}

    if pedido.modo == "edicao":
        fluxo = L.buscar_fluxo_ficha(prefixo, p, r)
        alteracoes = L.atualizar_ficha(prefixo, p, r, registro)
        exigir(alteracoes is not None, "Não foi possível localizar a ficha selecionada para salvar as alterações.", 404)
        L.registrar_ficha(prefixo, p, r, u.usuario, acao="Alterada", alteracoes=alteracoes)
        if fluxo["gerador_usuario"] == u.usuario:
            L.limpar_campos_com_erro(prefixo, p, r)
        return {"ok": True, "mensagem": "Alterações salvas na mesma revisão e enviadas para aprovação."}

    existe = not df.empty and ((df["Pesagem_num"] == p) & (df["Revisao_num"] == r)).any()
    if existe or not L.inserir_ficha(registro):
        raise HTTPException(409, f"Já existe uma ficha para {prefixo}, Pesagem {p}, Revisão {r}.")
    L.registrar_ficha(
        prefixo, p, r, u.usuario,
        acao="Ficha anterior cadastrada" if pedido.modo == "anterior" else "Gerada",
    )
    return {"ok": True, "mensagem": f"Ficha {prefixo}, Pesagem {p}, Revisão {r} salva e enviada para aprovação."}


class NovaOpcao(BaseModel):
    categoria: str
    valor: str


@rotas.post("/emissao/opcoes")
def salvar_opcao(pedido: NovaOpcao, u: Usuario = Depends(usuario_atual)):
    """Grava uma opção digitada (motivo, local, item...) para aparecer na lista."""
    ativar(u)
    valor = safe_str(pedido.valor)
    if not L.pode_emitir() or not valor:
        return {"ok": False}
    if any(valor.casefold() == o.casefold() for o in presets().get(pedido.categoria, [])):
        return {"ok": True}
    with L.conectar_banco() as conn:
        conn.execute(
            """INSERT INTO opcoes_cadastradas (categoria, valor, cadastrado_por, cadastrado_em)
               VALUES (?, ?, ?, ?) ON CONFLICT (categoria, valor) DO NOTHING""",
            (pedido.categoria, valor, u.usuario, datetime.datetime.now(datetime.timezone.utc).isoformat()),
        )
    L.carregar_opcoes_cadastradas.clear()
    return {"ok": True, "mensagem": f"“{valor}” foi adicionado à lista de opções."}


# --------------------------------------------------------------------------- #
# Aprovação
def _resumo_pendente(item):
    return {
        "prefixo": item["chave"][0], "pesagem": item["chave"][1], "revisao": item["chave"][2],
        "erros": item.get("erros", []),
        "fluxo": item.get("fluxo", {}),
    }


@rotas.get("/aprovacao")
def pendentes(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, *EMISSAO)
    aprovacao, correcao = L.listar_fichas_pendentes()
    return para_json({
        "aprovacao": [_resumo_pendente(i) for i in aprovacao],
        "correcao": [_resumo_pendente(i) for i in correcao],
        "pode_emitir": L.pode_emitir(),
    })


class Devolucao(BaseModel):
    campos: dict[str, str]


@rotas.post("/fichas/{prefixo}/{pesagem}/{revisao}/devolver")
def devolver(prefixo: str, pesagem: str, revisao: str, pedido: Devolucao, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_emitir(), "Seu perfil não pode devolver fichas.")
    L.salvar_campos_com_erro(prefixo, pesagem, revisao, pedido.campos, u.usuario)
    return {"ok": True, "mensagem": (
        "Os campos marcados foram enviados ao emissor para alteração."
        if pedido.campos else "As sinalizações foram removidas."
    )}


@rotas.post("/fichas/{prefixo}/{pesagem}/{revisao}/aprovar")
def aprovar(prefixo: str, pesagem: str, revisao: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_emitir(), "Seu perfil não pode aprovar fichas.")
    exigir(not L.carregar_campos_com_erro(prefixo, pesagem, revisao),
           "A aprovação está bloqueada até o emissor corrigir os campos sinalizados.", 409)
    fluxo = L.buscar_fluxo_ficha(prefixo, pesagem, revisao)
    exigir(fluxo["gerador_usuario"] != u.usuario, "Quem emitiu a ficha não pode aprová-la.", 409)
    L.aprovar_ficha(prefixo, pesagem, revisao, u.usuario)
    return {"ok": True, "mensagem": f"Ficha aprovada: {prefixo} | Pesagem {pesagem} | Revisão {revisao}."}


@rotas.delete("/fichas/{prefixo}/{pesagem}/{revisao}")
def excluir(prefixo: str, pesagem: str, revisao: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_OPERACAO, L.NIVEL_ADMIN)
    removidas = L.excluir_ficha(prefixo, pesagem, revisao)
    exigir(removidas, "A ficha não foi encontrada no banco de dados.", 404)
    return {"ok": True, "mensagem": f"Ficha excluída. Registros removidos: {removidas}."}


# --------------------------------------------------------------------------- #
# Gerou e aprovou (só o usuário Engenharia)
@rotas.get("/gerou-aprovou")
def gerou_aprovou(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_preencher_gerou_aprovou(), "Esta tela é só do usuário Engenharia.")
    df = L.listar_fichas_gerou_aprovou()
    usuarios = L.listar_usuarios_assinaturas()
    return para_json({
        "fichas": [
            {
                "prefixo": linha["chave"][0], "pesagem": linha["chave"][1], "revisao": linha["chave"][2],
                "data": linha["Data da pesagem"], "gerado_por": linha["gerado_por"],
                "aprovado_por": linha["aprovado_por"],
            }
            for linha in df.to_dict("records")
        ],
        "usuarios": [{"usuario": x["usuario"], "nome": x["nome"]} for x in usuarios],
        "fora_aprovacao": len(L.carregar_fichas_fora_aprovacao()),
    })


class MudancaGA(BaseModel):
    prefixo: str
    pesagem: str
    revisao: str
    gerado_por: str | None
    aprovado_por: str | None


@rotas.post("/gerou-aprovou")
def salvar_gerou_aprovou(mudancas: list[MudancaGA], u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_preencher_gerou_aprovou(), "Esta tela é só do usuário Engenharia.")
    fluxos = L.carregar_fluxos_fichas()
    nomes = {x["usuario"]: x["nome"] for x in L.listar_usuarios_assinaturas()}
    rotulo = lambda login: (nomes.get(login) or f"{login} (sem cadastro)") if login else "—"
    final = {}
    for m in mudancas:
        k = (safe_str(m.prefixo), chave(m.pesagem), chave(m.revisao))
        antes = fluxos.get(k, {})
        antes_g, antes_a = antes.get("gerador_usuario") or None, antes.get("aprovador_usuario") or None
        novo_g, novo_a = m.gerado_por or None, m.aprovado_por or None
        alteracoes = [
            {"campo": campo, "antes": rotulo(a), "depois": rotulo(d)}
            for campo, a, d in (("Gerada por", antes_g, novo_g), ("Aprovada por", antes_a, novo_a))
            if a != d
        ]
        if alteracoes:
            final[k] = {"gerado_por": novo_g, "aprovado_por": novo_a, "alteracoes": alteracoes}
    if final:
        L.definir_gerou_aprovou(final, u.usuario)
    return {"ok": True, "mensagem": f"{len(final)} fichas atualizadas."}


# --------------------------------------------------------------------------- #
# Aeronaves
@rotas.get("/aeronaves")
def aeronaves(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_OPERACAO, L.NIVEL_ADMIN)
    cadastradas = L.carregar_aeronaves_cadastradas()
    com_ficha = set(L.carregar_prefixos_fichas())
    modelos = sorted({d["modelo"] for d in L.dict_tipos_aeronave.values() if d.get("modelo")})
    return para_json({
        "modelos": [{"modelo": m, "armnose": L.armnose_padrao_modelo(m)} for m in modelos],
        "cadastradas": [
            {"prefixo": p, **d, "removivel": p not in com_ficha} for p, d in cadastradas.items()
        ],
    })


class NovaAeronave(BaseModel):
    prefixo: str
    modelo: str
    serial: str = ""
    vrbl: str = ""
    line: str = ""
    armnose: float = 93.0


@rotas.post("/aeronaves")
def cadastrar_aeronave(pedido: NovaAeronave, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_OPERACAO, L.NIVEL_ADMIN)
    prefixo = L.normalizar_prefixo(pedido.prefixo)
    exigir(pedido.modelo, "Selecione o modelo da aeronave.", 400)
    exigir(prefixo, "Informe o prefixo.", 400)
    exigir(not any(L.normalizar_prefixo(k) == prefixo for k in L.dict_tipos_aeronave),
           f"A aeronave {prefixo} já está cadastrada.", 409)
    try:
        L.cadastrar_aeronave(
            prefixo, pedido.modelo, L.safe_identifier(pedido.serial), L.safe_identifier(pedido.vrbl),
            L.safe_identifier(pedido.line), pedido.armnose, u.usuario,
        )
    except IntegrityError:
        raise HTTPException(409, f"A aeronave {prefixo} já está cadastrada.")
    return {"ok": True, "mensagem": f"Aeronave {prefixo} cadastrada."}


@rotas.delete("/aeronaves/{prefixo}")
def remover_aeronave(prefixo: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_OPERACAO, L.NIVEL_ADMIN)
    exigir(prefixo not in set(L.carregar_prefixos_fichas()),
           "Só é possível remover aeronaves que ainda não têm ficha.", 409)
    L.remover_aeronave_cadastrada(prefixo)
    return {"ok": True, "mensagem": f"Aeronave {prefixo} removida."}


# --------------------------------------------------------------------------- #
# Usuários e assinaturas (Administrador)
@rotas.get("/usuarios")
def usuarios(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    return para_json({
        "usuarios": [
            {**x, "perfil": L.PERFIS.get(x["nivel_acesso"], "—"), "tem_assinatura": bool(x["atualizado_em"])}
            for x in L.listar_usuarios_assinaturas()
        ],
        "perfis": [{"nivel": n, "nome": nome} for n, nome in L.PERFIS.items()],
    })


class NovoUsuario(BaseModel):
    nome: str
    usuario: str
    senha: str
    nivel: int


@rotas.post("/usuarios")
def criar_usuario(pedido: NovoUsuario, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    exigir(pedido.nome.strip() and pedido.usuario.strip(), "Informe o nome e o usuário.", 400)
    exigir(pedido.senha, "A senha deve ter pelo menos 1 caracteres.", 400)
    exigir(pedido.nivel in L.PERFIS, "Perfil inválido.", 400)
    try:
        L.criar_usuario(pedido.nome, pedido.usuario, pedido.senha, pedido.nivel)
    except IntegrityError:
        raise HTTPException(409, "Esse nome de usuário já está cadastrado.")
    return {"ok": True, "mensagem": f"Login criado para {pedido.nome.strip()}."}


class NovoPerfil(BaseModel):
    nivel: int


@rotas.put("/usuarios/{login}/perfil")
def alterar_perfil(login: str, pedido: NovoPerfil, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    exigir(pedido.nivel in L.PERFIS, "Perfil inválido.", 400)
    exigir(not (login == u.usuario and pedido.nivel != L.NIVEL_ADMIN),
           "Você não pode remover o seu próprio acesso de Administrador.", 409)
    with L.conectar_banco() as conn:
        conn.execute("UPDATE usuarios SET nivel_acesso = ? WHERE usuario = ?", (pedido.nivel, login))
    esquecer_usuario(login)
    return {"ok": True, "mensagem": f"Perfil de {login} alterado para {L.PERFIS[pedido.nivel]}."}


class NovaSenha(BaseModel):
    senha: str


@rotas.put("/usuarios/{login}/senha")
def redefinir_senha(login: str, pedido: NovaSenha, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    exigir(pedido.senha, "Informe a nova senha.", 400)
    L.redefinir_senha(login, pedido.senha)
    return {"ok": True, "mensagem": f"Senha de {login} redefinida."}


@rotas.get("/assinaturas/{login}")
def ver_assinatura(login: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    imagem = L.carregar_assinatura_usuario(login)
    exigir(imagem, "Assinatura não cadastrada.", 404)
    return Response(imagem, media_type="image/png")


@rotas.put("/assinaturas/{login}")
async def salvar_assinatura(login: str, arquivo: UploadFile = File(...), u: Usuario = Depends(usuario_atual)):
    conteudo = await arquivo.read()
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    try:
        imagem = L.normalizar_imagem_assinatura(conteudo)
    except ValueError as erro:
        raise HTTPException(400, str(erro))
    L.salvar_assinatura_usuario(login, imagem)
    return {"ok": True, "mensagem": "Assinatura salva."}


@rotas.delete("/assinaturas/{login}")
def remover_assinatura(login: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir_nivel(u, L.NIVEL_ADMIN)
    L.remover_assinatura_usuario(login)
    return {"ok": True, "mensagem": "Assinatura removida."}
