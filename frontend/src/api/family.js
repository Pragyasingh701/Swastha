import { getAuthHeader } from './client';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

function getStoredAuth() {
  try {
    const localToken = localStorage.getItem('swastha_token');
    const localUser = localStorage.getItem('swastha_user');
    const sessionToken = sessionStorage.getItem('swastha_token');
    const sessionUser = sessionStorage.getItem('swastha_user');

    const token = localToken || sessionToken;
    const user = localUser ? JSON.parse(localUser) : sessionUser ? JSON.parse(sessionUser) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

async function request(path, options = {}) {
  const { token } = getStoredAuth();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/family${path}`, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || 'Family Vault request failed');
    error.fieldErrors = data.fieldErrors || null;
    error.errorCode = data.errorCode || null;
    error.errorHint = data.errorHint || null;
    error.errorDetails = data.errorDetails || null;
    throw error;
  }

  return data;
}

export async function getFamilyDashboard() {
  return request('/summary');
}

export async function getFamilyVault() {
  return request('/vault');
}

export async function createFamilyVault() {
  return request('/vault', {
    method: 'POST',
  });
}

export async function getFamilyMembers() {
  return request('/members');
}

export async function createFamilyMember(memberData) {
  return request('/members', {
    method: 'POST',
    body: JSON.stringify(memberData),
  });
}

export async function sendFamilyMemberAuthorization(memberData) {
  return request('/members/authorize', {
    method: 'POST',
    body: JSON.stringify(memberData),
  });
}

export async function updateFamilyMember(memberId, memberData) {
  return request(`/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(memberData),
  });
}

export async function deleteFamilyMember(memberId) {
  return request(`/members/${memberId}/delete`, {
    method: 'DELETE',
  });
}

export default {
  getFamilyDashboard,
  getFamilyVault,
  createFamilyVault,
  getFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
};

