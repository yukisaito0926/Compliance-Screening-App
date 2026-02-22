import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CombinedCheckForm } from "@/components/combined-check-form";

async function AuthGuard({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <>{children}</>;
}

export default function ProtectedPage() {
  return (
    <Suspense>
      <AuthGuard>
        <div className="flex-1 w-full flex flex-col gap-8">
          <div>
            <h1 className="text-2xl font-bold">総合チェック</h1>
            <p className="text-muted-foreground text-sm mt-1">
              取引先名を入力すると、反社チェックと会社情報確認を同時に実施します。
            </p>
          </div>
          <CombinedCheckForm />
        </div>
      </AuthGuard>
    </Suspense>
  );
}
