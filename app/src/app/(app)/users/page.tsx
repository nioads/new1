import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Users } from "@/components/users";

export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/");
  return <Users currentUserId={session.user.id} />;
}
