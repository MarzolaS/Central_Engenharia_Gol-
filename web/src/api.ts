// Chamadas à API da Central (FastAPI no Hugging Face). O token vem do Firebase Auth
// (ou do token local da API, quando ela roda sem Firebase).
export const URL_API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000'

type Obter = () => Promise<string | null>
let obterToken: Obter = async () => null
let aoExpirar: () => void = () => {}

export function configurarToken(obter: Obter, expirou: () => void) {
  obterToken = obter
  aoExpirar = expirou
}

export class ErroApi extends Error {
  status: number
  dados: unknown
  constructor(status: number, mensagem: string, dados?: unknown) {
    super(mensagem)
    this.status = status
    this.dados = dados
  }
}

async function cabecalhos(extra?: HeadersInit): Promise<Headers> {
  const h = new Headers(extra)
  const token = await obterToken()
  if (token) h.set('Authorization', `Bearer ${token}`)
  return h
}

async function tratar(resposta: Response) {
  if (resposta.ok) return resposta
  let detalhe: unknown = null
  let texto = `Erro ${resposta.status}`
  try {
    const corpo = await resposta.json()
    detalhe = corpo.detail ?? corpo
    if (typeof detalhe === 'string') texto = detalhe
    else if (detalhe && typeof detalhe === 'object' && 'mensagem' in detalhe) texto = String((detalhe as { mensagem: unknown }).mensagem)
    else if (Array.isArray(detalhe)) texto = 'Confira os campos preenchidos.'
  } catch {
    /* corpo sem JSON */
  }
  if (resposta.status === 401) aoExpirar()
  throw new ErroApi(resposta.status, texto, detalhe)
}

export async function chamar<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const h = await cabecalhos()
  let body: BodyInit | undefined
  if (corpo instanceof FormData) body = corpo
  else if (corpo !== undefined) {
    h.set('Content-Type', 'application/json')
    body = JSON.stringify(corpo)
  }
  let resposta: Response
  try {
    resposta = await fetch(URL_API + caminho, { method: metodo, headers: h, body })
  } catch {
    throw new ErroApi(0, 'Não consegui falar com o servidor. Confira a internet e tente de novo (na primeira visita do dia ele pode levar até um minuto para acordar).')
  }
  await tratar(resposta)
  const tipo = resposta.headers.get('Content-Type') || ''
  if (tipo.includes('application/json')) return resposta.json()
  return (await resposta.text()) as T
}

export const api = {
  get: <T = any>(c: string) => chamar<T>('GET', c),
  post: <T = any>(c: string, corpo?: unknown) => chamar<T>('POST', c, corpo ?? {}),
  put: <T = any>(c: string, corpo?: unknown) => chamar<T>('PUT', c, corpo ?? {}),
  del: <T = any>(c: string) => chamar<T>('DELETE', c),
}

export function qs(parametros: Record<string, unknown>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(parametros)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  const t = p.toString()
  return t ? `?${t}` : ''
}

function nomeDoArquivo(resposta: Response, padrao: string) {
  const cd = resposta.headers.get('Content-Disposition') || ''
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (utf) return decodeURIComponent(utf[1])
  const simples = /filename="?([^";]+)"?/i.exec(cd)
  return simples ? simples[1] : padrao
}

// Baixa um arquivo da API (Excel, PDF, CSV) com o token e entrega ao navegador.
export async function baixar(caminho: string, padrao = 'arquivo', metodo = 'GET', corpo?: unknown) {
  const h = await cabecalhos()
  let body: BodyInit | undefined
  if (corpo !== undefined) {
    h.set('Content-Type', 'application/json')
    body = JSON.stringify(corpo)
  }
  const resposta = await tratar(await fetch(URL_API + caminho, { method: metodo, headers: h, body }))
  const blob = await resposta.blob()
  salvarBlob(blob, nomeDoArquivo(resposta, padrao))
}

export function salvarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function salvarTexto(texto: string, nome: string, tipo = 'text/csv') {
  salvarBlob(new Blob(['﻿' + texto], { type: `${tipo};charset=utf-8` }), nome)
}

// Busca um conteúdo binário/HTML com o token e devolve um blob (usado no iframe dos SRs).
export async function buscarBlob(caminho: string, tipo?: string) {
  const h = await cabecalhos()
  const resposta = await tratar(await fetch(URL_API + caminho, { headers: h }))
  const blob = await resposta.blob()
  return tipo ? new Blob([blob], { type: tipo }) : blob
}

export function enviarArquivo(campo: string, arquivo: File, extras: Record<string, string | number | null | undefined> = {}) {
  const f = new FormData()
  f.append(campo, arquivo)
  for (const [k, v] of Object.entries(extras)) if (v !== undefined && v !== null) f.append(k, String(v))
  return f
}
