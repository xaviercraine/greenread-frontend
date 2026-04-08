import { createClient } from "@/lib/supabase/server";
import PublicBookingChat from "@/components/concierge/PublicBookingChat";

type Course = {
  id: string;
  name: string;
  slug?: string | null;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ courseSlug: string }>;
}) {
  const { courseSlug } = await params;
  const supabase = await createClient();

  let course: Course | null = null;

  // 1. Try matching on slug column directly.
  const slugAttempt = await supabase
    .from("public_courses")
    .select("*")
    .eq("slug", courseSlug)
    .maybeSingle();

  if (slugAttempt.data) {
    course = slugAttempt.data as Course;
  } else {
    // 2. Fall back to fetching all and matching on slugified name.
    const allAttempt = await supabase.from("public_courses").select("*");
    if (allAttempt.data) {
      const match = (allAttempt.data as Course[]).find(
        (c) => slugify(c.name ?? "") === courseSlug
      );
      if (match) course = match;
    }

    // 3. Final fallback: treat the slug as a course id.
    if (!course) {
      const idAttempt = await supabase
        .from("public_courses")
        .select("*")
        .eq("id", courseSlug)
        .maybeSingle();
      if (idAttempt.data) course = idAttempt.data as Course;
    }
  }

  if (!course) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Course not found.</p>
      </div>
    );
  }

  return <PublicBookingChat courseId={course.id} courseName={course.name} />;
}
