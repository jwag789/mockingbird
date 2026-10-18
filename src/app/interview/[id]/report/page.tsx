import { Suspense } from "react";
import { Scorecard } from "@/components/Scorecard";

export default function ReportPage({ params }: PageProps<"/interview/[id]/report">) {
  return (
    <Suspense>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: PageProps<"/interview/[id]/report">["params"] }) {
  const { id } = await params;
  return <Scorecard id={id} />;
}
