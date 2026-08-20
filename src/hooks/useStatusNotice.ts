import { useEffect, useState } from 'react';

/**
 * Recado passageiro na barra de estado — uma remissão sem destino, por
 * exemplo. Se apaga sozinho: é resposta a um gesto, e não estado do ato.
 */
export function useStatusNotice(): { notice: string; setNotice: (notice: string) => void } {
  const [notice, setNotice] = useState<string>('');

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  return { notice, setNotice };
}
