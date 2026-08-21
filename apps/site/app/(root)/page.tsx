import { PublicSitePage } from "../../src/components/public-site";
import { getSiteMetadata } from "../../src/metadata";

export const metadata = getSiteMetadata("en", "home");

export default function RootPage() {
  return <PublicSitePage locale="en" pageId="home" />;
}
