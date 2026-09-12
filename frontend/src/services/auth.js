import { apiGet, apiPost, apiRequest } from '../api/client';

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
    return apiPost('/auth/profile', profileData, { token });
  },

  async uploadDocument(file, token) {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest('POST', '/auth/upload', { body: formData, token });
  },

  async forgotPassword(email) {
    return apiPost('/auth/forgot-password', { email });
  },

  async verifyResetToken(token) {
    return apiGet('/auth/verify-reset-token', { query: { token } });
  },

  async resetPassword(token, newPassword) {
    return apiPost('/auth/reset-password', { token, newPassword });
  },

  async sendChangePasswordOTP(token) {
    return apiPost('/auth/change-password/send-otp', {}, { token });
  },

  async verifyChangePasswordOTP(otpCode, token) {
    return apiPost('/auth/change-password/verify-otp', { otpCode }, { token });
  },

  async confirmChangePassword(changeToken, newPassword, token) {
    return apiPost('/auth/change-password/confirm', { changeToken, newPassword }, { token });
  },

  async deleteAccount(token) {
    return apiPost('/auth/user', {}, { token, method: 'DELETE' });
  },

  async getUserById(userId, token) {
    return apiGet(`/auth/users/${encodeURIComponent(userId)}`, { token });
  },

  async getProfile(token) {
    try {
      const data = await apiGet('/auth/me', { token });
      return data;
    } catch (err) {
      return null;
    }
  },
};

export default authService;
