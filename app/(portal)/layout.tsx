import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal/PortalShell";
import { getTeacherAccount } from "@/lib/teacherSession.server";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const teacher = await getTeacherAccount();
  if (!teacher) {
    redirect("/login");
  }

  return (
    <PortalShell teacherLabel={`${teacher.name}（${teacher.employeeNumber}）`}>
      {children}
    </PortalShell>
  );
}
