"use client";

import { Avatar, DropdownMenu } from "@tessera/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
  const router = useRouter();
  const { data } = authClient.useSession();
  if (!data) return null;
  const { user } = data;

  return (
    <>
      <nav className="mb-nav">
        <Link href="/">Dashboard</Link>
        <Link href="/practice">Practice</Link>
        <Link href="/stories">Stories</Link>
        <Link href="/new">New interview</Link>
      </nav>
      <DropdownMenu
      trigger={
        <button type="button" className="mb-user" aria-label="Account menu">
          <Avatar name={user.name || user.email} src={user.image ?? undefined} size={32} />
        </button>
      }
      items={[
        { label: user.email, disabled: true },
        {
          label: "Sign out",
          onSelect: async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          },
        },
      ]}
      />
    </>
  );
}
