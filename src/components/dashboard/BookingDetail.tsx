"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/edgeFunction";
import type { Booking, PricingSnapshot } from "./BookingTable";
import NumberInput from "@/components/common/NumberInput";

interface CancellationTier {
  refund_pct: number;
  min_days_before: number;
  max_days_before: number | null;
}

interface RefundInfo {
  daysUntilEvent: number;
  tier: CancellationTier | null;
  refundAmount: number | null;
}

interface FbSelectionRow {
  id: string;
  name: string;
  meal_type: string | null;
  price_per_person: number;
  headcount: number;
}

interface BarSelectionRow {
  id: string;
  name: string;
  bar_type: string | null;
  price_per_person: number;
  headcount: number;
}

interface AddonSelectionRow {
  id: string;
  name: string;
  pricing_type: string | null;
  price: number;
  quantity: number;
}

interface BookingDetailProps {
  booking: Booking;
  snapshot: PricingSnapshot | null;
  onClose: () => void;
  onCancelDraft: (bookingId: string) => Promise<void>;
  onRefresh?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  deposit_paid: "Deposit Paid",
  balance_paid: "Balance Paid",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
    case "completed":
      return "bg-green-100 text-green-800";
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "deposit_paid":
    case "balance_paid":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function truncateUuid(uuid: string): string {
  return uuid.slice(0, 8) + "...";
}

interface LineItem {
  name?: string;
  label?: string;
  amount?: number;
  price?: number;
  total?: number;
  [key: string]: unknown;
}

function LineItems({
  items,
}: {
  items: Record<string, unknown>[] | null;
}) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="ml-4 mt-1 space-y-0.5">
      {(items as LineItem[]).map((item, i) => (
        <li key={i} className="text-xs text-gray-500">
          {item.name || item.label || `Item ${i + 1}`}
          {(item.amount ?? item.price ?? item.total) != null && (
            <span className="ml-1">
              — ${(item.amount ?? item.price ?? item.total)!.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function BookingDetail({
  booking,
  snapshot,
  onClose,
  onCancelDraft,
  onRefresh,
}: BookingDetailProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showOverride, setShowOverride] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [reason, setReason] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState(false);
  const [showCancelBooking, setShowCancelBooking] = useState(false);
  const [refundInfo, setRefundInfo] = useState<RefundInfo | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [cancelBookingSubmitting, setCancelBookingSubmitting] = useState(false);
  const [cancelBookingError, setCancelBookingError] = useState<string | null>(null);
  const [cancelBookingSuccess, setCancelBookingSuccess] = useState<string | null>(null);

  const [showEmail, setShowEmail] = useState(false);
  const [emailSending, setEmailSending] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailFallback, setEmailFallback] = useState<
    { template: string; content: string } | null
  >(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const canSendEmail =
    booking.status === "deposit_paid" ||
    booking.status === "balance_paid" ||
    booking.status === "confirmed";

  const EMAIL_TEMPLATES: { key: string; label: string }[] = [
    { key: "booking_confirmation", label: "Booking Confirmation" },
    { key: "balance_due_reminder", label: "Balance Due Reminder" },
    { key: "registration_link", label: "Registration Link" },
  ];

  const generateEmailContent = async (template: string): Promise<string> => {
    const dateStr = new Date(booking.date + "T00:00:00").toLocaleDateString(
      "en-US",
      { weekday: "long", month: "long", day: "numeric", year: "numeric" }
    );
    if (template === "booking_confirmation") {
      const total = snapshot?.snapshot?.total ?? 0;
      const deposit = booking.deposit_amount ?? 0;
      return [
        "Booking Confirmation",
        "",
        `Date: ${dateStr}`,
        `Format: ${booking.tournament_formats?.name ?? "—"}`,
        `Players: ${booking.player_count}`,
        `Total: $${Number(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `Deposit: $${Number(deposit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ].join("\n");
    }
    if (template === "balance_due_reminder") {
      const balance = booking.balance_amount ?? 0;
      return [
        "Balance Due Reminder",
        "",
        `Booking Date: ${dateStr}`,
        `Balance Due: $${Number(balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ].join("\n");
    }
    if (template === "registration_link") {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("registration_tokens")
          .select("token")
          .eq("booking_id", booking.id)
          .maybeSingle();
        const token = (data as { token?: string } | null)?.token;
        if (!token) {
          return "No registration token found for this booking.";
        }
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        return [
          "Registration Link",
          "",
          `${origin}/register/${booking.id}?token=${token}`,
        ].join("\n");
      } catch {
        return "Failed to load registration token.";
      }
    }
    return "";
  };

  const handleSendEmail = async (template: string) => {
    setEmailSending(template);
    setEmailFallback(null);
    setEmailSuccess(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: template,
            params: {
              booking_id: booking.id,
              course_id: booking.course_id,
            },
          }),
        }
      );
      if (!res.ok) throw new Error("not configured");
      const data = await res.json().catch(() => null);
      if (data && data.error) throw new Error(data.error);
      setEmailSuccess("Email sent successfully.");
    } catch {
      const content = await generateEmailContent(template);
      setEmailFallback({ template, content });
    } finally {
      setEmailSending(null);
    }
  };

  const handleCopyEmail = async () => {
    if (!emailFallback) return;
    try {
      await navigator.clipboard.writeText(emailFallback.content);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const closeEmailModal = () => {
    if (emailSending) return;
    setShowEmail(false);
    setEmailFallback(null);
    setEmailSuccess(null);
    setEmailCopied(false);
  };

  const canCancelBooking =
    booking.status === "deposit_paid" || booking.status === "balance_paid";

  const canModifySelections =
    booking.status === "deposit_paid" ||
    booking.status === "balance_paid" ||
    booking.status === "confirmed";

  const canManageFoursomes =
    booking.status === "deposit_paid" ||
    booking.status === "balance_paid" ||
    booking.status === "confirmed";

  const [participantCount, setParticipantCount] = useState<number>(0);

  useEffect(() => {
    if (!canManageFoursomes) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("participants")
        .select("id", { count: "exact", head: true })
        .eq("booking_id", booking.id);
      if (!cancelled) setParticipantCount(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [booking.id, canManageFoursomes]);

  const [showModifySelections, setShowModifySelections] = useState(false);
  const [modifyLoading, setModifyLoading] = useState(false);
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [modifySuccess, setModifySuccess] = useState<string | null>(null);
  const [fbSelections, setFbSelections] = useState<FbSelectionRow[]>([]);
  const [barSelections, setBarSelections] = useState<BarSelectionRow[]>([]);
  const [addonSelections, setAddonSelections] = useState<AddonSelectionRow[]>([]);

  useEffect(() => {
    if (!showModifySelections) return;
    let cancelled = false;
    (async () => {
      setModifyLoading(true);
      setModifyError(null);
      try {
        const supabase = createClient();
        const [
          fbPackagesRes,
          barPackagesRes,
          addonsRes,
          fbCurrentRes,
          barCurrentRes,
          addonCurrentRes,
        ] = await Promise.all([
          supabase
            .from("fb_packages")
            .select("id, name, meal_type, price_per_person")
            .eq("course_id", booking.course_id),
          supabase
            .from("bar_packages")
            .select("id, name, bar_type, price_per_person")
            .eq("course_id", booking.course_id),
          supabase
            .from("addons")
            .select("id, name, pricing_type, price")
            .eq("course_id", booking.course_id),
          supabase
            .from("booking_fb_selections")
            .select("fb_package_id, headcount")
            .eq("booking_id", booking.id),
          supabase
            .from("booking_bar_selections")
            .select("bar_package_id, headcount")
            .eq("booking_id", booking.id),
          supabase
            .from("booking_addon_selections")
            .select("addon_id, quantity")
            .eq("booking_id", booking.id),
        ]);

        if (fbPackagesRes.error) throw fbPackagesRes.error;
        if (barPackagesRes.error) throw barPackagesRes.error;
        if (addonsRes.error) throw addonsRes.error;
        if (fbCurrentRes.error) throw fbCurrentRes.error;
        if (barCurrentRes.error) throw barCurrentRes.error;
        if (addonCurrentRes.error) throw addonCurrentRes.error;

        const fbCurrentMap = new Map<string, number>(
          (fbCurrentRes.data ?? []).map((r) => [
            r.fb_package_id as string,
            r.headcount as number,
          ])
        );
        const barCurrentMap = new Map<string, number>(
          (barCurrentRes.data ?? []).map((r) => [
            r.bar_package_id as string,
            r.headcount as number,
          ])
        );
        const addonCurrentMap = new Map<string, number>(
          (addonCurrentRes.data ?? []).map((r) => [
            r.addon_id as string,
            r.quantity as number,
          ])
        );

        if (cancelled) return;
        setFbSelections(
          (fbPackagesRes.data ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            meal_type: (p.meal_type as string | null) ?? null,
            price_per_person: Number(p.price_per_person),
            headcount: fbCurrentMap.get(p.id as string) ?? 0,
          }))
        );
        setBarSelections(
          (barPackagesRes.data ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            bar_type: (p.bar_type as string | null) ?? null,
            price_per_person: Number(p.price_per_person),
            headcount: barCurrentMap.get(p.id as string) ?? 0,
          }))
        );
        setAddonSelections(
          (addonsRes.data ?? []).map((a) => ({
            id: a.id as string,
            name: a.name as string,
            pricing_type: (a.pricing_type as string | null) ?? null,
            price: Number(a.price),
            quantity: addonCurrentMap.get(a.id as string) ?? 0,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setModifyError(
            err instanceof Error ? err.message : "Failed to load selections"
          );
        }
      } finally {
        if (!cancelled) setModifyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showModifySelections, booking.id, booking.course_id]);

  const closeModifySelectionsModal = () => {
    if (modifySubmitting) return;
    setShowModifySelections(false);
    setModifyError(null);
    setFbSelections([]);
    setBarSelections([]);
    setAddonSelections([]);
  };

  const handleSaveModifySelections = async () => {
    setModifySubmitting(true);
    setModifyError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("modify_booking_selections", {
        p_booking_id: booking.id,
        p_course_id: booking.course_id,
        p_fb_selections: fbSelections
          .filter((s) => s.headcount > 0)
          .map((s) => ({ fb_package_id: s.id, headcount: s.headcount })),
        p_bar_selections: barSelections
          .filter((s) => s.headcount > 0)
          .map((s) => ({ bar_package_id: s.id, headcount: s.headcount })),
        p_addon_selections: addonSelections
          .filter((s) => s.quantity > 0)
          .map((s) => ({ addon_id: s.id, quantity: s.quantity })),
      });
      if (error) {
        setModifyError(error.message);
        setModifySubmitting(false);
        return;
      }
      const result = data as
        | { success?: boolean; error?: string; new_total?: number }
        | null;
      if (result && result.error) {
        setModifyError(result.error);
        setModifySubmitting(false);
        return;
      }
      const newTotal = result?.new_total ?? 0;
      setModifySubmitting(false);
      setShowModifySelections(false);
      setFbSelections([]);
      setBarSelections([]);
      setAddonSelections([]);
      setModifySuccess(
        `Selections updated. New total: $${Number(newTotal).toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}`
      );
      setTimeout(() => setModifySuccess(null), 5000);
      onRefresh?.();
    } catch (err) {
      setModifyError(
        err instanceof Error ? err.message : "Failed to modify selections"
      );
      setModifySubmitting(false);
    }
  };

  const openCancelBookingModal = async () => {
    setShowCancelBooking(true);
    setCancelBookingError(null);
    setRefundInfo(null);
    setRefundLoading(true);

    const eventDate = new Date(booking.date + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntilEvent = Math.ceil(
      (eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("cancellation_tiers")
        .select("refund_pct, min_days_before, max_days_before")
        .eq("course_id", booking.course_id);

      if (error) throw error;

      const tiers = (data ?? []) as CancellationTier[];
      const tier =
        tiers.find(
          (t) =>
            daysUntilEvent >= t.min_days_before &&
            (t.max_days_before == null || daysUntilEvent <= t.max_days_before)
        ) ?? null;

      const refundAmount =
        tier && booking.deposit_amount
          ? (booking.deposit_amount * tier.refund_pct) / 100
          : null;

      setRefundInfo({ daysUntilEvent, tier, refundAmount });
    } catch (err) {
      setCancelBookingError(
        err instanceof Error ? err.message : "Failed to load refund info"
      );
      setRefundInfo({ daysUntilEvent, tier: null, refundAmount: null });
    } finally {
      setRefundLoading(false);
    }
  };

  const closeCancelBookingModal = () => {
    if (cancelBookingSubmitting) return;
    setShowCancelBooking(false);
    setCancelBookingError(null);
    setRefundInfo(null);
  };

  const handleConfirmCancelBooking = async () => {
    setCancelBookingSubmitting(true);
    setCancelBookingError(null);
    try {
      const result = await callEdgeFunction("payment", {
        action: "cancel_and_refund",
        params: {
          booking_id: booking.id,
          course_id: booking.course_id,
        },
      });
      if (result && result.error) {
        setCancelBookingError(result.error);
        setCancelBookingSubmitting(false);
        return;
      }
      const refundedAmount =
        (result && (result.refund_amount ?? result.refunded_amount)) ??
        refundInfo?.refundAmount ??
        0;
      setCancelBookingSubmitting(false);
      setShowCancelBooking(false);
      setRefundInfo(null);
      setCancelBookingSuccess(
        `Booking cancelled. Refund issued: $${Number(refundedAmount).toLocaleString(
          "en-US",
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }
        )}`
      );
      setTimeout(() => setCancelBookingSuccess(null), 5000);
      onRefresh?.();
    } catch (err) {
      setCancelBookingError(
        err instanceof Error ? err.message : "Failed to cancel booking"
      );
      setCancelBookingSubmitting(false);
    }
  };

  const currentTotal = snapshot?.snapshot?.total ?? 0;
  const canOverride =
    booking.status !== "cancelled" && booking.status !== "completed";

  const closeOverrideModal = () => {
    if (overrideSubmitting) return;
    setShowOverride(false);
    setNewPrice("");
    setReason("");
    setOverrideError(null);
  };

  const handleApplyOverride = async () => {
    setOverrideSubmitting(true);
    setOverrideError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("apply_booking_override", {
        p_booking_id: booking.id,
        p_course_id: booking.course_id,
        p_override_price: parseFloat(newPrice),
        p_override_reason: reason,
      });
      if (error) {
        setOverrideError(error.message);
        setOverrideSubmitting(false);
        return;
      }
      const result = data as { success?: boolean; error?: string } | null;
      if (result && result.error) {
        setOverrideError(result.error);
        setOverrideSubmitting(false);
        return;
      }
      setOverrideSubmitting(false);
      setShowOverride(false);
      setNewPrice("");
      setReason("");
      setOverrideSuccess(true);
      setTimeout(() => setOverrideSuccess(false), 3000);
      onRefresh?.();
    } catch (err) {
      setOverrideError(
        err instanceof Error ? err.message : "Failed to apply override"
      );
      setOverrideSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await onCancelDraft(booking.id);
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Failed to cancel booking");
      setCancelling(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 sm:left-auto sm:top-0 sm:right-0 sm:h-full sm:w-[480px] bg-white shadow-xl z-50 overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Booking Detail
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {/* Basic Info */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Booking ID</span>
              <span className="text-sm font-mono text-gray-900">
                {truncateUuid(booking.id)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Date</span>
              <span className="text-sm text-gray-900">
                {new Date(booking.date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Format</span>
              <span className="text-sm text-gray-900">
                {booking.tournament_formats?.name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Players</span>
              <span className="text-sm text-gray-900">{booking.player_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Status</span>
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(booking.status)}`}
              >
                {STATUS_LABELS[booking.status] ?? booking.status}
              </span>
            </div>
            {booking.notes && (
              <div>
                <span className="text-sm text-gray-500">Notes</span>
                <p className="mt-1 text-sm text-gray-700 bg-gray-50 rounded p-2">
                  {booking.notes}
                </p>
              </div>
            )}
          </div>

          {/* Pricing Breakdown */}
          <div className="border-t border-gray-200 pt-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Pricing Breakdown
            </h3>
            {snapshot?.snapshot ? (() => { const data = snapshot.snapshot; return (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Green Fees</span>
                  <span className="text-gray-900">
                    ${data?.green_fees?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Cart Fees</span>
                  <span className="text-gray-900">
                    ${data?.cart_fees?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                  </span>
                </div>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">F&B Total</span>
                    <span className="text-gray-900">
                      ${data?.fb_total?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                    </span>
                  </div>
                  <LineItems items={data?.fb_line_items ?? null} />
                </div>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Bar Total</span>
                    <span className="text-gray-900">
                      ${data?.bar_total?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                    </span>
                  </div>
                  <LineItems items={data?.bar_line_items ?? null} />
                </div>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Add-on Total</span>
                    <span className="text-gray-900">
                      ${data?.addon_total?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                    </span>
                  </div>
                  <LineItems items={data?.addon_line_items ?? null} />
                </div>
                <div className="border-t border-gray-100 pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="text-gray-900">
                      ${data?.subtotal?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">HST</span>
                    <span className="text-gray-900">
                      ${data?.hst?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold mt-1">
                    <span className="text-gray-900">Total</span>
                    <span className="text-gray-900">
                      ${data?.total?.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? '0.00'}
                    </span>
                  </div>
                </div>
                {data?.displacement_floor != null && data.displacement_floor.floor_amount !== 0 && (
                  <>
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-gray-500">Displacement Floor</span>
                      <span className="text-gray-700">
                        ${data.displacement_floor.floor_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Displacement Cost</span>
                      <span className="text-gray-700">
                        ${data.displacement_floor.displacement_cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </>
                )}
                {booking.override_price != null && (
                  <div className="mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-amber-700 font-medium">Override Price</span>
                      <span className="text-amber-900 font-semibold">
                        ${booking.override_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {booking.override_reason && (
                      <p className="text-xs text-amber-600 mt-1">
                        {booking.override_reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ); })() : (
              <p className="text-sm text-gray-400">No pricing snapshot available</p>
            )}
          </div>

          {/* Payment Status */}
          <div className="border-t border-gray-200 pt-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Payment Status
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Deposit Amount</span>
                <span className="text-gray-900">
                  {booking.deposit_amount != null
                    ? `$${booking.deposit_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Balance Amount</span>
                <span className="text-gray-900">
                  {booking.balance_amount != null
                    ? `$${booking.balance_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Stripe Session</span>
                <span className="text-sm font-mono text-gray-700">
                  {booking.stripe_checkout_session_id
                    ? truncateUuid(booking.stripe_checkout_session_id)
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              Actions
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3 [&>*]:text-center sm:[&>*]:text-left">
              {booking.status === "draft" && (
                <>
                  <Link
                    href={`/checkout/${booking.id}`}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700"
                  >
                    Pay Deposit
                  </Link>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
                  >
                    Cancel Draft
                  </button>
                </>
              )}
              {booking.status === "deposit_paid" && (
                <button
                  disabled
                  className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
                >
                  Collect Balance
                </button>
              )}
              {canOverride && (
                <button
                  onClick={() => setShowOverride(true)}
                  className="px-4 py-2 text-sm font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"
                >
                  Override Price
                </button>
              )}
              {canModifySelections && (
                <button
                  onClick={() => setShowModifySelections(true)}
                  className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200"
                >
                  Modify Selections
                </button>
              )}
              {canManageFoursomes && participantCount > 0 && (
                <Link
                  href={`/foursomes/${booking.id}`}
                  className="px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200"
                >
                  Manage Foursomes
                </Link>
              )}
              {canCancelBooking && (
                <button
                  onClick={openCancelBookingModal}
                  className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200"
                >
                  Cancel Booking
                </button>
              )}
              {canSendEmail && (
                <button
                  onClick={() => setShowEmail(true)}
                  className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200"
                >
                  Send Email
                </button>
              )}
            </div>

            {emailSuccess && !showEmail && (
              <p className="mt-3 text-sm text-green-600">{emailSuccess}</p>
            )}

            {modifySuccess && (
              <p className="mt-3 text-sm text-green-600">{modifySuccess}</p>
            )}

            {cancelBookingSuccess && (
              <p className="mt-3 text-sm text-green-600">{cancelBookingSuccess}</p>
            )}

            {cancelError && (
              <p className="mt-3 text-sm text-red-600">{cancelError}</p>
            )}
            {overrideSuccess && (
              <p className="mt-3 text-sm text-green-600">
                Override applied successfully.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !cancelling && setShowConfirm(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Cancel Draft Booking?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to cancel this draft? This will release all
              allocated resources.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={cancelling}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Keep Draft
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {cancelling && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {showCancelBooking && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCancelBookingModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Cancel Booking
            </h3>
            <div className="mb-4 space-y-2 text-sm">
              <div>
                <span className="text-gray-500">Event Date: </span>
                <span className="text-gray-900">
                  {new Date(booking.date + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              {refundLoading ? (
                <p className="text-gray-500">Loading refund info...</p>
              ) : refundInfo ? (
                <>
                  <div>
                    <span className="text-gray-500">Days until event: </span>
                    <span className="text-gray-900">{refundInfo.daysUntilEvent}</span>
                  </div>
                  {!booking.deposit_amount ? (
                    <p className="text-gray-700">No deposit on record</p>
                  ) : refundInfo.tier ? (
                    <p className="text-gray-900">
                      Refund: {refundInfo.tier.refund_pct}% of deposit ($
                      {(refundInfo.refundAmount ?? 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      )
                    </p>
                  ) : (
                    <p className="text-gray-700">
                      No refund available for this cancellation window.
                    </p>
                  )}
                </>
              ) : null}
            </div>
            {cancelBookingError && (
              <p className="mb-3 text-sm text-red-600">{cancelBookingError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeCancelBookingModal}
                disabled={cancelBookingSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Keep Booking
              </button>
              <button
                onClick={handleConfirmCancelBooking}
                disabled={cancelBookingSubmitting || refundLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {cancelBookingSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Override Price Modal */}
      {showOverride && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeOverrideModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Override Booking Price
            </h3>
            <div className="mb-4">
              <span className="text-sm text-gray-500">Current Total: </span>
              <span className="text-sm font-medium text-gray-900">
                ${currentTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Price
                </label>
                <input
                  type="number"
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v > 1000000) setNewPrice("1000000");
                  }}
                  value={newPrice}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v > 1000000) setNewPrice("1000000");
                    else setNewPrice(e.target.value);
                  }}
                  required
                  step="0.01"
                  min="0"
                  max="1000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-400 mt-1">max 1000000</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            {overrideError && (
              <p className="mb-3 text-sm text-red-600">{overrideError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeOverrideModal}
                disabled={overrideSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyOverride}
                disabled={
                  overrideSubmitting ||
                  newPrice.trim() === "" ||
                  reason.trim() === ""
                }
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {overrideSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modify Selections Modal */}
      {showModifySelections && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModifySelectionsModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Modify Selections
            </h3>

            {modifyLoading ? (
              <p className="text-sm text-gray-500">Loading selections...</p>
            ) : (
              <div className="space-y-6">
                {/* F&B Packages */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    F&amp;B Packages
                  </h4>
                  {fbSelections.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No F&amp;B packages available.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {fbSelections.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {row.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              ${row.price_per_person.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              / person
                              {row.meal_type ? ` · ${row.meal_type}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-col items-end">
                            <NumberInput
                              integer
                              min={0}
                              max={booking.player_count}
                              value={row.headcount}
                              onChange={(v) => {
                                setFbSelections((prev) =>
                                  prev.map((s) =>
                                    s.id === row.id
                                      ? {
                                          ...s,
                                          headcount: Math.max(
                                            0,
                                            Math.min(booking.player_count, v),
                                          ),
                                        }
                                      : s
                                  )
                                );
                              }}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <span className="text-xs text-gray-400 mt-1">
                              max {booking.player_count}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Bar Packages */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    Bar Packages
                  </h4>
                  {barSelections.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No bar packages available.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {barSelections.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {row.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              ${row.price_per_person.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}{" "}
                              / person
                              {row.bar_type ? ` · ${row.bar_type}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-col items-end">
                            <NumberInput
                              integer
                              min={0}
                              max={booking.player_count}
                              value={row.headcount}
                              onChange={(v) => {
                                setBarSelections((prev) =>
                                  prev.map((s) =>
                                    s.id === row.id
                                      ? {
                                          ...s,
                                          headcount: Math.max(
                                            0,
                                            Math.min(booking.player_count, v),
                                          ),
                                        }
                                      : s
                                  )
                                );
                              }}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <span className="text-xs text-gray-400 mt-1">
                              max {booking.player_count}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* Add-ons */}
                <section>
                  <h4 className="text-sm font-semibold text-gray-900 mb-2">
                    Add-ons
                  </h4>
                  {addonSelections.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No add-ons available.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {addonSelections.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {row.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              ${row.price.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                              {row.pricing_type ? ` · ${row.pricing_type}` : ""}
                            </p>
                          </div>
                          {(() => {
                            const addonMax =
                              row.pricing_type === "per_person"
                                ? booking.player_count
                                : 99;
                            return (
                              <div className="flex flex-col items-end">
                                <NumberInput
                                  integer
                                  min={0}
                                  max={addonMax}
                                  value={row.quantity}
                                  onChange={(v) => {
                                    setAddonSelections((prev) =>
                                      prev.map((s) =>
                                        s.id === row.id
                                          ? {
                                              ...s,
                                              quantity: Math.max(
                                                0,
                                                Math.min(addonMax, v),
                                              ),
                                            }
                                          : s
                                      )
                                    );
                                  }}
                                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                                <span className="text-xs text-gray-400 mt-1">
                                  max {addonMax}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {modifyError && (
              <p className="mt-4 text-sm text-red-600">{modifyError}</p>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={closeModifySelectionsModal}
                disabled={modifySubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModifySelections}
                disabled={modifySubmitting || modifyLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {modifySubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Email Modal */}
      {showEmail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeEmailModal}
          />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Send Email
            </h3>

            <p className="text-sm text-gray-600 mb-3">
              Choose an email template to send to the organizer.
            </p>

            <div className="space-y-2">
              {EMAIL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.key}
                  onClick={() => handleSendEmail(tpl.key)}
                  disabled={emailSending !== null}
                  className="w-full px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 flex items-center justify-between"
                >
                  <span>{tpl.label}</span>
                  {emailSending === tpl.key && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-700"></div>
                  )}
                </button>
              ))}
            </div>

            {emailSuccess && (
              <p className="mt-4 text-sm text-green-600">{emailSuccess}</p>
            )}

            {emailFallback && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                  Email service not yet configured. Email content shown below
                  for manual sending.
                </p>
                <textarea
                  readOnly
                  value={emailFallback.content}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={handleCopyEmail}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                  >
                    Copy to Clipboard
                  </button>
                  {emailCopied && (
                    <span className="text-sm text-green-600">Copied!</span>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeEmailModal}
                disabled={emailSending !== null}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
