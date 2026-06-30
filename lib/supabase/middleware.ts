import { NextResponse, type NextRequest } from "next/server";
import {
  TEACHER_PENDING_COOKIE,
  TEACHER_SESSION_COOKIE,
} from "@/lib/teacherSession";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const teacherSession = request.cookies.get(TEACHER_SESSION_COOKIE)?.value;
  const pendingSession = request.cookies.get(TEACHER_PENDING_COOKIE)?.value;

  const isLoginPage = pathname === "/login";
  const isChangePasswordPage = pathname === "/change-password";
  const isAuthApi =
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/logout") ||
    pathname.startsWith("/api/change-password");
  const isStudentStudyApi = pathname.startsWith("/api/study-sessions");

  if (teacherSession && (isLoginPage || isChangePasswordPage)) {
    const url = request.nextUrl.clone();
    url.pathname = "/learning-time";
    return NextResponse.redirect(url);
  }

  if (pendingSession) {
    if (isChangePasswordPage || isAuthApi || isLoginPage) {
      return NextResponse.next({ request });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/change-password";
    return NextResponse.redirect(url);
  }

  if (!teacherSession && !isLoginPage && !isChangePasswordPage && !isAuthApi && !isStudentStudyApi) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ message: "ログインが必要です。" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
