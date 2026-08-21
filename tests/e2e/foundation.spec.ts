import { expect, test, type Browser, type Page } from "@playwright/test";

async function selectLocale(page: Page, locale: "en" | "zh-CN") {
  await page.goto("/signup");
  if (locale === "zh-CN") {
    await page.getByLabel("Your name").fill("未提交输入");
    await page.getByLabel("Language").selectOption("zh-CN");
    await expect(page.getByLabel("你的姓名")).toHaveValue("未提交输入");
  }
  const policyLocale = locale === "zh-CN" ? "zh-cn" : "en";
  await expect(
    page.getByRole("link", { name: locale === "zh-CN" ? "服务条款" : "Terms" }),
  ).toHaveAttribute("href", `https://jingtangai.com/${policyLocale}/terms/`);
  await expect(
    page.getByRole("link", { name: locale === "zh-CN" ? "隐私政策" : "Privacy Policy" }),
  ).toHaveAttribute("href", `https://jingtangai.com/${policyLocale}/privacy/`);
}

async function register(
  page: Page,
  locale: "en" | "zh-CN",
  email: string,
  name: string,
  password: string,
) {
  await selectLocale(page, locale);
  await page.getByLabel(locale === "zh-CN" ? "你的姓名" : "Your name").fill(name);
  await page.getByLabel(locale === "zh-CN" ? "企业邮箱" : "Business email").fill(email);
  await page.getByLabel(locale === "zh-CN" ? "密码" : "Password").fill(password);
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: locale === "zh-CN" ? "创建账号" : "Create account" })
    .click();
  await expect(page).toHaveURL(/\/onboarding/);
}

async function runHumanPath(browser: Browser, locale: "en" | "zh-CN") {
  const suffix = `${locale.replace("-", "").toLowerCase()}-${Date.now()}`;
  const ownerEmail = `owner-${suffix}@example.test`;
  const memberEmail = `member-${suffix}@example.test`;
  const originalPassword = "D2-Foundation-Password-1!";
  const newPassword = "D2-Foundation-Password-2!";
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await register(owner, locale, ownerEmail, `Owner ${suffix}`, originalPassword);
  await owner
    .getByLabel(locale === "zh-CN" ? "工作空间名称" : "Workspace name")
    .fill(`Workspace ${suffix}`);
  await owner
    .getByRole("button", { name: locale === "zh-CN" ? "创建工作空间" : "Create Workspace" })
    .click();
  await expect(owner).toHaveURL(/\/app$/);
  await owner.getByRole("link", { name: locale === "zh-CN" ? "设置" : "Settings" }).click();
  await owner.getByLabel(locale === "zh-CN" ? "成员邮箱" : "Member email").fill(memberEmail);
  await owner.getByLabel(locale === "zh-CN" ? "初始角色" : "Initial role").selectOption("viewer");
  await owner
    .getByRole("button", { name: locale === "zh-CN" ? "发送邀请" : "Send invitation" })
    .click();
  const status = await owner.getByRole("status").textContent();
  const invitationPath = status?.match(/\/onboarding\?invite=[A-Za-z0-9._-]+/)?.[0];
  expect(invitationPath).toBeTruthy();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await register(member, locale, memberEmail, `Member ${suffix}`, originalPassword);
  const memberWorkspaceName = `Member Workspace ${suffix}`;
  await member
    .getByLabel(locale === "zh-CN" ? "工作空间名称" : "Workspace name")
    .fill(memberWorkspaceName);
  await member
    .getByRole("button", { name: locale === "zh-CN" ? "创建工作空间" : "Create Workspace" })
    .click();
  await expect(member).toHaveURL(/\/app$/);
  await member.goto(invitationPath ?? "/onboarding");
  await member
    .getByRole("button", { name: locale === "zh-CN" ? "接受邀请" : "Accept invitation" })
    .click();
  await expect(member).toHaveURL(/\/app$/);

  const workspaceSwitcher = member
    .locator(".app-rail")
    .getByLabel(locale === "zh-CN" ? "切换工作空间" : "Switch Workspace");
  await expect(workspaceSwitcher.locator("option:checked")).toHaveText(`Workspace ${suffix}`);
  await workspaceSwitcher.selectOption({ label: memberWorkspaceName });
  await expect(workspaceSwitcher.locator("option:checked")).toHaveText(memberWorkspaceName);
  await workspaceSwitcher.selectOption({ label: `Workspace ${suffix}` });
  await expect(workspaceSwitcher.locator("option:checked")).toHaveText(`Workspace ${suffix}`);

  await owner.reload();
  const roleSelect = owner.getByLabel(
    `${locale === "zh-CN" ? "更改角色" : "Change role"}: Member ${suffix}`,
  );
  await roleSelect.selectOption("editor");
  await expect(roleSelect).toHaveValue("editor");
  await member.reload();
  await expect(member.locator(".rail-account .role-badge")).toHaveText(
    locale === "zh-CN" ? "编辑者" : "Editor",
  );
  await owner
    .getByRole("button", { name: locale === "zh-CN" ? "移除成员" : "Remove member" })
    .click();
  await expect(owner.getByText(`Member ${suffix}`)).not.toBeVisible();
  await member.reload();
  await expect(
    member
      .locator(".app-rail")
      .getByLabel(locale === "zh-CN" ? "切换工作空间" : "Switch Workspace")
      .locator("option:checked"),
  ).toHaveText(memberWorkspaceName);

  await owner.getByRole("button", { name: locale === "zh-CN" ? "退出登录" : "Sign out" }).click();
  await expect(owner).toHaveURL(/\/login/);
  await owner.goto("/reset-password");
  await owner.getByLabel(locale === "zh-CN" ? "企业邮箱" : "Business email").fill(ownerEmail);
  await owner
    .getByRole("button", { name: locale === "zh-CN" ? "发送重置验证码" : "Send reset code" })
    .click();
  await owner.getByLabel(locale === "zh-CN" ? "验证码" : "Confirmation code").fill("000000");
  await owner.getByLabel(locale === "zh-CN" ? "新密码" : "New password").fill(newPassword);
  await owner
    .getByRole("button", { name: locale === "zh-CN" ? "设置新密码" : "Set new password" })
    .click();
  await expect(owner).toHaveURL(/\/login/);
  await owner.getByLabel(locale === "zh-CN" ? "企业邮箱" : "Business email").fill(ownerEmail);
  await owner.getByLabel(locale === "zh-CN" ? "密码" : "Password").fill(originalPassword);
  const rejectedLogin = owner.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/login"),
  );
  await owner.getByRole("button", { name: locale === "zh-CN" ? "登录" : "Sign in" }).click();
  expect((await rejectedLogin).status()).toBe(401);
  await expect(owner).toHaveURL(/\/login/);
  await owner.getByLabel(locale === "zh-CN" ? "密码" : "Password").fill(newPassword);
  await owner.getByRole("button", { name: locale === "zh-CN" ? "登录" : "Sign in" }).click();
  await expect(owner).toHaveURL(/\/app$/);
  await ownerContext.close();
  await memberContext.close();
}

test("English identity, consent, Workspace, invitation, role, recovery, and login path", async ({
  browser,
}) => {
  await runHumanPath(browser, "en");
});

test("简体中文身份、同意、工作空间、邀请、角色、恢复与登录路径", async ({ browser }) => {
  await runHumanPath(browser, "zh-CN");
});
