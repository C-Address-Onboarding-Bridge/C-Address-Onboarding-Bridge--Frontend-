import { renderHook, act, waitFor } from '@testing-library/react';
import { useHealthStatus } from '../hooks/useHealthStatus';
import * as api from '../lib/api';

jest.mock('../lib/api');

const mockedFetchHealth = api.fetchHealth as jest.MockedFunction<typeof api.fetchHealth>;

describe('useHealthStatus', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedFetchHealth.mockReset();
    mockedFetchHealth.mockResolvedValue({ status: 'ok' });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('polls health status on an interval while visible', async () => {
    renderHook(() => useHealthStatus());

    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(1));

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(2));
  });

  it('pauses polling while the tab is hidden', async () => {
    renderHook(() => useHealthStatus());

    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      jest.advanceTimersByTime(90_000);
    });

    expect(mockedFetchHealth).toHaveBeenCalledTimes(1);
  });

  it('refreshes immediately when the tab becomes visible again', async () => {
    renderHook(() => useHealthStatus());

    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => expect(mockedFetchHealth).toHaveBeenCalledTimes(2));
  });
});
