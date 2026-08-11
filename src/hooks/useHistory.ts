import { useState, useCallback } from 'react';
import { LegislativeDocument } from '../types/legislative';

const MAX_HISTORY_LENGTH = 50;

export function useHistory(initialPresent: LegislativeDocument) {
  const [past, setPast] = useState<LegislativeDocument[]>([]);
  const [present, setPresent] = useState<LegislativeDocument>(initialPresent);
  const [future, setFuture] = useState<LegislativeDocument[]>([]);

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const undo = useCallback(() => {
    if (!canUndo) return;

    setPast((prevPast) => {
      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, prevPast.length - 1);

      setFuture((prevFuture) => [present, ...prevFuture]);
      setPresent(previous);

      return newPast;
    });
  }, [canUndo, present]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    setFuture((prevFuture) => {
      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);

      setPast((prevPast) => [...prevPast, present]);
      setPresent(next);

      return newFuture;
    });
  }, [canRedo, present]);

  const set = useCallback(
    (newPresent: LegislativeDocument | ((prev: LegislativeDocument) => LegislativeDocument)) => {
      setPresent((currentPresent) => {
        const nextPresent = typeof newPresent === 'function' ? newPresent(currentPresent) : newPresent;

        if (JSON.stringify(currentPresent) === JSON.stringify(nextPresent)) {
          return currentPresent;
        }

        setPast((prevPast) => {
          const updatedPast = [...prevPast, currentPresent];
          if (updatedPast.length > MAX_HISTORY_LENGTH) {
            return updatedPast.slice(updatedPast.length - MAX_HISTORY_LENGTH);
          }
          return updatedPast;
        });

        setFuture([]);
        return nextPresent;
      });
    },
    []
  );

  const reset = useCallback((newPresent: LegislativeDocument) => {
    setPast([]);
    setPresent(newPresent);
    setFuture([]);
  }, []);

  return {
    state: present,
    setState: set,
    resetState: reset,
    undo,
    redo,
    canUndo,
    canRedo,
    historyLength: past.length,
  };
}
