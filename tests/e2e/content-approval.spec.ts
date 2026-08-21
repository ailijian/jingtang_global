import { expect, test } from "@playwright/test";

test("bilingual Source Asset, platform version, approval, and no-publish journey", async ({
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

  await page.getByLabel("Account display name").fill("Global Review Target 全球审阅");
  await page.getByLabel("Language").selectOption("zh-CN");
  await expect(page.getByLabel("账号显示名称")).toHaveValue("Global Review Target 全球审阅");
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
    page.getByText("Approval is complete. Publishing remains a separate, unavailable action."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /publish/i })).toHaveCount(0);

  await page.locator(".app-rail").getByRole("link", { name: "Activity" }).click();
  await expect(page.getByText("content.created")).toBeVisible();
  await expect(page.getByText("content.submitted")).toBeVisible();
  await expect(page.getByText("content.approved")).toBeVisible();

  await page.setViewportSize({ width: 320, height: 780 });
  await expect(page.locator(".app-rail").getByRole("link", { name: "Content" })).toBeVisible();
  await expect(page.locator(".app-rail").getByRole("link", { name: "Settings" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
