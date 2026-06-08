import { redirect } from "next/navigation";
import { getTeacherId } from "@/lib/teacherSession.server";

export default async function HomePage() {
  const teacherId = await getTeacherId();
  redirect(teacherId ? "/learning-time" : "/login");
}
