import { expect, test, type Page } from "@playwright/test";

const pageSegments = [
  "",
  "platform/social-publishing/",
  "platform/workflow-approvals/",
  "integrations/",
  "integrations/youtube/",
  "solutions/",
  "security/",
  "company/about/",
  "company/contact/",
  "privacy/",
  "terms/",
  "data-deletion/",
  "sign-in/",
  "book-demo/",
] as const;

const locales = [
  { route: "en", lang: "en", alternateRoute: "zh-cn", alternateLang: "zh-CN" },
  { route: "zh-cn", lang: "zh-CN", alternateRoute: "en", alternateLang: "en" },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(dimensions.page, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.body, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test("all bilingual routes expose localized metadata, same-locale links, and reciprocal alternates", async ({
  page,
}) => {
  const discovered = new Set<string>();
  for (const locale of locales) {
    for (const segment of pageSegments) {
      const path = `/${locale.route}/${segment}`;
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://jingtangai.com${path}`,
      );
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${locale.alternateLang}"]`),
      ).toHaveAttribute("href", `https://jingtangai.com/${locale.alternateRoute}/${segment}`);
      await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
        "href",
        `https://jingtangai.com/en/${segment}`,
      );
      const links = await page
        .locator('a[href^="/"]')
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? ""));
      for (const href of links) {
        discovered.add(href);
        const isLocaleSwitch = href.startsWith(`/${locale.alternateRoute}/`);
        expect(
          href.startsWith(`/${locale.route}/`) || isLocaleSwitch,
          `${path} contains cross-locale link ${href}`,
        ).toBe(true);
      }
    }
  }
  for (const locale of locales) {
    for (const segment of pageSegments) {
      if (segment !== "sign-in/") expect(discovered).toContain(`/${locale.route}/${segment}`);
    }
  }
});

