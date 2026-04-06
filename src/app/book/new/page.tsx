"use client";

import { useAuth } from "@/components/AuthProvider";
import NavBar from "@/components/NavBar";
import SummaryStrip from "@/components/booking/SummaryStrip";
import Screen1Setup from "@/components/booking/Screen1Setup";
import Screen2Dates from "@/components/booking/Screen2Dates";
import Screen3FB from "@/components/booking/Screen3FB";
import Screen4Space from "@/components/booking/Screen4Space";
import Screen5Addons from "@/components/booking/Screen5Addons";
import Screen6Pricing from "@/components/booking/Screen6Pricing";
import Screen7Confirm from "@/components/booking/Screen7Confirm";
import { useBooking } from "@/components/booking/BookingContext";

export default function BookingPage() {
  const { user, loading, courseId } = useAuth();
  const { state, dispatch } = useBooking();

  const handleStartOver = () => {
    try {
      sessionStorage.removeItem("greenread_booking");
    } catch {
      // ignore
    }
    dispatch({ type: "RESET" });
  };

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

      <div className="max-w-7xl mx-auto px-8 pt-4 flex justify-end">
        <button
          type="button"
          onClick={handleStartOver}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Start Over
        </button>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {state.step === 1 && <Screen1Setup courseId={courseId} />}
        {state.step === 2 && <Screen2Dates courseId={courseId} />}
        {state.step === 3 && <Screen3FB courseId={courseId} />}
        {state.step === 4 && <Screen4Space courseId={courseId} />}
        {state.step === 5 && <Screen5Addons courseId={courseId} />}
        {state.step === 6 && <Screen6Pricing courseId={courseId} />}
        {state.step === 7 && <Screen7Confirm courseId={courseId} />}
      </main>
    </div>
  );
}
