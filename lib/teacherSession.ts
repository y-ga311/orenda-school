export const TEACHER_SESSION_COOKIE = "orenda_teacher_id";

export const TEACHER_PENDING_COOKIE = "orenda_teacher_pending_id";

export const TEACHER_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const TEACHER_PENDING_MAX_AGE = 60 * 15;

export const INITIAL_TEACHER_PASSWORD = "0000";

export const MIN_TEACHER_PASSWORD_LENGTH = 8;

export function isInitialTeacherPassword(password: string) {
  return password === INITIAL_TEACHER_PASSWORD;
}

export function isValidNewTeacherPassword(password: string) {
  return password.length >= MIN_TEACHER_PASSWORD_LENGTH;
}
