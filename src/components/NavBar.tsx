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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

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
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile menu on tap outside
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

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
    {
      label: "Live Tournaments",
      href: "/tournaments/live",
      match: (p) => p.startsWith("/tournaments/live"),
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

  const mobileItemClass = (active: boolean) =>
    `block px-4 py-3 text-sm border-l-4 ${
      active
        ? "text-green-700 font-medium border-green-600 bg-green-50"
        : "text-gray-700 border-transparent hover:bg-gray-50"
    }`;

  const mobileSubItemClass = (active: boolean) =>
    `block pl-10 pr-4 py-2 text-sm ${
      active ? "text-green-700 font-medium" : "text-gray-600 hover:bg-gray-50"
    }`;

  return (
    <nav ref={mobileRef} className="bg-white shadow relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div ref={navRef} className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-green-700">
              Greenread
            </Link>
            <div className="hidden md:flex items-center gap-6">
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
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={signOut}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign Out
            </button>
          </div>
          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Toggle navigation menu"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 text-gray-700 hover:text-green-700 text-2xl leading-none"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full bg-white shadow-lg border-t border-gray-200 z-50">
          <Link
            href="/"
            className={mobileItemClass(dashboardActive)}
            onClick={() => setMobileOpen(false)}
          >
            Dashboard
            {escalatedCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                {escalatedCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() =>
              setMobileExpanded(
                mobileExpanded === "tournaments" ? null : "tournaments"
              )
            }
            className={`${mobileItemClass(tournamentsActive)} w-full text-left flex items-center justify-between`}
          >
            <span>Tournaments</span>
            <span className="text-xs ml-2">
              {mobileExpanded === "tournaments" ? "▼" : "▶"}
            </span>
          </button>
          {mobileExpanded === "tournaments" &&
            tournamentsItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={mobileSubItemClass(item.match(pathname, search))}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          <Link
            href="/calendar"
            className={mobileItemClass(calendarActive)}
            onClick={() => setMobileOpen(false)}
          >
            Calendar
          </Link>
          <button
            type="button"
            onClick={() =>
              setMobileExpanded(mobileExpanded === "revenue" ? null : "revenue")
            }
            className={`${mobileItemClass(revenueActive)} w-full text-left flex items-center justify-between`}
          >
            <span>Revenue</span>
            <span className="text-xs ml-2">
              {mobileExpanded === "revenue" ? "▼" : "▶"}
            </span>
          </button>
          {mobileExpanded === "revenue" &&
            revenueItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={mobileSubItemClass(item.match(pathname, search))}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          <Link
            href="/simulator"
            className={mobileItemClass(simulatorActive)}
            onClick={() => setMobileOpen(false)}
          >
            Simulator
          </Link>
          <Link
            href="/onboarding"
            className={mobileItemClass(courseSetupActive)}
            onClick={() => setMobileOpen(false)}
          >
            Course Setup
          </Link>
          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-gray-600 truncate">{user?.email}</span>
            <button
              onClick={() => {
                setMobileOpen(false);
                signOut();
              }}
              className="text-sm text-gray-500 hover:text-gray-700 ml-3"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
