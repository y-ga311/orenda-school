import { ExamResultsView } from "@/components/portal/ExamResultsView";
import { loadPortalStudents } from "@/lib/loadPortalStudents.server";

export default async function GraduationExamPage() {
  const students = await loadPortalStudents();
  return <ExamResultsView examType="graduation" students={students} />;
}
