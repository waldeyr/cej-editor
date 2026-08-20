import { useEffect, useState } from 'react';
import { InlineFormat, activeFormatsAtSelection } from '../utils/richText';
import { targetsInPlay } from '../utils/selection';

/**
 * A barra de comandos acompanha a seleção viva: os botões de formato acendem
 * conforme o trecho sob o cursor, e o alinhamento mostra o do campo em jogo.
 */
export function useActiveSelection(): {
  activeFormats: InlineFormat[];
  activeTargets: string[];
  setActiveFormats: (formats: InlineFormat[]) => void;
  setActiveTargets: (targets: string[]) => void;
} {
  const [activeFormats, setActiveFormats] = useState<InlineFormat[]>([]);
  const [activeTargets, setActiveTargets] = useState<string[]>([]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const formats = activeFormatsAtSelection();
      setActiveFormats((previous) => (previous.join() === formats.join() ? previous : formats));

      const targets = targetsInPlay();
      setActiveTargets((previous) => (previous.join() === targets.join() ? previous : targets));
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  return { activeFormats, activeTargets, setActiveFormats, setActiveTargets };
}
