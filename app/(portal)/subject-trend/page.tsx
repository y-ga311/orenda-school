import { SubjectTrendView } from "@/components/portal/SubjectTrendView";
import { loadPortalStudents } from "@/lib/loadPortalStudents.server";

export default async function SubjectTrendPage() {
  const students = await loadPortalStudents();
  return <SubjectTrendView students={students} />;
}
