import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const base =
  'inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:opacity-60';
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  secondary: 'border border-line bg-panel text-ink hover:border-accent',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-muted underline-offset-4 hover:text-ink hover:underline',
};

/** Class string, so links can look like buttons. */
export const buttonClass = (variant: ButtonVariant = 'primary', extra = ''): string =>
  `${base} ${variants[variant]} ${extra}`.trim();

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}
