import { Suspense } from "react";
import { InterviewRoom } from "@/components/InterviewRoom";

export default function InterviewPage({ params }: PageProps<"/interview/[id]">) {
  return (
    <Suspense>
      <Room params={params} />
    </Suspense>
  );
}

async function Room({ params }: { params: PageProps<"/interview/[id]">["params"] }) {
  const { id } = await params;
  return <InterviewRoom id={id} />;
}
