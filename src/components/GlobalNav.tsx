"use client";

import { useAuth } from "@/components/AuthProvider";
import NavBar from "@/components/NavBar";
import { usePathname } from "next/navigation";

const hiddenRoutePatterns = [
  /^\/results\//,
  /^\/tournament\/[^/]+\/tv$/,
  /^\/tournament\/[^/]+\/starter$/,
  /^\/tournament\/[^/]+\/card\//,
  /^\/register\//,
  /^\/score\//,
  /^\/marshal\//,
  /^\/booking\/success$/,
  /^\/booking\/cancel$/,
];

export default function GlobalNav() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;
  if (hiddenRoutePatterns.some((pattern) => pattern.test(pathname)))
    return null;

  return <NavBar />;
}
