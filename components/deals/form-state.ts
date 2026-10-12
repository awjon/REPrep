// Shared by the Server Actions and the client forms that call them.
export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  saved?: boolean;
  /** Raw submitted values, so a failed submit does not clear the form. */
  values?: Record<string, string>;
};
