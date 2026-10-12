import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const inputClass =
  'w-full min-h-11 rounded-md border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:bg-panel aria-[invalid=true]:border-danger';

type Common = { label: string; name: string; hint?: ReactNode; error?: string };

function Wrap({ label, name, hint, error, children }: Common & { children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${name}-hint`} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (name: string, hint: ReactNode, error?: string) =>
  [hint ? `${name}-hint` : '', error ? `${name}-error` : ''].filter(Boolean).join(' ') || undefined;

export function TextField({ label, hint, error, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Wrap label={label} name={props.name} hint={hint} error={error}>
      <input
        {...props}
        id={props.name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(props.name, hint, error)}
        className={inputClass}
      />
    </Wrap>
  );
}

export function TextAreaField({ label, hint, error, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Wrap label={label} name={props.name} hint={hint} error={error}>
      <textarea
        {...props}
        id={props.name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(props.name, hint, error)}
        className={inputClass}
      />
    </Wrap>
  );
}

export function SelectField({ label, hint, error, children, ...props }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Wrap label={label} name={props.name} hint={hint} error={error}>
      <select
        {...props}
        id={props.name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(props.name, hint, error)}
        className={inputClass}
      >
        {children}
      </select>
    </Wrap>
  );
}
