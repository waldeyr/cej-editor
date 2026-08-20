import { useState } from 'react';

/**
 * Visibilidade das caixas de diálogo da barra de comandos — remissão, endereço,
 * título, tabela e "Salvar como". Cada uma é um par (aberta, fechar) sem
 * relação entre si: quem decide quando abrir continua em `App.tsx`, perto do
 * gesto que a dispara.
 */
export function useModalVisibility() {
  const [showLinkModal, setShowLinkModal] = useState<boolean>(false);
  const [showUrlModal, setShowUrlModal] = useState<boolean>(false);
  const [showTitleModal, setShowTitleModal] = useState<boolean>(false);
  const [showTableModal, setShowTableModal] = useState<boolean>(false);
  const [showSaveAsModal, setShowSaveAsModal] = useState<boolean>(false);

  return {
    showLinkModal,
    setShowLinkModal,
    showUrlModal,
    setShowUrlModal,
    showTitleModal,
    setShowTitleModal,
    showTableModal,
    setShowTableModal,
    showSaveAsModal,
    setShowSaveAsModal,
  };
}
