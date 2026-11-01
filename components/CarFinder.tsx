"use client";

import { Card } from '@/components/ui/card';
import Quiz from '@/components/Quiz';
import type { Dictionary } from '@/lib/dictionary';

interface CarFinderProps {
  dictionary: Dictionary;
}

const CarFinder = ({ dictionary }: CarFinderProps) => {
  return (
    <section id="car-finder" className="scroll-mt-20 border-t border-border py-16 md:py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-[0.03]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-5">
              {dictionary.carFinder.title}
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground">
              {dictionary.carFinder.subtitle}
            </p>
          </div>

          <Card className="rounded-2xl border-border bg-white p-4 shadow-none sm:p-8">
            <Quiz dictionary={dictionary} />
          </Card>
        </div>
      </div>
    </section>
  );
};

export default CarFinder;