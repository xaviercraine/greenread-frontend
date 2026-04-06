"use client";

import { createContext, useContext, useReducer, ReactNode } from "react";

type BookingState = {
  step: number;
  playerCount: number;
  month: number;
  year: number;
  formatId: string | null;
  formatName: string | null;
  selectedDate: string | null;
  fbSelections: Array<{fb_package_id: string; name: string; headcount: number; price: number}>;
  barSelections: Array<{bar_package_id: string; name: string; headcount: number; price: number}>;
  eventSpaceId: string | null;
  eventSpaceName: string | null;
  addonSelections: Array<{addon_id: string; name: string; quantity: number; price: number; pricing_type: string}>;
};

type BookingAction =
  | { type: "SET_STEP"; step: number }
  | { type: "SET_FORMAT"; formatId: string; formatName: string }
  | { type: "SET_PLAYER_COUNT"; playerCount: number }
  | { type: "SET_MONTH_YEAR"; month: number; year: number }
  | { type: "SET_DATE"; date: string }
  | { type: "SET_FB_SELECTIONS"; selections: BookingState["fbSelections"] }
  | { type: "SET_BAR_SELECTIONS"; selections: BookingState["barSelections"] }
  | { type: "SET_EVENT_SPACE"; spaceId: string | null; spaceName: string | null }
  | { type: "SET_ADDON_SELECTIONS"; selections: BookingState["addonSelections"] }
  | { type: "RESET" };

const initialState: BookingState = {
  step: 1,
  playerCount: 72,
  month: new Date().getMonth() + 1,
  year: new Date().getFullYear(),
  formatId: null,
  formatName: null,
  selectedDate: null,
  fbSelections: [],
  barSelections: [],
  eventSpaceId: null,
  eventSpaceName: null,
  addonSelections: [],
};

function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  let newState: BookingState;
  switch (action.type) {
    case "SET_STEP":
      newState = { ...state, step: action.step };
      break;
    case "SET_FORMAT":
      newState = { ...state, formatId: action.formatId, formatName: action.formatName };
      break;
    case "SET_PLAYER_COUNT":
      newState = { ...state, playerCount: action.playerCount };
      break;
    case "SET_MONTH_YEAR":
      newState = { ...state, month: action.month, year: action.year, selectedDate: null };
      break;
    case "SET_DATE":
      newState = { ...state, selectedDate: action.date };
      break;
    case "SET_FB_SELECTIONS":
      newState = { ...state, fbSelections: action.selections };
      break;
    case "SET_BAR_SELECTIONS":
      newState = { ...state, barSelections: action.selections };
      break;
    case "SET_EVENT_SPACE":
      newState = { ...state, eventSpaceId: action.spaceId, eventSpaceName: action.spaceName };
      break;
    case "SET_ADDON_SELECTIONS":
      newState = { ...state, addonSelections: action.selections };
      break;
    case "RESET":
      newState = { ...initialState };
      break;
    default:
      newState = state;
  }
  // Persist to sessionStorage on every change
  if (typeof window !== "undefined") {
    sessionStorage.setItem("greenread_booking", JSON.stringify(newState));
  }
  return newState;
}

function getInitialState(): BookingState {
  if (typeof window !== "undefined") {
    const saved = sessionStorage.getItem("greenread_booking");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore parse errors
      }
    }
  }
  return initialState;
}

type BookingContextType = {
  state: BookingState;
  dispatch: React.Dispatch<BookingAction>;
};

const BookingContext = createContext<BookingContextType | null>(null);

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(bookingReducer, initialState, () => getInitialState());

  return (
    <BookingContext.Provider value={{ state, dispatch }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const context = useContext(BookingContext);
  if (!context) throw new Error("useBooking must be used within BookingProvider");
  return context;
}
