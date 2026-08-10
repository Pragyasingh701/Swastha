import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext(null);

const getInitialAuth = () => {
  try {
    const remember = localStorage.getItem('swastha_remember');
    const localToken = localStorage.getItem('swastha_token');
    const localUser = localStorage.getItem('swastha_user');
    const sessionToken = sessionStorage.getItem('swastha_token');
    const sessionUser = sessionStorage.getItem('swastha_user');

    if (remember === 'true' && localToken) {
      return {
        token: localToken,
        user: localUser ? JSON.parse(localUser) : null,
      };
    }
    if (sessionToken) {
      return {
        token: sessionToken,
        user: sessionUser ? JSON.parse(sessionUser) : null,
      };
    }
    if (localToken && remember !== 'false') {
      return {
        token: localToken,
        user: localUser ? JSON.parse(localUser) : null,
      };
    }
  } catch (e) {
    console.error('Error parsing initial auth state:', e);
  }
  return { token: null, user: null };
};

export const AuthProvider = ({ children }) => {
  const initialAuth = getInitialAuth();
  const [user, setUser] = useState(initialAuth.user);
  const [token, setToken] = useState(initialAuth.token);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const saveAuthSession = (newToken, newUser, remember = false) => {
    setToken(newToken);
    setUser(newUser);

    if (newToken && newUser) {
      if (remember) {
        localStorage.setItem('swastha_token', newToken);
        localStorage.setItem('swastha_user', JSON.stringify(newUser));
        localStorage.setItem('swastha_remember', 'true');
        sessionStorage.removeItem('swastha_token');
        sessionStorage.removeItem('swastha_user');
      } else {
        sessionStorage.setItem('swastha_token', newToken);
        sessionStorage.setItem('swastha_user', JSON.stringify(newUser));
        localStorage.setItem('swastha_remember', 'false');
        localStorage.removeItem('swastha_token');
        localStorage.removeItem('swastha_user');
      }
    } else {
      localStorage.removeItem('swastha_token');
      localStorage.removeItem('swastha_user');
      localStorage.removeItem('swastha_remember');
      sessionStorage.removeItem('swastha_token');
      sessionStorage.removeItem('swastha_user');
    }
  };

  useEffect(() => {
    if (!token) return;
    const isRemembered = localStorage.getItem('swastha_remember') === 'true';
    if (isRemembered) {
      if (token) localStorage.setItem('swastha_token', token);
      if (user) localStorage.setItem('swastha_user', JSON.stringify(user));
    } else {
      if (token) sessionStorage.setItem('swastha_token', token);
      if (user) sessionStorage.setItem('swastha_user', JSON.stringify(user));
    }
  }, [user, token]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateProfileFromDatabase() {
      if (!token) {
        if (!cancelled) {
          setAuthReady(true);
        }
        return;
      }

      try {
        const result = await authService.getProfile(token);
        if (!cancelled && result?.user) {
          setUser(result.user);
        }
      } catch {
        // Keep cached local auth state if backend unavailable
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    hydrateProfileFromDatabase();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = async (email, password, remember = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.login(email, password);
      if (result.token && result.user) {
        saveAuthSession(result.token, result.user, remember);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData, remember = true) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.register(userData);
      if (result.token && result.user) {
        saveAuthSession(result.token, result.user, remember);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (googleResponse, remember = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const tokenToSend = typeof googleResponse === 'object' && googleResponse !== null
        ? (googleResponse.access_token || googleResponse.credential || googleResponse.id_token || googleResponse.token || googleResponse)
        : googleResponse;
      const result = await authService.loginWithGoogle(tokenToSend);
      if (result.token && result.user) {
        saveAuthSession(result.token, result.user, remember);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithGoogle = async (googleResponse, role = 'patient', remember = true) => {
    setIsLoading(true);
    setError(null);
    try {
      const tokenToSend = typeof googleResponse === 'object' && googleResponse !== null
        ? (googleResponse.access_token || googleResponse.credential || googleResponse.id_token || googleResponse.token || googleResponse)
        : googleResponse;
      const result = await authService.registerWithGoogle(tokenToSend, role);
      if (result.token && result.user) {
        saveAuthSession(result.token, result.user, remember);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOTP = async (email, otpCode, remember = true) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.verifyOTP(email, otpCode);
      if (result.token && result.user) {
        saveAuthSession(result.token, result.user, remember);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    saveAuthSession(null, null, false);
  };

  const setUserRole = (role) => {
    const currentUser = user || (() => {
      try {
        return JSON.parse(localStorage.getItem('swastha_user') || sessionStorage.getItem('swastha_user') || 'null');
      } catch (e) {
        return null;
      }
    })();
    if (currentUser) {
      const updated = { ...currentUser, role, hasSelectedRole: !!currentUser.hasSelectedRole };
      setUser(updated);
      authService.updateRole(currentUser.id || currentUser.email, role);
    }
  };

  const updateProfile = async (profileData) => {
    setIsLoading(true);
    setError(null);
    try {
      const currentUser = user || (() => {
        try {
          return JSON.parse(localStorage.getItem('swastha_user') || sessionStorage.getItem('swastha_user') || 'null');
        } catch (e) {
          return null;
        }
      })();
      const payload = {
        email: currentUser?.email || profileData?.email,
        userId: currentUser?.id,
        ...profileData,
      };
      const result = await authService.updateProfile(payload, token);
      if (result?.user) {
        setUser(result.user);
      } else {
        setUser((prev) => ({ ...(prev || currentUser || {}), ...profileData, hasSelectedRole: true }));
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const sendOTP = async (email) => {
    try {
      return await authService.sendOTP(email);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const uploadDocument = async (file) => {
    try {
      return await authService.uploadDocument(file, token);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        authReady,
        isLoading,
        error,
        login,
        register,
        loginWithGoogle,
        registerWithGoogle,
        verifyOTP,
        sendOTP,
        logout,
        setUserRole,
        updateProfile,
        uploadDocument,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

