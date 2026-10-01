"use client";

import { Button } from "@heroui/react";
import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <p className="text-sm text-muted">Webiton</p>
        <h1 className="text-3xl font-semibold tracking-tight">Optima Desk</h1>
        <p className="mt-1 text-muted">Entrar como admin</p>
      </div>

      <form action={action} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            defaultValue="admin@webiton.pt"
            className="rounded-lg border border-border bg-surface px-3 py-2"
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Palavra-passe</span>
          <input
            name="password"
            type="password"
            required
            className="rounded-lg border border-border bg-surface px-3 py-2"
            autoComplete="current-password"
          />
        </label>
        {state?.error ? (
          <p className="text-sm text-danger">{state.error}</p>
        ) : null}
        <Button type="submit" variant="primary" isDisabled={pending}>
          {pending ? "A entrar…" : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
