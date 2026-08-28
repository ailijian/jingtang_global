const origin = process.env.SITE_ORIGIN ?? "https://jingtangai.com";
if (!origin.startsWith("https://")) throw new Error("Production smoke requires HTTPS");
const approvedSignInUrl = "https://review.jingtangai.com/login";

const routes = [
  "/",
  "/en/",
  "/zh-cn/",
  "/en/integrations/",
  "/zh-cn/integrations/",
  "/en/integrations/youtube/",
  "/zh-cn/integrations/youtube/",
  "/en/privacy/",
  "/zh-cn/privacy/",
  "/en/terms/",
  "/zh-cn/terms/",
  "/en/data-deletion/",
  "/zh-cn/data-deletion/",
  "/en/security/",
  "/zh-cn/security/",
  "/en/sign-in/",
  "/zh-cn/sign-in/",
  "/en/company/contact/",
  "/zh-cn/company/contact/",
];

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 12) await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw lastError;
}

for (const route of routes) {
  const response = await fetchWithRetry(`${origin}${route}`);
  const html = await response.text();
  if (!html.includes("JINGTANG")) throw new Error(`${route} did not render the public site`);
  if (route.startsWith("/zh-cn/") && !html.includes('<html lang="zh-CN">')) {
    throw new Error(`${route} has the wrong document language`);
  }
  if (route.startsWith("/en/") && !html.includes('<html lang="en">')) {
    throw new Error(`${route} has the wrong document language`);
  }
  if (
    (route.includes("/privacy/") ||
      route.includes("/terms/") ||
      route.includes("/data-deletion/")) &&
    !html.includes("2026-08-28-r4.5")
  ) {
    throw new Error(`${route} does not expose the released policy version`);
  }
  if (route.includes("/integrations/") && html.includes('href="/connect')) {
    throw new Error(`${route} exposes an unavailable executable action`);
  }
  if (!html.includes(`href="${approvedSignInUrl}"`)) {
    throw new Error(`${route} does not link Sign in to the approved current SaaS`);
  }
  for (const prohibited of [
    "Private Beta",
    "pre-launch",
    "Review Environment",
    "REVIEW ENVIRONMENT",
    "TEST INTEGRATION",
    "私有测试",
    "预发布",
    "审核环境",
    "测试账号",
  ]) {
    if (html.includes(prohibited)) {
      throw new Error(`${route} renders prohibited internal product copy: ${prohibited}`);
    }
  }
  for (const header of [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
  ]) {
    if (!response.headers.get(header)) throw new Error(`${route} is missing ${header}`);
  }
}

process.stdout.write(`Production website smoke passed for ${routes.length} HTTPS routes.\n`);
