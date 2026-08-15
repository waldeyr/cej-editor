import { LegislativeDocument } from '../types/legislative';
import { ArquivoDoAto } from '../types/abas';

/**
 * Recuperação do trabalho da sessão, agora para vários atos abertos.
 *
 * Isto era `draft.ts`, com uma chave só: gravava o documento inteiro a cada
 * alteração e o relia no arranque. Com abas, uma chave só significa que a
 * última aba digitada apaga a rede de segurança de todas as outras.
 *
 * A divisão em três compartimentos não é arbitrária:
 *
 * | o que | onde | por quê |
 * | :-- | :-- | :-- |
 * | rascunho de cada aba | `localStorage`, uma chave por aba | tem de sobreviver a uma queda do programa |
 * | quais abas esta janela tinha | `sessionStorage`, uma chave por janela | é por janela, e duas janelas dividem a mesma origem |
 * | pasta do projeto, preferências | `localStorage` | é para ser compartilhado entre janelas |
 */

const PREFIXO_RASCUNHO = 'cej.rascunho.v1.';
const PREFIXO_SESSAO = 'cej.sessao.v1.';

/** Chave herdada do editor Sagitário, lida uma última vez para migrar e apagar. */
export const CHAVE_LEGADA = 'sagitario_editor_draft';

/**
 * Teto por rascunho, antes mesmo de tentar gravar.
 *
 * A TIPI (2.854 dispositivos, 16.985 linhas de tabela) passa de qualquer cota de
 * navegador. Serializá-la e oferecê-la ao armazenamento a cada alteração custa
 * caro para falhar sempre; barrar pelo tamanho é mais barato e diz a verdade.
 */
const TETO_DE_RASCUNHO = 4 * 1024 * 1024;

export type ArmazenamentoDeRascunho = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key'> & {
  readonly length: number;
};

export interface RascunhoGravado {
  abaId: string;
  doc: LegislativeDocument;
  /** Sem o `handle`: `FileSystemFileHandle` não atravessa `JSON.stringify`. */
  arquivo: ArquivoDoAto | null;
  /** Para listar os rascunhos órfãos sem desserializar o ato inteiro. */
  rotulo: string;
  gravadoEm: number;
}

export interface SessaoGravada {
  abas: string[];
  ativa: string;
  pastaRaiz?: string;
  gravadaEm: number;
}

const chaveDoRascunho = (abaId: string) => `${PREFIXO_RASCUNHO}${abaId}`;
const chaveDaSessao = (janelaId: string) => `${PREFIXO_SESSAO}${janelaId}`;

/** As chaves guardadas que começam pelo prefixo — `localStorage` não se itera direto. */
function chavesCom(prefixo: string, s: ArmazenamentoDeRascunho): string[] {
  const chaves: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const chave = s.key(i);
    if (chave && chave.startsWith(prefixo)) chaves.push(chave);
  }
  return chaves;
}

function lerJson<T>(chave: string, s: ArmazenamentoDeRascunho): T | null {
  try {
    const guardado = s.getItem(chave);
    if (!guardado) return null;
    return JSON.parse(guardado) as T;
  } catch (e) {
    console.warn(`Não foi possível ler ${chave} do armazenamento:`, e);
    return null;
  }
}

/** Um ato reconhecível — o resto veio de outra versão do editor, ou foi escrito à mão. */
const pareceAto = (candidato: unknown): candidato is LegislativeDocument => {
  const doc = candidato as LegislativeDocument | null;
  return Boolean(doc && doc.epigrafe !== undefined && Array.isArray(doc.blocks));
};

export function lerRascunho(
  abaId: string,
  s: ArmazenamentoDeRascunho = localStorage
): RascunhoGravado | null {
  const guardado = lerJson<RascunhoGravado>(chaveDoRascunho(abaId), s);
  if (!guardado || !pareceAto(guardado.doc)) return null;
  return { ...guardado, abaId };
}

/**
 * Guarda o ato de uma aba.
 *
 * Devolve `'cheio'` em vez de estourar: cota esgotada e navegação anônima barram
 * a gravação, e nenhuma das duas é motivo para interromper quem está redigindo.
 * Quem chama é que decide se avisa — e avisa uma vez só, não a cada tecla.
 */
