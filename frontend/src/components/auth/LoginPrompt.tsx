import { Button } from '../ui/button';
import { Card } from '../ui/card';

interface LoginPromptProps {
  onLogin: () => void;
}

export default function LoginPrompt({ }: LoginPromptProps) {
  const handleOpenTelegram = () => {
    const botUsername = 'newshhbot';
    const telegramUrl = `https://t.me/${botUsername}?start=login`;
    window.open(telegramUrl, '_blank');
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md p-8">
        <div className="text-center">
          <div className="text-6xl mb-6">🎯</div>
          <h2 className="text-2xl font-bold mb-4">Персональная лента новостей</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Войдите через Telegram, чтобы мы могли настроить персональную ленту новостей 
            специально для вас на основе ваших интересов и предпочтений.
          </p>

          <div className="space-y-4">
            <Button 
              onClick={handleOpenTelegram}
              className="w-full"
              size="lg"
            >
              <span className="mr-2">📱</span>
              Войти через Telegram
            </Button>
            
            <div className="text-sm text-muted-foreground">
              <p className="font-semibold mb-2">Как войти:</p>
              <ol className="list-decimal list-inside text-left space-y-1">
                <li>Нажмите "Войти через Telegram"</li>
                <li>Отправьте команду <code className="bg-muted px-1 rounded">/login</code></li>
                <li>Нажмите на ссылку от бота</li>
              </ol>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-muted-foreground">
              💡 Пока что вы можете просматривать все новости без авторизации
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}