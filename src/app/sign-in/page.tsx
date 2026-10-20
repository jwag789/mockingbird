import { Suspense } from "react";
import { SignInForm } from "@/components/SignInForm";
import { enabledProviders } from "@/lib/auth";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm providers={enabledProviders} />
    </Suspense>
  );
}
