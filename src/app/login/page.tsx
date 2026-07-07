"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}

function LoginCard() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const errorMessage =
    signInError ??
    (searchParams.get("error") === "oauth"
      ? "Sign-in failed. Please try again."
      : null);

  async function handleSignIn() {
    setIsLoading(true);
    setSignInError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/gate`,
      },
    });

    if (error) {
      setSignInError("Sign-in failed. Please try again.");
      setIsLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <h1 id="login-title" className={styles.title}>
          Javi&apos;s Journal
        </h1>
        <button
          className={styles.button}
          type="button"
          onClick={handleSignIn}
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign in with Google"}
        </button>
        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
      </section>
    </main>
  );
}
