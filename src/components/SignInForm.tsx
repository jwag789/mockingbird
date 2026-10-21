"use client";

import { Alert, Button, Card, Divider, SegmentedControl, Stack, TextField } from "@tessera/react";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const PROVIDER_LABELS = { google: "Continue with Google", github: "Continue with GitHub" } as const;

export function SignInForm({ providers }: { providers: Array<keyof typeof PROVIDER_LABELS> }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState(params.get("mode") === "sign-up" ? "sign-up" : "sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password });
    if (error) {
      setError(error.message ?? "That didn't work. Check your details and try again.");
      setBusy(false);
      return;
    }
    // A full navigation so server components see the new session cookie.
    window.location.assign(next);
  }

  async function social(provider: keyof typeof PROVIDER_LABELS) {
    setBusy(true);
    await authClient.signIn.social({ provider, callbackURL: next });
  }

  return (
    <div className="mb-auth">
      <div className="mb-hero">
        <h1>Practice the interview before the interview.</h1>
        <p>
          Mock interviews built from your resume and the real job description, scored with quotes from
          what you said, and a practice plan to fix what held you back.
        </p>
      </div>

      <Card variant="raised" title={mode === "sign-up" ? "Create your account" : "Sign in"}>
        <Stack gap={4}>
          {providers.map((p) => (
            <Button key={p} variant="secondary" block onClick={() => social(p)} disabled={busy}>
              {PROVIDER_LABELS[p]}
            </Button>
          ))}
          {providers.length > 0 && <Divider label="or" />}

          <SegmentedControl
            label="Account"
            options={[
              { value: "sign-in", label: "Sign in" },
              { value: "sign-up", label: "Create account" },
            ]}
            value={mode}
            onChange={setMode}
            block
          />

          <form onSubmit={onSubmit}>
            <Stack gap={4}>
              {mode === "sign-up" && (
                <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              )}
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                hint={mode === "sign-up" ? "At least 8 characters" : undefined}
              />
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" variant="primary" size="lg" block loading={busy}>
                {mode === "sign-up" ? "Create account" : "Sign in"}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Card>
    </div>
  );
}

/** Only same-site paths, so a crafted ?next= can't bounce users elsewhere. */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
