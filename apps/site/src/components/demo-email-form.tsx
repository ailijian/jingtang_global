"use client";

import type { Locale } from "@jingtang/domain";
import { translate } from "@jingtang/i18n";
import { useMemo, useState, type FormEvent } from "react";

interface Draft {
  readonly href: string;
}

function formString(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export function DemoEmailForm({
  locale,
  destination,
}: {
  readonly locale: Locale;
  readonly destination: string;
}) {
  const t = (key: Parameters<typeof translate>[1], params?: Readonly<Record<string, string>>) =>
    translate(locale, key, params);
  const [draft, setDraft] = useState<Draft>();
  const [invalid, setInvalid] = useState(false);
  const formId = useMemo(() => `demo-form-${locale.toLowerCase()}`, [locale]);

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) {
      setInvalid(true);
      setDraft(undefined);
      return;
    }
    setInvalid(false);
    const data = new FormData(form);
    const company = formString(data, "company");
    const subject = t("site.form.subject", { company });
    const body = [
      `${t("site.form.name")}: ${formString(data, "name")}`,
      `${t("site.form.email")}: ${formString(data, "email")}`,
      `${t("site.form.company")}: ${company}`,
      "",
      formString(data, "message"),
    ].join("\n");
    setDraft({
      href: `mailto:${destination}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    });
  }

  return (
    <form className="site-contact-form" id={formId} noValidate onSubmit={prepare}>
      {invalid ? (
        <p className="site-form-error" id={`${formId}-error`} role="alert">
          {t("site.form.required")}
        </p>
      ) : null}
      <div className="site-form-grid">
        <label>
          <span>{t("site.form.name")}</span>
          <input
            name="name"
            autoComplete="name"
            placeholder={t("site.form.namePlaceholder")}
            aria-describedby={invalid ? `${formId}-error` : undefined}
            aria-invalid={invalid || undefined}
            required
          />
        </label>
        <label>
          <span>{t("site.form.email")}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder={t("site.form.emailPlaceholder")}
            aria-describedby={invalid ? `${formId}-error` : undefined}
            aria-invalid={invalid || undefined}
            required
          />
        </label>
        <label className="site-form-wide">
          <span>{t("site.form.company")}</span>
          <input
            name="company"
            autoComplete="organization"
            placeholder={t("site.form.companyPlaceholder")}
            aria-describedby={invalid ? `${formId}-error` : undefined}
            aria-invalid={invalid || undefined}
            required
          />
        </label>
        <label className="site-form-wide">
          <span>{t("site.form.message")}</span>
          <textarea
            name="message"
            rows={6}
            placeholder={t("site.form.messagePlaceholder")}
            aria-describedby={invalid ? `${formId}-error` : undefined}
            aria-invalid={invalid || undefined}
            required
          />
        </label>
      </div>
      <p className="site-form-notice">{t("site.form.notice")}</p>
      <button className="site-button site-button-primary" type="submit">
        {t("site.action.prepareEmail")}
      </button>
      {draft ? (
        <div className="site-form-ready" role="status">
          <strong>{t("site.form.readyTitle")}</strong>
          <p>{t("site.form.readyBody")}</p>
          <a className="site-button site-button-secondary" href={draft.href}>
            {t("site.action.openEmail")}
          </a>
        </div>
      ) : null}
    </form>
  );
}
