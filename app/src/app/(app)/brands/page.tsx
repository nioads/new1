import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Brands } from "@/components/brands";

export default async function BrandsPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/");
  return <Brands />;
}
