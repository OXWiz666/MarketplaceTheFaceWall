"use client";

import { useState } from "react";

export type FieldErrors = Record<string, string[] | undefined>;

export function useFormErrors(prefix: string) {
  const [errors, setErrors] = useState<FieldErrors>({});

  function setFieldError(name: string, message?: string) {
    setErrors((current) => ({ ...current, [name]: message ? [message] : undefined }));
  }

  function showErrors(form: HTMLFormElement, fields: FieldErrors) {
    setErrors(fields);
    const invalid = Array.from(form.elements).find((element) =>
      element instanceof HTMLElement && fields[element.getAttribute("name") ?? ""]?.length,
    );
    if (invalid instanceof HTMLElement) invalid.focus();
  }

  function fieldProps(name: string, ...descriptions: string[]) {
    const invalid = Boolean(errors[name]?.length);
    if (invalid) descriptions.push(`${prefix}-${name}-error`);
    return { id: `${prefix}-${name}`, name, "aria-invalid": invalid || undefined,
      "aria-describedby": descriptions.join(" ") || undefined };
  }

  function feedback(name: string) {
    const message = errors[name]?.[0];
    return message ? <span id={`${prefix}-${name}-error`} className="field-error" role="alert">{message}</span> : null;
  }

  return { setFieldError, showErrors, fieldProps, feedback };
}
