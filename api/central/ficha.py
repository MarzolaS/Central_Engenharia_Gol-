"""Ficha de pesagem: montar o registro, calcular o Weighing Report e o Excel.

As contas são as mesmas do app.py (renderizar_ficha_visualizacao e
formulario_pesagem), escritas aqui sem a parte de tela. As funções de apoio
(braco_mlg, calcular_level_correction, momento do flap...) vêm do app.py.
"""
import pandas as pd

from .base import L

safe_float = L.safe_float
safe_str = L.safe_str

CAMPOS_PESAGEM_1 = [
    ("Peso nariz LH", "Nariz LH"),
    ("Peso Nariz RH", "Nariz RH"),
    ("Peso MLG RH 1 ", "RH MLG 1"),
    ("Peso MLG RH 2", "RH MLG 2"),
    ("Peso MLG LH 1", "LH MLG 1"),
    ("Peso MLG LH2", "LH MLG 2"),
]
CAMPOS_PESAGEM_2 = [
    ("Peso nariz LH pesagem 2", "Nariz LH"),
    ("Peso Nariz RH pesagem 2", "Nariz RH"),
    ("Peso MLG RH 1  pesagem 2", "RH MLG 1"),
    ("Peso MLG RH 2 pesagem 2", "RH MLG 2"),
    ("Peso MLG LH 1 pesagem 2", "LH MLG 1"),
    ("Peso MLG LH2 pesagem 2", "LH MLG 2"),
]
# Nomes alternativos com que as colunas aparecem em fichas antigas.
ALTERNATIVAS = {
    "Peso nariz LH": ["Peso nariz LH"],
    "Peso Nariz RH": ["Peso Nariz RH"],
    "Peso MLG RH 1 ": ["Peso MLG RH 1 ", "Peso MLG RH 1"],
    "Peso MLG LH 1": ["Peso MLG LH 1", "Peso MLG LH 1 "],
    "Peso MLG RH 2": ["Peso MLG RH 2", "Peso MLG RH 2 "],
    "Peso MLG LH2": ["Peso MLG LH2", "Peso MLG LH 2"],
    "Peso nariz LH pesagem 2": ["Peso nariz LH pesagem 2"],
    "Peso Nariz RH pesagem 2": ["Peso Nariz RH pesagem 2"],
    "Peso MLG RH 1  pesagem 2": ["Peso MLG RH 1  pesagem 2", "Peso MLG RH 1 pesagem 2"],
    "Peso MLG LH 1 pesagem 2": ["Peso MLG LH 1 pesagem 2"],
    "Peso MLG RH 2 pesagem 2": ["Peso MLG RH 2 pesagem 2"],
    "Peso MLG LH2 pesagem 2": ["Peso MLG LH2 pesagem 2"],
}


def _texto(valor):
    return "" if valor is None or (isinstance(valor, float) and pd.isna(valor)) else str(valor)


def itens_da_ficha(row, tipo):
    """Deductions/Additions gravados: lista de {slot, desc, peso, braco}."""
    if tipo == "deductions":
        chaves = ("Deductions description", "Deductions Weigth", "Deductions arm", L.MAX_DEDUCTIONS)
    else:
        chaves = ("Additions Description", "Additions weigth", "Additions arm", L.MAX_ADDITIONS)
    campo_desc, campo_peso, campo_braco, limite = chaves
    itens = []
    for indice in range(1, limite + 1):
        descricao = row.get(f"{campo_desc} {indice}")
        if descricao is None or (not isinstance(descricao, str) and pd.isna(descricao)):
            continue
        if not str(descricao).strip():
            continue
        itens.append({
            "slot": indice,
            "desc": str(descricao),
            "peso": safe_float(row.get(f"{campo_peso} {indice}", 0)),
            "braco": safe_float(row.get(f"{campo_braco} {indice}", 0)),
        })
    return itens