test("official Sign in actions open the real account-controlled SaaS", async ({ page }) => {
  for (const locale of locales) {
    await page.goto(`/${locale.route}/`);
    await expect(page.locator(".site-sign-in")).toHaveAttribute(
      "href",
      "https://review.jingtangai.com/login",
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator(".site-mobile-menu summary").click();
    await expect(
      page.locator('.site-mobile-menu a[href="https://review.jingtangai.com/login"]'),
    ).toBeVisible();
    await page.goto(`/${locale.route}/sign-in/`);
    await expect(
      page.locator('.site-centered-action a[href="https://review.jingtangai.com/login"]'),
    ).toBeVisible();
  }
});

test("locale switch preserves the corresponding page, query, anchor, and preference", async ({
  page,
}) => {
  await page.goto("/en/platform/social-publishing/?source=e2e#section-1");
  await page.locator(".site-locale").click();
  await expect(page).toHaveURL(
    "http://127.0.0.1:3200/zh-cn/platform/social-publishing/?source=e2e#section-1",
  );
  expect(await page.evaluate(() => localStorage.getItem("jingtang_locale"))).toBe("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("registry status remains non-executable and YouTube scheduling is unavailable", async ({
  page,
}) => {
  for (const locale of locales) {
    await page.goto(`/${locale.route}/integrations/`);
    await expect(page.locator(".site-integration-row")).toHaveCount(7);
    await expect(page.locator(".site-status-coming_soon")).toHaveCount(7);
    await expect(
      page.getByRole("link", { name: /connect|publish now|立即连接|立即发布/i }),
    ).toHaveCount(0);
    await page.goto(`/${locale.route}/integrations/youtube/`);
    await expect(page.locator(".site-capability-grid strong")).toHaveCount(4);
    const capabilityText = await page.locator(".site-capability-grid").innerText();
    expect(capabilityText).toMatch(
      locale.route === "en" ? /Schedule Not Available/ : /暂不支持定时发布/,
    );
    await expect(page.getByRole("button", { name: /connect|publish|连接|发布/i })).toHaveCount(0);
  }
});

test("demo form reports errors and only prepares an explicit email draft", async ({ page }) => {
  await page.goto("/en/book-demo/");
  await page.getByRole("button", { name: "Prepare email" }).click();
  await expect(page.locator(".site-form-error")).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveAttribute("aria-invalid", "true");
  await page.locator('input[name="name"]').fill("E2E Reviewer");
  await page.locator('input[name="email"]').fill("reviewer@example.test");
  await page.locator('input[name="company"]').fill("Example Company");
  await page.locator('textarea[name="message"]').fill("Please arrange a product walkthrough.");
  await page.getByRole("button", { name: "Prepare email" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator('input[name="name"]')).not.toHaveAttribute("aria-invalid", "true");
  const draft = page.getByRole("link", { name: "Open email draft" });
  await expect(draft).toHaveAttribute("href", /^mailto:developer@jingtangai\.com\?/);
  expect(await draft.getAttribute("href")).toContain("Example%20Company");
});

test("mobile-first reflow and approved visual layout contract hold at all required widths", async ({
  page,
}) => {
  const widths = [320, 390, 768, 1024, 1440] as const;
  const representatives = ["en/", "zh-cn/", "en/privacy/", "zh-cn/book-demo/"] as const;
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of representatives) {
      await page.goto(`/${route}`);
      await expect(page.locator("h1")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.goto("/zh-cn/");
    const layout = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".site-header-inner");
      const menu = document.querySelector<HTMLElement>(".site-mobile-menu");
      const nav = document.querySelector<HTMLElement>(".site-desktop-nav");
      const hero = document.querySelector<HTMLElement>(".site-home-hero");
      if (!header || !menu || !nav || !hero) throw new Error("Missing layout evidence surface");
      return {
        headerHeight: Math.round(header.getBoundingClientRect().height),
        menuDisplay: getComputedStyle(menu).display,
        navDisplay: getComputedStyle(nav).display,
        heroColumns: getComputedStyle(hero).gridTemplateColumns.split(" ").length,
        canvas: getComputedStyle(document.documentElement).getPropertyValue("--jt-canvas").trim(),
      };
    });
    if (width <= 767) {
      expect(layout).toMatchObject({
        headerHeight: 64,
        menuDisplay: "block",
        navDisplay: "none",
        heroColumns: 1,
      });
    } else if (width <= 1023) {
      expect(layout.menuDisplay).toBe("block");
      expect(layout.navDisplay).toBe("none");
      expect(layout.heroColumns).toBe(1);
    } else {
      expect(layout.headerHeight).toBe(80);
      expect(layout.menuDisplay).toBe("none");
      expect(layout.navDisplay).toBe("flex");
      expect(layout.heroColumns).toBe(2);
    }
    expect(layout.canvas).toBe("#f3f1ea");
  }
});

test("keyboard focus, mobile navigation, public identity, and legal version are observable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/en/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".site-skip-link")).toBeFocused();
  await page.locator(".site-mobile-menu summary").click();
  await expect(page.locator(".site-mobile-menu nav")).toBeVisible();
  await page.getByRole("link", { name: "Security" }).last().focus();
  await expect(page.getByRole("link", { name: "Security" }).last()).toBeFocused();

  for (const locale of locales) {
    await page.goto(`/${locale.route}/privacy/`);
    await expect(page.locator("body")).toContainText(
      locale.route === "en"
        ? "Jingtang (Shanghai) Intelligent Technology Co., Ltd."
        : "鲸汤（上海）智能科技有限公司",
    );
    await expect(page.locator("body")).toContainText("2026-08-28-r4.5");
    await expect(page.locator("body")).toContainText("user.info.basic");
    await expect(page.locator("body")).toContainText("video.publish");
    await expect(page.locator("body")).toContainText("instagram_business_basic");
    await expect(page.locator("body")).toContainText("instagram_business_content_publish");
    await expect(page.getByRole("link", { name: "developer@jingtangai.com" })).toBeVisible();

    await page.goto(`/${locale.route}/terms/`);
    await expect(page.locator("body")).toContainText("TikTok Direct Post");
    await expect(page.locator("body")).toContainText("SELF_ONLY");
    await expect(page.locator("body")).toContainText("share_to_feed=false");

    await page.goto(`/${locale.route}/data-deletion/`);
    await expect(page.locator("body")).toContainText("TikTok");
    await expect(page.locator("body")).toContainText("Instagram");
    await expect(page.locator("body")).toContainText(
      "Website permissions → Apps and websites → Active",
    );
    await expect(page.locator("body")).toContainText("deauthorization callback");
  }
});
