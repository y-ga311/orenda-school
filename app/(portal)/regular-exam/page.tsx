import { ExamResultsView } from "@/components/portal/ExamResultsView";
import { loadPortalStudents } from "@/lib/loadPortalStudents.server";

export default async function RegularExamPage() {
  const students = await loadPortalStudents();
  return <ExamResultsView examType="regular" students={students} />;
}
