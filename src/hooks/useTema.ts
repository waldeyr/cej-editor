import { useCallback, useEffect, useState } from 'react';
import { Tema, aplicarTema, guardarTema, temaGuardado } from '../utils/tema';

/**
 * Tema do chrome. O inline script de index.html já pintou a primeira tela;
 * daqui em diante a escolha vive neste estado, vinda do menu "Exibir" da
 * barra ou do menu da aplicação no desktop. Só o <html data-tema> muda:
 * nenhum componente consulta o tema — todos leem tokens.
 */
export function useTema(): { tema: Tema; definirTema: (escolhido: Tema) => void } {
  const [tema, setTema] = useState<Tema>(temaGuardado);

  useEffect(() => {
    aplicarTema(tema);
    void window.electronAPI?.informarTema?.(tema);
    if (tema !== 'sistema') return;

    // Em "sistema", a troca de preferência do SO repinta o chrome na hora.
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudar = () => aplicarTema('sistema');
    media.addEventListener('change', aoMudar);
    return () => media.removeEventListener('change', aoMudar);
  }, [tema]);

  const definirTema = useCallback((escolhido: Tema) => {
    guardarTema(escolhido);
    setTema(escolhido);
  }, []);

  // O item "Exibir → Tema" do menu da aplicação dispara o mesmo canal.
  useEffect(() => window.electronAPI?.onTemaDefinido?.(definirTema), [definirTema]);

  return { tema, definirTema };
}
