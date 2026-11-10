"""Agenda: escala de plantão, férias e crachás (as regras são as do app.py)."""
import datetime
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from .auth import usuario_atual
from .base import L, Usuario, ativar, exigir, para_json

rotas = APIRouter(prefix="/api")


def _data(texto):
    try:
        return datetime.date.fromisoformat(str(texto)[:10])
    except ValueError:
        raise HTTPException(400, f"Data inválida: {texto}")


def _bloco_json(bloco):
    return {
        "colaborador": bloco["colaborador"],
        "inicio": bloco["inicio"].isoformat(),
        "fim": bloco["fim"].isoformat(),
        "datas": [d.isoformat() for d in bloco["datas"]],
        "rotulo": L.rotulo_bloco_plantao(bloco),
        "rotulos_dias": [L.formatar_dia_plantao(d) for d in bloco["datas"]],
    }


def _dialogo_cracha():
    meu = L.pessoa_do_usuario()
    if not meu or not L.cracha_pendente(meu):
        return None
    meus = L.carregar_crachas_plantao().get(meu, [])
    return {
        "pessoa": meu,
        "crachas": [
            {"base": b, "validade": v.isoformat(), "situacao": L.situacao_cracha(v)[0], "cor": L.situacao_cracha(v)[1]}
            for b, v in meus
        ],
        "vencidos": [b for b, v in meus if v < L.hoje_brasilia()],
    }


