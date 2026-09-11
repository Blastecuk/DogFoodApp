import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <AuthForm mode="sign-in" />
    </main>
  );
}
