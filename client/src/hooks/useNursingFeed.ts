import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../services/api';

/**
 * Loading state for one append-only bedside feed.
 *
 * The three nursing panels — observations, doses, notes — differ only in what
 * they fetch and how a row is drawn, so the fetch/loading/error/reload cycle
 * lives here once rather than three times. `reload` is what a record modal
 * calls on success, so a new entry appears without a page refresh.
 */
export default function useNursingFeed<T>(
  fetcher: () => Promise<T[]>,
  deps: unknown[]
): {
  items: T[] | null;
  error: string;
  reload: () => void;
} {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState('');

  // The fetcher is rebuilt on every render by its caller, so the dependency
  // list is passed explicitly rather than depending on the function identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setError('');
    try {
      setItems(await fetcher());
    } catch (err) {
      setItems([]);
      setError(getErrorMessage(err, 'Unable to load this part of the record.'));
    }
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { items, error, reload: load };
}
