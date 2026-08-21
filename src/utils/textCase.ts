/**
 * Iniciais Maiúsculas em português.
 *
 * Capitalizar toda palavra dá título errado em português: "Programa De Venda
 * Em Balcão" não é como o Planalto escreve. As palavras de ligação — artigo,
 * preposição, conjunção — ficam minúsculas, exceto a primeira do trecho, que
 * abre maiúscula mesmo sendo uma delas ("Da Silva" começa com maiúscula
 * porque é a primeira palavra, não porque "da" deixou de ser preposição).
 */
const STOPWORDS_PT_BR = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
  'por', 'pelo', 'pela', 'pelos', 'pelas',
  'para', 'com', 'sem', 'sob', 'sobre', 'entre', 'até', 'após', 'ante', 'contra', 'desde', 'perante',
  'e', 'ou', 'mas', 'que', 'se', 'como', 'quando', 'pois', 'porém', 'contudo', 'todavia', 'logo',
  'ao', 'aos', 'à', 'às',
]);

/** Uma palavra: letras (com acento), e apóstrofo/hífen internos ("d'água", "não-governamental"). */
const PALAVRA = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;

/**
 * Iniciais maiúsculas do trecho, com as stopwords do português como exceção.
 *
 * A primeira palavra do trecho sempre abre maiúscula, mesmo sendo stopword —
 * é o que faz sentido quando a seleção começa no início de uma frase ou de um
 * título. Se a seleção começar no meio de uma palavra, essa palavra parcial é
 * tratada como a primeira: limitação aceita, do mesmo tipo que já existe em
 * `coversWholeField` (richText.ts) para decidir se uma seleção cobre o campo.
 */
export function paraTituloPtBr(texto: string): string {
  let primeira = true;
  return texto.replace(PALAVRA, (palavra) => {
    const minuscula = palavra.toLowerCase();
    const capitaliza = primeira || !STOPWORDS_PT_BR.has(minuscula);
    primeira = false;
    return capitaliza ? minuscula.charAt(0).toUpperCase() + minuscula.slice(1) : minuscula;
  });
}
