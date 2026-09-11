import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export default async function SignUpPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <AuthForm mode="sign-up" />
    </main>
  );
}
