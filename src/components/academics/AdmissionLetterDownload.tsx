import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { buildAdmissionLetter, parseAdmissionLetterData } from "@/lib/admission-letter";

export function AdmissionLetterDownload({
  studentId,
  courseId,
}: {
  studentId: string;
  courseId: string;
}) {
  const [downloading, setDownloading] = useState(false);

  async function downloadLetter() {
    setDownloading(true);
    try {
      const { data, error } = await supabase.rpc("get_admission_letter_data", {
        _student_id: studentId,
        _course_id: courseId,
      });
      if (error) throw error;
      const letterData = parseAdmissionLetterData(data);
      const templateResponse = await fetch("/templates/office-of-registrar-template.docx");
      if (!templateResponse.ok) {
        throw new Error("The admission letter template could not be loaded.");
      }
      const template = new Uint8Array(await templateResponse.arrayBuffer());
      const file = buildAdmissionLetter(template, letterData);
      const blobBytes = new ArrayBuffer(file.byteLength);
      new Uint8Array(blobBytes).set(file);
      const blob = new Blob([blobBytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const safeAdmissionNumber = [...letterData.admissionNumber]
        .map((character) => {
          const code = character.charCodeAt(0);
          return /[<>:"/\\|?*]/.test(character) || code < 32 ? "-" : character;
        })
        .join("");
      link.download = `${safeAdmissionNumber}-admission-letter.docx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      toast.error("Could not generate the admission letter", {
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={downloading}
      loading={downloading}
      onClick={() => void downloadLetter()}
    >
      <Download className="mr-1 h-4 w-4" />
      {downloading ? "Preparing letter…" : "Admission letter"}
    </Button>
  );
}
