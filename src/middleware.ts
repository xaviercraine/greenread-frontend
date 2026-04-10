import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Belt-and-suspenders: skip auth entirely for post-checkout routes
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/booking/success") || pathname.startsWith("/booking/cancel")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public booking pages: /book/<courseSlug> is accessible without auth.
  // /book/new still requires auth (organizer-side flow).
  const isPublicBookingPage =
    pathname.startsWith("/book/") && !pathname.startsWith("/book/new");

  // Organizer portal and registration pages are token-authenticated, no Supabase auth.
  const isPublicPortalPage =
    pathname.startsWith("/portal/") || pathname.startsWith("/register/");

  // Post-checkout pages must be accessible after Stripe redirect (session may have expired).
  const isPostCheckoutPage =
    pathname.startsWith("/booking/success") ||
    pathname.startsWith("/booking/cancel");

  if (
    !user &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/auth") &&
    !isPublicBookingPage &&
    !isPublicPortalPage &&
    !isPostCheckoutPage
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
