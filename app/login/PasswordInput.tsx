"use client";

import { useState } from "react";

export default function PasswordInput() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <input
        id="password"
        name="password"
        type={showPassword ? "text" : "password"}
        required
        autoComplete="current-password"
        placeholder="••••••••"
        className="w-full rounded-xl border border-base-border bg-base-surface pl-4 pr-12 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
      />
      <button
        type="button"
        onClick={() => setShowPassword((visible) => !visible)}
        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {showPassword ? (
            <>
              <path d="m3 3 18 18M10.58 10.59a2 2 0 0 0 2.83 2.82" />
              <path d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a13.27 13.27 0 0 1-3.1 4.36M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a10.5 10.5 0 0 0 5.39-1.61" />
            </>
          ) : (
            <>
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
