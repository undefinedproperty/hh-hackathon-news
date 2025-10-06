import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authService, type User } from '../services/authService';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isAuthenticated = authService.isAuthenticated();
      
      if (isAuthenticated && authService.getToken()) {
        try {
          const token = authService.getToken()!;
          const payload = JSON.parse(atob(token.split('.')[1]));
          
          // Create a mock user object from JWT payload
          // In a real app, you might fetch full user details from the server
          setUser({
            id: payload.userId,
            telegramId: payload.telegramId,
            displayName: `User${payload.telegramId}`,
          });
        } catch (error) {
          console.error('Auth check failed:', error);
          authService.clearToken();
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const login = async (token: string) => {
    setIsLoading(true);
    try {
      const response = await authService.loginWithTelegram(token);
      setUser(response.user);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};