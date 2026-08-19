import { apiGet, apiPost, getAuthHeader } from '../api/client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

export const authService = {
  async login(email, password) {
    return apiPost('/auth/login', { email, password });
  },

  async register(userData) {
    return apiPost('/auth/register', userData);
  },

  async exchangeGoogleCode({ code, redirectUri, mode = 'login', role }) {
    return apiPost('/auth/google/exchange', { code, redirectUri, mode, role });
  },

  async verifyOTP(email, otpCode) {
    return apiPost('/auth/verify-otp', { email, otpCode });
  },

  async sendOTP(email) {
    return apiPost('/auth/send-otp', { email });
  },

  async updateRole(userId, role) {
    return apiPost('/auth/role', { userId, role });
  },

  async updateProfile(profileData, token) {
    // apiPost attaches stored token; pass explicit header when token provided
    const headers = token ? getAuthHeader(token) : undefined;
    return apiPost('/auth/profile', profileData, { headers });
  },

  async uploadDocument(file, token) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = token ? getAuthHeader(token) : getAuthHeader();
    const response = await fetch(`${API_BASE_URL}/auth/upload`, {
      method: 'POST',
      headers: headers && Object.keys(headers).length ? headers : undefined,
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Document upload failed');
    return data;
  },

  async forgotPassword(email) {
    return apiPost('/auth/forgot-password', { email });
  },

  async verifyResetToken(token) {
    return apiGet(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
  },

  async resetPassword(token, newPassword) {
    return apiPost('/auth/reset-password', { token, newPassword });
  },

  async sendChangePasswordOTP(token) {
    return apiPost('/auth/change-password/send-otp', {}, { headers: getAuthHeader(token) });
  },

  async verifyChangePasswordOTP(otpCode, token) {
    return apiPost('/auth/change-password/verify-otp', { otpCode }, { headers: getAuthHeader(token) });
  },

  async confirmChangePassword(changeToken, newPassword, token) {
    return apiPost('/auth/change-password/confirm', { changeToken, newPassword }, { headers: getAuthHeader(token) });
  },

  async deleteAccount(token) {
    return apiPost('/auth/user', {}, { headers: getAuthHeader(token), method: 'DELETE' });
  },

  async getUserById(userId, token) {
    return apiGet(`/auth/users/${encodeURIComponent(userId)}`, { headers: getAuthHeader(token) });
  },

  async getProfile(token) {
    try {
      const data = await apiGet('/auth/me', { headers: getAuthHeader(token) });
      return data;
    } catch (err) {
      return null;
    }
  },
};

export default authService;
