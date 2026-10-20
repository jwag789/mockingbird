import { headers } from "next/headers";
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard/Dashboard";
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
  if (!user) return null;
  return <Dashboard data={await getDashboard(user.id)} name={user.name || user.email} />;
}
