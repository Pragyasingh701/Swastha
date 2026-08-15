const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

function getStoredAuth() {
  try {
    const localToken = localStorage.getItem('swastha_token');
    const sessionToken = sessionStorage.getItem('swastha_token');
    return {
      token: localToken || sessionToken || null,
    };
  } catch {
    return { token: null };
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

  const response = await fetch(`${API_BASE_URL}/doctor-patients${path}`, {
    ...options,
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Doctor patients request failed');
  }

  return data;
}

export async function getDoctorPatients() {
  const result = await request('/');
  return result.patients || [];
}

export async function linkPatientToDoctor(patientUserId) {
  const result = await request('/link', {
    method: 'POST',
    body: { patientUserId },
  });
  return result;
}

export async function deletePatientFromDoctor(patientId, linkId = null) {
  const result = await request(`/${patientId}`, {
    method: 'DELETE',
    body: linkId ? { linkId } : {},
  });
  return result;
}

export default {
  getDoctorPatients,
  linkPatientToDoctor,
};
