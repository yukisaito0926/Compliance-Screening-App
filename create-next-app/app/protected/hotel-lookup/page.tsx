import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HotelLookupForm } from "@/components/hotel-lookup-form";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}

export default function HotelLookupPage() {
  return (
    <Suspense>
      <AuthGuard>
        <div className="flex-1 w-full flex flex-col gap-8">
          <div>
            <h1 className="text-2xl font-bold">旅館・ホテルの運営会社検索</h1>
            <p className="text-muted-foreground text-sm mt-1">
              旅館・ホテル名を入力すると、AIが運営会社（法人名）を調査します。
            </p>
          </div>
          <HotelLookupForm />
        </div>
      </AuthGuard>
    </Suspense>
  );
}
