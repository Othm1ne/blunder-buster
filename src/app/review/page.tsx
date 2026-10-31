"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingCard } from "@/components/ProgressBar";
import { ReviewScreen } from "@/components/review/ReviewScreen";

// /review?id=<game id>: a query parameter instead of /review/[id], because the site is a static export.
function ReviewFromUrl() {
  const params = useSearchParams();
  const id = params.get("id");
  return <ReviewScreen key={id} id={id} initialPly={Number(params.get("ply")) || 0} />;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <ReviewFromUrl />
    </Suspense>
  );
}
