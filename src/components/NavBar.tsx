"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

interface NavBarProps {
  escalatedCount?: number;
}

interface DropdownItem {
  label: string;
  href: string;
  match: (pathname: string, search: string) => boolean;
}

export default function NavBar({ escalatedCount = 0 }: NavBarProps) {
  const { user, signOut } = useAuth();
  const pathname = usePathname() ?? "/";
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Read search params on client to avoid forcing Suspense boundaries.
  useEffect(() => {
    setSearch(window.location.search);
  }, [pathname]);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openMenu]);

  // Close dropdown on route change
  useEffect(() => {
    setOpenMenu(null);
  }, [pathname]);

  const isPipelineView =
    pathname === "/calendar" && search.includes("view=pipeline");
  const isCalendarView = pathname === "/calendar" && !isPipelineView;

  const tournamentsItems: DropdownItem[] = [
    {
      label: "New Booking",
      href: "/book/new",
      match: (p) => p.startsWith("/book"),
    },
    {
      label: "Quick Quote",
      href: "/quick-quote",
      match: (p) => p.startsWith("/quick-quote"),
    },
    {
      label: "Organizers",
      href: "/organizers",
      match: (p) => p.startsWith("/organizers"),
    },
    {
      label: "Pipeline",
      href: "/calendar?view=pipeline",
      match: (p, s) => p === "/calendar" && s.includes("view=pipeline"),
    },
  ];

  const revenueItems: DropdownItem[] = [
    {
      label: "Overview",
      href: "/revenue",
      match: (p) => p === "/revenue" || p.startsWith("/revenue/"),
    },
    {
      label: "Scenarios",
      href: "/scenarios",
      match: (p) => p.startsWith("/scenarios"),
    },
  ];

  const tournamentsActive = tournamentsItems.some((item) =>
    item.match(pathname, search)
  );
  const revenueActive = revenueItems.some((item) => item.match(pathname, search));

  const dashboardActive = pathname === "/";
  const calendarActive = isCalendarView;
  const simulatorActive = pathname.startsWith("/simulator");
  const courseSetupActive = pathname.startsWith("/onboarding");

  const topLinkClass = (active: boolean) =>
    `relative text-sm font-medium pb-1 ${
      active
        ? "text-green-600 border-b-2 border-green-600"
        : "text-gray-700 border-b-2 border-transparent hover:text-green-700"
    }`;

  const dropdownItemClass = (active: boolean) =>
    `block px-4 py-2 text-sm hover:bg-gray-100 ${
      active ? "text-green-600 font-medium" : "text-gray-700"
    }`;

  const renderDropdown = (
    key: string,
    label: string,
    active: boolean,
    items: DropdownItem[]
  ) => (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpenMenu(openMenu === key ? null : key)}
        className={topLinkClass(active)}
      >
        {label}
        <span className="ml-1 text-xs">▾</span>
      </button>
      {openMenu === key && (
        <div
          className="absolute left-0 top-full mt-2 w-44 bg-white shadow-lg rounded-md py-1 z-50"
          style={{ zIndex: 9999 }}
        >
          {items.map((item) => {
            const itemActive = item.match(pathname, search);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={dropdownItemClass(itemActive)}
                onClick={() => setOpenMenu(null)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div ref={navRef} className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-green-700">
              Greenread
            </Link>
            <div className="flex items-center gap-6">
              <Link href="/" className={topLinkClass(dashboardActive)}>
                Dashboard
                {escalatedCount > 0 && (
                  <span className="absolute -top-2 -right-5 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                    {escalatedCount}
                  </span>
                )}
              </Link>
              {renderDropdown(
                "tournaments",
                "Tournaments",
                tournamentsActive,
                tournamentsItems
              )}
              <Link href="/calendar" className={topLinkClass(calendarActive)}>
                Calendar
              </Link>
              {renderDropdown("revenue", "Revenue", revenueActive, revenueItems)}
              <Link href="/simulator" className={topLinkClass(simulatorActive)}>
                Simulator
              </Link>
              <Link
                href="/onboarding"
                className={topLinkClass(courseSetupActive)}
              >
                Course Setup
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
