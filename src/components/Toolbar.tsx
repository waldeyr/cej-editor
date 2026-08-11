import React from 'react';
import {
  FileCode,
  FileUp,
  Globe,
  Save,
  Download,
  FilePlus,
  Bold,
  Italic,
  Underline,
  Superscript,
  Subscript,
  RemoveFormatting,
  Link as LinkIcon,
  Anchor,
  Quote,
  PanelLeftClose,
  PanelLeft,
  Undo2,
  Redo2,
  Table,
  CornerDownLeft,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from 'lucide-react';
import { BlockAlign, BlockType } from '../types/legislative';
import { InlineFormat } from '../utils/richText';
import { textInkOf, weightOf } from '../utils/rank';
import logoCej from '../assets/logo-cej.png';

export type TextCommand = InlineFormat | 'clearStyle' | 'link' | 'anchor';

interface ToolbarProps {
  documentTitle: string;
  onNew: () => void;
  onImportRtf: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenHtml: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenUrl: () => void;
  /** Abre a caixa do <title> do arquivo salvo. */
  onEditTitle: () => void;
  onInsertTable: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onAddBlock: (type: BlockType) => void;
  onFormatInline: (format: TextCommand) => void;
  onAlign: (align: BlockAlign) => void;
  activeFormats: readonly InlineFormat[];
  activeAlign?: BlockAlign;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const COMMAND_CLASS =
  'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-comando text-texto bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0 disabled:opacity-35 disabled:hover:bg-tinta-alta';

const ICON_CLASS =
  'inline-flex items-center justify-center size-7 rounded text-legenda hover:text-texto hover:bg-tinta-alta transition-colors shrink-0 disabled:opacity-30 disabled:hover:bg-transparent';

const Divider: React.FC = () => <span className="h-4 w-px bg-rule shrink-0" aria-hidden="true" />;

/*
 * Dispositivos da estrutura. A posição hierárquica é ordinal, então todos os
 * botões dividem a mesma superfície e a hierarquia aparece por peso e densidade
 * da tinta — a mesma rampa usada pela trilha e pela lista lateral. A versão
 * anterior usava sete matizes categóricas (âmbar, índigo, azul, ciano, roxo,
 * ardósia) que não codificavam hierarquia alguma.
 */
const ESTRUTURA: readonly { type: BlockType; label: string }[] = [
  { type: 'PARTE', label: 'Parte' },
  { type: 'LIVRO', label: 'Livro' },
  { type: 'TITULO', label: 'Título' },
  { type: 'SUBTITULO', label: 'Subtítulo' },
  { type: 'CAPITULO', label: 'Capítulo' },
  { type: 'SECAO', label: 'Seção' },
  { type: 'SUBSECAO', label: 'Subseção' },
];

const DISPOSITIVOS: readonly { type: BlockType; label: string }[] = [
  { type: 'ARTIGO', label: 'Artigo' },
  { type: 'PARAGRAFO', label: 'Parágrafo' },
  { type: 'INCISO', label: 'Inciso' },
  { type: 'ALINEA', label: 'Alínea' },
  { type: 'ITEM', label: 'Item' },
];

const ALINHAMENTOS: readonly { align: BlockAlign; label: string; icon: React.ReactNode }[] = [
  { align: 'left', label: 'Alinhar à esquerda', icon: <AlignLeft size={14} /> },
  { align: 'center', label: 'Centralizar', icon: <AlignCenter size={14} /> },
  { align: 'right', label: 'Alinhar à direita', icon: <AlignRight size={14} /> },
  { align: 'justify', label: 'Justificar', icon: <AlignJustify size={14} /> },
];

const FORMATOS: readonly { format: InlineFormat; label: string; icon: React.ReactNode }[] = [
  { format: 'bold', label: 'Negrito', icon: <Bold size={14} /> },
  { format: 'italic', label: 'Itálico', icon: <Italic size={14} /> },
  { format: 'underline', label: 'Sublinhado', icon: <Underline size={14} /> },
  { format: 'superscript', label: 'Sobrescrito', icon: <Superscript size={14} /> },
  { format: 'subscript', label: 'Subscrito', icon: <Subscript size={14} /> },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  documentTitle,
  onNew,
  onImportRtf,
  onOpenHtml,
  onOpenUrl,
  onEditTitle,
  onInsertTable,
  onSave,
  onSaveAs,
  onAddBlock,
  onFormatInline,
  onAlign,
  activeFormats,
  activeAlign,
  sidebarOpen,
  onToggleSidebar,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) => {
  const preserveSelectionMouseDown = (e: React.MouseEvent<HTMLElement>) => {
    // Impede que o clique na barra roube o foco e colapse a seleção corrente.
    e.preventDefault();
  };

  const structureButton = (type: BlockType, label: string) => (
    <button
      key={type}
      type="button"
      onClick={() => onAddBlock(type)}
      className="h-6 px-2 rounded text-comando bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0"
      style={{ color: 'var(--color-rank)', opacity: textInkOf(type), fontWeight: weightOf(type) }}
    >
      {label}
    </button>
  );

  /*
   * Botões de texto. Eles permanecem na barra o tempo todo: escondê-los até que
   * houvesse seleção economizava uma linha de altura ao custo de fazer o
   * usuário descobrir por tentativa que negrito, âncora e limpeza de formatação
   * ainda existiam.
   */
  const textButton = (
    label: string,
    icon: React.ReactNode,
    onActivate: () => void,
    isActive = false
  ) => (
    <button
      key={label}
      type="button"
      onMouseDown={preserveSelectionMouseDown}
      onClick={onActivate}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={`inline-flex items-center justify-center size-6 rounded transition-colors shrink-0 ${
        isActive ? 'bg-rule text-texto' : 'text-legenda bg-tinta-alta hover:bg-rule/70 hover:text-texto'
      }`}
    >
      {icon}
    </button>
  );

  const labelledTextButton = (
    label: string,
    icon: React.ReactNode,
    onActivate: () => void
  ) => (
    <button
      type="button"
      onMouseDown={preserveSelectionMouseDown}
      onClick={onActivate}
      title={label}
      className="inline-flex items-center gap-1.5 h-6 px-2 rounded text-comando text-texto bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0"
    >
      {icon}
      {label}
    </button>
  );

  return (
    <header className="w-full shrink-0 bg-tinta border-b border-rule/60 select-none">
      {/* Linha permanente: identidade, documento e ações de arquivo. */}
      {/*
        Comandos de arquivo. Abaixo de 1024px os rotulos recolhem para leitores
        de tela e sobram os icones: com eles a mostra, "Salvar como..." saia da
        janela sem rolagem alguma - inalcancavel. A rolagem aqui e rede de
        seguranca para as janelas mais estreitas, nao o arranjo normal.
      */}
      <div className="flex items-center gap-2 px-2 h-11 border-b border-rule/40 overflow-x-auto">
        {/*
          Abaixo de 1024px a lista lateral já sai de cena por CSS (ver
          SidebarTree), e um botão que comanda o que não está lá promete o que
          não pode cumprir. O invólucro é quem esconde: `hidden` na própria
          classe do botão perderia para o `inline-flex` que ICON_CLASS traz —
          entre duas utilidades de display, quem vence é a ordem da folha de
          estilo gerada, não a ordem em que aparecem no atributo.
        */}
        <span className="hidden lg:contents">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={ICON_CLASS}
            aria-label={sidebarOpen ? 'Recolher a vista do ato' : 'Expandir a vista do ato'}
            title={sidebarOpen ? 'Recolher a vista do ato' : 'Expandir a vista do ato'}
          >
            {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
          </button>
        </span>

        {/*
          Marca e nome formam um conjunto só, e por isso ficam mais próximos
          entre si do que do botão ao lado. O ícone foi desenhado sobre branco
          e vem numa placa clara: descartar esse branco deixaria a folha do
          próprio desenho transparente sobre o chrome escuro, e a marca perderia
          justamente o papel que ela representa.
        */}
        <div className="flex items-center gap-1.5 shrink-0">
          <img
            src={logoCej}
            alt=""
            aria-hidden="true"
            className="size-6 rounded-[5px] bg-white object-contain shrink-0"
          />
          <span className="text-titulo text-texto hidden sm:inline">CEJ-EDITOR</span>
        </div>

        <Divider />

        {/*
          O nome do ato na barra é também a porta para editá-lo: o <title> não
          aparece em lugar nenhum da folha, e aqui é onde o usuário já olha
          para saber que documento tem em mãos.
        */}
        <button
          type="button"
          onClick={onEditTitle}
          title={`${documentTitle}\n\nClique para definir o título do documento`}
          className="hidden md:block text-comando text-legenda hover:text-texto truncate min-w-0 flex-1 text-left rounded px-1 -mx-1 py-0.5 hover:bg-tinta-alta transition-colors"
        >
          {documentTitle}
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {/*
            Com os rótulos recolhidos abaixo de 1024px, sobram quatro ícones de
            documento parecidos entre si. A dica os distingue para quem vê; o
            rótulo em `sr-only` continua nomeando o botão para quem não vê.
          */}
          <button type="button" onClick={onNew} className={COMMAND_CLASS} title="Novo documento">
            <FilePlus size={14} aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Novo</span>
          </button>

          <label className={`${COMMAND_CLASS} cursor-pointer`} title="Abrir arquivo HTML do disco">
            <FileCode size={14} aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Abrir HTML</span>
            <input type="file" accept=".html,.htm" onChange={onOpenHtml} className="sr-only" />
          </label>

          <button
            type="button"
            onClick={onOpenUrl}
            className={COMMAND_CLASS}
            title="Abrir um ato publicado na internet pelo endereço"
          >
            <Globe size={14} aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Abrir URL</span>
          </button>

          <label className={`${COMMAND_CLASS} cursor-pointer`} title="Importar RTF, DOC ou DOCX">
            <FileUp size={14} aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Importar</span>
            <input type="file" accept=".rtf,.doc,.docx" onChange={onImportRtf} className="sr-only" />
          </label>

          <Divider />

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={ICON_CLASS}
            aria-label="Desfazer"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 size={15} />
          </button>

          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={ICON_CLASS}
            aria-label="Refazer"
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 size={15} />
          </button>

          <Divider />

          <button
            type="button"
            onClick={onSave}
            className={`${COMMAND_CLASS} bg-rank/15 border border-rank/30 hover:bg-rank/25`}
            title="Salvar o ato"
          >
            <Save size={14} aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Salvar</span>
          </button>

          <button
            type="button"
            onClick={onSaveAs}
            className={COMMAND_CLASS}
            title="Salvar com outro nome"
          >
            <Download size={14} aria-hidden="true" />
            <span className="sr-only lg:not-sr-only">Salvar como…</span>
          </button>
        </div>
      </div>

      {/*
       * Linha de texto: alinhamento, formatação inline, remissões e, ao fim, as
       * duas inserções que acompanham a redação em vez da estrutura — a linha
       * sem formatação e a tabela.
       */}
      {/*
        Centralização por `mx-auto` no grupo interno, e não por `justify-center`
        no contêiner: com a barra centralizada pelo contêiner, uma janela
        estreita cortaria os primeiros botões num ponto que a rolagem não
        alcança. Assim eles ficam no centro quando cabem e roláveis quando não.
      */}
      <div className="flex px-2 h-9 overflow-x-auto border-b border-rule/30">
        <div className="flex items-center gap-1 mx-auto">
        {ALINHAMENTOS.map(({ align, label, icon }) =>
          textButton(label, icon, () => onAlign(align), activeAlign === align)
        )}

        <Divider />

        {FORMATOS.map(({ format, label, icon }) =>
          textButton(label, icon, () => onFormatInline(format), activeFormats.includes(format))
        )}

        <Divider />

        {labelledTextButton(
          'Limpar formatação',
          <RemoveFormatting size={13} aria-hidden="true" />,
          () => onFormatInline('clearStyle')
        )}

        {/*
          A âncora vem antes do link porque essa é a ordem em que se usa: marca-se
          o destino e, depois, cria-se a remissão que chega até ele.
        */}
        {labelledTextButton('Inserir âncora', <Anchor size={13} aria-hidden="true" />, () =>
          onFormatInline('anchor')
        )}

        {labelledTextButton('Inserir link', <LinkIcon size={13} aria-hidden="true" />, () =>
          onFormatInline('link')
        )}

        <Divider />

        <button
          type="button"
          onClick={() => onAddBlock('TEXTO_LIVRE')}
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-comando text-texto bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0"
          title="Inserir uma linha sem formatação (o mesmo que teclar Enter no fim de um dispositivo)"
        >
          <CornerDownLeft size={12} aria-hidden="true" /> Novo conteúdo
        </button>

        <button
          type="button"
          onMouseDown={preserveSelectionMouseDown}
          onClick={onInsertTable}
          className="inline-flex items-center gap-1.5 h-6 px-2 rounded text-comando text-legenda bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0"
          title="Inserir tabela"
        >
          <Table size={13} aria-hidden="true" /> Inserir tabela
        </button>
        </div>
      </div>

      {/* Linha de estrutura: o que se pode inserir no corpo do ato. */}
      <div className="flex px-2 h-9 overflow-x-auto">
        <div className="flex items-center gap-1.5 mx-auto">
        {ESTRUTURA.map(({ type, label }) => structureButton(type, label))}

        <Divider />

        {DISPOSITIVOS.map(({ type, label }) => structureButton(type, label))}

        <Divider />

        <button
          type="button"
          onClick={() => onAddBlock('ALTERACAO')}
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-comando text-legenda bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0"
        >
          <Quote size={12} aria-hidden="true" /> Alteração
        </button>

        <button
          type="button"
          onClick={() => onAddBlock('OMISSIS')}
          className="h-6 px-2 rounded text-comando text-legenda bg-tinta-alta hover:bg-rule/70 transition-colors shrink-0"
        >
          Omissis
        </button>
        </div>
      </div>
    </header>
  );
};