# --------------------------------------------------------------------------- #
# Escala de plantão
@rotas.get("/plantao")
def plantao(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    escala = L.carregar_escala_plantao()
    colaboradores = L.carregar_colaboradores_plantao()
    hoje = L.hoje_brasilia()
    if escala.empty:
        return para_json({"vazia": True, "colaboradores": colaboradores,
                          "configurar": L.pode_configurar_plantao(), "editar": L.pode_editar_plantao()})
    meses = sorted({(d.year, d.month) for d in escala["data"]})
    nomes = sorted(set(escala["colaborador"]), key=str.lower)
    return para_json({
        "vazia": False,
        "hoje": hoje,
        "faixa_html": L.faixa_hoje_plantao_html(escala),
        "meses": [{"ano": a, "mes": m, "titulo": f"{L.MESES_PLANTAO[m - 1]} de {a}"} for a, m in meses],
        "nomes": [{"nome": n, "cor": L.cor_colaborador_plantao(n, nomes)} for n in nomes],
        "colaboradores": colaboradores,
        "anos": sorted({d.year for d in escala["data"]}),
        "categorias": L.CATEGORIAS_PLANTAO,
        "cores_categorias": L.CORES_CATEGORIAS_PLANTAO,
        "motivos": L.MOTIVOS_TROCA_PLANTAO,
        "editar": L.pode_editar_plantao(),
        "configurar": L.pode_configurar_plantao(),
        "dialogo_cracha": _dialogo_cracha(),
        "bases_cracha": L.BASES_CRACHA,
        "inicio_escala": escala["data"].min(),
        "fim_escala": escala["data"].max(),
        "categoria_por_dia": {d.isoformat(): int(c) for d, c in zip(escala["data"], escala["categoria"])},
    })


@rotas.get("/plantao/mes")
def plantao_mes(ano: int, mes: int, visao: str = "Mês", destaque: str | None = None,
                u: Usuario = Depends(usuario_atual)):
    ativar(u)
    escala = L.carregar_escala_plantao()
    if escala.empty:
        return {"html": ""}
    destaque = destaque or None
    if visao == "Agenda":
        html = L.agenda_plantao_html(escala, ano, mes, destaque)
    else:
        html = (
            L.ferias_do_mes_html(ano, mes, set(escala["colaborador"]))
            + L.calendario_plantao_html(escala, ano, mes, destaque, L.dias_de_ferias_plantao())
        )
    return {"html": html}


@rotas.get("/plantao/excel")
def plantao_excel(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    escala = L.carregar_escala_plantao()
    nome = f"Escala_plantao_{L.hoje_brasilia():%Y%m%d}.xlsx"
    return Response(
        L.escala_para_excel(escala),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@rotas.get("/plantao/blocos")
def plantao_blocos(passados: bool = False, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    escala = L.carregar_escala_plantao()
    hoje = L.hoje_brasilia()
    colaboradores = L.carregar_colaboradores_plantao()
    blocos = [b for b in L.blocos_plantao(escala) if passados or b["fim"] >= hoje]
    return {
        "blocos": [_bloco_json(b) for b in blocos],
        "indice_padrao": next((i for i, b in enumerate(blocos) if b["fim"] >= hoje), 0),
        "ativos": sorted([n for n, a in colaboradores.items() if a], key=str.lower),
    }


class Troca(BaseModel):
    mudancas: list[tuple[str, str]]
    motivo: str = ""
    observacao: str = ""
    envolvidos: list[str] = []


@rotas.post("/plantao/simular")
def plantao_simular(troca: Troca, u: Usuario = Depends(usuario_atual)):
    """'Como fica' e os avisos de intervalo curto, antes de confirmar."""
    ativar(u)
    escala = L.carregar_escala_plantao()
    mudancas = [(_data(d), novo) for d, novo in troca.mudancas]
    por_data = dict(zip(escala["data"], escala["colaborador"]))
    simulada = escala.copy()
    novos = dict(mudancas)
    simulada["colaborador"] = [novos.get(d, c) for d, c in zip(simulada["data"], simulada["colaborador"])]
    return {
        "como_fica": [
            {"dia": L.formatar_dia_plantao(d), "antes": por_data.get(d, "—"), "depois": novo}
            for d, novo in sorted(mudancas)
        ],
        "avisos": L.avisos_intervalo_plantao(simulada, set(troca.envolvidos), novos),
    }


@rotas.post("/plantao/trocar")
def plantao_trocar(troca: Troca, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(troca.mudancas, "Escolha os dias e quem assume.", 400)
    texto = troca.motivo + (f" — {troca.observacao.strip()}" if troca.observacao.strip() else "")
    L.aplicar_trocas_plantao([(_data(d), n) for d, n in troca.mudancas], texto, u.usuario)
    return {"ok": True, "mensagem": f"Troca registrada: {len(troca.mudancas)} dia(s) alterado(s)."}


@rotas.get("/plantao/totais")
def plantao_totais(ano: int, so_passado: bool = False, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    escala = L.carregar_escala_plantao()
    totais = L.totais_plantao(
        escala, L.carregar_colaboradores_plantao(), ano, L.hoje_brasilia() if so_passado else None,
    )
    return para_json({
        "colunas": list(totais.columns),
        "linhas": totais.to_dict("records") if not totais.empty else [],
        "rotulo_intervalos": L.ROTULO_INTERVALOS_CURTOS,
        "intervalo_minimo": L.INTERVALO_MINIMO_PLANTAO,
    })


@rotas.get("/plantao/historico")
def plantao_historico(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    historico = L.carregar_historico_plantao()
    return para_json([
        {
            "quando": L.formatar_data_hora_brasilia(linha["registrado_em"]),
            "acao": linha["acao"],
            "dia": L.formatar_dia_plantao(linha["data"], com_ano=True)
            if isinstance(linha["data"], datetime.date) else "—",
            "antes": linha["antes"] or "", "depois": linha["depois"] or "",
            "motivo": linha["motivo"] or "", "por": linha["nome"] or "",
        }
        for linha in historico.to_dict("records")
    ])


class Categoria(BaseModel):
    data: str
    categoria: int


@rotas.post("/plantao/categoria")
def plantao_categoria(pedido: Categoria, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    data = _data(pedido.data)
    escala = L.carregar_escala_plantao()
    exigir(data in set(escala["data"]), "Esse dia não está na escala.", 400)
    exigir(pedido.categoria in L.CATEGORIAS_PLANTAO, "Categoria inválida.", 400)
    mudou = L.alterar_categoria_plantao(data, pedido.categoria, u.usuario)
    return {"ok": True, "mensagem": (
        f"{L.formatar_dia_plantao(data, com_ano=True)} agora é "
        f"{L.CATEGORIAS_PLANTAO[pedido.categoria].lower()}." if mudou else "Nada mudou."
    )}


class Colaborador(BaseModel):
    nome: str
    ativo: bool = True


@rotas.post("/plantao/colaboradores")
def plantao_colaborador(pedido: Colaborador, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    nome = pedido.nome.strip()
    exigir(nome, "Informe o nome.", 400)
    L.salvar_colaborador_plantao(nome, pedido.ativo, u.usuario)
    return {"ok": True, "mensagem": f"{nome} {'incluído na' if pedido.ativo else 'fora da'} escala."}


@rotas.get("/plantao/config")
def plantao_config(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    exigir(L.pode_configurar_plantao(), "Só o usuário engenharia configura a escala de plantão.")
    colaboradores = L.carregar_colaboradores_plantao()
    ativos = [n for n, a in colaboradores.items() if a]
    logins = L.carregar_logins_site()
    manual = L.carregar_vinculos_plantao()
    return {
        "emails": {n: L.carregar_emails_plantao().get(n, "") for n in colaboradores},
        "logins": [{"usuario": k, "nome": v} for k, v in logins.items()],
        "vinculos": [
            {
                "colaborador": nome,
                "manual": manual.get(nome),
                "achado": L.login_do_colaborador(nome, ativos),
                "achado_nome": logins.get(L.login_do_colaborador(nome, ativos) or "", L.login_do_colaborador(nome, ativos)),
            }
            for nome in ativos
        ],
    }


class Emails(BaseModel):
    emails: dict[str, str] = {}
    lista: str = ""


@rotas.post("/plantao/emails")
def plantao_emails(pedido: Emails, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    colaboradores = L.carregar_colaboradores_plantao()
    emails = L.carregar_emails_plantao()
    if pedido.lista.strip():
        achados = L.associar_emails_plantao(pedido.lista, list(colaboradores))
        exigir(achados, "Nenhum nome da escala foi encontrado na lista.", 400)
        L.salvar_emails_plantao({**emails, **achados})
        faltando = [n for n in colaboradores if n not in achados and not emails.get(n)]
        return {"ok": True, "mensagem": f"{len(achados)} e-mail(s) preenchido(s)."
                + (f" Sem e-mail: {', '.join(faltando)}." if faltando else "")}
    invalidos = [n for n, e in pedido.emails.items() if e.strip() and "@" not in e]
    exigir(not invalidos, f"E-mail inválido para {', '.join(invalidos)}.", 400)
    L.salvar_emails_plantao(pedido.emails)
    return {"ok": True, "mensagem": "E-mails salvos."}


class Logins(BaseModel):
    ligacoes: dict[str, str | None]


@rotas.post("/plantao/logins")
def plantao_logins(pedido: Logins, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    L.salvar_logins_plantao({k: (v or None) for k, v in pedido.ligacoes.items()})
    return {"ok": True, "mensagem": "Logins salvos."}


class _Arquivo(io.BytesIO):
    def __init__(self, conteudo, nome):
        super().__init__(conteudo)
        self.name = nome


@rotas.post("/plantao/importar")
async def plantao_importar(confirmar: bool = False, arquivo: UploadFile = File(...),
                           u: Usuario = Depends(usuario_atual)):
    conteudo = await arquivo.read()
    ativar(u)
    exigir(L.pode_configurar_plantao(), "Só o usuário engenharia configura a escala de plantão.")
    try:
        nova, avisos = L.ler_planilha_plantao(_Arquivo(conteudo, arquivo.filename or "escala.csv"))
    except Exception as erro:
        raise HTTPException(400, f"Não consegui ler a planilha: {erro}")
    if confirmar:
        L.importar_escala_plantao(nova, u.usuario)
        return {"ok": True, "mensagem": f"Escala importada: {len(nova)} dias."}
    escala = L.carregar_escala_plantao()
    existentes = dict(zip(escala["data"], escala["colaborador"]))
    substituidos = [d for d in nova["data"] if d in existentes]
    diferentes = [d for d, c in zip(nova["data"], nova["colaborador"]) if d in existentes and existentes[d] != c]
    ajustes = int((nova["escalado_original"].notna() | nova["motivo"].notna()).sum())
    return para_json({
        "avisos": avisos,
        "dias": len(nova),
        "de": f"{nova['data'].min():%d/%m/%Y}",
        "ate": f"{nova['data'].max():%d/%m/%Y}",
        "colaboradores": int(nova["colaborador"].nunique()),
        "resumo": f"{ajustes} dia(s) com ajuste (coluna \"Antes do ajuste\"). " + (
            f"{len(substituidos)} dia(s) já estão no site e serão substituídos"
            + (f", {len(diferentes)} deles com outra pessoa." if diferentes else ".")
            if substituidos else "Nenhum desses dias está no site ainda."
        ),
        "linhas": [
            {
                "data": L.formatar_dia_plantao(d, com_ano=True), "colaborador": c,
                "categoria": L.CATEGORIAS_PLANTAO[int(cat)], "antes": a or "", "motivo": m or "",
            }
            for d, c, cat, a, m in zip(nova["data"], nova["colaborador"], nova["categoria"],
                                       nova["escalado_original"], nova["motivo"])
        ],
    })


# --------------------------------------------------------------------------- #
# Férias e crachás
def _pessoas_e_cores():
    todos = L.carregar_colaboradores_plantao()
    colaboradores = [n for n, a in todos.items() if a]
    ferias = L.carregar_ferias_plantao()
    crachas = L.carregar_crachas_plantao()
    escala = L.carregar_escala_plantao()
    pessoas = sorted(
        set(colaboradores) | set(ferias["colaborador"])
        | {p for p, lista in crachas.items() if lista and p not in todos},
        key=str.lower,
    )
    cores = set(escala["colaborador"]) or set(colaboradores)
    return pessoas, cores, ferias, crachas, escala


@rotas.get("/ferias")
def ferias(u: Usuario = Depends(usuario_atual)):
    ativar(u)
    pessoas, cores, ferias_df, crachas, escala = _pessoas_e_cores()
    hoje = L.hoje_brasilia()
    pessoa = L.pessoa_do_usuario()
    conflitos = L.conflitos_ferias_plantao(escala, ferias_df)
    meus_crachas = crachas.get(pessoa, []) if pessoa else []
    minhas = ferias_df[ferias_df["colaborador"] == pessoa] if pessoa else ferias_df.iloc[0:0]
    excluiveis = [
        l for l in ferias_df.itertuples(index=False)
        if l.fim >= hoje and L.pode_excluir_ferias_de(l.colaborador)
    ]
    return para_json({
        "hoje": hoje,
        "pessoa": pessoa,
        "pode_configurar": L.pode_configurar_plantao(),
        "conflitos": [
            {
                "nome": nome, "inicio": L.formatar_data_br(inicio), "fim": L.formatar_data_br(fim),
                "dias": [L.formatar_dia_plantao(d, com_ano=True) for d in dias],
            }
            for nome, inicio, fim, dias in conflitos
        ],
        "anos": sorted({2026, 2027, hoje.year} | {d.year for d in ferias_df["inicio"]}),
        "crachas_html": L.crachas_html(crachas, pessoas, cores),
        "meus_crachas": [
            {"base": b, "validade": v, "data": L.formatar_data_br(v),
             "situacao": L.situacao_cracha(v)[0], "cor": L.situacao_cracha(v)[1]}
            for b, v in meus_crachas
        ],
        "minhas_ferias": [
            {"id": int(l.id), "texto": L.formatar_periodo_ferias(l.inicio, l.fim), "passou": l.fim < hoje}
            for l in minhas.itertuples(index=False)
        ],
        "excluiveis": [
            {"id": int(l.id), "colaborador": l.colaborador, "texto": L.formatar_periodo_ferias(l.inicio, l.fim)}
            for l in excluiveis
        ],
        "bases_cracha": L.BASES_CRACHA,
        "ano_ferias_pedidas": L.ANO_FERIAS_PEDIDAS,
        "dialogo_ferias": (
            {
                "pessoa": pessoa,
                "ja_marcadas": [
                    L.formatar_periodo_ferias(l.inicio, l.fim)
                    for l in minhas.itertuples(index=False) if l.fim >= hoje
                ],
            }
            if pessoa and L.ferias_pendentes(pessoa) else None
        ),
    })


@rotas.get("/ferias/html")
def ferias_html(visao: str = "Mês", ano: int | None = None, mes: int | None = None,
                u: Usuario = Depends(usuario_atual)):
    ativar(u)
    pessoas, cores, ferias_df, _, _ = _pessoas_e_cores()
    hoje = L.hoje_brasilia()
    ano = ano or hoje.year
    mes = mes or hoje.month
    if visao == "Lista":
        return {"html": L.lista_ferias_html(ferias_df, cores)}
    if visao == "Ano":
        return {"html": L.linha_do_tempo_ferias_html(ferias_df, pessoas, cores, ano)}
    return {"html": L.calendario_ferias_html(ferias_df, ano, mes, cores),
            "titulo": f"{L.MESES_PLANTAO[mes - 1]} de {ano}"}


class Periodos(BaseModel):
    periodos: list[tuple[str, str]]


@rotas.post("/ferias")
def marcar_ferias(pedido: Periodos, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    pessoa = L.pessoa_do_usuario()
    exigir(pessoa, "Esta é a conta geral da Engenharia. Entre com o seu login para marcar férias.")
    periodos = [(_data(a), _data(b)) for a, b in pedido.periodos]
    exigir(periodos, "Escolha pelo menos um período.", 400)
    erros = L.validar_periodos_ferias(pessoa, periodos)
    exigir(not erros, " ".join(erros), 400)
    L.adicionar_ferias_plantao(pessoa, periodos)
    if len(periodos) == 1:
        return {"ok": True, "mensagem": f"Férias marcadas: {L.formatar_periodo_ferias(*periodos[0])}."}
    return {"ok": True, "mensagem": "Férias marcadas. Obrigado!"}


@rotas.delete("/ferias/{ferias_id}")
def excluir_ferias(ferias_id: int, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    L.excluir_ferias_plantao(ferias_id)
    return {"ok": True, "mensagem": "Férias excluídas."}


class Cracha(BaseModel):
    crachas: list[tuple[str, str]]


@rotas.post("/crachas")
def salvar_crachas(pedido: Cracha, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    pessoa = L.pessoa_do_usuario()
    exigir(pessoa, "Esta é a conta geral da Engenharia. Entre com o seu login para marcar o crachá.")
    bases = [b for b, _ in pedido.crachas]
    exigir(pedido.crachas, "Escolha a base e a validade de pelo menos um crachá.", 400)
    exigir(all(b in L.BASES_CRACHA for b in bases), "Base inválida.", 400)
    exigir(len(set(bases)) == len(bases), "A mesma base aparece duas vezes.", 400)
    for base, validade in pedido.crachas:
        L.salvar_cracha_plantao(pessoa, base, _data(validade))
    return {"ok": True, "mensagem": "Crachás salvos." if len(bases) > 1 else f"Crachá {bases[0]} salvo."}


@rotas.delete("/crachas/{base}")
def excluir_cracha(base: str, u: Usuario = Depends(usuario_atual)):
    ativar(u)
    pessoa = L.pessoa_do_usuario()
    exigir(pessoa, "Entre com o seu login para mexer no crachá.")
    L.excluir_cracha_plantao(pessoa, base)
    return {"ok": True, "mensagem": f"Crachá {base} excluído."}
