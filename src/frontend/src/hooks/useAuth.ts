import { useActor } from "@caffeineai/core-infrastructure";
import { useCallback, useEffect, useState } from "react";
import { createActor } from "../backend";
import type { Role, UserInfo } from "../backend";

export type { UserInfo, Role };

export interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  changePassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<string | null>;
}

const TOKEN_KEY = "screener_token";

export function useAuth(): AuthState {
  const { actor, isFetching } = useActor(createActor);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [isValidating, setIsValidating] = useState(true);

  // On mount (or when actor becomes ready), validate stored token
  useEffect(() => {
    if (isFetching || !actor) return;

    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (!storedToken) {
      setIsValidating(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const userInfo = await actor.getCurrentUser(storedToken);
        if (!cancelled) {
          if (userInfo) {
            setUser(userInfo);
            setToken(storedToken);
          } else {
            // Token invalid — clear
            localStorage.removeItem(TOKEN_KEY);
            setToken(null);
            setUser(null);
          }
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsValidating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [actor, isFetching]);

  const login = useCallback(
    async (username: string, password: string): Promise<string | null> => {
      if (!actor) return "Not connected to backend";
      try {
        const result = await actor.login(username, password);
        if (result.__kind__ === "ok") {
          const newToken = result.ok;
          const userInfo = await actor.getCurrentUser(newToken);
          if (userInfo) {
            localStorage.setItem(TOKEN_KEY, newToken);
            setToken(newToken);
            setUser(userInfo);
            return null;
          }
          return "Failed to load user info";
        }
        return result.err;
      } catch (e) {
        return e instanceof Error ? e.message : "Login failed";
      }
    },
    [actor],
  );

  const logout = useCallback(async () => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken && actor) {
      try {
        await actor.logout(storedToken);
      } catch {
        // best-effort
      }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, [actor]);

  const changePassword = useCallback(
    async (
      oldPassword: string,
      newPassword: string,
    ): Promise<string | null> => {
      if (!actor || !token) return "Not authenticated";
      try {
        const result = await actor.changePassword(
          token,
          oldPassword,
          newPassword,
        );
        if (result.__kind__ === "ok") return null;
        return result.err;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed to change password";
      }
    },
    [actor, token],
  );

  return {
    user,
    token,
    isLoading: isFetching || isValidating,
    login,
    logout,
    changePassword,
  };
}
