"use client";

import { useAuth } from "@/components/AuthProvider";
import NavBar from "@/components/NavBar";

export default function GlobalNav() {
  const { user } = useAuth();
  if (!user) return null;
  return <NavBar />;
}
