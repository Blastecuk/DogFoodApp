import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-6 text-6xl">🐶🦴</div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          DogFoodApp
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-slate-500 dark:text-slate-400">
          Keep track of every bag in your pup&apos;s pantry. Log brands,
          flavors, and how many bags you have left.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/sign-up"
            className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="rounded-lg border border-slate-300 px-6 py-3 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
