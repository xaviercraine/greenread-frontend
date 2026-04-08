"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CourseData {
  name: string;
  total_carts: number;
  players_per_cart: number;
  kitchen_capacity: number;
  operating_hours_start: string;
  operating_hours_end: string;
  season_start: string;
  season_end: string;
  min_booking_notice_days: number;
  max_advance_booking_days: number;
  fb_minimum_spend: number;
  terms_text: string;
  weather_policy: string;
}

const EMPTY_COURSE: CourseData = {
  name: "",
  total_carts: 0,
  players_per_cart: 0,
  kitchen_capacity: 0,
  operating_hours_start: "",
  operating_hours_end: "",
  season_start: "",
  season_end: "",
  min_booking_notice_days: 0,
  max_advance_booking_days: 0,
  fb_minimum_spend: 0,
  terms_text: "",
  weather_policy: "",
};

export default function Step1CourseBasics({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState<CourseData>(EMPTY_COURSE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsSaved, setTermsSaved] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);

  const fetchCourse = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .single();
    if (err) {
      setError(err.message);
    } else if (data) {
      setForm({
        name: data.name ?? "",
        total_carts: data.total_carts ?? 0,
        players_per_cart: data.players_per_cart ?? 0,
        kitchen_capacity: data.kitchen_capacity ?? 0,
        operating_hours_start: data.operating_hours_start ?? "",
        operating_hours_end: data.operating_hours_end ?? "",
        season_start: data.season_start ?? "",
        season_end: data.season_end ?? "",
        min_booking_notice_days: data.min_booking_notice_days ?? 0,
        max_advance_booking_days: data.max_advance_booking_days ?? 0,
        fb_minimum_spend: data.fb_minimum_spend ?? 0,
        terms_text: data.terms_text ?? "",
        weather_policy: data.weather_policy ?? "",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleChange = (field: keyof CourseData, value: string | number) => {
    setSaved(false);
    setTermsSaved(false);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveTerms = async () => {
    setSavingTerms(true);
    setTermsError(null);
    setTermsSaved(false);
    const { error: err } = await supabase
      .from("courses")
      .update({
        terms_text: form.terms_text,
        weather_policy: form.weather_policy,
      })
      .eq("id", courseId);
    if (err) {
      setTermsError(err.message);
    } else {
      setTermsSaved(true);
      setTimeout(() => setTermsSaved(false), 3000);
    }
    setSavingTerms(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: err } = await supabase
      .from("courses")
      .update({
        name: form.name,
        total_carts: form.total_carts,
        players_per_cart: form.players_per_cart,
        kitchen_capacity: form.kitchen_capacity,
        operating_hours_start: form.operating_hours_start,
        operating_hours_end: form.operating_hours_end,
        season_start: form.season_start,
        season_end: form.season_end,
        min_booking_notice_days: form.min_booking_notice_days,
        max_advance_booking_days: form.max_advance_booking_days,
        fb_minimum_spend: form.fb_minimum_spend,
      })
      .eq("id", courseId);
    if (err) {
      setError(err.message);
    } else {
      setSaved(true);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error && !form.name) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchCourse}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const textField = (label: string, field: keyof CourseData) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={form[field] as string}
        onChange={(e) => handleChange(field, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
    </div>
  );

  const numberField = (label: string, field: keyof CourseData, step?: string) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        step={step}
        value={form[field] as number}
        onChange={(e) => handleChange(field, step ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
    </div>
  );

  const timeField = (label: string, field: keyof CourseData) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="time"
        value={form[field] as string}
        onChange={(e) => handleChange(field, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
    </div>
  );

  const dateField = (label: string, field: keyof CourseData) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="date"
        value={form[field] as string}
        onChange={(e) => handleChange(field, e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Course Basics</h2>

      <div className="grid grid-cols-2 gap-6">
        {textField("Course Name", "name")}
        {numberField("Total Carts", "total_carts")}
        {numberField("Players per Cart", "players_per_cart")}
        {numberField("Kitchen Capacity", "kitchen_capacity")}
        {timeField("Operating Hours Start", "operating_hours_start")}
        {timeField("Operating Hours End", "operating_hours_end")}
        {dateField("Season Start", "season_start")}
        {dateField("Season End", "season_end")}
        {numberField("Min Booking Notice (days)", "min_booking_notice_days")}
        {numberField("Max Advance Booking (days)", "max_advance_booking_days")}
        {numberField("F&B Minimum Spend", "fb_minimum_spend", "0.01")}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={handleSave}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Saving…
            </span>
          ) : (
            "Save"
          )}
        </button>
        {saved && <span className="text-green-600 text-sm font-medium">Saved!</span>}
      </div>

      {/* Terms & Conditions */}
      <div className="mt-10 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Terms &amp; Conditions</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Booking Terms &amp; Conditions
            </label>
            <textarea
              value={form.terms_text}
              onChange={(e) => handleChange("terms_text", e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Weather Policy
            </label>
            <textarea
              value={form.weather_policy}
              onChange={(e) => handleChange("weather_policy", e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        {termsError && (
          <p className="mt-3 text-red-600 text-sm">{termsError}</p>
        )}

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={handleSaveTerms}
            disabled={savingTerms}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {savingTerms ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Saving…
              </span>
            ) : (
              "Save Terms"
            )}
          </button>
          {termsSaved && (
            <span className="text-green-600 text-sm font-medium">Terms saved!</span>
          )}
        </div>
      </div>
    </div>
  );
}
