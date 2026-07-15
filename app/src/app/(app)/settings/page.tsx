import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Settings } from "@/components/settings";

export default async function SettingsPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/");
  return <Settings />;
}
