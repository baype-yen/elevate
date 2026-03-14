import { NextResponse, type NextRequest } from "next/server"

function isTeacherPath(pathname: string) {
  return pathname === "/teacher" || pathname.startsWith("/teacher/")
}

function isStudentPath(pathname: string) {
  return pathname === "/student" || pathname.startsWith("/student/")
}

function isProtectedPath(pathname: string) {
  return isTeacherPath(pathname) || isStudentPath(pathname)
}

function isAuthPath(pathname: string) {
  return pathname === "/login" || pathname === "/student-login"
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const session = request.cookies.get("__session")?.value

  if (!session && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = isStudentPath(pathname) ? "/student-login" : "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  if (session && isAuthPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/teacher"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*", "/login", "/student-login"],
}
