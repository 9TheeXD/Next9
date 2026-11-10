import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { PhotosHome } from "@/components/photos/home/PhotosHome";

// Album list, with the trash (?view=trash) and shared links (?view=shares) views.
export default function PhotosPage() {
  return (
    <PageTransition>
      <Suspense fallback={null}>
        <PhotosHome />
      </Suspense>
    </PageTransition>
  );
}
