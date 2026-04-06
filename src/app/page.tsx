"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

export default function HomePage() {
  const { user, loading, courseId, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-6">
              <h1 className="text-xl font-bold text-green-700">Greenread</h1>
              <Link href="/onboarding" className="text-sm font-medium text-gray-600 hover:text-green-700">
                Onboarding
              </Link>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
          <p className="mt-2 text-gray-600">
            Course ID: {courseId ?? "Not assigned"}
          </p>
          <p className="mt-1 text-gray-600">
            Logged in as: {user?.email}
          </p>
        </div>
      </main>
    </div>
  );
}
