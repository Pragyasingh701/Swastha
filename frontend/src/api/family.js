import { apiRequest } from './client';

function request(path, options = {}, token) {
  return apiRequest(options.method || 'GET', `/family${path}`, { ...options, token });
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
    body: memberData,
  }, token);
}

export async function sendFamilyMemberAuthorization(memberData, token) {
  return request('/members/authorize', {
    method: 'POST',
    body: memberData,
  }, token);
}

export async function updateFamilyMember(memberId, memberData, token) {
  return request(`/members/${memberId}`, {
    method: 'PATCH',
    body: memberData,
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
