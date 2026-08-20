"use client";

import type { Locale } from "@jingtang/domain";
import { useState } from "react";

import { formStateStorageKey } from "./form-state-restorer";

export function LocalePicker({
  locale,
  enLabel,
  zhLabel,
}: {
  locale: Locale;
  enLabel: string;
  zhLabel: string;
}) {
  const [busy, setBusy] = useState(false);

  async function change(next: Locale) {
    if (next === locale) return;
    setBusy(true);
    const fields: Record<string, string | boolean> = {};
    for (const field of document.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("form [name]")) {
      if (field instanceof HTMLInputElement && field.type === "password") continue;
      fields[field.name] =
        field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")
          ? field.checked
          : field.value;
    }
    sessionStorage.setItem(
      formStateStorageKey,
      JSON.stringify({ path: window.location.pathname, fields }),
    );
    const response = await fetch("/api/v1/locale", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    if (response.ok) window.location.reload();
    else setBusy(false);
  }

  return (
    <label className="locale-picker">
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={locale}
        disabled={busy}
        onChange={(event) => void change(event.target.value as Locale)}
      >
        <option value="en">{enLabel}</option>
        <option value="zh-CN">{zhLabel}</option>
      </select>
    </label>
  );
}
