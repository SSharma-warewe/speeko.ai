import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Spinner } from "@call-agent/ui";
import {
  adminLogin as apiAdminLogin,
  clearStoredAdminToken,
  clearStoredUserToken,
  getAdminMe,
  getStoredAdminToken,
  getStoredUserToken,
  getUserMe,
  userLogin as apiUserLogin,
  type AdminProfile,
  type UserProfile,
  UnauthorizedError,
} from "./api";

/* ── Admin auth ── */

type AdminAuthState = {
  token: string | null;
  admin: AdminProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AdminAuthContext = createContext<AdminAuthState | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(getStoredAdminToken()));

  const refresh = useCallback(async () => {
    const stored = getStoredAdminToken();
    if (!stored) {
      setToken(null);
      setAdmin(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const me = await getAdminMe();
      setToken(stored);
      setAdmin(me);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearStoredAdminToken();
      }
      setToken(null);
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await apiAdminLogin(email, password);
    const me = await getAdminMe();
    setToken(getStoredAdminToken());
    setAdmin(me);
  }, []);

  const logout = useCallback(() => {
    clearStoredAdminToken();
    setToken(null);
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({ token, admin, loading, login, logout, refresh }),
    [token, admin, loading, login, logout, refresh],
  );

  return (
    <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
}

function SessionSpinner() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f0eee9",
      }}
    >
      <Spinner size="lg" label="Checking session" />
    </div>
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { token, admin, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) return <SessionSpinner />;

  if (!token || !admin) {
    return (
      <Navigate to="/admin-login" replace state={{ from: location.pathname }} />
    );
  }

  return <>{children}</>;
}

/* ── Org-user auth ── */

type UserAuthState = {
  token: string | null;
  user: UserProfile | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    organizationSlug: string,
  ) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const UserAuthContext = createContext<UserAuthState | null>(null);

export function UserAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredUserToken());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(getStoredUserToken()));

  const refresh = useCallback(async () => {
    const stored = getStoredUserToken();
    if (!stored) {
      setToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const me = await getUserMe();
      setToken(stored);
      setUser(me);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        clearStoredUserToken();
      }
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string, organizationSlug: string) => {
      await apiUserLogin(email, password, organizationSlug);
      const me = await getUserMe();
      setToken(getStoredUserToken());
      setUser(me);
    },
    [],
  );

  const logout = useCallback(() => {
    clearStoredUserToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, loading, login, logout, refresh }),
    [token, user, loading, login, logout, refresh],
  );

  return (
    <UserAuthContext.Provider value={value}>{children}</UserAuthContext.Provider>
  );
}

export function useUserAuth(): UserAuthState {
  const ctx = useContext(UserAuthContext);
  if (!ctx) {
    throw new Error("useUserAuth must be used within UserAuthProvider");
  }
  return ctx;
}

export function RequireUser({ children }: { children: ReactNode }) {
  const { token, user, loading } = useUserAuth();
  const location = useLocation();

  if (loading) return <SessionSpinner />;

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
