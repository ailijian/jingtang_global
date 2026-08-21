import "@jingtang/ui/styles.css";
import "../site.css";

import type { ReactNode } from "react";

export default function EnglishRootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
