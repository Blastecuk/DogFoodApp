"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dogFood } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function listDogFood() {
  const session = await getSession();
  if (!session) return [];
  return db
    .select()
    .from(dogFood)
    .where(eq(dogFood.userId, session.user.id))
    .orderBy(desc(dogFood.createdAt));
}

export async function addDogFood(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const brand = String(formData.get("brand") ?? "").trim();
  const flavor = String(formData.get("flavor") ?? "").trim();
  const bagsInStock = Number(formData.get("bagsInStock") ?? 1);

  if (!brand || !flavor) {
    throw new Error("Brand and flavor are required");
  }

  await db.insert(dogFood).values({
    userId: session.user.id,
    brand,
    flavor,
    bagsInStock: Number.isFinite(bagsInStock) ? Math.max(0, bagsInStock) : 1,
  });

  revalidatePath("/dashboard");
}

export async function deleteDogFood(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");

  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) return;

  await db
    .delete(dogFood)
    .where(and(eq(dogFood.id, id), eq(dogFood.userId, session.user.id)));

  revalidatePath("/dashboard");
}
