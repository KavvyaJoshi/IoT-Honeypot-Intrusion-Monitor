import { useCallback, useEffect, useRef, useState } from 'react';
import { describeError } from '../api/client.js';

/**
 * Fetches data and keeps the previous result while refetching, so refreshes do not flash
 * skeletons. `loading` is true only before the first response; `refreshing` during refetches.
 */
export function useApi(fetcher, deps = [], { refreshInterval = 0, enabled = true } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: enabled, refreshing: false });
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: s.data === undefined, refreshing: s.data !== undefined }));
    try {
      const data = await fetcherRef.current();
      if (id === requestId.current) setState({ data, error: null, loading: false, refreshing: false });
    } catch (error) {
      if (id === requestId.current) {
        setState((s) => ({ ...s, error: { message: describeError(error), raw: error }, loading: false, refreshing: false }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled) return undefined;
    run();
    if (!refreshInterval) return undefined;
    const timer = setInterval(run, refreshInterval);
    return () => clearInterval(timer);
  }, [run, enabled, refreshInterval]);

  return { ...state, refetch: run, setData: (updater) => setState((s) => ({ ...s, data: updater(s.data) })) };
}
