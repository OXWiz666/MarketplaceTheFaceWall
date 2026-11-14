import { redirect } from "next/navigation";

export default function ConnectRefreshPage() {
  redirect("/seller/connect?retry=1");
}

