import { redirect } from "next/navigation";
import { addDogFood, deleteDogFood, listDogFood } from "@/app/actions";
import { SignOutButton } from "@/components/sign-out-button";
import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const items = await listDogFood();
  const totalBags = items.reduce((sum, item) => sum + item.bagsInStock, 0);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🦴 Your pantry</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Signed in as {session.user.email}
          </p>
        </div>
        <SignOutButton />
      </header>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-lg font-semibold">Add dog food</h2>
        <form action={addDogFood} className="mt-4 grid gap-4 sm:grid-cols-4">
          <input
            name="brand"
            placeholder="Brand"
            required
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 sm:col-span-1"
          />
          <input
            name="flavor"
            placeholder="Flavor"
            required
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 sm:col-span-1"
          />
          <input
            name="bagsInStock"
            type="number"
            min={0}
            defaultValue={1}
            aria-label="Bags in stock"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 sm:col-span-1"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:col-span-1"
          >
            Add
          </button>
        </form>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Stock ({items.length} {items.length === 1 ? "entry" : "entries"})
          </h2>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {totalBags} {totalBags === 1 ? "bag" : "bags"} total
          </span>
        </div>

        {items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
            No dog food yet. Add your first bag above! 🐾
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <p className="font-semibold">
                    {item.brand}{" "}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      · {item.flavor}
                    </span>
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {item.bagsInStock}{" "}
                    {item.bagsInStock === 1 ? "bag" : "bags"} in stock
                  </p>
                </div>
                <form action={deleteDogFood}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