def momento_flaps_sugerido(prefixo, row):
    info_aero = L.dict_tipos_aeronave.get(prefixo, {})
    momento = L.momento_flaps_do_registro(row or {})
    if momento is None:
        momento = L.buscar_momento_flaps_banco(prefixo, info_aero.get("modelo", ""))
    return safe_float(momento)


def ultima_ficha_antes(prefixo, pesagem_atual, revisao_atual):
    df_aero = L.carregar_fichas_prefixo(prefixo)
    if df_aero.empty:
        return "", ""
    df_aero["Pesagem_num"] = pd.to_numeric(df_aero["Pesagem"], errors="coerce").fillna(0)
    df_aero["Revisao_num"] = pd.to_numeric(df_aero["Revisao"], errors="coerce").fillna(0)
    df_prev = df_aero[
        (df_aero["Pesagem_num"] < pesagem_atual)
        | ((df_aero["Pesagem_num"] == pesagem_atual) & (df_aero["Revisao_num"] < revisao_atual))
    ].sort_values(by=["Pesagem_num", "Revisao_num"])
    if df_prev.empty:
        return "", ""
    return str(int(df_prev.iloc[-1]["Pesagem_num"])), str(int(df_prev.iloc[-1]["Revisao_num"]))


def calcular_ficha(prefixo, row):
    """Weighing Report e dados do Excel de uma ficha (igual à Consulta do app.py)."""
    row = dict(row)
    info_aero = L.dict_tipos_aeronave.get(prefixo, {})
    lh_1 = safe_float(row.get("Peso MLG LH 1", 0))
    lh_2 = safe_float(row.get("Peso MLG LH2", 0))
    lh_1_p2 = safe_float(row.get("Peso MLG LH 1 pesagem 2", 0))
    lh_2_p2 = safe_float(row.get("Peso MLG LH2 pesagem 2", 0))
    rh_1 = safe_float(row.get("Peso MLG RH 1 ", 0))
    rh_2 = safe_float(row.get("Peso MLG RH 2", 0))
    rh_1_p2 = safe_float(row.get("Peso MLG RH 1  pesagem 2", row.get("Peso MLG RH 1 pesagem 2", 0)))
    rh_2_p2 = safe_float(row.get("Peso MLG RH 2 pesagem 2", 0))
    nariz_lh = (safe_float(row.get("Peso nariz LH", 0)) + safe_float(row.get("Peso nariz LH pesagem 2", 0))) / 2
    nariz_rh = (safe_float(row.get("Peso Nariz RH", 0)) + safe_float(row.get("Peso Nariz RH pesagem 2", 0))) / 2
    nose = nariz_lh + nariz_rh
    tail = safe_float(row.get("Tail", 0))
    canela_mlg_lh = safe_float(row.get("Canela MLG LH", 0))
    canela_mlg_rh = safe_float(row.get("Canela MLG RH", 0))

    boeing = L.pesagem_boeing(row)
    arm_b_lh = L.braco_mlg(canela_mlg_lh, boeing)
    arm_b_rh = L.braco_mlg(canela_mlg_rh, boeing)
    tipo_aeronave = info_aero.get("modelo", "")
    arm_a = info_aero.get("armnose", 93.0000)
    arm_c = 1298.9000
    rh = (rh_1 + rh_2 + rh_1_p2 + rh_2_p2) / 2
    lh = (lh_1 + lh_2 + lh_1_p2 + lh_2_p2) / 2
    m_lh = lh * arm_b_lh
    m_rh = rh * arm_b_rh
    m_nose = nose * arm_a
    m_tail = tail * arm_c
    tot_reg_weight = lh + rh + nose + tail
    tot_reg_moment = m_lh + m_rh + m_nose + m_tail
    tot_reg_arm = tot_reg_moment / tot_reg_weight if tot_reg_weight > 0 else 0.0
    angulo = L.normalizar_angulo_level_correction(row.get("Graus correção do cg", ""))
    lc_fator, lc_momento, lc_lado = L.calcular_level_correction(angulo, tot_reg_weight)

    deducoes = itens_da_ficha(row, "deductions")
    adicoes = itens_da_ficha(row, "additions")
    ded_weight = sum(item["peso"] for item in deducoes)
    ded_moment = sum(item["peso"] * item["braco"] for item in deducoes)
    if lc_lado == "deductions":
        ded_moment += lc_momento
    ded_arm = ded_moment / ded_weight if ded_weight > 0 else 0.0
    flaps_ativo = any("flap" in item["desc"].casefold() for item in adicoes)
    momento_extra_flaps = 0.0
    if flaps_ativo:
        momento_extra_flaps = (
            L.momento_flaps_do_registro(row)
            or L.buscar_momento_flaps_banco(prefixo, tipo_aeronave)
        )
    add_weight = sum(item["peso"] for item in adicoes)
    add_moment = sum(item["peso"] * item["braco"] for item in adicoes) + momento_extra_flaps
    if lc_lado == "additions":
        add_moment += lc_momento
    add_arm = add_moment / add_weight if add_weight > 0 else 0.0
    basic_weight = tot_reg_weight + add_weight - ded_weight
    basic_moment = tot_reg_moment + add_moment - ded_moment
    basic_arm = basic_moment / basic_weight if basic_weight > 0 else 0.0
    cg_mac = ((basic_arm - 627.1) / 1.558) if basic_arm > 0 else 0.0

    relatorio = [
        {"item": "LH", "peso": lh, "braco": arm_b_lh, "momento": m_lh},
        {"item": "RH", "peso": rh, "braco": arm_b_rh, "momento": m_rh},
        {"item": "NOSE", "peso": nose, "braco": arm_a, "momento": m_nose},
        {"item": "TAIL", "peso": tail, "braco": arm_c, "momento": m_tail},
        {"item": "TOTAL REGISTERED", "peso": tot_reg_weight, "braco": tot_reg_arm, "momento": tot_reg_moment},
        {"item": "LEVEL CORRECTION", "peso": 0.0, "braco": lc_fator, "momento": lc_momento},
        {"item": "DEDUCTIONS", "peso": ded_weight, "braco": ded_arm, "momento": ded_moment},
        {"item": "ADDITIONS", "peso": add_weight, "braco": add_arm, "momento": add_moment},
        {"item": "AIRCRAFT BASIC WEIGHT", "peso": basic_weight, "braco": basic_arm, "momento": basic_moment},
    ]

    pesagem_atual = safe_float(row.get("Pesagem", 0))
    revisao_atual = safe_float(row.get("Revisao", 0))
    ultima_p, ultima_r = ultima_ficha_antes(prefixo, pesagem_atual, revisao_atual)
    up_salva, ur_salva = L.ultima_ficha_gravada(row)
    if up_salva:
        ultima_p, ultima_r = up_salva, ur_salva
    lopa, config_lopa = L.separar_campos_lopa(row)

    def extra(desc):
        return momento_extra_flaps if "flap" in desc.casefold() else 0

    deducoes_excel = [
        {"desc": d["desc"], "w": d["peso"], "a": d["braco"], "m": d["peso"] * d["braco"]}
        for d in deducoes
    ]
    adicoes_excel = [
        {"desc": a["desc"], "w": a["peso"], "a": a["braco"], "m": a["peso"] * a["braco"] + extra(a["desc"])}
        for a in adicoes
    ]
    linha_lc = {"desc": L.LEVEL_CORRECTION_LABEL, "w": 0.0, "a": lc_fator, "m": lc_momento}
    if lc_lado == "deductions":
        deducoes_excel.append(linha_lc)
    elif lc_lado == "additions":
        adicoes_excel.append(linha_lc)

    dados_excel = {
        "prefixo": prefixo, "modelo": tipo_aeronave,
        "pesado_por": safe_str(row.get("Pesado Por", "")),
        "local": safe_str(row.get("Local da pesagem", "")),
        "data": safe_str(row.get("Data_da_Pesagem", "")),
        "config_lopa": config_lopa, "lopa": lopa,
        "razao": safe_str(row.get("Motivo", "")), "cg_mac": cg_mac,
        "arm_a": arm_a, "arm_b_lh": arm_b_lh, "arm_b_rh": arm_b_rh,
        "issue_date": safe_str(row.get("Data da ficha", "")),
        "ultima_pesagem": ultima_p, "ultima_revisao": ultima_r,
        "vrbl_number": safe_str(safe_str(row.get("VRBL")) or info_aero.get("vrbl", "")),
        "serial_number": safe_str(safe_str(row.get("SERIAL")) or info_aero.get("serial", "")),
        "line_number": safe_str(safe_str(row.get("LINE")) or info_aero.get("line", "")),
        "numero_pesagem": str(int(pesagem_atual)) if pesagem_atual else "",
        "revisao": str(int(revisao_atual)),
        "reactions": {
            linha["item"]: {"weight": linha["peso"], "arm": linha["braco"], "moment": linha["momento"]}
            for linha in relatorio if linha["item"] != "LEVEL CORRECTION"
        },
        "deductions": deducoes_excel,
        "additions": adicoes_excel,
    }
    return {
        "relatorio": relatorio,
        "peso_basico": basic_weight,
        "braco_basico": basic_arm,
        "cg_mac": cg_mac,
        "momento_flaps": momento_extra_flaps,
        "level_correction": {"angulo": angulo, "fator": lc_fator, "momento": lc_momento, "lado": lc_lado},
        "dados_excel": dados_excel,
    }


