import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Package2, Timer, Shield, Car } from 'lucide-react';
import type { Dictionary } from '@/lib/dictionary';

interface PartsProps {
  dictionary: Dictionary;
}

const Parts = ({ dictionary }: PartsProps) => {
  return (
    <section id="parts" className="py-24 bg-muted/50 relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-[0.03]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            {dictionary.parts.title}
          </h2>
          <p className="text-xl text-muted-foreground">
            {dictionary.parts.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          {dictionary.parts.features.map((feature, index) => (
            <Card key={index} className="p-8 bg-background/50 backdrop-blur-sm">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  {index === 0 && <Package2 className="h-8 w-8 text-[#2E7D32]" />}
                  {index === 1 && <Timer className="h-8 w-8 text-[#2E7D32]" />}
                  {index === 2 && <Car className="h-8 w-8 text-[#2E7D32]" />}
                  {index === 3 && <Shield className="h-8 w-8 text-[#2E7D32]" />}
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-8 text-center bg-primary/5 border-primary/10">
          <h3 className="text-2xl font-semibold mb-4">
            {dictionary.parts.cta.title}
          </h3>
          <p className="text-muted-foreground mb-6">
            {dictionary.parts.cta.description}
          </p>
          <Button variant="consultation"  asChild size="lg" className="min-w-[200px]">
            <a 
                href={dictionary.global.tgLink}  
                target="_blank" 
                rel="noopener noreferrer"
                className="whitespace-nowrap"
                aria-label="Получить консультацию в Telegram"
              >
              <MessageCircle className="mr-2 h-5 w-5" />
              {dictionary.parts.cta.button}
            </a>
          </Button>
        </Card>
      </div>
    </section>
  );
};

export default Parts;