import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LiveProvider } from "@/components/live";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <LiveProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-100">
        <Sidebar user={{ name: session.user.name, role: session.user.role }} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </LiveProvider>
  );
}
