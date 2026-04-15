import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    try {
      const savedToken = sessionStorage.getItem('token');
      const savedUser = sessionStorage.getItem('user');
      if (savedToken && savedUser) {
        // Validate token isn't expired (decode JWT payload)
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          // Token expired — clear
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('user');
        }
      }
    } catch {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    }
    setLoading(false);
  }, []);

  const login = useCallback((tokenValue, userData) => {
    sessionStorage.setItem('token', tokenValue);
    sessionStorage.setItem('user', JSON.stringify(userData));
    setToken(tokenValue);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

