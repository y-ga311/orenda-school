import { ExamResultsView } from "@/components/portal/ExamResultsView";
import { loadPortalStudents } from "@/lib/loadPortalStudents.server";

export default async function MockExamPage() {
  const students = await loadPortalStudents();
  return <ExamResultsView examType="mock" students={students} />;
}
