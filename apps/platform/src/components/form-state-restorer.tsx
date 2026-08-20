"use client";

import { useEffect } from "react";

export const formStateStorageKey = "jingtang:locale-switch-form-state";

export function FormStateRestorer() {
  useEffect(() => {
    const serialized = sessionStorage.getItem(formStateStorageKey);
    if (!serialized) return;
    sessionStorage.removeItem(formStateStorageKey);
    let saved: { path: string; fields: Record<string, string | boolean> };
    try {
      saved = JSON.parse(serialized) as typeof saved;
    } catch {
      return;
    }
    if (saved.path !== window.location.pathname) return;
    for (const [name, value] of Object.entries(saved.fields)) {
      const field = document.querySelector<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >(`[name="${CSS.escape(name)}"]`);
      if (!field) continue;
      if (
        field instanceof HTMLInputElement &&
        (field.type === "checkbox" || field.type === "radio")
      ) {
        field.checked = value === true;
      } else if (typeof value === "string") {
        field.value = value;
      }
    }
  }, []);
  return null;
}
