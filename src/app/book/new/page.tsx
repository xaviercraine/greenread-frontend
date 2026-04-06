"use client";

import { useAuth } from "@/components/AuthProvider";
import NavBar from "@/components/NavBar";
import SummaryStrip from "@/components/booking/SummaryStrip";
import Screen1Setup from "@/components/booking/Screen1Setup";
import Screen2Dates from "@/components/booking/Screen2Dates";
import { useBooking } from "@/components/booking/BookingContext";

export default function BookingPage() {
  const { user, loading, courseId } = useAuth();
  const { state } = useBooking();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!user || !courseId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please log in to create a booking.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      <SummaryStrip />

      <main className="max-w-7xl mx-auto px-8 py-8">
        {state.step === 1 && <Screen1Setup courseId={courseId} />}
        {state.step === 2 && <Screen2Dates courseId={courseId} />}
        {state.step >= 3 && state.step <= 7 && (
          <div className="text-center py-20 text-gray-400 text-lg">
            Step {state.step} — Coming soon
          </div>
        )}
      </main>
    </div>
  );
}
