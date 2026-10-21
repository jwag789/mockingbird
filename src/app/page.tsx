import { headers } from "next/headers";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Landing } from "@/components/landing/Landing";
import { getUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";

export default function Home() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}

async function DashboardPage() {
  // Reading the request's cookies also keeps this out of the build-time cache.
  const user = await getUser(await headers());
  // Visitors who aren't signed in get the landing page.
  if (!user) return <Landing />;
  return <Dashboard data={await getDashboard(user.id)} name={user.name || user.email} />;
}
