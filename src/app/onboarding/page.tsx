"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import Step1CourseBasics from "@/components/onboarding/Step1CourseBasics";
import Step2Nines from "@/components/onboarding/Step2Nines";
import Step3Rotations from "@/components/onboarding/Step3Rotations";
import Step4EventSpaces from "@/components/onboarding/Step4EventSpaces";
import Step5Formats from "@/components/onboarding/Step5Formats";
import Step6FBPackages from "@/components/onboarding/Step6FBPackages";
import Step7Addons from "@/components/onboarding/Step7Addons";
import Step8Revenue from "@/components/onboarding/Step8Revenue";

const STEP_LABELS = [
  "Course",
  "Nines",
  "Rotations",
  "Spaces",
  "Formats",
  "F&B",
  "Add-ons",
  "Revenue",
];

const MAX_STEP = 8;

export default function OnboardingPage() {
  const { user, loading, courseId, signOut } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<number>(1);
  const [dataMode, setDataMode] = useState<string | null>(null);
  const [dataModeLoading, setDataModeLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const fetchDataMode = async () => {
      setDataModeLoading(true);
      const { data } = await supabase
        .from("courses")
        .select("data_mode")
        .eq("id", courseId)
        .single();
      if (!cancelled) {
        setDataMode(data?.data_mode ?? null);
        setDataModeLoading(false);
      }
    };
    fetchDataMode();
    return () => { cancelled = true; };
  }, [courseId, supabase]);

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
        <p className="text-gray-600">No course assigned. Please contact your administrator.</p>
      </div>
    );
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return <Step1CourseBasics courseId={courseId} />;
      case 2:
        return <Step2Nines courseId={courseId} />;
      case 3:
        return <Step3Rotations courseId={courseId} />;
      case 4:
        return <Step4EventSpaces courseId={courseId} />;
      case 5:
        return <Step5Formats courseId={courseId} />;
      case 6:
        return <Step6FBPackages courseId={courseId} />;
      case 7:
        return <Step7Addons courseId={courseId} />;
      case 8:
        return <Step8Revenue courseId={courseId} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <h1
              className="text-xl font-bold text-green-700 cursor-pointer"
              onClick={() => router.push("/")}
            >
              Greenread
            </h1>
            <div className="flex items-center gap-4">
              {!dataModeLoading && dataMode && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    dataMode === "real"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {dataMode === "real" ? "Real Data" : "Fictional Data"}
                </span>
              )}
              <span className="text-sm text-gray-600">{user.email}</span>
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const isActive = stepNum === step;
              const isCompleted = stepNum < step;
              const isDisabled = stepNum > MAX_STEP;
              const isAccessible = stepNum <= MAX_STEP;

              return (
                <div
                  key={label}
                  className={`flex flex-col items-center flex-1 ${
                    isAccessible ? "cursor-pointer" : "cursor-default"
                  }`}
                  onClick={() => {
                    if (isAccessible) setStep(stepNum);
                  }}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      isActive
                        ? "bg-green-600 text-white"
                        : isCompleted
                        ? "bg-green-200 text-green-800"
                        : isDisabled
                        ? "bg-gray-200 text-gray-400"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {stepNum}
                  </div>
                  <span
                    className={`mt-1 text-xs ${
                      isActive
                        ? "text-green-700 font-semibold"
                        : isDisabled
                        ? "text-gray-400"
                        : "text-gray-600"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / 8) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Content */}
        {renderStep()}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-6 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={() => setStep((s) => Math.min(MAX_STEP, s + 1))}
            disabled={step >= MAX_STEP}
            className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
