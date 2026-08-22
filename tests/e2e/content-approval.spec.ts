import { expect, test } from "@playwright/test";

test("bilingual Source Asset, connected platform version, approval, and separate publish confirmation", async ({
  page,
}) => {
  const suffix = Date.now();
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(`D4 Owner ${suffix}`);
  await page.getByLabel("Business email").fill(`d4-owner-${suffix}@example.test`);
  await page.getByLabel("Password").fill("D4-Content-Approval-Password-1!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Workspace name").fill(`D4 Workspace ${suffix}`);
  await page.getByRole("button", { name: "Create Workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator(".app-rail")).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await fetch("/api/v1/testing/youtube-channel", { method: "POST" })).status,
    ),
  ).toBe(201);

  await page.locator(".app-rail").getByRole("link", { name: "Content" }).click();
  await page.getByRole("link", { name: "Create content" }).click();
  await page.getByLabel("Select Source Asset").setInputFiles({
    name: "owned-launch.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("D4 owned source asset fixture"),
  });
  await page.getByLabel("I own this asset or am authorized to use it.").check();
  await page.getByRole("button", { name: "Upload Source Asset" }).click();
  await expect(page.getByText("Source Asset stored privately.")).toBeVisible();

  await expect(page.getByLabel("Connected channel")).toHaveValue(/UC_E2E_/);
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel("已连接渠道")).toHaveValue(/UC_E2E_/);
  await expect(page.getByRole("heading", { name: "选择平台版本" })).toBeVisible();
  await page.getByRole("button", { name: "继续" }).click();

  const authoredInternalTitle = "User-authored 全球 Launch";
  const authoredPlatformTitle = "Original 标题 remains unchanged";
  const authoredDescription = "Original copy 保持原样; locale must not translate this text.";
  await page.getByLabel("内部内容标题").fill(authoredInternalTitle);
  await page.getByLabel("YouTube 标题").fill(authoredPlatformTitle);
  await page.getByLabel("描述").fill(authoredDescription);
  await page.getByLabel("Language").selectOption("en");
  await expect(page.getByLabel("Internal content title")).toHaveValue(authoredInternalTitle);
  await expect(page.getByLabel("YouTube title")).toHaveValue(authoredPlatformTitle);
  await expect(page.getByLabel("Description")).toHaveValue(authoredDescription);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Submitting starts human approval only.")).toBeVisible();
  await expect(page.getByText("Schedule Not Available")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page).toHaveURL(/\/app\/content\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.locator(".content-status")).toHaveText("Pending Approval");
  await expect(page.getByText(authoredPlatformTitle)).toBeVisible();
  await expect(page.getByText(authoredDescription)).toBeVisible();
  await expect(page.getByText("No Publishing Intent or Platform Execution exists.")).toBeVisible();
  await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Approve revision" }).click();
  await expect(page.locator(".content-status")).toHaveText("Approved", { timeout: 30_000 });
  await expect(
    page.getByText(
      "Approval is complete. Publishing still requires the separate exact confirmation below.",
    ),
  ).toBeVisible();
  const confirmation = page.locator(".publish-confirmation");
  await expect(confirmation.getByText("owned-launch.mp4", { exact: true })).toBeVisible();
  await expect(confirmation.getByText(authoredPlatformTitle, { exact: true })).toHaveCount(2);
  await expect(confirmation.getByText(authoredDescription, { exact: true })).toHaveCount(2);
  await expect(confirmation.getByText("Private", { exact: true })).toBeVisible();
  await expect(confirmation.getByText("Not made for kids", { exact: true })).toBeVisible();
  await expect(confirmation.getByText("Publish Now", { exact: true })).toBeVisible();
  await expect(confirmation.getByLabel("Platform preview")).toBeVisible();
  const publishButton = page.getByRole("button", { name: "Confirm private upload" });
  await expect(publishButton).toBeDisabled();
  await expect(page.getByText("No Publishing Intent or Platform Execution exists.")).toBeVisible();

  await page.locator(".app-rail").getByRole("link", { name: "Activity" }).click();
  await expect(page.getByText("content.created")).toBeVisible();
  await expect(page.getByText("content.submitted")).toBeVisible();
  await expect(page.getByText("content.approved")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 780 });
  await expect(page.locator(".app-rail").getByRole("link", { name: "Content" })).toBeVisible();
  await expect(page.locator(".app-rail").getByRole("link", { name: "Settings" })).toBeVisible();
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
      .filter(({ bounds }) => bounds.right > window.innerWidth + 1 || bounds.left < -1)
      .slice(0, 12)
      .map(({ element, bounds }) => ({
        tag: element.tagName,
        className: element.className.toString(),
        left: Math.round(bounds.left),
        right: Math.round(bounds.right),
        text: element.textContent?.trim().slice(0, 60),
      })),
  }));
  expect(mobileLayout.documentWidth, JSON.stringify(mobileLayout)).toBeLessThanOrEqual(
    mobileLayout.viewportWidth,
  );
});
