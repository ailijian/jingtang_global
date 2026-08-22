import { expect, test, type Page } from "@playwright/test";

async function createWorkspace(page: Page, label: string) {
  const suffix = `${label}-${Date.now()}`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill(`D6 Owner ${suffix}`);
  await page.getByLabel("Business email").fill(`d6-${suffix}@example.test`);
  await page.getByLabel("Password").fill("D6-Trust-Lifecycle-Password-1!");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  const workspaceName = `D6 Workspace ${suffix}`;
  await page.getByLabel("Workspace name").fill(workspaceName);
  await page.getByRole("button", { name: "Create Workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return workspaceName;
}

test("disconnect is explicit, fail-closed, recoverable, and distinguishes third-party content", async ({
  page,
}) => {
  await createWorkspace(page, "disconnect");
  expect(
    await page.evaluate(
      async () => (await fetch("/api/v1/testing/youtube-channel", { method: "POST" })).status,
    ),
  ).toBe(201);
  await page.goto("/app/channels");
  await page.getByRole("button", { name: "Disconnect YouTube" }).click();
  const dialog = page.getByRole("dialog", { name: "Disconnect this YouTube channel?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "Videos already held by YouTube are not deleted. Manage those separately in YouTube Studio.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Disconnect YouTube" }).click();
  await expect(page).toHaveURL(/youtube=disconnect_failed/);
  await expect(page.locator(".channel-notice[role='alert']")).toContainText(
    "Access is blocked in JINGTANG, but Google revocation did not finish",
  );
  await expect(page.getByText("Disconnecting", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry disconnect" })).toBeVisible();
});

test("Workspace data deletion requires exact confirmation and returns a durable reference", async ({
  page,
}) => {
  const workspaceName = await createWorkspace(page, "delete");
  await page.goto("/app/settings/data");
  await page.getByRole("button", { name: "Delete Workspace data" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Permanently delete this Workspace's data?",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      "YouTube videos and other content held by third parties are not deleted; manage them on those services.",
    ),
  ).toBeVisible();
  const confirmation = dialog.getByLabel(`Type ${workspaceName} to confirm`);
  await confirmation.fill("wrong workspace");
  await dialog.getByRole("button", { name: "Delete Workspace data" }).click();
  await expect(dialog).toBeVisible();
  await confirmation.fill(workspaceName);
  await dialog.getByRole("button", { name: "Delete Workspace data" }).click();
  await expect(page).toHaveURL(/\/onboarding\?deletion=completed&reference=DEL-/);
  await expect(page.getByRole("status")).toContainText("Workspace data deletion completed");
  await expect(page.getByRole("status")).toContainText("DEL-");

  await page.setViewportSize({ width: 320, height: 780 });
  await expect(page.getByRole("heading", { name: "Set your working boundary" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
