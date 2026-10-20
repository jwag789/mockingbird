import { Stack } from "@tessera/react";
import { SetupForm } from "@/components/SetupForm";

export default function NewInterviewPage() {
  return (
    <Stack gap={8}>
      <div className="mb-hero">
        <h1>Practice the interview before the interview.</h1>
        <p>
          Mockingbird reads your resume and the job description, asks the questions that role would ask, pushes back
          when an answer is vague, and scores every answer with quotes from what you said.
        </p>
      </div>
      <SetupForm />
    </Stack>
  );
}
