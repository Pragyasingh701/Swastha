const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

/**
 * Service helper for Authentication APIs
 */
export const authService = {
  /**
   * Email & Password Login -> triggers OTP email
   */
  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Login failed');
    return data;
  },

  /**
   * Register a new user with Email & Password -> triggers OTP email
   */
  async register(userData) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Registration failed');
    return data;
  },

  /**
   * Google Login (on Login page) -> verifies existing account
   */
  async loginWithGoogle(credential) {
    const response = await fetch(`${API_BASE_URL}/auth/google-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Google Sign-In failed');
    return data;
  },

  /**
   * Google Register (on Register page) -> checks existing or creates new account
   */
  async registerWithGoogle(credential, role = 'patient') {
    const response = await fetch(`${API_BASE_URL}/auth/google-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, role }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Google Registration failed');
    return data;
  },

  /**
   * Verify 6-digit OTP code -> logs in user
   */
  async verifyOTP(email, otpCode) {
    const response = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otpCode }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'OTP Verification failed');
    return data;
  },

  /**
   * Send / Resend OTP Code
   */
  async sendOTP(email) {
    const response = await fetch(`${API_BASE_URL}/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to send OTP code');
    return data;
  },

  /**
   * Update User Role in Backend
   */
  async updateRole(userId, role) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      return await response.json();
    } catch (err) {
      return { success: true, role };
    }
  },

  /**
   * Update User Profile Details (Patient or Doctor Registration)
   */
  async updateProfile(profileData) {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to save profile details');
    return data;
  },

  /**
   * Upload Registration Certificate or ID Proof Document
   */
  async uploadDocument(file, token) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}/auth/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Document upload failed');
    return data;
  },

  /**
   * Request password reset link
   */
  async forgotPassword(email) {
    const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Password reset request failed');
    return data;
  },

  /**
   * Verify if password reset token is valid
   */
  async verifyResetToken(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Invalid or expired password reset link');
      return data;
    } catch (err) {
      throw err;
    }
  },

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword) {
    const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Password reset failed');
    return data;
  },

  /**
   * Get authenticated user profile
   */
  async getProfile(token) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to fetch user profile');
      return data;
    } catch (err) {
      return null;
    }
  },
};
