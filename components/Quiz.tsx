import { useState } from "react";
import { useRouter } from "next/router";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CF_WORKER_URL } from "@/lib/cloudflare";
import { submitLead } from "@/lib/api/client";
import { isApiEnabled } from "@/lib/api/config";
import type { Dictionary } from "@/lib/dictionary";

interface QuizProps {
  dictionary: Dictionary;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Send lead; never block the thank-you redirect for more than a few seconds. */
export const sendQuizData = async (payload: {
  answers: string[];
  phone: string;
  name: string;
}) => {
  const tasks: Promise<unknown>[] = [];

  if (isApiEnabled()) {
    tasks.push(
      submitLead({
        name: payload.name,
        phone: payload.phone,
        comment: payload.answers.join(" | "),
        source: "quiz",
        model: payload.answers[0],
        page: typeof window !== "undefined" ? window.location.pathname : undefined,
      }).catch((err) => console.error("Lead API error:", err)),
    );
  }

  if (CF_WORKER_URL) {
    tasks.push(
      fetch(CF_WORKER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => console.error("CF Worker error:", err)),
    );
  }

  await withTimeout(Promise.allSettled(tasks), 4500);
};

const Quiz = ({ dictionary }: QuizProps) => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [touchedFields, setTouchedFields] = useState({
    phone: false,
    name: false,
  });

  const steps = dictionary.carFinder.steps;
  const isLastStep = currentStep === steps.length;
  const isInputStep = steps[currentStep]?.type === "input";

  const handleNext = () => {
    if (isInputStep) {
      setAnswers([...answers, modelInput]);
    }
    setCurrentStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setCurrentStep((prev) => prev - 1);
  };

  const goThanks = async () => {
    try {
      await router.push("/thanks/");
    } catch {
      if (typeof window !== "undefined") window.location.assign("/thanks/");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    const payload = { answers, phone, name };

    try {
      await sendQuizData(payload);
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      await goThanks();
      setSending(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value);
    setTouchedFields((prev) => ({ ...prev, phone: true }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setTouchedFields((prev) => ({ ...prev, name: true }));
  };

  const isFormValid = phone.trim() !== "" && name.trim() !== "";

  const renderStep = () => {
    if (isLastStep) {
      return (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">
          <div className="space-y-6">
            <div>
              <Label htmlFor="phone" className="mb-4 block text-xl font-semibold">
                {dictionary.carFinder.form.phone}
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+375 (99) 999-99-99"
                required
                className="h-14 bg-background text-lg"
                aria-required="true"
                aria-invalid={touchedFields.phone && phone === ""}
                aria-describedby="phone-error"
              />
              {touchedFields.phone && phone === "" && (
                <span id="phone-error" className="mt-1 text-sm text-destructive">
                  Пожалуйста, введите номер телефона
                </span>
              )}
            </div>
            <div>
              <Label htmlFor="name" className="mb-4 block text-xl font-semibold">
                {dictionary.carFinder.form.name}
              </Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="Имя"
                required
                className="h-14 bg-background text-lg"
                aria-required="true"
                aria-invalid={touchedFields.name && name === ""}
                aria-describedby="name-error"
              />
              {touchedFields.name && name === "" && (
                <span id="name-error" className="mt-1 text-sm text-destructive">
                  Пожалуйста, введите ваше имя
                </span>
              )}
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={!isFormValid || sending}
            className="h-14 w-full bg-primary text-lg font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Отправить форму"
          >
            {sending ? "Отправляем…" : dictionary.carFinder.form.submit}
          </Button>
        </form>
      );
    }

    const step = steps[currentStep];

    if (step.type === "input") {
      return (
        <div
          className="min-h-[300px]"
          role="form"
          aria-label={`Шаг ${currentStep + 1}: ${step.title}`}
        >
          <h3 className="mb-8 text-2xl font-semibold">{step.title}</h3>
          <Input
            type="text"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            placeholder={step.placeholder}
            className="h-14 bg-background text-lg"
            aria-label="Введите модель автомобиля"
            aria-required="true"
          />
        </div>
      );
    }

    return (
      <div
        className="min-h-[300px]"
        role="form"
        aria-label={`Шаг ${currentStep + 1}: ${step.title}`}
      >
        <h3 className="mb-8 text-2xl font-semibold">{step.title}</h3>
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
          {step.options &&
            step.options.map((option, index) => (
              <Label
                key={index}
                className={`flex cursor-pointer items-center gap-4 rounded-lg border p-6 transition-all duration-200 ${
                  answers[currentStep] === option
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
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
    <div className="space-y-8" role="region" aria-label="Опросник по подбору автомобиля">
      <div className="transition-all duration-300 ease-in-out">{renderStep()}</div>

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
            className={`h-14 px-8 text-base font-medium ${
              currentStep > 0 ? "ml-auto" : "w-full"
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
  );
};

export default Quiz;
