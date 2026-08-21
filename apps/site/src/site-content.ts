import type { MessageKey } from "@jingtang/i18n";

import type { PageId } from "./site-routes";

export interface ContentSection {
  readonly title: MessageKey;
  readonly body: MessageKey;
}

export interface PageDefinition {
  readonly metaTitle: MessageKey;
  readonly metaDescription: MessageKey;
  readonly eyebrow: MessageKey;
  readonly title: MessageKey;
  readonly lead: MessageKey;
  readonly sections: readonly ContentSection[];
}

export const pageDefinitions: Readonly<
  Record<
    Exclude<PageId, "home" | "integrations" | "youtube" | "contact" | "bookDemo">,
    PageDefinition
  >
> = {
  socialPublishing: {
    metaTitle: "site.social.metaTitle",
    metaDescription: "site.social.metaDescription",
    eyebrow: "site.social.eyebrow",
    title: "site.social.title",
    lead: "site.social.lead",
    sections: [
      { title: "site.social.section1.title", body: "site.social.section1.body" },
      { title: "site.social.section2.title", body: "site.social.section2.body" },
      { title: "site.social.section3.title", body: "site.social.section3.body" },
      { title: "site.social.section4.title", body: "site.social.section4.body" },
    ],
  },
  workflowApprovals: {
    metaTitle: "site.workflow.metaTitle",
    metaDescription: "site.workflow.metaDescription",
    eyebrow: "site.workflow.eyebrow",
    title: "site.workflow.title",
    lead: "site.workflow.lead",
    sections: [
      { title: "site.workflow.section1.title", body: "site.workflow.section1.body" },
      { title: "site.workflow.section2.title", body: "site.workflow.section2.body" },
      { title: "site.workflow.section3.title", body: "site.workflow.section3.body" },
      { title: "site.workflow.section4.title", body: "site.workflow.section4.body" },
    ],
  },
  solutions: {
    metaTitle: "site.solutions.metaTitle",
    metaDescription: "site.solutions.metaDescription",
    eyebrow: "site.solutions.eyebrow",
    title: "site.solutions.title",
    lead: "site.solutions.lead",
    sections: [
      { title: "site.solutions.product.title", body: "site.solutions.product.body" },
      { title: "site.solutions.services.title", body: "site.solutions.services.body" },
      { title: "site.solutions.ai.title", body: "site.solutions.ai.body" },
      { title: "site.solutions.fit.title", body: "site.solutions.fit.body" },
    ],
  },
  security: {
    metaTitle: "site.security.metaTitle",
    metaDescription: "site.security.metaDescription",
    eyebrow: "site.security.eyebrow",
    title: "site.security.title",
    lead: "site.security.lead",
    sections: [
      { title: "site.security.current.title", body: "site.security.current.body" },
      { title: "site.security.production.title", body: "site.security.production.body" },
      { title: "site.security.website.title", body: "site.security.website.body" },
      { title: "site.security.certification.title", body: "site.security.certification.body" },
    ],
  },
  about: {
    metaTitle: "site.about.metaTitle",
    metaDescription: "site.about.metaDescription",
    eyebrow: "site.about.eyebrow",
    title: "site.about.title",
    lead: "site.about.lead",
    sections: [
      { title: "site.about.company.title", body: "site.about.company.body" },
      { title: "site.about.strategy.title", body: "site.about.strategy.body" },
      { title: "site.about.product.title", body: "site.about.product.body" },
    ],
  },
  privacy: {
    metaTitle: "site.privacy.metaTitle",
    metaDescription: "site.privacy.metaDescription",
    eyebrow: "site.privacy.eyebrow",
    title: "site.privacy.title",
    lead: "site.privacy.lead",
    sections: [
      { title: "site.privacy.scope.title", body: "site.privacy.scope.body" },
      { title: "site.privacy.collect.title", body: "site.privacy.collect.body" },
      { title: "site.privacy.use.title", body: "site.privacy.use.body" },
      { title: "site.privacy.processors.title", body: "site.privacy.processors.body" },
      { title: "site.privacy.youtube.title", body: "site.privacy.youtube.body" },
      { title: "site.privacy.retention.title", body: "site.privacy.retention.body" },
      { title: "site.privacy.cookies.title", body: "site.privacy.cookies.body" },
      { title: "site.privacy.security.title", body: "site.privacy.security.body" },
      { title: "site.privacy.rights.title", body: "site.privacy.rights.body" },
      { title: "site.privacy.changes.title", body: "site.privacy.changes.body" },
    ],
  },
  terms: {
    metaTitle: "site.terms.metaTitle",
    metaDescription: "site.terms.metaDescription",
    eyebrow: "site.terms.eyebrow",
    title: "site.terms.title",
    lead: "site.terms.lead",
    sections: [
      { title: "site.terms.agreement.title", body: "site.terms.agreement.body" },
      { title: "site.terms.service.title", body: "site.terms.service.body" },
      { title: "site.terms.accounts.title", body: "site.terms.accounts.body" },
      { title: "site.terms.content.title", body: "site.terms.content.body" },
      { title: "site.terms.control.title", body: "site.terms.control.body" },
      { title: "site.terms.youtube.title", body: "site.terms.youtube.body" },
      { title: "site.terms.prohibited.title", body: "site.terms.prohibited.body" },
      { title: "site.terms.availability.title", body: "site.terms.availability.body" },
      { title: "site.terms.liability.title", body: "site.terms.liability.body" },
      { title: "site.terms.contact.title", body: "site.terms.contact.body" },
    ],
  },
  dataDeletion: {
    metaTitle: "site.deletion.metaTitle",
    metaDescription: "site.deletion.metaDescription",
    eyebrow: "site.deletion.eyebrow",
    title: "site.deletion.title",
    lead: "site.deletion.lead",
    sections: [
      { title: "site.deletion.jingtang.title", body: "site.deletion.jingtang.body" },
      { title: "site.deletion.disconnect.title", body: "site.deletion.disconnect.body" },
      { title: "site.deletion.thirdParty.title", body: "site.deletion.thirdParty.body" },
      { title: "site.deletion.timeline.title", body: "site.deletion.timeline.body" },
      { title: "site.deletion.request.title", body: "site.deletion.request.body" },
    ],
  },
  signIn: {
    metaTitle: "site.signIn.metaTitle",
    metaDescription: "site.signIn.metaDescription",
    eyebrow: "site.signIn.eyebrow",
    title: "site.signIn.title",
    lead: "site.signIn.lead",
    sections: [
      { title: "site.signIn.existing.title", body: "site.signIn.existing.body" },
      { title: "site.signIn.contact.title", body: "site.signIn.contact.body" },
    ],
  },
};

export const contactDefinitions = {
  contact: {
    metaTitle: "site.contact.metaTitle",
    metaDescription: "site.contact.metaDescription",
    eyebrow: "site.contact.eyebrow",
    title: "site.contact.title",
    lead: "site.contact.lead",
  },
  bookDemo: {
    metaTitle: "site.demo.metaTitle",
    metaDescription: "site.demo.metaDescription",
    eyebrow: "site.demo.eyebrow",
    title: "site.demo.title",
    lead: "site.demo.lead",
  },
} as const satisfies Readonly<Record<"contact" | "bookDemo", Omit<PageDefinition, "sections">>>;

export const specialMetadata = {
  home: { title: "site.home.metaTitle", description: "site.home.metaDescription" },
  integrations: {
    title: "site.integrations.metaTitle",
    description: "site.integrations.metaDescription",
  },
  youtube: { title: "site.youtube.metaTitle", description: "site.youtube.metaDescription" },
} as const satisfies Readonly<
  Record<"home" | "integrations" | "youtube", { title: MessageKey; description: MessageKey }>
>;
