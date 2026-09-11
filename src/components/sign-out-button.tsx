"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();

  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/");
        router.refresh();
      }}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      Sign out
    </button>
  );
}
