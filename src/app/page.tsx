import { redirect } from "next/navigation";

// Landing: send everyone to the dashboard (which redirects to /login
// when there is no valid session).
export default function Home() {
  redirect("/dashboard");
}
