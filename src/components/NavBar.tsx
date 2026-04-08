"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

interface NavBarProps {
  escalatedCount?: number;
}

export default function NavBar({ escalatedCount = 0 }: NavBarProps) {
  const { user, signOut } = useAuth();

  return (
    <nav className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-green-700">
              Greenread
            </Link>
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="relative text-sm font-medium text-gray-700 hover:text-green-700"
              >
                Dashboard
                {escalatedCount > 0 && (
                  <span className="absolute -top-2 -right-5 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                    {escalatedCount}
                  </span>
                )}
              </Link>
              <div className="flex items-center gap-1">
                <Link
                  href="/book/new"
                  className="text-sm font-medium text-gray-700 hover:text-green-700"
                >
                  Tournaments
                </Link>
                <Link
                  href="/book/new"
                  className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-600 text-white text-xs font-bold hover:bg-green-700"
                >
                  +
                </Link>
              </div>
              <Link
                href="/calendar"
                className="text-sm font-medium text-gray-700 hover:text-green-700"
              >
                Calendar
              </Link>
              <Link
                href="/revenue"
                className="text-sm font-medium text-gray-700 hover:text-green-700"
              >
                Revenue
              </Link>
              <Link
                href="/onboarding"
                className="text-sm font-medium text-gray-700 hover:text-green-700"
              >
                Course Setup
              </Link>
              <Link
                href="/simulator"
                className="text-sm font-medium text-gray-700 hover:text-green-700"
              >
                Simulator
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
