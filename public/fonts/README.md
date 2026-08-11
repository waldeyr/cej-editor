# Fonts — Base Legislação

## Fonte primária: Rawline (servida localmente)

**Origem:** design system Sagitário (OFL).
**Licença:** Open Font License (OFL).
**Arquivos:** TTF em `/fonts/` — **18 arquivos** (9 pesos × normal + italic).

| Peso | Normal | Italic |
|---|---|---|
| 100 — Thin       | `rawline-100.ttf` | `rawline-100i.ttf` |
| 200 — ExtraLight | `rawline-200.ttf` | `rawline-200i.ttf` |
| 300 — Light      | `rawline-300.ttf` | `rawline-300i.ttf` |
| **400 — Regular** | `rawline-400.ttf` | `rawline-400i.ttf` |
| **500 — Medium**  | `rawline-500.ttf` | `rawline-500i.ttf` |
| **600 — Semibold** | `rawline-600.ttf` | `rawline-600i.ttf` |
| **700 — Bold**    | `rawline-700.ttf` | `rawline-700i.ttf` |
| 800 — ExtraBold  | `rawline-800.ttf` | `rawline-800i.ttf` |
| 900 — Black      | `rawline-900.ttf` | `rawline-900i.ttf` |

**Pesos canônicos no produto:** body 400 · labels 500 · headings 500–600 · estado ativo 600. Pesos 100/200 e 800/900 ficam disponíveis para marcas e display, sem uso em UI corrente.

## Carregamento

Declarado via `@font-face` em `colors_and_type.css` na raiz do projeto. Não há mais dependência de CDN — o design system funciona **offline** e pode ser empacotado em PPTX/PDF/HTML estático com fidelidade tipográfica completa.

```css
@font-face { font-family: 'Rawline'; font-weight: 400; font-style: normal;
  src: url("fonts/rawline-400.ttf") format("truetype"); }
/* … 17 outros … */
```

## Fallback (defensivo)

`-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif` — só ativa se os TTFs falharem (caminho quebrado, política CSP bloqueando, etc.). Raleway foi removido como fallback agora que temos todos os 9 pesos locais.

## Em produção (legacy)

O produto real Base Legislação ainda carrega Rawline via CDN Sagitário DS (`cdngovbr-ds.estaleiro.serpro.sagitario`). A versão local desta pasta é para o design system standalone (mockups, decks, prototipos isolados, PPTX exportável).

## Tipografia auxiliar (apenas para code blocks deste design system)

`JetBrains Mono`, `SF Mono`, `Menlo`, `Consolas`, `monospace`. Não está no produto real — usada apenas em documentação técnica deste DS.
