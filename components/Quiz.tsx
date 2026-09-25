import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { CF_WORKER_URL } from '@/lib/cloudflare';
import { submitLead } from '@/lib/api/client';
import { isApiEnabled } from '@/lib/api/config';
import type { Dictionary } from '@/lib/dictionary';

interface QuizProps {
  dictionary: Dictionary;
}

export const sendQuizData = async (payload: { answers: string[]; phone: string; name: string }) => {
  if (isApiEnabled()) {
    try {
      await submitLead({
        name: payload.name,
        phone: payload.phone,
        comment: payload.answers.join(' | '),
        source: 'quiz',
        model: payload.answers[0],
      });
    } catch (err) {
      console.error('Lead API error:', err);
    }
  }

  return fetch(CF_WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
};

const Quiz = ({ dictionary }: QuizProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [touchedFields, setTouchedFields] = useState({
    phone: false,
    name: false
  });

  const steps = dictionary.carFinder.steps;
  const isLastStep = currentStep === steps.length;
  const isInputStep = steps[currentStep]?.type === 'input';

  const handleNext = () => {
    if (isInputStep) {
      setAnswers([...answers, modelInput]);
    }
    setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      answers,
      phone,
      name,
    };

    try {
      await sendQuizData(payload);
      setShowSuccess(true);
    } catch (error) {
      console.error('Error submitting form:', error);
    }
    setShowSuccess(true);
  };

  const resetQuiz = () => {
    setCurrentStep(0);
    setAnswers([]);
    setModelInput('');
    setPhone('');
    setName('');
    setShowSuccess(false);
    setTouchedFields({ phone: false, name: false });
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
    setTouchedFields(prev => ({ ...prev, phone: true }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setTouchedFields(prev => ({ ...prev, name: true }));
  };

  const isFormValid = phone.trim() !== '' && name.trim() !== '';

  const renderStep = () => {
    if (isLastStep) {
      return (
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            <div>
              <Label htmlFor="phone" className="text-xl font-semibold mb-4 block">
                {dictionary.carFinder.form.phone}
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+375 (99) 999-99-99"
                required
                className="h-14 text-lg bg-background"
                aria-required="true"
                aria-invalid={touchedFields.phone && phone === ''}
                aria-describedby="phone-error"
              />
              {touchedFields.phone && phone === '' && (
                <span id="phone-error" className="text-sm text-destructive mt-1">
                  Пожалуйста, введите номер телефона
                </span>
              )}
            </div>
            <div>
              <Label htmlFor="name" className="text-xl font-semibold mb-4 block">
                {dictionary.carFinder.form.name}
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="Имя"
                required
                className="h-14 text-lg bg-background"
                aria-required="true"
                aria-invalid={touchedFields.name && name === ''}
                aria-describedby="name-error"
              />
              {touchedFields.name && name === '' && (
                <span id="name-error" className="text-sm text-destructive mt-1">
                  Пожалуйста, введите ваше имя
                </span>
              )}
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!isFormValid}
            className="w-full bg-primary hover:bg-primary/90 h-14 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Отправить форму"
          >
            {dictionary.carFinder.form.submit}
          </Button>
        </form>
      );
    }

    const step = steps[currentStep];

    if (step.type === 'input') {
      return (
        <div className="min-h-[300px]" role="form" aria-label={`Шаг ${currentStep + 1}: ${step.title}`}>
          <h3 className="text-2xl font-semibold mb-8">{step.title}</h3>
          <Input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={step.placeholder}
            className="h-14 text-lg bg-background"
            aria-label="Введите модель автомобиля"
            aria-required="true"
          />
        </div>
      );
    }

    return (
      <div className="min-h-[300px]" role="form" aria-label={`Шаг ${currentStep + 1}: ${step.title}`}>
        <h3 className="text-2xl font-semibold mb-8">{step.title}</h3>
        <RadioGroup
          value={answers[currentStep]}
          onValueChange={(value) => {
            const newAnswers = [...answers];
            newAnswers[currentStep] = value;
            setAnswers(newAnswers);
          }}
          className="grid gap-4"
          aria-required="true"
        >
          {step.options && step.options.map((option, index) => (
            <Label
              key={index}
              className={`flex items-center gap-4 p-6 border rounded-lg cursor-pointer transition-all duration-200 ${answers[currentStep] === option
                ? 'bg-primary/5 border-primary'
                : 'hover:bg-muted/50 border-border'
                }`}
            >
              <RadioGroupItem value={option} aria-label={option} />
              <span className="text-lg font-medium">{option}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-8" role="region" aria-label="Опросник по подбору автомобиля">
        <div className="transition-all duration-300 ease-in-out">
          {renderStep()}
        </div>

        <div className="flex justify-between pt-6">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={handleBack}
              size="lg"
              className="h-14 px-8 text-base font-medium"
              aria-label="Вернуться к предыдущему шагу"
            >
              <ArrowLeft className="mr-2 h-5 w-5" aria-hidden="true" />
              {dictionary.carFinder.nav.back}
            </Button>
          )}
          {!isLastStep && (
            <Button
              onClick={handleNext}
              size="lg"
              className={`h-14 px-8 text-base font-medium ${currentStep > 0 ? 'ml-auto' : 'w-full'
                }`}
              disabled={isInputStep ? !modelInput : !answers[currentStep]}
              aria-label="Перейти к следующему шагу"
            >
              {dictionary.carFinder.nav.next}
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showSuccess} onOpenChange={resetQuiz}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {dictionary.carFinder.form.success.title}
            </DialogTitle>
            <DialogDescription>
              {dictionary.carFinder.form.success.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button
              onClick={resetQuiz}
              size="lg"
              className="bg-primary hover:bg-primary/90 h-12 px-8 text-base font-medium"
              aria-label="Закрыть окно успешной отправки"
            >
              <Check className="mr-2 h-5 w-5" aria-hidden="true" />
              {dictionary.carFinder.form.success.button}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Quiz;