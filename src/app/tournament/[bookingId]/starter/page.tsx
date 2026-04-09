'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createAuthedClient } from '@/lib/supabase-tournament';
import QRCode from 'qrcode';

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface PlayerInfo {
  name: string;
  handicap: number;
  position: number;
  registration_token: string | null;
}

interface FoursomeRow {
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  starting_hole: number;
  starting_nine_name: string;
  players: PlayerInfo[];
  qrDataUrl: string | null;
}

interface BookingMeta {
  course_name: string;
  tournament_date: string;
  format_name: string;
  player_count: number;
  started_at: string | null;
}

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export default function StarterSheetPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;

  const supabase = useMemo(() => createAuthedClient(), []);

  const [meta, setMeta] = useState<BookingMeta | null>(null);
  const [foursomes, setFoursomes] = useState<FoursomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // 1. Booking metadata
        const { data: booking, error: bErr } = await supabase
          .from('bookings')
          .select('date, player_count, courses ( name ), tournament_formats ( name )')
          .eq('id', bookingId)
          .single();

        if (bErr || !booking) {
          setError('Booking not found.');
          setLoading(false);
          return;
        }

        setMeta({
          course_name: (booking as any).courses?.name ?? 'Golf Course',
          tournament_date: booking.date,
          format_name: (booking as any).tournament_formats?.name ?? 'Tournament',
          player_count: booking.player_count,
          started_at: null,
        });

        // 2. Foursomes
        const { data: fsData, error: fsErr } = await supabase
          .from('foursomes')
          .select('id, foursome_number, cart_number, starting_hole, starting_nine_id')
          .eq('booking_id', bookingId)
          .order('starting_hole');

        if (fsErr || !fsData) {
          setError('Could not load foursomes.');
          setLoading(false);
          return;
        }

        // 3. Nine names (for display)
        const nineIds = [...new Set(fsData.map(f => f.starting_nine_id).filter(Boolean))];
        const nineNames: Record<string, string> = {};
        if (nineIds.length > 0) {
          const { data: nines } = await supabase
            .from('nines')
            .select('id, name')
            .in('id', nineIds);
          if (nines) {
            for (const n of nines) nineNames[n.id] = n.name;
          }
        }

        // 4. Participants per foursome
        const foursomeIds = fsData.map(f => f.id);
        const { data: fpData } = await supabase
          .from('foursome_participants')
          .select('foursome_id, participant_id, position, participants ( id, name, handicap, registration_token )')
          .in('foursome_id', foursomeIds)
          .order('position');

        const participantsByFoursome: Record<string, PlayerInfo[]> = {};
        if (fpData) {
          for (const fp of fpData) {
            const p = (fp as any).participants;
            if (!p) continue;
            if (!participantsByFoursome[fp.foursome_id]) participantsByFoursome[fp.foursome_id] = [];
            participantsByFoursome[fp.foursome_id].push({
              name: p.name,
              handicap: p.handicap ?? 0,
              position: fp.position,
              registration_token: p.registration_token ?? null,
            });
          }
          // Sort each by position
          for (const key of Object.keys(participantsByFoursome)) {
            participantsByFoursome[key].sort((a, b) => a.position - b.position);
          }
        }

        // 5. Build rows + QR codes
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const rows: FoursomeRow[] = [];

        for (const f of fsData) {
          const players = participantsByFoursome[f.id] || [];
          // QR code links to first participant's registration token
          const firstToken = players.find(p => p.registration_token)?.registration_token;
          let qrDataUrl: string | null = null;
          if (firstToken && baseUrl) {
            try {
              qrDataUrl = await QRCode.toDataURL(`${baseUrl}/score/${firstToken}`, {
                width: 80,
                margin: 1,
                color: { dark: '#000000', light: '#ffffff' },
              });
            } catch { /* QR generation failed — skip */ }
          }

          rows.push({
            foursome_id: f.id,
            foursome_number: f.foursome_number,
            cart_number: f.cart_number,
            starting_hole: f.starting_hole,
            starting_nine_name: f.starting_nine_id ? (nineNames[f.starting_nine_id] || 'Nine') : '',
            players,
            qrDataUrl,
          });
        }

        setFoursomes(rows);
        setLoading(false);
      } catch {
        setError('Unable to load starter sheet data.');
        setLoading(false);
      }
    }
    load();
  }, [bookingId, supabase]);

  /* ── Helpers ── */
  const formatDate = (d: string) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return d; }
  };

  /* ────────────────────────────────────────────
     Render
     ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700 mx-auto mb-4" />
          <p className="text-gray-500">Loading starter sheet…</p>
        </div>
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-500">{error || 'Unable to load data.'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <div className="min-h-screen bg-white p-8 max-w-5xl mx-auto" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {/* ── Print button ── */}
        <div className="no-print mb-4">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 transition"
          >
            Print Starter Sheet
          </button>
        </div>

        {/* ── Header ── */}
        <div className="text-center mb-8 border-b-2 border-gray-900 pb-4">
          <h1 className="text-3xl font-bold text-gray-900">{meta.course_name}</h1>
          <h2 className="text-xl font-semibold text-gray-700 mt-1">Tournament Starter Sheet</h2>
          <div className="flex justify-center gap-4 mt-2 text-gray-600">
            <span>{formatDate(meta.tournament_date)}</span>
            <span>•</span>
            <span>{meta.format_name}</span>
            <span>•</span>
            <span>{meta.player_count} Players</span>
          </div>
        </div>

        {/* ── Starter table ── */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Cart</th>
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Start</th>
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Player 1</th>
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Player 2</th>
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Player 3</th>
              <th className="border border-gray-300 py-2 px-3 text-left font-semibold">Player 4</th>
              <th className="border border-gray-300 py-2 px-3 text-center font-semibold" style={{ width: '90px' }}>Score App</th>
            </tr>
          </thead>
          <tbody>
            {foursomes.map((fs) => (
              <tr key={fs.foursome_id} className="border-b border-gray-200">
                <td className="border border-gray-300 py-3 px-3 font-semibold text-center">
                  {fs.cart_number}
                </td>
                <td className="border border-gray-300 py-3 px-3 text-center">
                  <div className="font-semibold">Hole {fs.starting_hole}</div>
                  {fs.starting_nine_name && (
                    <div className="text-xs text-gray-500">{fs.starting_nine_name}</div>
                  )}
                </td>
                {[0, 1, 2, 3].map((idx) => {
                  const player = fs.players[idx];
                  return (
                    <td key={idx} className="border border-gray-300 py-3 px-3">
                      {player ? (
                        <>
                          <div className="font-medium">{player.name}</div>
                          <div className="text-xs text-gray-500">HCP: {player.handicap}</div>
                        </>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="border border-gray-300 py-2 px-2 text-center">
                  {fs.qrDataUrl ? (
                    <img
                      src={fs.qrDataUrl}
                      alt={`QR for Cart ${fs.cart_number}`}
                      className="inline-block"
                      style={{ width: '72px', height: '72px' }}
                    />
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Footer ── */}
        <div className="mt-6 text-center text-xs text-gray-400">
          Scan QR code at your starting hole to open the live scoring app on your phone.
        </div>
      </div>
    </>
  );
}
