import { LearningTimeView } from "@/components/portal/LearningTimeView";
import { loadPortalStudents } from "@/lib/loadPortalStudents.server";

export default async function LearningTimePage() {
  const students = await loadPortalStudents();

  return <LearningTimeView students={students} />;
}