export function gravarRascunho(
  rascunho: RascunhoGravado,
  s: ArmazenamentoDeRascunho = localStorage
): 'ok' | 'cheio' {
  let serializado: string;
  try {
    serializado = JSON.stringify(rascunho);
  } catch (e) {
    console.warn('Não foi possível serializar o rascunho:', e);
    return 'cheio';
  }

  if (serializado.length > TETO_DE_RASCUNHO) return 'cheio';

  const tentar = (): boolean => {
    try {
      s.setItem(chaveDoRascunho(rascunho.abaId), serializado);
      return true;
    } catch {
      return false;
    }
  };

  if (tentar()) return 'ok';

  /*
   * Faltou espaço. O que se descarta são os rascunhos órfãos — de abas que já
   * não existem em sessão alguma. Sacrificar o rascunho de uma aba aberta para
   * caber o de outra trocaria uma rede de segurança por outra, calado.
   */
  const liberou = descartarOrfaos(s);
  if (liberou > 0 && tentar()) return 'ok';

  console.warn('O armazenamento não coube o rascunho desta aba.');
  return 'cheio';
}

export function descartarRascunho(abaId: string, s: ArmazenamentoDeRascunho = localStorage): void {
  try {
    s.removeItem(chaveDoRascunho(abaId));
  } catch (e) {
    console.warn('Não foi possível descartar o rascunho:', e);
  }
}

/** Todos os rascunhos guardados, do mais recente para o mais antigo. */
export function rascunhosGuardados(s: ArmazenamentoDeRascunho = localStorage): RascunhoGravado[] {
  return chavesCom(PREFIXO_RASCUNHO, s)
    .map((chave) => lerRascunho(chave.slice(PREFIXO_RASCUNHO.length), s))
    .filter((r): r is RascunhoGravado => r !== null)
    .sort((a, b) => b.gravadoEm - a.gravadoEm);
}

export function lerSessao(
  janelaId: string,
  s: ArmazenamentoDeRascunho = localStorage
): SessaoGravada | null {
  const guardada = lerJson<SessaoGravada>(chaveDaSessao(janelaId), s);
  if (!guardada || !Array.isArray(guardada.abas) || guardada.abas.length === 0) return null;
  return guardada;
}

export function gravarSessao(
  janelaId: string,
  sessao: SessaoGravada,
  s: ArmazenamentoDeRascunho = localStorage
): void {
  try {
    s.setItem(chaveDaSessao(janelaId), JSON.stringify(sessao));
  } catch (e) {
    console.warn('Não foi possível guardar a lista de abas desta janela:', e);
  }
}

export function descartarSessao(janelaId: string, s: ArmazenamentoDeRascunho = localStorage): void {
  try {
    s.removeItem(chaveDaSessao(janelaId));
  } catch (e) {
    console.warn('Não foi possível descartar a sessão:', e);
  }
}

/*
 * ---------------------------------------------------------------------------
 * Quem está vivo
 *
 * Reabrir o programa deve trazer de volta as abas da última sessão; abrir uma
 * segunda janela, não — ela roubaria as abas da primeira, que continua aberta.
 * As duas situações são indistinguíveis pelo armazenamento (janela nova nunca
 * tem `sessionStorage`), e por isso cada janela bate um pulso: sessão sem pulso
 * recente é de janela que morreu, e só essa pode ser adotada.
 * ---------------------------------------------------------------------------
 */

const PREFIXO_PULSO = 'cej.pulso.v1.';

/** De quanto em quanto tempo a janela avisa que continua aberta. */
export const INTERVALO_DE_PULSO = 5_000;

/** Sem pulso por este tanto, a janela é dada por encerrada. */
export const PULSO_MORTO = 20_000;

export function pulsar(janelaId: string, agora: number, s: ArmazenamentoDeRascunho = localStorage): void {
  try {
    s.setItem(`${PREFIXO_PULSO}${janelaId}`, String(agora));
  } catch {
    /* Sem pulso, a sessão apenas fica adotável cedo demais — não é motivo para parar. */
  }
}

export function esquecerPulso(janelaId: string, s: ArmazenamentoDeRascunho = localStorage): void {
  try {
    s.removeItem(`${PREFIXO_PULSO}${janelaId}`);
  } catch {
    /* idem */
  }
}

export function janelaViva(
  janelaId: string,
  agora: number,
  s: ArmazenamentoDeRascunho = localStorage
): boolean {
  const pulso = Number(s.getItem(`${PREFIXO_PULSO}${janelaId}`) ?? 0);
  return pulso > 0 && agora - pulso < PULSO_MORTO;
}

