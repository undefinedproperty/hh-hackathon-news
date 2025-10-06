import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Card } from '../ui/card';

export default function TelegramAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      handleTelegramLogin(token);
    }
  }, [searchParams]);

  const handleTelegramLogin = async (token: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await login(token);
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenTelegram = () => {
    const botUsername = 'newshhbot';
    const telegramUrl = `https://t.me/${botUsername}?start=login`;
    window.open(telegramUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold mb-2">Authenticating...</h2>
            <p className="text-muted-foreground">Please wait while we log you in.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-2xl font-bold mb-2">Welcome to NewsAgent</h1>
          <p className="text-muted-foreground mb-6">
            Authenticate with Telegram to access your personalized news feed
          </p>

          {error && (
            <div className="bg-destructive/15 text-destructive px-4 py-3 rounded-md mb-4">
              <h3 className="font-semibold mb-1">Authentication Failed</h3>
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <Button 
              onClick={handleOpenTelegram}
              className="w-full"
              size="lg"
            >
              <span className="mr-2">📱</span>
              Open Telegram Bot
            </Button>
            
            <div className="text-sm text-muted-foreground">
              <p>Steps to authenticate:</p>
              <ol className="list-decimal list-inside text-left mt-2 space-y-1">
                <li>Click "Open Telegram Bot"</li>
                <li>Send <code>/login</code> command</li>
                <li>Click the login link from bot</li>
              </ol>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}