def montar_registro(prefixo, base, formulario, momento_flaps, colunas):
    """Monta o registro gravado a partir do formulário do site.

    Mesmo mapeamento do fim de formulario_pesagem no app.py: os nomes das
    colunas seguem os que já existem nas fichas da aeronave (get_real_col).
    """
    L.st.session_state["historico_colunas"] = tuple(colunas)
    col = L.get_real_col
    f = formulario
    info_aero = L.dict_tipos_aeronave.get(prefixo, {})
    tipo_a = info_aero.get("modelo", "")
    novo = dict(base or {})
    novo.pop("Pesagem_num", None)
    novo.pop("Revisao_num", None)

    novo[col(["Prefixo"])] = prefixo
    if tipo_a:
        novo[col(["Tipo_aeronave"])] = tipo_a
    novo[col(["Data da ficha", "Data_da_Pesagem"])] = safe_str(f.get("data_emissao"))
    novo[col(["Pesado Por", "WEIGHED BY"])] = safe_str(f.get("pesado_por"))
    novo[col(["Local da pesagem"])] = safe_str(f.get("local"))
    novo[col(["Data_da_Pesagem"])] = safe_str(f.get("data_pesagem"))
    novo[col([" LOPA", "LOPA"])] = safe_str(f.get("lopa"))
    novo[col(["Configuração LOPA ", "Configuração LOPA"])] = safe_str(f.get("config_lopa"))
    novo[col(["Motivo", "Razão"])] = safe_str(f.get("razao"))
    novo[col(["VRBL", "VRBL NUMBER"])] = safe_str(f.get("vrbl"))
    novo[col(["SERIAL", "SERIAL NUMBER"])] = safe_str(f.get("serial"))
    novo[col(["LINE", "LINE NUMBER"])] = safe_str(f.get("line"))

    origem_boeing = bool(f.get("origem_boeing"))
    celulas = f.get("celulas") or {}
    valores_boeing_lb = {}
    if origem_boeing:
        lb = f.get("boeing_lb") or {}
        valores_boeing_lb = {campo: safe_float(lb.get(campo)) for campo, _ in L.CAMPOS_BOEING_LB}
        kgf = [valores_boeing_lb[campo] * L.LB_PARA_KGF for campo, _ in L.CAMPOS_BOEING_LB]
        lh_ob, lh_ib, rh_ib, rh_ob, nariz = kgf
        # Pesagem 01 e 02 iguais, 1 = OB e 2 = IB, nariz dividido em LH/RH.
        valores = {
            "Peso nariz LH": nariz / 2, "Peso Nariz RH": nariz / 2,
            "Peso MLG RH 1 ": rh_ob, "Peso MLG LH 1": lh_ob,
            "Peso MLG RH 2": rh_ib, "Peso MLG LH2": lh_ib,
            "Peso nariz LH pesagem 2": nariz / 2, "Peso Nariz RH pesagem 2": nariz / 2,
            "Peso MLG RH 1  pesagem 2": rh_ob, "Peso MLG LH 1 pesagem 2": lh_ob,
            "Peso MLG RH 2 pesagem 2": rh_ib, "Peso MLG LH2 pesagem 2": lh_ib,
        }
        bracos = f.get("boeing_braco") or {}
        canela = {}
        for lado in ("LH", "RH"):
            braco = safe_float(bracos.get(lado))
            canela[lado] = (braco - L.BASE_BRACO_MLG_BOEING) / L.FATOR_CANELA_MLG if braco else 0.0
        canela_lh, canela_rh = canela["LH"], canela["RH"]
    else:
        valores = {campo: safe_float(celulas.get(campo)) for campo in ALTERNATIVAS}
        canela_lh = safe_float(f.get("canela_lh"))
        canela_rh = safe_float(f.get("canela_rh"))
    for campo, nomes in ALTERNATIVAS.items():
        novo[col(nomes)] = valores.get(campo, 0.0)

    pesagem_informada = safe_str(f.get("ultima_pesagem_informada"))
    revisao_informada = safe_str(f.get("ultima_revisao_informada"))
    novo[L.CAMPO_ULTIMA_PESAGEM_INFORMADA] = pesagem_informada or None
    novo[L.CAMPO_ULTIMA_REVISAO_INFORMADA] = (revisao_informada or "0") if pesagem_informada else None
    novo[col(["Canela MLG LH"])] = canela_lh
    novo[col(["Canela MLG RH"])] = canela_rh
    novo[L.CAMPO_ORIGEM_CELULAS] = L.ORIGEM_BOEING if origem_boeing else None
    for campo, _ in L.CAMPOS_BOEING_LB:
        novo[campo] = valores_boeing_lb.get(campo) if origem_boeing else None
    novo[col(["Tail"])] = 0.0

    def limpar_itens(itens):
        linhas = []
        for item in itens or []:
            descricao = safe_str(item.get("desc"))
            if not descricao:
                continue
            eh_flap = "flap" in descricao.casefold()
            linhas.append({
                "desc": descricao,
                "peso": 0.0 if eh_flap else safe_float(item.get("peso")),
                "braco": 0.0 if eh_flap else safe_float(item.get("braco")),
            })
        return linhas

    deducoes = limpar_itens(f.get("deducoes"))
    adicoes = limpar_itens(f.get("adicoes"))
    novo[col(["Adction LAP"])] = (
        momento_flaps if any("flap" in item["desc"].casefold() for item in adicoes) else 0.0
    )
    angulo = L.normalizar_angulo_level_correction(f.get("angulo") or "")
    novo[col(["Graus correção do cg"])] = angulo or None
    novo[col(["Braço correspondente "])] = L.LEVEL_CORRECTION_VALUES[angulo] if angulo else None

    for i in range(1, L.MAX_DEDUCTIONS + 1):
        novo[f"Deductions description {i}"] = None
        novo[f"Deductions Weigth {i}"] = None
        novo[f"Deductions arm {i}"] = None
    for i, item in enumerate(deducoes[:L.MAX_DEDUCTIONS], start=1):
        novo[f"Deductions description {i}"] = item["desc"]
        novo[f"Deductions Weigth {i}"] = item["peso"]
        novo[f"Deductions arm {i}"] = item["braco"]
    for i in range(1, L.MAX_ADDITIONS + 1):
        novo[f"Additions Description {i}"] = None
        novo[f"Additions weigth {i}"] = None
        novo[f"Additions arm {i}"] = None
    for i, item in enumerate(adicoes[:L.MAX_ADDITIONS], start=1):
        novo[f"Additions Description {i}"] = item["desc"]
        novo[f"Additions weigth {i}"] = item["peso"]
        novo[f"Additions arm {i}"] = item["braco"]
    return novo


