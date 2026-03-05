// ============================================
// API CLIENT - Environment-aware configuration
// ============================================

// Determine API URL based on environment
const getApiUrl = () => {
    // Check if running in development (localhost)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000/api';
    }

    // Production: API is served from same domain or configured separately
    // If your backend is deployed separately (e.g., Render, Railway, Heroku):
    // return 'https://your-backend-url.com/api';

    // If backend is on same domain (e.g., Vercel with serverless functions):
    return '/api';
};

const API_URL = getApiUrl();

// Get stored token
const getToken = () => localStorage.getItem('token');

// API request wrapper with improved error handling
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    const config = {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        }
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);

        // Handle non-JSON responses
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { error: text || 'Server error' };
        }

        if (!response.ok) {
            // Token expired or invalid - redirect to login (except during login/register)
            if ((response.status === 401 || response.status === 403) &&
                endpoint !== '/auth/login' &&
                endpoint !== '/auth/register') {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        // Network error or other issues
        if (error.message === 'Failed to fetch') {
            throw new Error('Unable to connect to server. Please check your connection.');
        }
        throw error;
    }
}

// Auth functions
const auth = {
    async register(username, email, password) {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return data;
    },

    async login(username, password) {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        return data;
    },

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
    },

    async getProfile() {
        return await apiRequest('/auth/profile');
    },

    isLoggedIn() {
        return !!getToken();
    },

    getCurrentUser() {
        const u = localStorage.getItem('user');
        return u ? JSON.parse(u) : null;
    },

    // Handle OAuth callback (when redirected from Google)
    handleOAuthCallback() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const userStr = params.get('user');

        if (token && userStr) {
            try {
                const user = JSON.parse(decodeURIComponent(userStr));
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user));
                // Redirect to main app, removing query params
                window.location.href = '/';
                return true;
            } catch (e) {
                console.error('Failed to parse OAuth user data:', e);
            }
        }
        return false;
    }
};

// Notes functions
const notes = {
    async getAll(filters = {}) {
        const params = new URLSearchParams(filters);
        return await apiRequest(`/notes?${params}`);
    },

    async getOne(id) {
        return await apiRequest(`/notes/${id}`);
    },

    async create(noteData) {
        return await apiRequest('/notes', {
            method: 'POST',
            body: JSON.stringify(noteData)
        });
    },

    async update(id, updates) {
        return await apiRequest(`/notes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(updates)
        });
    },

    async delete(id) {
        return await apiRequest(`/notes/${id}`, {
            method: 'DELETE'
        });
    },

    async bulkDelete(noteIds) {
        return await apiRequest('/notes/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ noteIds })
        });
    }
};

// Library functions
const library = {
    async getAll(filters = {}) {
        const params = new URLSearchParams(filters);
        return await apiRequest(`/library?${params}`);
    },

    async publish(noteId, description) {
        return await apiRequest('/library/publish', {
            method: 'POST',
            body: JSON.stringify({ noteId, description })
        });
    },

    async clone(id) {
        return await apiRequest(`/library/${id}/clone`, {
            method: 'POST'
        });
    },

    async getMyPublished() {
        return await apiRequest('/library/my-published');
    },

    async delete(id) {
        return await apiRequest(`/library/${id}`, {
            method: 'DELETE'
        });
    },

    async upload(chapter) {
        return await apiRequest('/library/upload', {
            method: 'POST',
            body: JSON.stringify(chapter)
        });
    }
};

// Stats function
const getStats = async () => {
    return await apiRequest('/stats');
};

// Sync function
const sync = async (lastSyncTime) => {
    const params = lastSyncTime ? `?lastSync=${lastSyncTime}` : '';
    return await apiRequest(`/sync${params}`);
};

// Health check
const checkHealth = async () => {
    try {
        return await apiRequest('/health');
    } catch (error) {
        console.error('Health check failed:', error);
        return { status: 'ERROR', error: error.message };
    }
};

// Export API object
window.api = {
    auth,
    notes,
    library,
    getStats,
    sync,
    checkHealth,
    getApiUrl: () => API_URL
};
