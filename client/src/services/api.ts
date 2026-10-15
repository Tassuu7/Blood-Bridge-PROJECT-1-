const API_BASE_URL = '/api';

export function getToken(): string | null {
  return localStorage.getItem('bloodbridge_token');
}

export function setToken(token: string): void {
  localStorage.setItem('bloodbridge_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('bloodbridge_token');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: 'Failed to parse response from server.',
  }));

  if (!response.ok) {
    throw new Error(data.message || `Request failed with status ${response.status}`);
  }

  return data;
}

// Convenience API methods
export const api = {
  // Auth
  login: (credentials: { email: string; password: string }) =>
    apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
  
  register: (payload: any) =>
    apiRequest('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  
  getCurrentUser: () =>
    apiRequest('/auth/me', { method: 'GET' }),
  
  demoLogin: (role: string) =>
    apiRequest('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role }) }),

  // Requests
  createBloodRequest: (data: any) =>
    apiRequest('/requests', { method: 'POST', body: JSON.stringify(data) }),

  getBloodRequests: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/requests${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  getBloodRequestById: (id: string) =>
    apiRequest(`/requests/${id}`, { method: 'GET' }),

  markBloodReceived: (id: string, notes?: string) =>
    apiRequest(`/requests/${id}/complete`, { method: 'POST', body: JSON.stringify({ notes }) }),

  triggerEscalation: (id: string, stage?: number) =>
    apiRequest(`/requests/${id}/escalate`, { method: 'POST', body: JSON.stringify({ stage }) }),

  cancelBloodRequest: (id: string, payload: { reason: string; notes?: string }) =>
    apiRequest(`/requests/${id}/cancel`, { method: 'POST', body: JSON.stringify(payload) }),

  // Donors
  getDonorDashboard: () =>
    apiRequest('/donors/dashboard', { method: 'GET' }),

  updateDonorAvailability: (status: string) =>
    apiRequest('/donors/availability', { method: 'PUT', body: JSON.stringify({ status }) }),

  respondToMatch: (matchId: string, action: 'ACCEPT' | 'DECLINE', declineReason?: string) =>
    apiRequest(`/donors/matches/${matchId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action, declineReason }),
    }),

  // Hospitals
  getHospitalsList: () =>
    apiRequest('/hospitals', { method: 'GET' }),

  getHospitalDashboard: () =>
    apiRequest('/hospitals/dashboard', { method: 'GET' }),

  verifyBloodRequest: (requestId: string, status: string, reviewNotes?: string) =>
    apiRequest(`/hospitals/requests/${requestId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ status, reviewNotes }),
    }),

  // Admin
  getAdminOverview: () =>
    apiRequest('/admin/overview', { method: 'GET' }),

  getDuplicateQueue: () =>
    apiRequest('/admin/duplicates', { method: 'GET' }),

  getUsersList: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/users${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  updateUserStatus: (userId: string, status: string) =>
    apiRequest(`/admin/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getAuditLogs: (params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/admin/audit-logs${query ? `?${query}` : ''}`, { method: 'GET' });
  },

  // Notifications
  getNotifications: () =>
    apiRequest('/notifications', { method: 'GET' }),

  markNotificationAsRead: (id: string) =>
    apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllNotificationsAsRead: () =>
    apiRequest('/notifications/read-all', { method: 'POST' }),

  // Donor Preferences
  getDonorPreferences: () =>
    apiRequest('/donor-preferences', { method: 'GET' }),

  updateDonorPreferences: (data: any) =>
    apiRequest('/donor-preferences', { method: 'PUT', body: JSON.stringify(data) }),

  // Badges & Gamification
  getDonorBadges: (donorId?: string) =>
    apiRequest(`/badges/profile${donorId ? `?donorId=${donorId}` : ''}`, { method: 'GET' }),

  getLeaderboard: (limit?: number) =>
    apiRequest(`/badges/leaderboard${limit ? `?limit=${limit}` : ''}`, { method: 'GET' }),

  getBadgeCatalog: () =>
    apiRequest('/badges/catalog', { method: 'GET' }),

  // Health Screening
  evaluateHealthScreening: (data: any) =>
    apiRequest('/health-screening/evaluate', { method: 'POST', body: JSON.stringify(data) }),

  // Emergency Broadcasts
  getActiveBroadcasts: () =>
    apiRequest('/broadcasts/active', { method: 'GET' }),

  issueBroadcast: (data: any) =>
    apiRequest('/broadcasts', { method: 'POST', body: JSON.stringify(data) }),

  revokeBroadcast: (id: string) =>
    apiRequest(`/broadcasts/${id}/revoke`, { method: 'POST' }),

  // Hospital Inventory & Staff
  getHospitalInventory: (hospitalId?: string) =>
    apiRequest(`/inventory${hospitalId ? `?hospitalId=${hospitalId}` : ''}`, { method: 'GET' }),

  restockInventory: (data: any) =>
    apiRequest('/inventory/restock', { method: 'POST', body: JSON.stringify(data) }),

  reserveInventory: (data: any) =>
    apiRequest('/inventory/reserve', { method: 'POST', body: JSON.stringify(data) }),

  dispenseInventory: (data: any) =>
    apiRequest('/inventory/dispense', { method: 'POST', body: JSON.stringify(data) }),

  getHospitalStaff: (hospitalId?: string) =>
    apiRequest(`/hospital-staff${hospitalId ? `?hospitalId=${hospitalId}` : ''}`, { method: 'GET' }),

  addHospitalStaff: (data: any) =>
    apiRequest('/hospital-staff', { method: 'POST', body: JSON.stringify(data) }),

  deleteHospitalStaff: (id: string) =>
    apiRequest(`/hospital-staff/${id}`, { method: 'DELETE' }),

  // Feedback & Reviews
  submitFeedback: (data: any) =>
    apiRequest('/feedback', { method: 'POST', body: JSON.stringify(data) }),

  getDonorFeedback: (donorId: string) =>
    apiRequest(`/feedback/donor/${donorId}`, { method: 'GET' }),
};