/**
 * A sessão que uma janela nova pode adotar: a mais recente entre as de janelas
 * que já não respondem. Devolve `null` quando todas as sessões guardadas
 * pertencem a janelas abertas — que é o caso de quem clicou em "Nova janela".
 */
export function sessaoParaAdotar(
  agora: number,
  s: ArmazenamentoDeRascunho = localStorage
): { janelaId: string; sessao: SessaoGravada } | null {
  const candidatas = chavesCom(PREFIXO_SESSAO, s)
    .map((chave) => {
      const janelaId = chave.slice(PREFIXO_SESSAO.length);
      const sessao = lerSessao(janelaId, s);
      return sessao ? { janelaId, sessao } : null;
    })
    .filter((c): c is { janelaId: string; sessao: SessaoGravada } => c !== null)
    .filter((c) => !janelaViva(c.janelaId, agora, s))
    .sort((a, b) => b.sessao.gravadaEm - a.sessao.gravadaEm);

  return candidatas[0] ?? null;
}

/**
 * Passa a sessão de uma janela encerrada para a janela que está abrindo.
 *
 * O registro antigo sai no mesmo gesto: sem isso, duas janelas abertas em
 * seguida adotariam a mesma sessão e mostrariam os mesmos atos duas vezes.
 */
export function adotarSessao(
  deJanela: string,
  paraJanela: string,
  s: ArmazenamentoDeRascunho = localStorage
): SessaoGravada | null {
  const sessao = lerSessao(deJanela, s);
  if (!sessao) return null;

  descartarSessao(deJanela, s);
  esquecerPulso(deJanela, s);
  gravarSessao(paraJanela, sessao, s);
  return sessao;
}

/** As abas que alguma janela ainda reivindica. */
function abasReivindicadas(s: ArmazenamentoDeRascunho): Set<string> {
  const vivas = new Set<string>();
  chavesCom(PREFIXO_SESSAO, s).forEach((chave) => {
    const sessao = lerJson<SessaoGravada>(chave, s);
    sessao?.abas?.forEach((abaId) => vivas.add(abaId));
  });
  return vivas;
}

/**
 * Apaga o rascunho de aba que nenhuma sessão reivindica.
 *
 * Devolve quantos saíram — é o que permite tentar gravar de novo depois de
 * liberar espaço. Chamado no arranque e quando a cota estoura.
 */
export function descartarOrfaos(s: ArmazenamentoDeRascunho = localStorage): number {
  const vivas = abasReivindicadas(s);
  let apagados = 0;

  chavesCom(PREFIXO_RASCUNHO, s).forEach((chave) => {
    const abaId = chave.slice(PREFIXO_RASCUNHO.length);
    if (vivas.has(abaId)) return;
    try {
      s.removeItem(chave);
      apagados++;
    } catch {
      /* Não poder apagar não é motivo para interromper o arranque. */
    }
  });

  return apagados;
}

/** A aba que recebe o rascunho herdado da versão anterior do editor. */
export const ABA_LEGADA = 'legado';

/**
 * Converte o rascunho da chave antiga num rascunho de aba, e apaga a chave.
 *
 * **Grava antes de devolver**, e é isso que a torna segura: o `StrictMode` do
 * React invoca duas vezes o que roda em inicializador de estado e descarta o
 * resultado da primeira. Se a migração só devolvesse o ato, a segunda chamada
 * já não acharia a chave, devolveria `null`, e o rascunho da sessão anterior
 * sumiria — justamente no caminho que existe para não perdê-lo.
 */
export function migrarRascunhoLegado(
  s: ArmazenamentoDeRascunho = localStorage
): RascunhoGravado | null {
  const legado = lerJson<LegislativeDocument>(CHAVE_LEGADA, s);
  try {
    s.removeItem(CHAVE_LEGADA);
  } catch {
    /* Não poder apagar a chave antiga não impede adotar o que ela guardava. */
  }

  if (!pareceAto(legado)) return null;

  const rascunho: RascunhoGravado = {
    abaId: ABA_LEGADA,
    doc: legado,
    arquivo: null,
    rotulo: legado.title || 'Ato recuperado',
    gravadoEm: Date.now(),
  };

  gravarRascunho(rascunho, s);
  return rascunho;
}
