import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../../services/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('swastha_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('swastha_token') || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('swastha_token', token);
    } else {
      localStorage.removeItem('swastha_token');
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('swastha_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('swastha_user');
    }
  }, [user]);

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
        // Keep the cached local auth state if the backend is unavailable.
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

  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.login(email, password);
      if (result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.register(userData);
      if (result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (googleResponse) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.loginWithGoogle(googleResponse.credential || googleResponse);
      if (result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithGoogle = async (googleResponse, role = 'patient') => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.registerWithGoogle(googleResponse.credential || googleResponse, role);
      if (result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
      }
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOTP = async (email, otpCode) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.verifyOTP(email, otpCode);
      if (result.token && result.user) {
        setToken(result.token);
        setUser(result.user);
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
    setToken(null);
    setUser(null);
    localStorage.removeItem('swastha_token');
    localStorage.removeItem('swastha_user');
  };

  const setUserRole = (role) => {
    const currentUser = user || JSON.parse(localStorage.getItem('swastha_user') || 'null');
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
      const currentUser = user || JSON.parse(localStorage.getItem('swastha_user') || 'null');
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
