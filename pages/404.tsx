import { Button } from '@/components/ui/button';
import { Home } from 'lucide-react';
import { getDictionary } from '@/lib/dictionary';
import SEO from '@/components/SEO';

export default function Custom404() {
  const dictionary = getDictionary();

  return (
    <>
      <SEO dictionary={dictionary} lang="ru" />
      <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-[0.03]" />
        </div>

        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <div className="space-y-6">
            {/* 404 Number */}
            <div className="relative">
              <div className="text-[8rem] font-bold text-primary/10">404</div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-4xl font-bold">404</div>
              </div>
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Страница не найдена</h1>
              <p className="text-muted-foreground">
                К сожалению, запрашиваемая страница не существует или была перемещена.
              </p>
            </div>

            {/* Back to Home Button */}
            <Button asChild size="lg" className="mt-8">
              <a href="/">
                <Home className="mr-2 h-4 w-4" />
                На главную
              </a>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}