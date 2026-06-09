import { StudentBasicInfoView } from "@/components/portal/StudentBasicInfoView";
import { loadPortalStudents } from "@/lib/loadPortalStudents.server";

export default async function StudentInfoPage() {
  const students = await loadPortalStudents();
  return <StudentBasicInfoView students={students} />;
}
