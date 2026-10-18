"use client";

import { Alert, Button, Card, FileDropzone, SegmentedControl, Stack, Textarea } from "@tessera/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { fetchJson } from "@/lib/client-types";

export function SetupForm() {
  const router = useRouter();
  const [jobDescription, setJobDescription] = useState("");
  const [resumeMode, setResumeMode] = useState("pdf");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [minutes, setMinutes] = useState("20");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData();
    form.set("jobDescription", jobDescription);
    form.set("targetMinutes", minutes);
    if (resumeMode === "pdf" && resumeFile) form.set("resumeFile", resumeFile);
    if (resumeMode === "text") form.set("resumeText", resumeText);

    try {
      const { id } = await fetchJson<{ id: string }>("/api/sessions", { method: "POST", body: form });
      router.push(`/interview/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Card title="Set up your interview" variant="raised">
      <form onSubmit={onSubmit}>
        <Stack gap={5}>
          <Textarea
            label="Job description"
            hint="Paste the whole posting: responsibilities and requirements are what the questions are built from."
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            required
          />

          <Stack gap={3}>
            <SegmentedControl
              label="Resume"
              options={[
                { value: "pdf", label: "Upload PDF" },
                { value: "text", label: "Paste text" },
              ]}
              value={resumeMode}
              onChange={setResumeMode}
            />
            {resumeMode === "pdf" ? (
              <FileDropzone
                label="Resume PDF"
                accept="application/pdf"
                maxSize={5 * 1024 * 1024}
                files={resumeFile ? [resumeFile] : []}
                onFilesChange={(files) => setResumeFile(files[0] ?? null)}
              />
            ) : (
              <Textarea
                label="Resume text"
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={8}
              />
            )}
          </Stack>

          <SegmentedControl
            label="Length"
            options={[
              { value: "10", label: "10 min" },
              { value: "20", label: "20 min" },
              { value: "30", label: "30 min" },
            ]}
            value={minutes}
            onChange={setMinutes}
          />

          {error && <Alert tone="danger">{error}</Alert>}

          <div>
            <Button type="submit" variant="primary" size="lg" loading={submitting}>
              {submitting ? "Reading your resume and planning questions…" : "Start interview"}
            </Button>
          </div>
        </Stack>
      </form>
    </Card>
  );
}
