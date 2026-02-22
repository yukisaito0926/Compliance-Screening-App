import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ComplianceCheckForm } from "@/components/compliance-check-form";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}

export default function CompliancePage() {
  return (
    <Suspense>
      <AuthGuard>
        <div className="flex-1 w-full flex flex-col gap-8">
          <div>
            <h1 className="text-2xl font-bold">反社チェック</h1>
            <p className="text-muted-foreground text-sm mt-1">
              取引先名を入力すると、AIがネット上の情報を調査して判定します。
            </p>
          </div>
          <ComplianceCheckForm />
        </div>
      </AuthGuard>
    </Suspense>
  );
}
