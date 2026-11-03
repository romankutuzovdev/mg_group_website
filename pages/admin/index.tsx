import { FormEvent, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import type { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { CabinetFrame } from "@/components/cabinet/app-shell";
import { Button, Notice, inputClass, labelClass } from "@/components/cabinet/ui";
import { getDictionary } from "@/lib/dictionary";
import type { Dictionary } from "@/lib/dictionary";
import { loginWithPassword } from "@/lib/api/cabinet";
import { ConsentCheck } from "@/components/site/consent-check";
import { CABINET_POLICY_PATH, acceptCabinetPolicyConsent } from "@/lib/cabinet-consent";
import Link from "next/link";

interface Props {
  dictionary: Dictionary;
}

export default function AdminLoginPage({ dictionary }: Props) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [consentService, setConsentService] = useState(true);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!policyAccepted) {
      setError("Отметьте согласие с политикой конфиденциальности");
      return;
    }
    if (!consentService) {
      setError("Нужно согласие на сервисные уведомления");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      acceptCabinetPolicyConsent();
      const res = await loginWithPassword(login.trim(), password, {
        consent_privacy: policyAccepted,
        consent_service: consentService,
      });
      if (!res.user.is_admin) {
        setError("Этот вход не открывает админку");
        return;
      }
      await router.push("/cabinet/?tab=manager");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SEO
        dictionary={{
          ...dictionary,
          metadata: {
            ...dictionary.metadata,
            title: "Вход администратора | MG.GROUP",
            description: "Вход в админку MG.GROUP",
          },
        }}
        lang="ru"
        path="/admin/"
      />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <CabinetFrame>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
          <Link href="/" className="mb-6 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-zinc-900 text-xs font-bold text-white">
              MG
            </span>
            <span className="text-sm font-semibold text-zinc-900">MG.GROUP</span>
          </Link>
          <div className="w-full max-w-[400px] rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Вход администратора</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Служебный доступ к CRM и логистике.</p>
          <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
            <label className={labelClass}>
              Логин
              <input
                className={`${inputClass} mt-1.5`}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className={labelClass}>
              Пароль
              <input
                type="password"
                className={`${inputClass} mt-1.5`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="space-y-2.5 pt-1">
              <ConsentCheck
                checked={policyAccepted}
                required
                onCheckedChange={(next) => {
                  setPolicyAccepted(next);
                  if (next) acceptCabinetPolicyConsent();
                  setError(null);
                }}
              >
                Согласен(на) с{" "}
                <Link
                  href={CABINET_POLICY_PATH}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-800 underline underline-offset-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  политикой конфиденциальности
                </Link>
              </ConsentCheck>
              <ConsentCheck
                checked={consentService}
                required
                onCheckedChange={(next) => {
                  setConsentService(next);
                  setError(null);
                }}
              >
                Согласен(на) на сервисные уведомления (статус сделки, SMS о кабинете)
              </ConsentCheck>
            </div>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button type="submit" variant="primary" disabled={busy} className="h-10 w-full text-sm">
              {busy ? "Входим…" : "Войти"}
            </Button>
          </form>
          </div>
          <p className="mt-6 text-[13px] text-zinc-500">
            Клиент?{" "}
            <Link href="/cabinet/" className="font-medium text-zinc-900 underline underline-offset-2">
              Вход в личный кабинет
            </Link>
          </p>
        </div>
      </CabinetFrame>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { dictionary: getDictionary() },
});
