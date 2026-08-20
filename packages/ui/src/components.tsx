import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type={type}
      className={`jt-button jt-button--${variant} ${className}`.trim()}
      {...props}
    />
  );
}

export function FormField({
  id,
  label,
  error,
  help,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  readonly id: string;
  readonly label: string;
  readonly error?: string;
  readonly help?: string;
}) {
  const descriptionId = `${id}-description`;
  return (
    <div className="jt-field">
      <label htmlFor={id}>{label}</label>
      {help ? (
        <p className="jt-help" id={descriptionId}>
          {help}
        </p>
      ) : null}
      <input
        id={id}
        aria-describedby={help || error ? descriptionId : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? (
        <p className="jt-error" id={descriptionId} role="alert">
          <span aria-hidden="true">●</span> {error}
        </p>
      ) : null}
    </div>
  );
}

export function StatusMessage({
  tone,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  readonly tone: "info" | "success" | "warning" | "danger";
  readonly children: ReactNode;
}) {
  return (
    <div className={`jt-status jt-status--${tone}`} {...props}>
      <span className="jt-status__marker" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function PageState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <section className="jt-page-state">
      <div className="jt-page-state__rule" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
