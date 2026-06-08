import { NextResponse } from "next/server";
import {
  TEACHER_PENDING_COOKIE,
  TEACHER_SESSION_COOKIE,
} from "@/lib/teacherSession";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(TEACHER_SESSION_COOKIE, "", cookieOptions);
  response.cookies.set(TEACHER_PENDING_COOKIE, "", cookieOptions);

  return response;
}