def formulario_da_ficha(prefixo, row, mesma_ficha=True):
    """Valores iniciais do formulário do site a partir de uma ficha gravada."""
    row = dict(row or {})
    info_aero = L.dict_tipos_aeronave.get(prefixo, {})
    lopa, config_lopa = L.separar_campos_lopa(row)
    boeing = L.pesagem_boeing(row)
    up_salva, ur_salva = L.ultima_ficha_gravada(row) if mesma_ficha else ("", "")
    data_pesagem = pd.to_datetime(row.get("Data_da_Pesagem"), errors="coerce", dayfirst=True)

    def pegar(nomes):
        for nome in nomes:
            if nome in row and row.get(nome) is not None:
                return row.get(nome)
        return None

    return {
        "data_emissao": None,
        "pesado_por": safe_str(pegar(["Pesado Por", "WEIGHED BY"])),
        "local": safe_str(row.get("Local da pesagem")),
        "data_pesagem": data_pesagem.date().isoformat() if pd.notna(data_pesagem) else None,
        "lopa": lopa,
        "config_lopa": config_lopa,
        "razao": safe_str(pegar(["Motivo", "Razão"])),
        "vrbl": safe_str(pegar(["VRBL", "VRBL NUMBER"])) or safe_str(info_aero.get("vrbl", "")),
        "serial": safe_str(pegar(["SERIAL", "SERIAL NUMBER"])) or safe_str(info_aero.get("serial", "")),
        "line": safe_str(pegar(["LINE", "LINE NUMBER"])) or safe_str(info_aero.get("line", "")),
        "origem_boeing": boeing,
        "celulas": {campo: safe_float(pegar(nomes)) for campo, nomes in ALTERNATIVAS.items()},
        "boeing_lb": {campo: safe_float(row.get(campo)) if boeing else 0.0 for campo, _ in L.CAMPOS_BOEING_LB},
        "boeing_braco": {
            lado: (L.braco_mlg(row.get(f"Canela MLG {lado}"), boeing=True) if boeing else None)
            for lado in ("LH", "RH")
        },
        "canela_lh": safe_float(row.get("Canela MLG LH")),
        "canela_rh": safe_float(row.get("Canela MLG RH")),
        "ultima_pesagem_informada": up_salva,
        "ultima_revisao_informada": ur_salva,
        "deducoes": [
            {"desc": i["desc"], "peso": i["peso"], "braco": i["braco"], "slot": i["slot"]}
            for i in itens_da_ficha(row, "deductions")
        ],
        "adicoes": [
            {"desc": i["desc"], "peso": i["peso"], "braco": i["braco"], "slot": i["slot"]}
            for i in itens_da_ficha(row, "additions")
        ],
        "angulo": L.normalizar_angulo_level_correction(row.get("Graus correção do cg", "")),
    }


