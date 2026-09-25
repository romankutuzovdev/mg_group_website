"use client";

import { useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, TrendingDown } from 'lucide-react';
import type { Dictionary } from '@/lib/dictionary';

interface CatalogProps {
  dictionary: Dictionary;
}

const Catalog = ({ dictionary }: CatalogProps) => {
  const [filter, setFilter] = useState('all');

  const filteredCars = dictionary.catalog.cars.filter(car => 
    filter === 'all' ? true : car.condition === filter
  );

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case 'new':
        return 'bg-[#1B5E20] text-white';
      case 'used':
        return 'bg-[#0D47A1] text-white';
      case 'damaged':
        return 'bg-[#B71C1C] text-white';
      default:
        return 'bg-[#212121] text-white';
    }
  };

  const getConditionText = (condition: string) => {
    switch (condition) {
      case 'new':
        return 'Новый';
      case 'used':
        return 'С пробегом';
      case 'damaged':
        return 'Под ремонт';
      default:
        return condition;
    }
  };

  return (
    <section id="catalog" className="py-16 sm:py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-[0.03]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 sm:mb-6">
            {dictionary.catalog.title}
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground">
            {dictionary.catalog.subtitle}
          </p>
        </div>

        <div className="flex flex-nowrap overflow-x-auto gap-2 sm:gap-4 mb-8 sm:mb-12 pb-4 sm:pb-0 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-center">
          {Object.entries(dictionary.catalog.filters).map(([key, label]) => (
            <Button
              key={key}
              variant={filter === key ? 'filter' : 'outline'}
              onClick={() => setFilter(key)}
              className="flex-shrink-0 px-4 sm:px-6 h-9 sm:h-10 text-sm sm:text-base"
              aria-pressed={filter === key}
              aria-label={`Фильтр: ${label}`}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12 sm:mb-16">
          {filteredCars.map((car) => (
            <Card key={car.id} className="group overflow-hidden">
              <div className="aspect-video overflow-hidden relative">
                <Image
                  src={car.image}
                  alt={car.title}
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  quality={85}
                />
                <Badge 
                  variant="secondary"
                  className={`absolute top-4 right-4 ${getConditionColor(car.condition)}`}
                >
                  {getConditionText(car.condition)}
                </Badge>
              </div>
              <div className="p-4 sm:p-6">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-lg sm:text-xl font-semibold line-clamp-1">{car.title}</h3>
                  <span className="text-sm text-muted-foreground">{car.year}</span>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="text-lg font-semibold text-[#1B5E20]">
                    Цена в США: {car.priceUSA}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground line-through">
                      Цена в РБ: {car.priceBY}
                    </span>
                    <Badge variant="secondary" className="bg-[#1B5E20] text-white">
                      <TrendingDown className="w-3 h-3 mr-1" aria-hidden="true" />
                      {car.savings}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {car.specs.map((spec, index) => (
                    <div key={index} className="text-sm text-muted-foreground">
                      {spec}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6 sm:p-8 text-center bg-primary/5 border-primary/10">
          <h3 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4">
            {dictionary.catalog.cta.title}
          </h3>
          <p className="text-muted-foreground mb-4 sm:mb-6">
            {dictionary.catalog.cta.description}
          </p>
          <Button variant="consultation" size="lg" className="min-w-[200px]">
            <MessageCircle className="mr-2 h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            {dictionary.catalog.cta.button}
          </Button>
        </Card>
      </div>
    </section>
  );
};

export default Catalog;