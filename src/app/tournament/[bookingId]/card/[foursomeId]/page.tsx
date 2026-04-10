'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface PlayerInfo {
  name: string;
  handicap: number;
  position: number;
}

interface HolePar {
  nine_id: string;
  hole_number: number;
  par: number;
}

interface NineInfo {
  nine_id: string;
  nine_name: string;
  holes: { hole_number: number; par: number }[];
}

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export default function PrintableScorecardPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;
  const foursomeId = params.foursomeId as string;

  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();

  const [courseName, setCourseName] = useState('');
  const [tournamentDate, setTournamentDate] = useState('');
  const [formatName, setFormatName] = useState('');
  const [foursomeNumber, setFoursomeNumber] = useState(0);
  const [cartNumber, setCartNumber] = useState(0);
  const [startingHole, setStartingHole] = useState(0);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [nines, setNines] = useState<NineInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    async function load() {
      if (!user) {
        setError('Not authenticated.');
        setLoading(false);
        return;
      }
      try {
        // 1. Booking metadata
        const { data: booking } = await supabase
          .from('bookings')
          .select('date, courses ( name ), tournament_formats ( name )')
          .eq('id', bookingId)
          .single();

        if (booking) {
          setCourseName((booking as any).courses?.name ?? 'Golf Course');
          setTournamentDate(booking.date);
          setFormatName((booking as any).tournament_formats?.name ?? '');
        }

        // 2. Foursome info
        const { data: foursome } = await supabase
          .from('foursomes')
          .select('foursome_number, cart_number, starting_hole')
          .eq('id', foursomeId)
          .single();

        if (!foursome) {
          setError('Foursome not found.');
          setLoading(false);
          return;
        }

        setFoursomeNumber(foursome.foursome_number);
        setCartNumber(foursome.cart_number);
        setStartingHole(foursome.starting_hole);

        // 3. Players
        const { data: fpData } = await supabase
          .from('foursome_participants')
          .select('participant_id, participants ( name, handicap )')
          .eq('foursome_id', foursomeId);

        if (fpData) {
          setPlayers(
            fpData.map((fp: any, idx: number) => ({
              name: fp.participants?.name ?? 'Unknown',
              handicap: fp.participants?.handicap ?? 0,
              position: idx + 1,
            }))
          );
        }

        // 4. Hole pars — get from booking_nines → nines → hole_pars
        const { data: bookingNines } = await supabase
          .from('booking_nines')
          .select('nine_id, nines ( id, name )')
          .eq('booking_id', bookingId)
          .order('nine_id');

        if (bookingNines && bookingNines.length > 0) {
          const nineIds = bookingNines.map((bn: any) => bn.nine_id);

          const { data: holePars } = await supabase
            .from('hole_pars')
            .select('nine_id, hole_number, par')
            .in('nine_id', nineIds)
            .order('nine_id')
            .order('hole_number');

          const nineMap: Record<string, NineInfo> = {};
          for (const bn of bookingNines) {
            const n = (bn as any).nines;
            nineMap[bn.nine_id] = {
              nine_id: bn.nine_id,
              nine_name: n?.name ?? 'Nine',
              holes: [],
            };
          }

          if (holePars) {
            for (const hp of holePars) {
              if (nineMap[hp.nine_id]) {
                nineMap[hp.nine_id].holes.push({
                  hole_number: hp.hole_number,
                  par: hp.par,
                });
              }
            }
          }

          setNines(Object.values(nineMap));
        }

        setLoading(false);
      } catch {
        setError('Unable to load scorecard data.');
        setLoading(false);
      }
    }
    load();
  }, [bookingId, foursomeId, supabase, user, authLoading]);

  /* ── Helpers ── */
  const formatDate = (d: string) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return d; }
  };

  /* ────────────────────────────────────────────
     Render
     ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print, nav, [data-chat-widget], .fixed { display: none !important; }
          body { background: white !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead tr { background: white !important; }
          table { border-collapse: collapse; }
          td, th { border: 1px solid #333 !important; }
          @page { margin: 0.4in; }
        }
        .score-cell {
          min-width: 36px;
          min-height: 28px;
        }
      `}</style>

      <div className="min-h-screen bg-white p-6 max-w-4xl mx-auto" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', fontSize: '12px' }}>
        {/* ── Print button ── */}
        <div className="no-print mb-4">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            Print Scorecard
          </button>
        </div>

        {/* ── Header ── */}
        <div className="border-2 border-gray-900 p-4 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{courseName}</h1>
              <div className="text-sm text-gray-600 mt-1">
                {formatDate(tournamentDate)} {formatName && `• ${formatName}`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">Foursome #{foursomeNumber}</div>
              <div className="text-sm text-gray-600">Cart #{cartNumber} • Start: Hole {startingHole}</div>
            </div>
          </div>

          {/* Player list */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            {players.map((p, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold">{p.name}</span>
                <span className="text-gray-500 ml-1">(HCP {p.handicap})</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Scorecard grids — one per nine ── */}
        {nines.map((nine) => {
          const totalPar = nine.holes.reduce((sum, h) => sum + h.par, 0);
          return (
            <div key={nine.nine_id} className="mb-6">
              <h3 className="font-bold text-sm text-gray-700 mb-1">{nine.nine_name}</h3>
              <div className="overflow-x-auto">
              <table className="w-full border-collapse border-2 border-gray-900">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-400 py-1 px-2 text-left font-semibold w-20">Hole</th>
                    {nine.holes.map((h) => (
                      <th key={h.hole_number} className="border border-gray-400 py-1 px-1 text-center font-semibold score-cell">
                        {h.hole_number}
                      </th>
                    ))}
                    <th className="border border-gray-400 py-1 px-2 text-center font-bold w-14">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Par row */}
                  <tr className="bg-gray-50">
                    <td className="border border-gray-400 py-1 px-2 font-semibold">Par</td>
                    {nine.holes.map((h) => (
                      <td key={h.hole_number} className="border border-gray-400 py-1 px-1 text-center font-medium">
                        {h.par}
                      </td>
                    ))}
                    <td className="border border-gray-400 py-1 px-2 text-center font-bold">{totalPar}</td>
                  </tr>

                  {/* Blank score rows — one per player */}
                  {players.map((p, i) => (
                    <tr key={i}>
                      <td className="border border-gray-400 py-2 px-2 text-xs font-medium truncate max-w-[80px]">
                        {p.name.split(' ')[0]}
                      </td>
                      {nine.holes.map((h) => (
                        <td key={h.hole_number} className="border border-gray-400 py-2 px-1 score-cell">
                          {/* Blank for writing */}
                        </td>
                      ))}
                      <td className="border border-gray-400 py-2 px-2 score-cell">
                        {/* Total blank */}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          );
        })}

        {/* ── Attestation line ── */}
        <div className="mt-8 border-t border-gray-300 pt-4">
          <div className="flex gap-8">
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Scorer Signature</div>
              <div className="border-b border-gray-900 h-8" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">Attested By</div>
              <div className="border-b border-gray-900 h-8" />
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-4 text-center text-xs text-gray-400">
          Greenread — Physical Backup Scorecard
        </div>
      </div>
    </>
  );
}
