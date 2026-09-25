import { Check } from 'lucide-react';
import type { Dictionary } from '@/lib/dictionary';

interface BenefitsProps {
  dictionary: Dictionary;
}

const Benefits = ({ dictionary }: BenefitsProps) => {
  return (
    <section id="benefits" className="py-16 sm:py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10 opacity-5">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:2rem_2rem] sm:bg-[size:4rem_4rem]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
            {dictionary.benefits.title}
          </h2>
          <div className="mt-4 sm:mt-6 flex items-center justify-center gap-2">
            <div className="h-1 w-8 bg-primary/30 rounded-full" />
            <div className="h-1 w-12 bg-primary rounded-full" />
            <div className="h-1 w-8 bg-primary/30 rounded-full" />
          </div>
        </div>
        
        <div className="grid gap-12 sm:gap-16 relative">
          {dictionary.benefits.items.map((item, index) => (
            <div key={index} className="relative">
              {/* Connecting line */}
              {index !== dictionary.benefits.items.length - 1 && (
                <div className="absolute left-8 sm:left-12 top-20 sm:top-24 bottom-0 w-[2px] bg-gradient-to-b from-primary/20 to-transparent -z-10" />
              )}
              
              <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
                <div className="flex-shrink-0 w-16 h-16 sm:w-24 sm:h-24 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <div className="text-2xl sm:text-4xl font-bold text-primary" style={{ color: 'hsl(142.1 76.2% 27.3%)' }}>
                    {item.number}
                  </div>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">
                    {item.title}{' '}
                    <span className="text-primary" style={{ color: 'hsl(142.1 76.2% 27.3%)' }}>
                      {item.highlight}
                    </span>
                  </h3>
                  <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-4">
                    {item.description}
                  </p>
                  {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {[1, 2].map((_, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                        <Check className="h-3 w-3 sm:h-4 sm:w-4 text-primary" style={{ color: 'hsl(142.1 76.2% 27.3%)' }} />
                        <span>Преимущество {i + 1}</span>
                      </div>
                    ))}
                  </div> */}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;