const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://fc2dc84aa7f0.ngrok.app/api';

export interface User {
  id: string;
  telegramId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface AuthError {
  error: string;
}

class AuthService {
  private tokenKey = 'news_agent_token';

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken(): void {
    localStorage.removeItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  }

  async loginWithTelegram(token: string): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/telegram-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    this.setToken(data.token);
    return data;
  }

  logout(): void {
    this.clearToken();
  }

  async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    
    if (!token) {
      throw new Error('No authentication token');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    };

    return fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });
  }

  async fetchNoAuth(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${API_BASE_URL}${url}`, {
      ...options,
    });
  }
}

export const authService = new AuthService();