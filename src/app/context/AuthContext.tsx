import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthResult, RegistrationChallenge, TwoFactorChallenge, User } from '../services/types';
import {
  clearSession, completeTwoFactorLogin as apiCompleteTwoFactor, getMe, login as apiLogin, logout as apiLogout,
  register as apiRegister, verifyRegistration as apiVerifyRegistration, verifyOtp as apiVerifyOtp,
} from '../services/api';

type AuthAttempt = { user?: User; challenge?: TwoFactorChallenge };
type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<AuthAttempt>;
  register: (body: { name: string; email: string; phone: string; password: string }) => Promise<RegistrationChallenge>;
  verifyRegistration: (phone: string, otp: string) => Promise<User>;
  verifyOtp: (body: { identifier?: string; email?: string; phone?: string; otp: string }) => Promise<AuthAttempt>;
  completeTwoFactor: (challengeToken: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
function isChallenge(result: AuthResult): result is TwoFactorChallenge { return Boolean((result as TwoFactorChallenge)?.requiresTwoFactor); }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try { const result = await getMe(); setUser(result.data); }
    catch { clearSession(); setUser(null); }
  }

  useEffect(() => { (async () => { await refreshUser(); setLoading(false); })(); }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    isAuthenticated: Boolean(user),
    async login(identifier, password) {
      const result = await apiLogin(identifier, password);
      if (isChallenge(result.data)) return { challenge: result.data };
      setUser(result.data.user); return { user: result.data.user };
    },
    async register(body) { const result = await apiRegister(body); return result.data; },
    async verifyRegistration(phone, otp) { const result = await apiVerifyRegistration(phone, otp); setUser(result.data.user); return result.data.user; },
    async verifyOtp(body) {
      const result = await apiVerifyOtp(body);
      if (isChallenge(result.data)) return { challenge: result.data };
      setUser(result.data.user); return { user: result.data.user };
    },
    async completeTwoFactor(challengeToken, code) { const result = await apiCompleteTwoFactor(challengeToken, code); setUser(result.data.user); return result.data.user; },
    async logout() { try { await apiLogout(); } finally { setUser(null); } },
    refreshUser,
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
