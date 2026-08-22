"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton({
  label,
  pendingLabel,
}: {
  readonly label: string;
  readonly pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className="jt-button jt-button--danger" type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function DestructiveActionDialog({
  action,
  triggerLabel,
  title,
  description,
  consequences,
  submitLabel,
  pendingLabel,
  cancelLabel,
  hiddenFields,
  confirmation,
}: {
  readonly action: string;
  readonly triggerLabel: string;
  readonly title: string;
  readonly description: string;
  readonly consequences: readonly string[];
  readonly submitLabel: string;
  readonly pendingLabel: string;
  readonly cancelLabel: string;
  readonly hiddenFields: Readonly<Record<string, string>>;
  readonly confirmation?: {
    readonly label: string;
    readonly name: string;
    readonly expectedValue: string;
  };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button
        className="jt-button jt-button--danger-outline"
        type="button"
        onClick={() => dialog.current?.showModal()}
      >
        {triggerLabel}
      </button>
      <dialog ref={dialog} className="destructive-dialog" aria-labelledby={titleId}>
        <form action={action} method="post">
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
          <ul>
            {consequences.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {confirmation ? (
            <label className="destructive-confirmation">
              <span>{confirmation.label}</span>
              <input
                name={confirmation.name}
                required
                pattern={confirmation.expectedValue.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}
                autoComplete="off"
              />
            </label>
          ) : null}
          <div className="destructive-dialog__actions">
            <button className="jt-button" type="button" onClick={() => dialog.current?.close()}>
              {cancelLabel}
            </button>
            <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
          </div>
        </form>
      </dialog>
    </>
  );
}
