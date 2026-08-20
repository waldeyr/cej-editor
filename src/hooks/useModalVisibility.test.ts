import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useModalVisibility } from './useModalVisibility';

describe('visibilidade das caixas de diálogo', () => {
  it('nasce com todas fechadas, e cada uma abre e fecha sem afetar as outras', () => {
    const { result } = renderHook(() => useModalVisibility());

    expect(result.current.showLinkModal).toBe(false);
    expect(result.current.showUrlModal).toBe(false);
    expect(result.current.showTitleModal).toBe(false);
    expect(result.current.showTableModal).toBe(false);
    expect(result.current.showSaveAsModal).toBe(false);

    act(() => result.current.setShowTableModal(true));

    expect(result.current.showTableModal).toBe(true);
    expect(result.current.showLinkModal).toBe(false);
    expect(result.current.showUrlModal).toBe(false);
    expect(result.current.showTitleModal).toBe(false);
    expect(result.current.showSaveAsModal).toBe(false);

    act(() => result.current.setShowTableModal(false));
    expect(result.current.showTableModal).toBe(false);
  });
});
