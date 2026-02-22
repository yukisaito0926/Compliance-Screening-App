import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CompanyInfoForm } from "@/components/company-info-form";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}

export default function CompanyInfoPage() {
  return (
    <Suspense>
      <AuthGuard>
        <div className="flex-1 w-full flex flex-col gap-8">
          <div>
            <h1 className="text-2xl font-bold">会社情報確認</h1>
            <p className="text-muted-foreground text-sm mt-1">
              会社名を入力すると、現在の正式名称・最新性・代表者名を調査します。
            </p>
          </div>
          <CompanyInfoForm />
        </div>
      </AuthGuard>
    </Suspense>
  );
}
