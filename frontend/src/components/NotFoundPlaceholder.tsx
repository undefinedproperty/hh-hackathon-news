import { useCallback } from 'react'
import Lottie from 'lottie-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import notFoundAnimation from '@/assets/not_found.json'

interface NotFoundPlaceholderProps {
  onSourcesClick: () => void
}

export default function NotFoundPlaceholder({ onSourcesClick }: NotFoundPlaceholderProps) {
  const handleSourcesClick = useCallback(() => {
    onSourcesClick()
  }, [onSourcesClick])

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-6 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          {/* Lottie Animation */}
          <div className="w-48 h-48">
            <Lottie
              animationData={notFoundAnimation}
              loop={true}
              autoplay={true}
              style={{ width: '100%', height: '100%' }}
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              Ничего не найдено
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Попробуй изменить фильтры или{' '}
              <Button
                variant="link"
                className="p-0 h-auto text-sm font-medium text-blue-600 hover:text-blue-800 underline-offset-4"
                onClick={handleSourcesClick}
              >
                изменить источники
              </Button>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}