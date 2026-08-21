import type { Locale } from "@jingtang/domain";
import { translate, type MessageKey } from "@jingtang/i18n";
import Link from "next/link";

import { contactDefinitions, pageDefinitions } from "../site-content";
import { getPublicSiteConfig } from "../site-config";
import {
  getPublicIntegrations,
  type PublicIntegration,
  type PublicStatus,
} from "../integration-registry";
import { getAlternatePath, getLocalizedPath, type PageId } from "../site-routes";
import { DemoEmailForm } from "./demo-email-form";
import { LocaleSwitcher } from "./locale-switcher";

interface PageProps {
  readonly locale: Locale;
  readonly pageId: PageId;
}

type Translator = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;

function statusLabel(t: Translator, status: PublicStatus): string {
  if (status === "available") return t("site.status.available");
  if (status === "beta_early_access") return t("site.status.betaEarlyAccess");
  return t("site.status.comingSoon");
}

function Header({ locale, pageId, t }: PageProps & { readonly t: Translator }) {
  const links: readonly [PageId, MessageKey][] = [
    ["socialPublishing", "site.nav.platform"],
    ["integrations", "site.nav.integrations"],
    ["solutions", "site.nav.solutions"],
    ["security", "site.nav.security"],
    ["about", "site.nav.company"],
  ];
  return (
    <header className="site-header">
      <div className="site-shell site-header-inner">
        <Link
          className="site-wordmark"
          href={getLocalizedPath(locale, "home")}
          aria-label="JINGTANG home"
        >
          JINGTANG
        </Link>
        <nav className="site-desktop-nav" aria-label={t("site.menu.label")}>
          {links.map(([target, key]) => (
            <Link
              key={target}
              href={getLocalizedPath(locale, target)}
              aria-current={pageId === target ? "page" : undefined}
            >
              {t(key)}
            </Link>
          ))}
        </nav>
        <div className="site-header-actions">
          <LocaleSwitcher
            locale={locale}
            alternatePath={getAlternatePath(locale, pageId)}
            label={t(locale === "en" ? "site.locale.switchToZh" : "site.locale.switchToEn")}
          />
          <Link className="site-sign-in" href={getLocalizedPath(locale, "signIn")}>
            {t("site.action.signIn")}
          </Link>
          <Link
            className="site-button site-button-primary site-header-cta"
            href={getLocalizedPath(locale, "bookDemo")}
          >
            {t("site.action.bookDemo")}
          </Link>
          <details className="site-mobile-menu">
            <summary>{t("site.menu.open")}</summary>
            <nav aria-label={t("site.menu.label")}>
              {links.map(([target, key]) => (
                <Link
                  key={target}
                  href={getLocalizedPath(locale, target)}
                  aria-current={pageId === target ? "page" : undefined}
                >
                  {t(key)}
                </Link>
              ))}
              <Link href={getLocalizedPath(locale, "signIn")}>{t("site.action.signIn")}</Link>
              <Link href={getLocalizedPath(locale, "bookDemo")}>{t("site.action.bookDemo")}</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function Footer({ locale, t }: { readonly locale: Locale; readonly t: Translator }) {
  const config = getPublicSiteConfig();
  const legalEntity = config.identity.legal_entity[locale];
  return (
    <footer className="site-footer">
      <div className="site-shell site-footer-grid">
        <div className="site-footer-brand">
          <Link className="site-wordmark" href={getLocalizedPath(locale, "home")}>
            JINGTANG
          </Link>
          <p>{t("site.footer.positioning")}</p>
          <p>{t("site.footer.identity", { legalEntity })}</p>
          <a href={`mailto:${config.identity.support_email}`}>{config.identity.support_email}</a>
        </div>
        <div className="site-footer-column">
          <strong>{t("site.footer.platform")}</strong>
          <Link href={getLocalizedPath(locale, "socialPublishing")}>
            {t("site.nav.socialPublishing")}
          </Link>
          <Link href={getLocalizedPath(locale, "workflowApprovals")}>
            {t("site.nav.workflowApprovals")}
          </Link>
          <Link href={getLocalizedPath(locale, "integrations")}>{t("site.nav.integrations")}</Link>
        </div>
        <div className="site-footer-column">
          <strong>{t("site.footer.company")}</strong>
          <Link href={getLocalizedPath(locale, "about")}>{t("site.nav.about")}</Link>
          <Link href={getLocalizedPath(locale, "contact")}>{t("site.nav.contact")}</Link>
          <Link href={getLocalizedPath(locale, "security")}>{t("site.nav.security")}</Link>
        </div>
        <div className="site-footer-column">
          <strong>{t("site.footer.legal")}</strong>
          <Link href={getLocalizedPath(locale, "privacy")}>{t("site.nav.privacy")}</Link>
          <Link href={getLocalizedPath(locale, "terms")}>{t("site.nav.terms")}</Link>
          <Link href={getLocalizedPath(locale, "dataDeletion")}>{t("site.nav.dataDeletion")}</Link>
        </div>
      </div>
      <div className="site-shell site-footer-bottom">
        <span>{t("site.footer.rights", { year: new Date().getUTCFullYear() })}</span>
        <span>{config.identity.official_domain}</span>
      </div>
    </footer>
  );
}

function Hero({
  eyebrow,
  title,
  lead,
  children,
  compact = false,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly children?: React.ReactNode;
  readonly compact?: boolean;
}) {
  return (
    <section className={`site-hero${compact ? " site-hero-compact" : ""}`}>
      <div>
        <p className="site-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="site-hero-lead">{lead}</p>
        {children}
      </div>
    </section>
  );
}

function FinalCta({ locale, t }: { readonly locale: Locale; readonly t: Translator }) {
  return (
    <section className="site-final-cta">
      <div>
        <h2>{t("site.common.finalCtaTitle")}</h2>
        <p>{t("site.common.finalCtaBody")}</p>
      </div>
      <Link className="site-button site-button-light" href={getLocalizedPath(locale, "bookDemo")}>
        {t("site.action.bookDemo")}
      </Link>
    </section>
  );
}

function EditorialPage({ locale, pageId, t }: PageProps & { readonly t: Translator }) {
  const definition = pageDefinitions[pageId as keyof typeof pageDefinitions];
  if (!definition) throw new Error(`No editorial definition for ${pageId}`);
  const config = getPublicSiteConfig();
  const legalEntity = config.identity.legal_entity[locale];
  const isLegal = pageId === "privacy" || pageId === "terms" || pageId === "dataDeletion";
  return (
    <>
      <Hero
        eyebrow={t(definition.eyebrow)}
        title={t(definition.title)}
        lead={t(definition.lead)}
        compact={isLegal}
      >
        {pageId === "security" || pageId === "signIn" ? (
          <span className="site-status site-status-warning">{t("site.status.privateBeta")}</span>
        ) : null}
        {isLegal ? <PolicyMeta t={t} /> : null}
      </Hero>
      <div className={isLegal ? "site-legal-layout" : "site-section-grid"}>
        {definition.sections.map((section, index) => (
          <section
            className={isLegal ? "site-legal-section" : "site-content-card"}
            key={section.title}
            id={`section-${index + 1}`}
          >
            <span className="site-section-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2>{t(section.title)}</h2>
              <p>{t(section.body, { legalEntity })}</p>
              {pageId === "privacy" && index === 4 ? <GooglePolicyLinks t={t} /> : null}
              {pageId === "terms" && index === 5 ? <YouTubeTermsLink t={t} /> : null}
              {pageId === "dataDeletion" && index === 1 ? <GoogleSecurityLink t={t} /> : null}
              {pageId === "dataDeletion" && index === 4 ? (
                <a className="site-inline-action" href={`mailto:${config.identity.support_email}`}>
                  {config.identity.support_email}
                </a>
              ) : null}
            </div>
          </section>
        ))}
      </div>
      {!isLegal && pageId !== "signIn" ? <FinalCta locale={locale} t={t} /> : null}
      {pageId === "signIn" ? (
        <div className="site-centered-action">
          <a
            className="site-button site-button-secondary"
            href={`mailto:${config.identity.support_email}`}
          >
            {t("site.action.emailSupport")}
          </a>
        </div>
      ) : null}
    </>
  );
}

function PolicyMeta({ t }: { readonly t: Translator }) {
  const config = getPublicSiteConfig();
  return (
    <div className="site-policy-meta">
      <span>{t("site.legal.version", { version: config.legal.policy_version })}</span>
      <span>{t("site.legal.effective", { date: config.legal.effective_date })}</span>
      {config.legal.approval_status !== "approved" ? (
        <span className="site-policy-warning">{t("site.legal.approvalPending")}</span>
      ) : null}
    </div>
  );
}

function GooglePolicyLinks({ t }: { readonly t: Translator }) {
  return (
    <p className="site-related-links">
      <a href="https://www.youtube.com/t/terms" rel="noreferrer">
        {t("site.external.youtubeTerms")}
      </a>
      <a href="https://policies.google.com/privacy" rel="noreferrer">
        {t("site.external.googlePrivacy")}
      </a>
      <a href="https://security.google.com/settings/security/permissions" rel="noreferrer">
        {t("site.external.googleSecurity")}
      </a>
    </p>
  );
}

function YouTubeTermsLink({ t }: { readonly t: Translator }) {
  return (
    <p className="site-related-links">
      <a href="https://www.youtube.com/t/terms" rel="noreferrer">
        {t("site.external.readYouTubeTerms")}
      </a>
    </p>
  );
}

function GoogleSecurityLink({ t }: { readonly t: Translator }) {
  return (
    <p className="site-related-links">
      <a href="https://security.google.com/settings/security/permissions" rel="noreferrer">
        {t("site.external.openGoogleSecurity")}
      </a>
    </p>
  );
}

function HomePage({ locale, t }: { readonly locale: Locale; readonly t: Translator }) {
  const integrations = getPublicIntegrations().slice(0, 3);
  const steps = [
    ["site.home.workflow.create", "site.home.workflow.createDetail", "site.home.workflow.ready"],
    [
      "site.home.workflow.approve",
      "site.home.workflow.approveDetail",
      "site.home.workflow.pending",
    ],
    [
      "site.home.workflow.confirm",
      "site.home.workflow.confirmDetail",
      "site.home.workflow.userAction",
    ],
    ["site.home.workflow.track", "site.home.workflow.trackDetail", "site.home.workflow.perChannel"],
  ] as const;
  const features = [
    ["A", "site.home.platform.a.title", "site.home.platform.a.body"],
    ["B", "site.home.platform.b.title", "site.home.platform.b.body"],
    ["C", "site.home.platform.c.title", "site.home.platform.c.body"],
  ] as const;
  const trust = [
    ["01", "site.home.trust.a.title", "site.home.trust.a.body"],
    ["02", "site.home.trust.b.title", "site.home.trust.b.body"],
    ["03", "site.home.trust.c.title", "site.home.trust.c.body"],
  ] as const;
  return (
    <>
      <section className="site-home-hero">
        <div>
          <p className="site-eyebrow">{t("site.home.eyebrow")}</p>
          <h1>{t("site.home.title")}</h1>
          <p className="site-hero-lead">{t("site.home.lead")}</p>
          <div className="site-hero-actions">
            <Link
              className="site-button site-button-primary"
              href={getLocalizedPath(locale, "bookDemo")}
            >
              {t("site.action.bookDemo")}
            </Link>
            <Link
              className="site-button site-button-secondary"
              href={getLocalizedPath(locale, "socialPublishing")}
            >
              {t("site.action.explorePlatform")}
            </Link>
          </div>
          <p className="site-hero-footnote">{t("site.home.footnote")}</p>
        </div>
        <aside className="site-workflow-panel" aria-label={t("site.home.workflow.label")}>
          <div className="site-workflow-heading">
            <strong>{t("site.home.workflow.label")}</strong>
            <span>{t("site.home.workflow.note")}</span>
          </div>
          <ol>
            {steps.map(([title, detail, state], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{t(title)}</strong>
                  <small>{t(detail)}</small>
                </div>
                <em>{t(state)}</em>
              </li>
            ))}
          </ol>
        </aside>
      </section>
      <EditorialSection
        kicker={t("site.home.platform.kicker")}
        title={t("site.home.platform.title")}
      >
        <div className="site-feature-grid">
          {features.map(([mark, title, body]) => (
            <Feature key={mark} mark={mark} title={t(title)} body={t(body)} />
          ))}
        </div>
      </EditorialSection>
      <EditorialSection
        kicker={t("site.home.integrations.kicker")}
        title={t("site.home.integrations.title")}
      >
        <IntegrationRows integrations={integrations} locale={locale} t={t} />
      </EditorialSection>
      <EditorialSection kicker={t("site.home.trust.kicker")} title={t("site.home.trust.title")}>
        <div className="site-feature-grid">
          {trust.map(([mark, title, body]) => (
            <Feature key={mark} mark={mark} title={t(title)} body={t(body)} />
          ))}
        </div>
        <FinalCta locale={locale} t={t} />
      </EditorialSection>
    </>
  );
}

function EditorialSection({
  kicker,
  title,
  children,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="site-editorial-section">
      <div className="site-editorial-heading">
        <span>{kicker}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Feature({
  mark,
  title,
  body,
}: {
  readonly mark: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <article className="site-feature">
      <span>{mark}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

const integrationBodyKeys: Readonly<Record<string, MessageKey>> = {
  youtube: "site.integrations.youtube.body",
  facebook: "site.integrations.facebook.body",
  instagram: "site.integrations.instagram.body",
  tiktok: "site.integrations.tiktok.body",
  linkedin: "site.integrations.linkedin.body",
  pinterest: "site.integrations.pinterest.body",
  x: "site.integrations.x.body",
};

function IntegrationRows({
  integrations,
  locale,
  t,
}: {
  readonly integrations: readonly PublicIntegration[];
  readonly locale: Locale;
  readonly t: Translator;
}) {
  return (
    <div className="site-integration-list">
      {integrations.map((integration) => (
        <article className="site-integration-row" key={integration.id}>
          <strong>{integration.displayName}</strong>
          <p>{t(integrationBodyKeys[integration.id] ?? "site.common.truthNote")}</p>
          <span className={`site-status site-status-${integration.status}`}>
            {statusLabel(t, integration.status)}
          </span>
          {integration.id === "youtube" ? (
            <Link href={getLocalizedPath(locale, "youtube")}>
              {t("site.action.learnMore")} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span aria-hidden="true">—</span>
          )}
        </article>
      ))}
    </div>
  );
}

function IntegrationsPage({ locale, t }: { readonly locale: Locale; readonly t: Translator }) {
  const integrations = getPublicIntegrations();
  return (
    <>
      <Hero
        eyebrow={t("site.integrations.eyebrow")}
        title={t("site.integrations.title")}
        lead={t("site.integrations.lead")}
      />
      <p className="site-truth-note">{t("site.common.truthNote")}</p>
      <IntegrationRows integrations={integrations} locale={locale} t={t} />
      <FinalCta locale={locale} t={t} />
    </>
  );
}

function YouTubePage({ locale, t }: { readonly locale: Locale; readonly t: Translator }) {
  const youtube = getPublicIntegrations().find((entry) => entry.id === "youtube");
  if (!youtube) throw new Error("YouTube is missing from the Integration Registry");
  const capabilities = [
    ["site.integrations.capability.connect", youtube.capabilities.connect],
    ["site.integrations.capability.publish", youtube.capabilities.publishNow],
    ["site.integrations.capability.schedule", youtube.capabilities.schedule],
    ["site.integrations.capability.track", youtube.capabilities.trackResult],
  ] as const;
  const sections = [
    ["site.youtube.limit.title", "site.youtube.limit.body"],
    ["site.youtube.auth.title", "site.youtube.auth.body"],
    ["site.youtube.control.title", "site.youtube.control.body"],
    ["site.youtube.data.title", "site.youtube.data.body"],
    ["site.youtube.audit.title", "site.youtube.audit.body"],
  ] as const;
  return (
    <>
      <Hero
        eyebrow={t("site.youtube.eyebrow")}
        title={t("site.youtube.title")}
        lead={t("site.youtube.lead")}
      >
        <span className="site-status site-status-coming_soon">
          {statusLabel(t, youtube.status)}
        </span>
      </Hero>
      <div className="site-capability-grid">
        {capabilities.map(([label, state]) => (
          <div key={label}>
            <span>{t(label)}</span>
            <strong>
              {state === "available"
                ? t("site.status.available")
                : label === "site.integrations.capability.schedule"
                  ? t("site.status.scheduleUnavailable")
                  : t("site.status.comingSoon")}
            </strong>
          </div>
        ))}
      </div>
      <div className="site-section-grid">
        {sections.map(([title, body], index) => (
          <section className="site-content-card" key={title}>
            <span className="site-section-index">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{t(title)}</h2>
              <p>{t(body)}</p>
            </div>
          </section>
        ))}
      </div>
      <div className="site-related-links site-related-links-block">
        <Link href={getLocalizedPath(locale, "privacy")}>{t("site.nav.privacy")}</Link>
        <Link href={getLocalizedPath(locale, "terms")}>{t("site.nav.terms")}</Link>
        <Link href={getLocalizedPath(locale, "dataDeletion")}>{t("site.nav.dataDeletion")}</Link>
      </div>
      <FinalCta locale={locale} t={t} />
    </>
  );
}

function ContactPage({ locale, pageId, t }: PageProps & { readonly t: Translator }) {
  const definition = contactDefinitions[pageId as "contact" | "bookDemo"];
  const config = getPublicSiteConfig();
  return (
    <>
      <Hero
        eyebrow={t(definition.eyebrow)}
        title={t(definition.title)}
        lead={t(definition.lead)}
        compact
      />
      <div className="site-contact-layout">
        <aside>
          <span className="site-eyebrow">{t("site.footer.contact")}</span>
          <a href={`mailto:${config.identity.support_email}`}>{config.identity.support_email}</a>
          <p>{t("site.form.notice")}</p>
        </aside>
        <DemoEmailForm locale={locale} destination={config.contact.destination} />
      </div>
    </>
  );
}

export function PublicSitePage({ locale, pageId }: PageProps) {
  const t: Translator = (key, params = {}) => translate(locale, key, params);
  let content: React.ReactNode;
  if (pageId === "home") content = <HomePage locale={locale} t={t} />;
  else if (pageId === "integrations") content = <IntegrationsPage locale={locale} t={t} />;
  else if (pageId === "youtube") content = <YouTubePage locale={locale} t={t} />;
  else if (pageId === "contact" || pageId === "bookDemo")
    content = <ContactPage locale={locale} pageId={pageId} t={t} />;
  else content = <EditorialPage locale={locale} pageId={pageId} t={t} />;
  return (
    <>
      <a className="site-skip-link" href="#main-content">
        {t("site.skipToContent")}
      </a>
      <Header locale={locale} pageId={pageId} t={t} />
      <main className="site-shell" id="main-content">
        {content}
      </main>
      <Footer locale={locale} t={t} />
    </>
  );
}
