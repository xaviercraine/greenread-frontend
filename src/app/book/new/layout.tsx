import { BookingProvider } from "@/components/booking/BookingContext";

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <BookingProvider>{children}</BookingProvider>;
}
