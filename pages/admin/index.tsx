import { FormEvent, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import type { GetStaticProps } from "next";
import SEO from "@/components/SEO";
import { PageShell } from "@/components/layout/page-shell";
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
      <PageShell>
        <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-white p-5 sm:p-6">
          <h1 className="text-lg font-semibold text-text-primary">Вход администратора</h1>
          <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
            <label className="block text-sm">
              <span className="text-text-muted">Логин</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-text-muted">Пароль</span>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
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
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "Входим…" : "Войти"}
            </button>
          </form>
        </div>
      </PageShell>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => ({
  props: { dictionary: getDictionary() },
});
