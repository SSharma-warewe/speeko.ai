import { useCallback, useEffect, useState } from "react";
import { NotFoundError, UnauthorizedError } from "../../lib/api";
import { useAdminAuth, useUserAuth } from "../../lib/auth";

type State<T> = {
  data: T | null;
  error: string | null;
  notFound: boolean;
  loading: boolean;
  reload: () => void;
};

function useAsyncWithLogout<T>(
  loader: () => Promise<T>,
  logout: () => void,
  deps: unknown[] = [],
): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    loader()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof UnauthorizedError) {
          logout();
          return;
        }
        if (err instanceof NotFoundError) {
          setNotFound(true);
          setError(err.message);
          setLoading(false);
          return;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, logout, ...deps]);

  return { data, error, notFound, loading, reload };
}

/** Admin-dashboard data loader (401 → admin logout). */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): State<T> {
  const { logout } = useAdminAuth();
  return useAsyncWithLogout(loader, logout, deps);
}

/** User-dashboard data loader (401 → user logout). */
export function useUserAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
): State<T> {
  const { logout } = useUserAuth();
  return useAsyncWithLogout(loader, logout, deps);
}