def aviso_celulas(prefixo, registro, ficha_base, colunas):
    L.st.session_state["historico_colunas"] = tuple(colunas)
    return L.aviso_celulas_ficha(registro, ficha_base)


def visualizacao(prefixo, row):
    """Campos da ficha como a Consulta/Aprovação do app.py mostra (renderizar_ficha_visualizacao).

    Cada campo traz o nome da coluna (para marcar "Erro" na aprovação), o rótulo e o valor em texto.
    """
    row = dict(row or {})
    info_aero = L.dict_tipos_aeronave.get(prefixo, {})
    lopa, config_lopa = L.separar_campos_lopa(row)

    def campo(nome, rotulo, valor, permitir_erro=True):
        return {"campo": nome, "rotulo": rotulo, "valor": safe_str(valor), "permitir_erro": permitir_erro}

    dados_gerais = [
        [campo("Pesagem", "Número da Pesagem:", row.get("Pesagem", ""), False),
         campo("Revisao", "Número da Revisão:", row.get("Revisao", ""), False)],
        [campo("Data da ficha", "Data de emissão:", row.get("Data da ficha", row.get("Data_da_Pesagem", ""))),
         campo("Pesado Por", "Pesado por:", row.get("Pesado Por", row.get("WEIGHED BY", ""))),
         campo("Local da pesagem", "Local da pesagem:", row.get("Local da pesagem", ""))],
        [campo("Data_da_Pesagem", "Data da pesagem:", row.get("Data_da_Pesagem", "")),
         campo("lopa", "LOPA:", lopa),
         campo("config_lopa", "Configuração LOPA:", config_lopa)],
        [campo("VRBL", "VRBL. NUMBER:", safe_str(row.get("VRBL")) or info_aero.get("vrbl", "")),
         campo("SERIAL", "SERIAL NUMBER:", safe_str(row.get("SERIAL")) or info_aero.get("serial", "")),
         campo("LINE", "LINE NUMBER:", safe_str(row.get("LINE")) or info_aero.get("line", ""))],
        [campo("Motivo", "Razão para emissão:", row.get("Motivo", ""))],
    ]
    resposta = {"dados_gerais": dados_gerais, "boeing": bool(L.pesagem_boeing(row))}
    if resposta["boeing"]:
        resposta["boeing_campos"] = [
            campo(nome, f"{rotulo} (lb)", row.get(nome, "")) for nome, rotulo in L.CAMPOS_BOEING_LB
        ]
        resposta["boeing_bracos"] = [
            campo(f"Canela MLG {lado}", f"Balance arm Main {lado} (in)",
                  f"{L.braco_mlg(row.get(f'Canela MLG {lado}'), boeing=True):.2f}")
            for lado in ("LH", "RH")
        ]
        total_lb = sum(safe_float(row.get(nome)) for nome, _ in L.CAMPOS_BOEING_LB)
        resposta["boeing_legenda"] = (
            f"Total {L.formatar_numero(total_lb)} lb = {L.formatar_numero(total_lb * L.LB_PARA_KGF)} kgf. "
            "Os pesos foram convertidos para kgf na ficha. "
            f'DIM "A" gravado: LH {safe_float(row.get("Canela MLG LH")):.2f} in, '
            f'RH {safe_float(row.get("Canela MLG RH")):.2f} in.'
        )
    else:
        def real(nome):
            for alternativa in ALTERNATIVAS.get(nome, [nome]):
                if alternativa in row:
                    return alternativa
            return nome
        resposta["pesagens"] = [
            {"titulo": titulo, "celulas": [campo(real(nome), rotulo, row.get(real(nome), "")) for nome, rotulo in campos]}
            for titulo, campos in (("Pesagem 01", CAMPOS_PESAGEM_1), ("Pesagem 02", CAMPOS_PESAGEM_2))
        ]
        resposta["canelas"] = [
            campo("Canela MLG LH", "Canela MLG LH (in)", row.get("Canela MLG LH", "")),
            campo("Canela MLG RH", "Canela MLG RH (in)", row.get("Canela MLG RH", "")),
        ]

    def itens(tipo, campo_desc, campo_peso, campo_braco):
        lista = []
        for i in itens_da_ficha(row, tipo.lower()):
            indice = i["slot"]
            lista.append({
                "indice": indice, "descricao": i["desc"], "peso": i["peso"], "braco": i["braco"],
                "campo": f"{tipo} {campo_desc} {indice}",
                "campos": [f"{tipo} {c} {indice}" for c in (campo_desc, campo_peso, campo_braco)],
            })
        return lista

    resposta["deducoes"] = itens("Deductions", "description", "Weigth", "arm")
    resposta["adicoes"] = itens("Additions", "Description", "weigth", "arm")
    return resposta
