import type { Dictionary } from '@/lib/dictionary';
import { Phone, MapPin, Clock, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import WhatsUpIcon from '../public/whatsapp.svg';

interface FooterProps {
  dictionary: Dictionary;
}

const Footer = ({ dictionary }: FooterProps) => {
  const phones = [
    {
      number: '+375 29 866 88 11',
      hasViber: true,
      hasTelegram: true,
      hasWhatsApp: true,
    },
    {
      number: '+375 29 888 77 80',
      hasViber: true,
      hasTelegram: true,
      hasWhatsApp: true,
    },
    {
      number: '+375 33 617 36 17',
      hasViber: true,
      hasTelegram: false,
      hasWhatsApp: false,
    },
    {
      number: '+1 929 280 98 09',
      hasWhatsApp: true,
      hasTelegram: true,
    }
  ];

  const formatPhoneForLink = (phone: string) => {
    return phone.replace(/\s+/g, '');
  };

  return (
    <footer id="footer" className="hidden border-t bg-background lg:block">
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-4 md:gap-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{dictionary.footer.company.name}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {dictionary.footer.company.description}
            </p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Разделы</h3>
            <nav className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <a href="/avto/" className="hover:text-foreground transition-colors">
                Каталог авто
              </a>
              <a href="/avto/usa/" className="hover:text-foreground transition-colors">
                Авто из США
              </a>
              <a href="/avto/china/" className="hover:text-foreground transition-colors">
                Авто из Китая
              </a>
              <a href="/avto/korea/" className="hover:text-foreground transition-colors">
                Авто из Кореи
              </a>
              <a href="/avto/uk/" className="hover:text-foreground transition-colors">
                Авто из Англии
              </a>
              <a href="/kuplennye-avto/" className="hover:text-foreground transition-colors">
                Купленные авто
              </a>
              <a href="/mashinokomplekt/" className="hover:text-foreground transition-colors">
                Машинокомплекты
              </a>
              <a
                href="/kuplennye-mashinokomplekty/"
                className="hover:text-foreground transition-colors"
              >
                Купленные комплекты
              </a>
              <a href="/calculator/" className="hover:text-foreground transition-colors">
                Калькулятор
              </a>
              <a href="/otzyvy/" className="hover:text-foreground transition-colors">
                Отзывы
              </a>
              <a href="/about/" className="hover:text-foreground transition-colors">
                {dictionary.nav.about}
              </a>
              <a href="/faq/" className="hover:text-foreground transition-colors">
                {dictionary.nav.faq}
              </a>
              <a href="/contacts/" className="hover:text-foreground transition-colors">
                {dictionary.nav.contacts}
              </a>
            </nav>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Города
            </p>
            <nav className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <a href="/gorod/minsk/" className="hover:text-foreground transition-colors">
                Минск
              </a>
              <a href="/gorod/grodno/" className="hover:text-foreground transition-colors">
                Гродно
              </a>
              <a href="/gorod/brest/" className="hover:text-foreground transition-colors">
                Брест
              </a>
              <a href="/gorod/vitebsk/" className="hover:text-foreground transition-colors">
                Витебск
              </a>
              <a href="/gorod/gomel/" className="hover:text-foreground transition-colors">
                Гомель
              </a>
              <a href="/gorod/mogilev/" className="hover:text-foreground transition-colors">
                Могилёв
              </a>
            </nav>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">{dictionary.nav.contacts}</h3>
            <div className="grid grid-cols-1 gap-3">
              {phones.map((phone, index) => (
                <div key={index} className="flex items-center">
                  <div className="flex items-center min-w-[200px] gap-2">
                    <Phone className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <a 
                      href={`tel:${formatPhoneForLink(phone.number)}`}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {phone.number}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    {phone.hasViber && (
                      <a 
                        href={`viber://chat?number=${formatPhoneForLink(phone.number)}`}
                        className="w-5 h-5"
                        aria-label={`Написать в Viber на номер ${phone.number}`}
                      >
                        <Image
                          src="/viber.svg"
                          alt="Viber"
                          width={20}
                          height={20}
                          className="hover:opacity-80 transition-opacity"
                        />
                      </a>
                    )}
                    {phone.hasTelegram && (
                      <a 
                        href={`https://t.me/${formatPhoneForLink(phone.number)}`}
                        className="w-5 h-5"
                        aria-label={`Написать в Telegram на номер ${phone.number}`}
                      >
                        <Image
                          src="/telegram.svg"
                          alt="Telegram"
                          width={20}
                          height={20}
                          className="hover:opacity-80 transition-opacity"
                        />
                      </a>
                    )}
                    {phone.hasWhatsApp && (
                      <a 
                        href={`https://wa.me/${formatPhoneForLink(phone.number)}`}
                        aria-label={`Написать в WhatsApp на номер ${phone.number}`}
                      >
                         <Image
                          src="/whatsapp.svg"
                          alt="Whatsup"
                          width={25}
                          height={25}
                          className="hover:opacity-80 transition-opacity"
                        />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4">Адрес</h3>
            <div className="space-y-3">
              <a 
                href="https://maps.google.com/?q=Гродно+Гаспадарчая+19"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 text-muted-foreground hover:text-foreground group transition-colors"
              >
                <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
                <span>Г. Гродно, Ул. Гаспадарчая 19 каб.340/1 БЦ. Марро</span>
                <ExternalLink className="h-4 w-4 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span className="whitespace-pre-line">{dictionary.contact.hours}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          <p>{dictionary.footer.copyright.replace('{year}', new Date().getFullYear().toString())}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;