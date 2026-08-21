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

async function request(path, options = {}, explicitToken = null) {
  const { token: storedToken } = getStoredAuth();
  const token = explicitToken || storedToken;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(getAuthHeader(token)),
  };

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

export async function getFamilyDashboard(token) {
  return request('/summary', {}, token);
}

export async function getFamilyVault(token) {
  return request('/vault', {}, token);
}

export async function createFamilyVault(token) {
  return request('/vault', {
    method: 'POST',
  }, token);
}

export async function getFamilyMembers(token) {
  return request('/members', {}, token);
}

export async function createFamilyMember(memberData, token) {
  return request('/members', {
    method: 'POST',
    body: JSON.stringify(memberData),
  }, token);
}

export async function sendFamilyMemberAuthorization(memberData, token) {
  return request('/members/authorize', {
    method: 'POST',
    body: JSON.stringify(memberData),
  }, token);
}

export async function updateFamilyMember(memberId, memberData, token) {
  return request(`/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(memberData),
  }, token);
}

export async function deleteFamilyMember(memberId, token) {
  return request(`/members/${memberId}/delete`, {
    method: 'DELETE',
  }, token);
}

export default {
  getFamilyDashboard,
  getFamilyVault,
  createFamilyVault,
  getFamilyMembers,
  createFamilyMember,
  updateFamilyMember,
};
