import { beforeEach, describe, expect, it } from 'vitest';
import { NEED_IDS } from '../lib/reach/model';
import { useReachStore } from './reachStore';

describe('reachStore', () => {
  beforeEach(() => {
    useReachStore.setState({ enabled: false, minutes: 15, needs: [...NEED_IDS], selectedCell: null });
  });

  it('starts off, at 15 minutes, with every need and no block', () => {
    expect(useReachStore.getState()).toMatchObject({
      enabled: false,
      minutes: 15,
      needs: [...NEED_IDS],
      selectedCell: null,
    });
  });

  it('toggleNeed never removes the last need', () => {
    useReachStore.getState().setNeeds(['ph']);
    useReachStore.getState().toggleNeed('ph');
    expect(useReachStore.getState().needs).toEqual(['ph']);
  });

  it('toggleNeed keeps display order', () => {
    useReachStore.getState().setNeeds(['st']);
    useReachStore.getState().toggleNeed('sm');
    expect(useReachStore.getState().needs).toEqual(['sm', 'st']);
  });

  it('toggleNeed removes a need when others remain', () => {
    useReachStore.getState().toggleNeed('pk');
    expect(useReachStore.getState().needs).not.toContain('pk');
  });

  it('setNeeds canonicalises and ignores an empty list', () => {
    useReachStore.getState().setNeeds(['st', 'sm']);
    expect(useReachStore.getState().needs).toEqual(['sm', 'st']);
    useReachStore.getState().setNeeds([]);
    expect(useReachStore.getState().needs).toEqual(['sm', 'st']);
  });

  it('switching off clears the selected block', () => {
    const s = useReachStore.getState();
    s.setEnabled(true);
    s.selectCell('891f1d48947ffff');
    s.setEnabled(false);
    expect(useReachStore.getState().selectedCell).toBeNull();
  });

  it('switching on keeps a selected block', () => {
    useReachStore.setState({ selectedCell: 'abc' });
    useReachStore.getState().setEnabled(true);
    expect(useReachStore.getState().selectedCell).toBe('abc');
  });

  it('setMinutes sets the time', () => {
    useReachStore.getState().setMinutes(10);
    expect(useReachStore.getState().minutes).toBe(10);
  });
});
